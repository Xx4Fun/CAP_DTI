<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Models\FieldOfflineLease;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldMonitoringRecordTest extends TestCase
{
    use RefreshDatabase;

    private function fieldSession(): array
    {
        $officer = User::create([
            'name' => 'Field Officer', 'email' => 'field@dti.test',
            'password' => 'secure-password', 'role' => 'field_officer',
        ]);
        $login = $this->postJson('/api/field/login', ['email' => $officer->email, 'password' => 'secure-password'])->assertOk();
        return [$officer, $login->json('token'), $login->json('offline_lease.id')];
    }

    private function store(): Store
    {
        return Store::create([
            'dti_sec_number' => 'SEC-FIELD-1', 'store_name' => 'San Isidro Grocery',
            'owner_name' => 'Maria Santos', 'latitude' => 10.7424, 'longitude' => 121.9406,
            'address' => 'San Jose de Buenavista', 'is_active' => true,
        ]);
    }

    private function bulletin(string $name, float $price): SrpBulletin
    {
        return SrpBulletin::create([
            'commodity_name' => $name, 'baseline_price' => $price,
            'effective_date' => now()->subDay()->toDateString(), 'is_active' => true,
        ]);
    }

    private function payload(Store $store, array $bulletins, string $uuid = '4cb0a181-a590-4f95-b96e-aadab8e09a67'): array
    {
        return [
            'records' => [[
                'client_uuid' => $uuid,
                'store_id' => $store->id,
                'offline_lease_id' => $this->leaseId,
                'started_at' => now()->subMinutes(20)->toIso8601String(),
                'finalized_at' => now()->subMinute()->toIso8601String(),
                'location' => [
                    'latitude' => 10.7425, 'longitude' => 121.9407,
                    'accuracy_meters' => 12.5, 'captured_at' => now()->subMinute()->toIso8601String(),
                ],
                'representative' => ['name' => 'Maria Santos', 'title' => 'Store manager'],
                'signatures' => [
                    'officer_png_base64' => base64_encode("\x89PNG\r\n\x1a\nofficer-signature"),
                    'representative_png_base64' => base64_encode("\x89PNG\r\n\x1a\nrepresentative-signature"),
                ],
                'sync_source' => 'offline_queue', 'client_version' => '1.0.0',
                'items' => [
                    ['srp_id' => $bulletins[0]->id, 'recorded_price' => 115.00],
                    ['srp_id' => $bulletins[1]->id, 'recorded_price' => 45.00],
                ],
            ]],
        ];
    }

    private string $leaseId;

    public function test_sync_accepts_one_complete_visit_exactly_once_and_projects_verified_temporal_rows(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletins[0]->id,
            'recorded_price' => 108, 'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(2), 'officer_signature' => 'legacy-signed',
            'validation_status' => 'verified',
        ]);

        $first = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'accepted')
            ->assertJsonPath('data.results.0.item_count', 2)
            ->assertJsonPath('data.results.0.anomaly_count', 1);

        $recordId = $first->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_records', ['id' => $recordId, 'officer_user_id' => $officer->id, 'status' => 'accepted']);
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'is_anomaly' => true]);
        $this->assertSame(2, TemporalInspection::where('monitoring_record_id', $recordId)->where('validation_status', 'verified')->count());
        $this->assertCount(2, Storage::disk('receipt_evidence')->allFiles("field-monitoring/{$recordId}"));

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertDatabaseCount('monitoring_records', 1);
        $this->assertSame(2, TemporalInspection::where('monitoring_record_id', $recordId)->count());
    }

    public function test_bootstrap_downloads_active_field_data_and_returns_an_empty_delta_when_current(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletin = $this->bulletin('Rice', 100);
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id,
            'recorded_price' => 108, 'is_flagged' => false,
            'inspection_timestamp' => now()->subDay(), 'officer_signature' => 'signed',
            'validation_status' => 'verified',
        ]);

        $full = $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonPath('data.is_delta', false)
            ->assertJsonPath('data.stores.0.id', $store->id)
            ->assertJsonPath('data.srp_bulletins.0.id', $bulletin->id)
            ->assertJsonPath('data.recent_prices.0.recorded_price', 108);

        $version = rawurlencode($full->json('data.version'));
        $this->withToken($token)->getJson("/api/field/bootstrap?since={$version}")
            ->assertOk()->assertJsonPath('data.is_delta', true)
            ->assertJsonCount(0, 'data.stores')->assertJsonCount(0, 'data.srp_bulletins');
    }

    public function test_sync_rejects_missing_dual_signature_or_an_inaccurate_location(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        unset($payload['records'][0]['signatures']['representative_png_base64']);
        $payload['records'][0]['location']['accuracy_meters'] = 150;

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'records.0.signatures.representative_png_base64',
                'records.0.location.accuracy_meters',
            ]);
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_signature_content_that_is_not_a_png(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['signatures']['officer_png_base64'] = base64_encode('not-a-png-file');

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.signatures.officer_png_base64');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_a_commodity_that_is_no_longer_active(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $bulletins[0]->update(['is_active' => false]);

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.items');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_a_visit_finalized_after_its_offline_lease_expired(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        FieldOfflineLease::findOrFail($this->leaseId)->update(['expires_at' => now()->subMinutes(5)]);
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The offline authorization lease did not cover this finalized visit.');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_officer_history_and_admin_review_are_paginated_and_do_not_expose_signature_paths(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))->assertCreated();

        $this->withToken($token)->getJson('/api/field/monitoring-records?per_page=10')
            ->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonMissingPath('data.data.0.officer_signature_path');

        $manager = User::create(['name' => 'Manager', 'email' => 'manager@dti.test', 'password' => 'manager-password', 'role' => 'dti_evaluator']);
        Sanctum::actingAs($manager, ['dti-admin']);
        $list = $this->getJson('/api/admin/monitoring-records?anomaly=all&per_page=10')
            ->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.officer.email', $officer->email)
            ->assertJsonMissingPath('data.data.0.representative_signature_path');

        $recordId = $list->json('data.data.0.id');
        $this->getJson("/api/admin/monitoring-records/{$recordId}")
            ->assertOk()->assertJsonCount(2, 'data.items')
            ->assertJsonMissingPath('data.officer_signature_path');
        $this->get("/api/admin/monitoring-records/{$recordId}/signatures/officer")
            ->assertOk()->assertHeader('content-type', 'image/png');
        $this->assertDatabaseHas('audit_events', [
            'action' => 'monitoring_record.signature_viewed',
            'subject_id' => $recordId,
        ]);
    }
}
