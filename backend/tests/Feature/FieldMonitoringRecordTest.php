<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Models\FieldOfflineLease;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
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
            'commodity_name' => $name, 'commodity_key' => strtolower($name), 'baseline_price' => $price,
            'effective_date' => now()->subDay()->toDateString(), 'source_reference' => 'SRP-'.strtoupper($name), 'is_active' => true,
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

        $payload = $this->payload($store, $bulletins);
        $first = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'accepted')
            ->assertJsonPath('data.results.0.item_count', 2)
            ->assertJsonPath('data.results.0.anomaly_count', 1);

        $recordId = $first->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_records', ['id' => $recordId, 'officer_user_id' => $officer->id, 'status' => 'accepted']);
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'is_anomaly' => true]);
        $this->assertSame(2, TemporalInspection::where('monitoring_record_id', $recordId)->where('validation_status', 'verified')->count());
        $this->assertCount(2, Storage::disk('receipt_evidence')->allFiles("field-monitoring/{$recordId}"));

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');

        $bulletins[0]->update(['is_active' => false]);
        SrpBulletin::create([
            'commodity_name' => 'Rice revised', 'commodity_key' => 'rice', 'baseline_price' => 105,
            'effective_date' => now('Asia/Manila')->toDateString(), 'source_reference' => 'SRP-RICE-REVISED', 'is_active' => true,
        ]);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
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

    public function test_bootstrap_keeps_current_unkeyed_srp_rows_distinct_by_id(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $first = SrpBulletin::create([
            'commodity_name' => 'Argentina (150g)', 'commodity_key' => null,
            'category' => 'Meat Loaf', 'unit' => '150g', 'baseline_price' => 23.75,
            'effective_date' => now('Asia/Manila')->subDay()->toDateString(), 'is_active' => true,
        ]);
        $second = SrpBulletin::create([
            'commodity_name' => 'Argentina (150g)', 'commodity_key' => null,
            'category' => 'Corned Beef', 'unit' => '150g', 'baseline_price' => 36.75,
            'effective_date' => now('Asia/Manila')->subDay()->toDateString(), 'is_active' => true,
        ]);

        $response = $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()->assertJsonCount(2, 'data.srp_bulletins');

        $this->assertEqualsCanonicalizing(
            [$first->id, $second->id],
            collect($response->json('data.srp_bulletins'))->pluck('id')->all(),
        );
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

    public function test_sync_fails_closed_and_removes_signature_files_when_its_acceptance_audit_cannot_be_written(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        Schema::drop('audit_events');

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');

        $this->assertDatabaseCount('monitoring_records', 0);
        $this->assertSame([], Storage::disk('receipt_evidence')->allFiles('field-monitoring'));
    }

    public function test_sync_uses_an_unsourced_unkeyed_current_srp_as_a_provisional_baseline(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $bulletins[0]->update(['commodity_key' => null, 'source_reference' => null]);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'reference_status' => 'available', 'reference_type' => 'standard_srp',
            'reference_label' => 'SRP baseline (provisional)', 'reference_value' => 100,
            'reference_source' => null, 'is_anomaly' => true,
        ]);
    }

    public function test_standard_reference_does_not_flag_the_exact_ten_percent_boundary(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['items'][0]['recorded_price'] = 110;

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id, 'is_anomaly' => false,
        ]);
    }

    public function test_bootstrap_only_returns_current_effective_reference_rows_and_declares_emergency_mode(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $admin = User::factory()->create(['role' => 'dti_evaluator']);
        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 50,
            'effective_date' => now()->subDay()->toDateString(), 'source_reference' => 'SRP-CURRENT', 'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Rice future', 'commodity_key' => 'rice', 'baseline_price' => 70,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-FUTURE', 'is_active' => true,
        ]);
        $emergency = RegulatoryEmergency::create([
            'location' => 'Antique', 'starts_on' => now()->subDay(), 'declaration_reference' => 'DECL-CURRENT',
            'status' => 'active', 'confirmed_at' => now(), 'responsible_admin_id' => $admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC',
            'authoritative_price' => 55, 'effective_from' => now()->subDay(), 'effective_until' => now()->addDay(),
            'location' => 'Antique', 'declaration_reference' => 'DECL-CURRENT', 'source_reference' => 'APC-CURRENT', 'created_by' => $admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'milk', 'price_type' => 'APC',
            'authoritative_price' => 80, 'effective_from' => now('Asia/Manila')->addDay(),
            'location' => 'Antique', 'declaration_reference' => 'DECL-CURRENT', 'source_reference' => 'APC-FUTURE', 'created_by' => $admin->id,
        ]);

        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonCount(1, 'data.srp_bulletins')
            ->assertJsonPath('data.srp_bulletins.0.id', $current->id)
            ->assertJsonCount(1, 'data.regulatory_prices')
            ->assertJsonPath('data.protocol.mode', 'emergency')
            ->assertJsonPath('data.protocol.declaration_reference', 'DECL-CURRENT');

        $emergency->update(['status' => 'ended', 'active_scope_key' => null, 'ends_on' => now('Asia/Manila')->toDateString()]);
        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonCount(1, 'data.regulatory_prices')
            ->assertJsonPath('data.protocol.mode', 'emergency')
            ->assertJsonPath('data.protocol.declaration_reference', 'DECL-CURRENT');
    }

    public function test_bootstrap_counts_accepted_visits_by_the_manila_calendar_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-31 18:00:00', 'UTC'));
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()->json('data.results.0.record_id');
        \App\Models\MonitoringRecord::findOrFail($recordId)->update(['received_at' => '2026-08-31 15:00:00']);

        $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()->assertJsonPath('data.accepted_today', 0);
    }

    public function test_bootstrap_version_changes_when_the_manila_effective_date_rolls_over(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-31 15:59:00', 'UTC'));
        [, $token, $this->leaseId] = $this->fieldSession();
        $version = $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.version');
        Carbon::setTestNow(Carbon::parse('2026-08-31 16:01:00', 'UTC'));

        $this->withToken($token)->getJson('/api/field/bootstrap?since='.rawurlencode($version))
            ->assertOk()->assertJsonPath('data.is_delta', false);
    }

    public function test_sync_rejects_same_client_uuid_when_any_canonical_visit_value_changes(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)->assertCreated();
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');

        $changedItem = $payload;
        $changedItem['records'][0]['items'][0]['recorded_price'] = 116;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedItem)->assertConflict();
        $changedSignature = $payload;
        $changedSignature['records'][0]['signatures']['officer_png_base64'] = base64_encode("\x89PNG\r\n\x1a\nother-officer");
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedSignature)->assertConflict();
        $otherStore = Store::create([
            'dti_sec_number' => 'SEC-FIELD-2', 'store_name' => 'Other Store', 'owner_name' => 'Owner',
            'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'Antique', 'is_active' => true,
        ]);
        $changedStore = $payload;
        $changedStore['records'][0]['store_id'] = $otherStore->id;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedStore)->assertConflict();
    }

    public function test_sync_rejects_duplicate_client_uuids_inside_one_batch(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $payload = $this->payload($this->store(), [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)]);
        $payload['records'][] = $payload['records'][0];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('records.1.client_uuid');
    }

    public function test_sync_uses_the_effective_bulletin_for_future_or_stale_submissions_and_rejects_when_none_exists(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $past = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);
        $future = SrpBulletin::create([
            'commodity_name' => 'Rice future', 'commodity_key' => 'rice', 'baseline_price' => 120,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-RICE-FUTURE', 'is_active' => true,
        ]);
        $futurePayload = $this->payload($store, [$future, $milk]);
        $futureRecordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $futurePayload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $futureRecordId, 'srp_id' => $past->id, 'baseline_price' => 100]);

        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 110,
            'effective_date' => now('Asia/Manila')->toDateString(), 'source_reference' => 'SRP-RICE-CURRENT', 'is_active' => true,
        ]);
        $stalePayload = $this->payload($store, [$past, $milk], 'f0b0a181-a590-4f95-b96e-aadab8e09a67');
        $stalePayload['records'][0]['finalized_at'] = now()->subMinutes(2)->toIso8601String();
        $stalePayload['records'][0]['location']['captured_at'] = now()->subMinutes(2)->toIso8601String();
        $staleRecordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $stalePayload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $staleRecordId, 'srp_id' => $current->id, 'baseline_price' => 110]);

        $onlyFuture = SrpBulletin::create([
            'commodity_name' => 'Oil future', 'commodity_key' => 'oil', 'baseline_price' => 90,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-OIL-FUTURE', 'is_active' => true,
        ]);
        $nonePayload = $this->payload($store, [$onlyFuture, $milk], 'e0b0a181-a590-4f95-b96e-aadab8e09a67');
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $nonePayload)
            ->assertUnprocessable()->assertJsonValidationErrors('records.0.items');
    }

    public function test_sync_uses_the_manila_calendar_date_for_effective_bulletins(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-31 16:30:00', 'UTC'));
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $past = SrpBulletin::create([
            'commodity_name' => 'Rice prior', 'commodity_key' => 'rice', 'baseline_price' => 100,
            'effective_date' => '2026-08-31', 'source_reference' => 'SRP-RICE-PRIOR', 'is_active' => true,
        ]);
        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 110,
            'effective_date' => '2026-09-01', 'source_reference' => 'SRP-RICE-CURRENT', 'is_active' => true,
        ]);
        $milk = $this->bulletin('Milk', 50);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$past, $milk]))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'srp_id' => $current->id]);
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

    public function test_admin_monitoring_workspace_uses_captured_references_and_establishment_summaries(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $rice = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);

        $recordId = $this->withToken($token)
            ->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$rice, $milk]))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_records', [
            'id' => $recordId,
            'protocol_mode' => 'standard',
            'protocol_reference' => null,
        ]);
        $rice->update(['baseline_price' => 999]);

        $manager = User::create([
            'name' => 'Manager', 'email' => 'workspace-manager@dti.test',
            'password' => 'manager-password', 'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($manager, ['dti-admin']);

        $this->getJson('/api/admin/monitoring-establishments?status=with_observations&search=San&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.summary.monitored_establishments', 1)
            ->assertJsonPath('data.summary.recent_activity', 1)
            ->assertJsonPath('data.summary.records_with_observations', 1)
            ->assertJsonPath('data.summary.open_verification_requests', 0)
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.id', $store->id)
            ->assertJsonPath('data.establishments.data.0.latest_result', 'with_observations')
            ->assertJsonPath('data.establishments.data.0.latest_officer.name', 'Field Officer');

        $this->getJson("/api/admin/monitoring-establishments/{$store->id}")
            ->assertOk()
            ->assertJsonPath('data.completed_records_count', 1)
            ->assertJsonPath('data.records_with_observations_count', 1)
            ->assertJsonPath('data.latest_record.id', $recordId)
            ->assertJsonPath('data.latest_record.protocol_mode', 'standard')
            ->assertJsonFragment(['selector' => 'key:milk'])
            ->assertJsonFragment(['selector' => 'key:rice']);

        $this->getJson("/api/admin/monitoring-establishments/{$store->id}/price-history?per_page=10")
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.data.0.monitoring_record_id', $recordId)
            ->assertJsonFragment(['reference_value' => 100]);

        $this->getJson("/api/admin/monitoring-records?store_id={$store->id}&per_page=10")
            ->assertOk()->assertJsonPath('data.total', 1);
    }

    public function test_establishment_status_uses_only_latest_visit_and_missing_reference_precedence(): void
    {
        Carbon::setTestNow('2026-09-06 10:00:00');
        $officer = User::create(['name' => 'Latest Officer', 'email' => 'latest@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $manager = User::create(['name' => 'Manager', 'email' => 'latest-manager@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store();
        $bulletin = $this->bulletin('Rice', 100);
        foreach ([['2026-08-01', true, 'available'], ['2026-09-05', false, 'unavailable']] as $index => [$date, $anomaly, $reference]) {
            $record = MonitoringRecord::create([
                'client_uuid' => "00000000-0000-4000-8000-00000000000{$index}", 'officer_user_id' => $officer->id,
                'store_id' => $store->id, 'status' => 'accepted', 'started_at' => "$date 08:00:00", 'finalized_at' => "$date 09:00:00",
                'received_at' => "$date 09:01:00", 'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8,
                'location_captured_at' => "$date 08:59:00", 'representative_name' => 'Owner', 'officer_signature_disk' => 'local',
                'officer_signature_path' => 'a', 'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
                'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
            ]);
            MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 100,
                'baseline_price' => 100, 'variance_percent' => 0, 'is_anomaly' => $anomaly,
                'reference_status' => $reference, 'reference_type' => 'standard_srp',
                'reference_label' => $reference === 'available' ? 'SRP' : 'SRP reference unavailable',
                'reference_value' => $reference === 'available' ? 100 : null,
            ]);
        }
        Sanctum::actingAs($manager, ['dti-admin']);

        $this->getJson('/api/admin/monitoring-establishments?status=with_observations')->assertOk()->assertJsonPath('data.establishments.total', 0);
        $this->getJson('/api/admin/monitoring-establishments?status=reference_unavailable')->assertOk()
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.latest_result', 'reference_unavailable')
            ->assertJsonPath('data.establishments.data.0.latest_officer.name', 'Latest Officer');
        $this->getJson('/api/admin/monitoring-establishments?status=recently_monitored')->assertOk()->assertJsonPath('data.establishments.total', 1);

        $rejectedStore = Store::create(['store_name' => 'Rejected Only', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121, 'is_active' => true]);
        MonitoringRecord::create([
            'client_uuid' => '00000000-0000-4000-8000-000000000099', 'officer_user_id' => $officer->id, 'store_id' => $rejectedStore->id,
            'status' => 'rejected', 'started_at' => now(), 'finalized_at' => now()->addDay(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Owner', 'officer_signature_disk' => 'local', 'officer_signature_path' => 'a',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
            'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
        ]);
        $this->getJson('/api/admin/monitoring-establishments?status=never_monitored')->assertOk()
            ->assertJsonFragment(['store_name' => 'Rejected Only']);
        Carbon::setTestNow();
    }
}
