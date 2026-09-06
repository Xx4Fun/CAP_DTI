<?php

namespace Tests\Feature;

use App\Models\ConsumerReport;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\RegulatoryFinding;
use App\Models\Store;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use LogicException;
use Tests\TestCase;

class AdminFieldVerificationRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create([
            'name' => 'Evaluator', 'email' => 'verification-admin@dti.test',
            'password' => 'password', 'role' => 'dti_evaluator',
        ]);
        $this->store = Store::create([
            'dti_sec_number' => 'VERIFY-STORE-1', 'store_name' => 'Verification Store',
            'owner_name' => 'Owner', 'latitude' => 10.7, 'longitude' => 122.0,
            'address' => 'Antique', 'is_active' => true,
        ]);
        Sanctum::actingAs($this->admin, ['dti-admin']);
    }

    private function report(?Store $store = null): ConsumerReport
    {
        return ConsumerReport::create([
            'report_reference' => 'VERIFY-REPORT-1',
            'tracking_token_hash' => hash('sha256', 'token'),
            'submission_uuid' => 'verification-submission-1',
            'store_id' => ($store ?? $this->store)->id,
            'status' => 'Under initial evaluation',
            'raw_ocr_json' => ['items' => [['commodity_name' => 'Rice', 'receipt_price' => 60]]],
            'submitted_at' => now()->subHour(),
        ]);
    }

    public function test_admin_refers_a_report_once_without_creating_a_regulatory_finding_and_lists_the_summary(): void
    {
        $report = $this->report();

        $response = $this->postJson("/api/admin/reports/{$report->id}/verification-request", [
            'reason' => 'Verify the shelf price in person.',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.consumer_report_id', $report->id);

        $requestId = $response->json('data.id');
        $this->assertDatabaseHas('consumer_reports', ['id' => $report->id, 'status' => 'Referred for field verification']);
        $this->assertDatabaseHas('report_status_histories', [
            'consumer_report_id' => $report->id,
            'previous_status' => 'Under initial evaluation',
            'new_status' => 'Referred for field verification',
        ]);
        $this->assertDatabaseHas('audit_events', ['action' => 'field_verification.requested', 'subject_id' => $requestId]);
        $this->assertSame(0, RegulatoryFinding::count());

        $this->postJson("/api/admin/reports/{$report->id}/verification-request", [
            'reason' => 'Do not create another request.',
        ])->assertStatus(409);
        $this->assertDatabaseCount('field_verification_requests', 1);

        $this->getJson('/api/admin/reports')->assertOk()
            ->assertJsonPath('data.0.verification_request.id', $requestId)
            ->assertJsonPath('data.0.verification_request.status', 'open');
    }

    public function test_referral_requires_an_active_linked_store(): void
    {
        $report = $this->report();
        $this->store->update(['is_active' => false]);

        $this->postJson("/api/admin/reports/{$report->id}/verification-request", [
            'reason' => 'This store is inactive.',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('field_verification_requests', 0);
    }

    public function test_admin_can_cancel_and_reopen_unclaimed_requests_without_stranding_claimed_work(): void
    {
        $report = $this->report();
        $report->update(['status' => 'Referred for field verification']);
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Visit requested.',
            'context_json' => ['report_reference' => $report->report_reference, 'return_status' => 'Under initial evaluation'], 'requested_at' => now(),
        ]);

        $this->postJson("/api/admin/verification-requests/{$verification->id}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame('Under initial evaluation', $report->fresh()->status);
        $this->assertDatabaseHas('report_status_histories', [
            'consumer_report_id' => $report->id,
            'previous_status' => 'Referred for field verification',
            'new_status' => 'Under initial evaluation',
        ]);
        $this->postJson("/api/admin/verification-requests/{$verification->id}/cancel")
            ->assertStatus(422);
        $this->postJson("/api/admin/verification-requests/{$verification->id}/reopen")
            ->assertOk()->assertJsonPath('data.status', 'open');
        $this->assertSame('Referred for field verification', $report->fresh()->status);
        $this->assertDatabaseHas('report_status_histories', [
            'consumer_report_id' => $report->id,
            'previous_status' => 'Under initial evaluation',
            'new_status' => 'Referred for field verification',
        ]);

        $officer = User::create([
            'name' => 'Officer', 'email' => 'claimed-officer@dti.test',
            'password' => 'password', 'role' => 'field_officer',
        ]);
        $verification->update(['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $this->postJson("/api/admin/verification-requests/{$verification->id}/reopen")
            ->assertStatus(422);
        $this->assertSame('claimed', $verification->fresh()->status);
        $this->assertSame($officer->id, $verification->fresh()->claimed_by);
        $this->assertDatabaseHas('audit_events', ['action' => 'field_verification.reopened', 'subject_id' => $verification->id]);
    }

    public function test_verification_request_context_cannot_be_changed_after_creation(): void
    {
        $report = $this->report();
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Snapshot required.',
            'context_json' => ['reported_price' => 50], 'requested_at' => now(),
        ]);

        $this->expectException(LogicException::class);
        $verification->update(['context_json' => ['reported_price' => 999]]);
    }

    public function test_open_or_claimed_verification_blocks_an_ordinary_report_decision(): void
    {
        $report = $this->report();
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Visit first.',
            'context_json' => ['previous_status' => 'Under initial evaluation'], 'requested_at' => now(),
        ]);

        foreach (['open', 'claimed'] as $status) {
            $verification->update(['status' => $status]);
            $this->postJson("/api/admin/reports/{$report->id}/decision", [
                'action' => 'dismiss', 'reason' => 'Must wait for the visit.',
            ])->assertStatus(409);
        }
        $this->assertDatabaseCount('regulatory_findings', 0);
        $this->assertSame('Under initial evaluation', $report->fresh()->status);
    }

    public function test_report_cannot_be_deleted_while_its_verification_request_exists(): void
    {
        $report = $this->report();
        FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Retain source.',
            'context_json' => ['previous_status' => $report->status], 'requested_at' => now(),
        ]);

        $this->expectException(QueryException::class);
        $report->delete();
    }

    public function test_admin_lists_verification_requests_with_source_and_result_links(): void
    {
        $report = $this->report();
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'completed', 'reason' => 'Confirm shelf price.',
            'context_json' => ['report_reference' => $report->report_reference],
            'requested_at' => now()->subHour(), 'completed_at' => now(),
        ]);
        $record = MonitoringRecord::create([
            'client_uuid' => 'd1d0a181-a590-4f95-b96e-aadab8e09a67',
            'officer_user_id' => $this->admin->id, 'store_id' => $this->store->id,
            'status' => 'accepted', 'started_at' => now()->subMinutes(20),
            'finalized_at' => now()->subMinutes(5), 'received_at' => now()->subMinutes(4),
            'latitude' => 10.7, 'longitude' => 122.0, 'location_accuracy_meters' => 8,
            'location_captured_at' => now()->subMinutes(5), 'representative_name' => 'Owner',
            'officer_signature_disk' => 'receipt_evidence', 'officer_signature_path' => 'officer.png',
            'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'receipt_evidence', 'representative_signature_path' => 'representative.png',
            'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
            'field_verification_request_id' => $verification->id,
        ]);

        $this->getJson('/api/admin/verification-requests?status=completed&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.store.id', $this->store->id)
            ->assertJsonPath('data.data.0.report.id', $report->id)
            ->assertJsonPath('data.data.0.report.report_reference', $report->report_reference)
            ->assertJsonPath('data.data.0.monitoring_record.id', $record->id);
    }
}
