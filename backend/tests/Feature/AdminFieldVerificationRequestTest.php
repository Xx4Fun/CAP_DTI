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
        $officer = User::create([
            'name' => 'Assigned Officer', 'email' => 'assigned@dti.test',
            'password' => 'password', 'role' => 'field_officer', 'is_active' => true,
        ]);

        $response = $this->postJson("/api/admin/reports/{$report->id}/verification-request", [
            'reason' => 'Verify the shelf price in person.',
            'field_officer_id' => $officer->id,
        ])->assertCreated()
            ->assertJsonPath('data.status', 'claimed')
            ->assertJsonPath('data.report_state.category', 'with_officer')
            ->assertJsonPath('data.report_state.status', 'Referred for field verification')
            ->assertJsonPath('data.source_type', 'complaint')
            ->assertJsonPath('data.claimed_by', $officer->id)
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
            'field_officer_id' => $officer->id,
        ])->assertStatus(409);
        $this->assertDatabaseCount('field_verification_requests', 1);

        $this->getJson('/api/admin/reports')->assertOk()
            ->assertJsonPath('data.0.verification_request.id', $requestId)
            ->assertJsonPath('data.0.verification_request.status', 'claimed');
    }

    public function test_admin_assigns_a_supervisor_directive_without_a_consumer_report(): void
    {
        $officer = User::create([
            'name' => 'Directive Officer', 'email' => 'directive@dti.test',
            'password' => 'password', 'role' => 'field_officer', 'is_active' => true,
        ]);

        $response = $this->postJson("/api/admin/monitoring-establishments/{$this->store->id}/additional-visits", [
            'reason' => 'Supervisor requested a second shelf inspection.',
            'field_officer_id' => $officer->id,
        ])->assertCreated()
            ->assertJsonPath('data.source_type', 'supervisor_directive')
            ->assertJsonPath('data.consumer_report_id', null)
            ->assertJsonPath('data.status', 'claimed')
            ->assertJsonPath('data.claimed_by', $officer->id);

        $this->assertDatabaseHas('audit_events', [
            'action' => 'field_verification.requested',
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_admin_assigns_only_active_field_officers_to_returned_requests(): void
    {
        $inactive = User::create([
            'name' => 'Inactive Officer', 'email' => 'inactive-assignment@dti.test',
            'password' => 'password', 'role' => 'field_officer', 'is_active' => false,
        ]);
        $active = User::create([
            'name' => 'Active Officer', 'email' => 'active-assignment@dti.test',
            'password' => 'password', 'role' => 'field_officer', 'is_active' => true,
        ]);
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => null, 'source_type' => 'supervisor_directive',
            'store_id' => $this->store->id, 'requested_by' => $this->admin->id,
            'status' => 'open', 'reason' => 'Returned task.', 'context_json' => [], 'requested_at' => now(),
        ]);

        $this->postJson("/api/admin/verification-requests/{$verification->id}/assign", [
            'field_officer_id' => $inactive->id,
        ])->assertUnprocessable();

        $this->postJson("/api/admin/verification-requests/{$verification->id}/assign", [
            'field_officer_id' => $active->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'claimed')
            ->assertJsonPath('data.claimed_by', $active->id);
    }

    public function test_admin_cancels_and_reopens_an_unassigned_supervisor_directive(): void
    {
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => null, 'source_type' => 'supervisor_directive',
            'store_id' => $this->store->id, 'requested_by' => $this->admin->id,
            'status' => 'open', 'reason' => 'Returned directive.', 'context_json' => [], 'requested_at' => now(),
        ]);

        $this->postJson("/api/admin/verification-requests/{$verification->id}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->postJson("/api/admin/verification-requests/{$verification->id}/reopen")
            ->assertOk()->assertJsonPath('data.status', 'open');
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

        $otherStore = Store::create(['store_name' => 'Other Store', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121, 'is_active' => true]);
        $otherReport = ConsumerReport::create([
            'report_reference' => 'VERIFY-REPORT-2', 'tracking_token_hash' => hash('sha256', 'other-token'),
            'submission_uuid' => 'verification-submission-2', 'store_id' => $otherStore->id,
            'status' => 'Under initial evaluation', 'raw_ocr_json' => [], 'submitted_at' => now(),
        ]);
        FieldVerificationRequest::create([
            'consumer_report_id' => $otherReport->id, 'store_id' => $otherStore->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Other visit', 'context_json' => [], 'requested_at' => now(),
        ]);
        $this->getJson("/api/admin/verification-requests?store_id={$this->store->id}&per_page=10")
            ->assertOk()->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.store.id', $this->store->id);
    }

    public function test_weekly_routine_and_verification_filters_remain_independent(): void
    {
        $officer = User::create([
            'name' => 'Routine Officer', 'email' => 'routine@dti.test', 'password' => 'password', 'role' => 'field_officer',
        ]);
        MonitoringRecord::create([
            'client_uuid' => 'a1d0a181-a590-4f95-b96e-aadab8e09a67', 'officer_user_id' => $officer->id,
            'store_id' => $this->store->id, 'status' => 'accepted', 'started_at' => now()->subMinutes(20),
            'finalized_at' => now()->subMinute(), 'received_at' => now()->subWeeks(2),
            'latitude' => 10.7, 'longitude' => 122.0, 'location_accuracy_meters' => 8,
            'location_captured_at' => now()->subMinute(), 'representative_name' => 'Owner',
            'officer_signature_disk' => 'receipt_evidence', 'officer_signature_path' => 'officer.png',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'receipt_evidence',
            'representative_signature_path' => 'representative.png', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'offline_queue',
        ]);
        $report = $this->report();
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => $report->id, 'store_id' => $this->store->id,
            'requested_by' => $this->admin->id, 'status' => 'open', 'reason' => 'Verify separately.',
            'context_json' => [], 'requested_at' => now(),
        ]);

        $this->getJson('/api/admin/monitoring-establishments?weekly_status=monitored_this_week&additional_task=verification_required&observation=all')
            ->assertOk()
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.weekly_routine_status', 'monitored_this_week')
            ->assertJsonPath('data.establishments.data.0.verification_task_status', 'open')
            ->assertJsonPath('data.weekly_summary.verification_required', 1);

        $verification->update(['status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now()]);
        $this->getJson('/api/admin/monitoring-establishments?additional_task=verification_required')
            ->assertOk()
            ->assertJsonPath('data.establishments.data.0.verification_task_status', 'claimed')
            ->assertJsonPath('data.establishments.data.0.verification_claimant.name', 'Routine Officer');

        $verification->update(['status' => 'completed', 'completed_at' => now()]);
        $this->getJson('/api/admin/monitoring-establishments?additional_task=verification_required')
            ->assertOk()->assertJsonPath('data.establishments.total', 0);
        $this->getJson('/api/admin/monitoring-establishments?weekly_status=monitored_this_week')
            ->assertOk()->assertJsonPath('data.establishments.total', 1);
    }

    public function test_a_report_still_processing_cannot_be_referred_for_verification(): void
    {
        $report = $this->report();
        $report->update(['status' => 'Processing']);
        $officer = User::create(['name' => 'Assigned Officer', 'email' => 'assigned@dti.test', 'password' => 'password', 'role' => 'field_officer', 'is_active' => true]);
        $this->postJson("/api/admin/reports/{$report->id}/verification-request", ['reason' => 'Verify the shelf price in person.', 'field_officer_id' => $officer->id])
            ->assertConflict();
        $this->assertSame(0, \App\Models\FieldVerificationRequest::count());
    }
}
