<?php

namespace Tests\Feature;

use App\Models\ConsumerReport;
use App\Models\AuditEvent;
use App\Models\FieldVerificationRequest;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldVerificationQueueTest extends TestCase
{
    use RefreshDatabase;

    private function fieldSession(string $email): array
    {
        $officer = User::create([
            'name' => $email, 'email' => $email, 'password' => 'secure-password',
            'role' => 'field_officer',
        ]);
        $login = $this->postJson('/api/field/login', [
            'email' => $email, 'password' => 'secure-password',
        ])->assertOk();
        return [$officer, $login->json('token'), $login->json('offline_lease.id')];
    }

    private function store(string $suffix = '1'): Store
    {
        return Store::create([
            'dti_sec_number' => 'QUEUE-'.$suffix, 'store_name' => 'Queue Store '.$suffix,
            'owner_name' => 'Owner', 'latitude' => 10.7, 'longitude' => 122.0,
            'address' => 'Antique '.$suffix, 'is_active' => true,
        ]);
    }

    private function verification(Store $store, User $admin, array $extra = []): FieldVerificationRequest
    {
        $report = ConsumerReport::create([
            'report_reference' => 'QUEUE-REPORT-'.uniqid(),
            'tracking_token_hash' => hash('sha256', uniqid()),
            'submission_uuid' => uniqid('submission-', true),
            'store_id' => $store->id, 'status' => 'Referred for field verification',
        ]);
        return FieldVerificationRequest::create($extra + [
            'consumer_report_id' => $report->id, 'store_id' => $store->id,
            'requested_by' => $admin->id, 'status' => 'open', 'reason' => 'Check the displayed price.',
            'context_json' => ['private_customer_note' => 'must not leave admin context'],
            'requested_at' => now(),
        ]);
    }

    private function bulletin(): SrpBulletin
    {
        return SrpBulletin::create([
            'commodity_name' => 'Rice', 'commodity_key' => 'rice', 'baseline_price' => 100,
            'effective_date' => now()->subDay()->toDateString(), 'source_reference' => 'SRP-1',
            'is_active' => true,
        ]);
    }

    private function syncPayload(Store $store, SrpBulletin $bulletin, string $leaseId, int $verificationId): array
    {
        return ['records' => [[
            'client_uuid' => '07b1654e-8386-4cf4-9ca0-d08f492443e8',
            'verification_request_id' => $verificationId,
            'store_id' => $store->id, 'offline_lease_id' => $leaseId,
            'started_at' => now()->subMinutes(10)->toIso8601String(),
            'finalized_at' => now()->subMinute()->toIso8601String(),
            'location' => [
                'latitude' => 10.71, 'longitude' => 122.01, 'accuracy_meters' => 8,
                'captured_at' => now()->subMinute()->toIso8601String(),
            ],
            'representative' => ['name' => 'Store Representative', 'title' => 'Manager'],
            'signatures' => [
                'officer_png_base64' => base64_encode("\x89PNG\r\n\x1a\nofficer"),
                'representative_png_base64' => base64_encode("\x89PNG\r\n\x1a\nrepresentative"),
            ],
            'items' => [['srp_id' => $bulletin->id, 'recorded_price' => 112]],
        ]]];
    }

    public function test_queue_contains_open_and_own_claimed_requests_without_consumer_context(): void
    {
        [$officer, $token] = $this->fieldSession('queue-one@dti.test');
        [$other] = $this->fieldSession('queue-two@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'queue-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store();
        $open = $this->verification($store, $admin);
        $mine = $this->verification($store, $admin, ['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $this->verification($store, $admin, ['status' => 'claimed', 'claimed_by' => $other->id, 'claimed_at' => now()]);

        $response = $this->withToken($token)->getJson('/api/field/verification-requests')
            ->assertOk()->assertJsonCount(2, 'data');
        $this->assertEqualsCanonicalizing([$open->id, $mine->id], collect($response->json('data'))->pluck('id')->all());
        $response->assertJsonMissingPath('data.0.consumer_report_id')
            ->assertJsonMissingPath('data.0.context_json');
        $this->assertStringNotContainsString('private_customer_note', $response->getContent());
    }

    public function test_claim_is_atomic_and_only_the_claimant_can_release(): void
    {
        [$officer, $token] = $this->fieldSession('claim-one@dti.test');
        [$other] = $this->fieldSession('claim-two@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'claim-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $verification = $this->verification($this->store(), $admin);

        $this->withToken($token)->postJson("/api/field/verification-requests/{$verification->id}/claim")
            ->assertOk()->assertJsonPath('data.claimed_by', $officer->id);
        Sanctum::actingAs($other->fresh(), ['field-monitoring']);
        $this->postJson("/api/field/verification-requests/{$verification->id}/claim")
            ->assertStatus(409);
        $this->postJson("/api/field/verification-requests/{$verification->id}/release")
            ->assertForbidden();
        Sanctum::actingAs($officer->fresh(), ['field-monitoring']);
        $this->postJson("/api/field/verification-requests/{$verification->id}/release")
            ->assertOk()->assertJsonPath('data.status', 'open');
        $this->assertNull($verification->fresh()->claimed_by);
    }

    public function test_claimed_request_sync_links_once_completes_the_request_and_moves_the_report_to_review(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $leaseId] = $this->fieldSession('sync-verification@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'sync-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store();
        $verification = $this->verification($store, $admin, ['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $bulletin = $this->bulletin();

        $payload = $this->syncPayload($store, $bulletin, $leaseId, $verification->id);
        $sync = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->assertJsonPath('data.results.0.status', 'accepted');
        $recordId = $sync->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_records', ['id' => $recordId, 'field_verification_request_id' => $verification->id]);
        $this->assertDatabaseHas('field_verification_requests', ['id' => $verification->id, 'status' => 'completed']);
        $this->assertDatabaseHas('consumer_reports', ['id' => $verification->consumer_report_id, 'status' => 'Under regulatory review']);
        $this->assertDatabaseHas('report_status_histories', [
            'consumer_report_id' => $verification->consumer_report_id,
            'new_status' => 'Under regulatory review', 'actor_id' => $officer->id,
        ]);
        $this->assertSame('monitoring_record_accepted', $officer->fresh()->notifications()->latest()->first()?->data['event'] ?? null);
        $auditCount = AuditEvent::count();
        $notificationCount = $officer->fresh()->notifications()->count();
        $historyCount = ReportStatusHistory::count();

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertSame($auditCount, AuditEvent::count());
        $this->assertSame($notificationCount, $officer->fresh()->notifications()->count());
        $this->assertSame($historyCount, ReportStatusHistory::count());

        $this->withToken($token)->getJson("/api/field/monitoring-records/{$recordId}")
            ->assertOk()
            ->assertJsonPath('data.location.latitude', 10.71)
            ->assertJsonPath('data.representative.name', 'Store Representative')
            ->assertJsonPath('data.signatures.officer_present', true)
            ->assertJsonPath('data.sync_source', 'online')
            ->assertJsonPath('data.field_verification_request_id', $verification->id)
            ->assertJsonPath('data.items.0.reference_type', 'standard_srp')
            ->assertJsonMissingPath('data.officer_signature_path')
            ->assertJsonMissingPath('data.signatures.officer_path');

        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonPath('data.protocol.standard_review_threshold_percent', 10)
            ->assertJsonPath('data.accepted_today', 1)
            ->assertJsonStructure(['data' => ['reference_version', 'regulatory_prices']]);
    }

    public function test_sync_rejects_a_request_claimed_by_another_officer_or_for_another_store(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $leaseId] = $this->fieldSession('wrong-sync@dti.test');
        [$other] = $this->fieldSession('right-sync@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'wrong-sync-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $verification = $this->verification($this->store('request'), $admin, ['status' => 'claimed', 'claimed_by' => $other->id, 'claimed_at' => now()]);
        $payload = $this->syncPayload($this->store('visit'), $this->bulletin(), $leaseId, $verification->id);

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable();
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_an_officer_cannot_read_another_officers_monitoring_record_detail(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $leaseId] = $this->fieldSession('detail-owner@dti.test');
        [$other] = $this->fieldSession('detail-other@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'detail-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store('detail');
        $verification = $this->verification($store, $admin, ['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->syncPayload($store, $this->bulletin(), $leaseId, $verification->id))
            ->assertCreated()->json('data.results.0.record_id');

        Sanctum::actingAs($other->fresh(), ['field-monitoring']);
        $this->getJson("/api/field/monitoring-records/{$recordId}")->assertNotFound();
    }

    public function test_sync_persists_the_exact_emergency_reference_and_flags_any_price_above_the_ceiling(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $leaseId] = $this->fieldSession('emergency-sync@dti.test');
        $admin = User::create(['name' => 'Admin', 'email' => 'emergency-sync-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store('emergency');
        $verification = $this->verification($store, $admin, ['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $bulletin = $this->bulletin();
        $emergency = RegulatoryEmergency::create([
            'location' => 'A different province', 'starts_on' => now()->subDay(),
            'declaration_reference' => 'DECL-SYNC', 'status' => 'active',
            'confirmed_at' => now(), 'responsible_admin_id' => $admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 100,
            'effective_from' => now()->subDay(), 'location' => 'A different province',
            'declaration_reference' => 'DECL-SYNC', 'source_reference' => 'APC-SYNC',
            'created_by' => $admin->id,
        ]);
        $payload = $this->syncPayload($store, $bulletin, $leaseId, $verification->id);
        $payload['records'][0]['items'][0]['recorded_price'] = 100.01;

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'reference_status' => 'available',
            'reference_type' => 'emergency_ceiling', 'reference_value' => 100,
            'reference_source' => 'APC-SYNC', 'is_anomaly' => true,
        ]);
    }
}
