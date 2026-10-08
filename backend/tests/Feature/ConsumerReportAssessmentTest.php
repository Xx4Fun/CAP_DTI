<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\FieldVerificationRequest;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\RegulatoryFinding;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsumerReportAssessmentTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('receipt_evidence');
        $this->store = Store::create(['store_name' => 'Assessment Mart', 'address' => 'San Jose', 'latitude' => 10.7, 'longitude' => 121.9]);
        $this->bulletin = SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'commodity_key' => 'saba-sardines-155g', 'unit' => '155g', 'baseline_price' => 21.50, 'effective_date' => '2026-01-01', 'is_active' => true]);
    }

    private function receipt(float $price = 21.50, array $raw = []): ConsumerReport
    {
        $uuid = (string) Str::uuid();
        $session = CaptureSession::create(['session_uuid' => $uuid, 'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1', 'processing_status' => 'finalized', 'token_hash' => hash('sha256', $uuid), 'expires_at' => now()->addHour(), 'is_used' => true]);
        $result = array_replace(['transaction_date' => '2026-07-20', 'merchant' => ['status' => 'matched'], 'warnings' => [], 'manual_review_required' => false, 'evidence_assessment' => ['is_receipt' => true, 'legibility' => 'clear', 'problems' => []]], $raw);
        $bundle = ReceiptEvidenceBundle::create(['evidence_uuid' => $uuid, 'capture_session_id' => $session->id, 'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1', 'processing_status' => 'ready', 'processing_result_json' => $result]);
        $report = ConsumerReport::create(['report_reference' => 'REP-'.$uuid, 'tracking_token_hash' => hash('sha256', 'tracking-'.$uuid), 'store_id' => $this->store->id, 'submission_uuid' => $uuid, 'capture_session_id' => $session->id, 'receipt_evidence_bundle_id' => $bundle->id, 'capture_mode' => 'guided_photos_v1', 'processing_status' => 'ready', 'status' => 'Ready for confirmation', 'raw_ocr_json' => $result, 'privacy_notice_version' => '1.0']);
        $bundle->update(['consumer_report_id' => $report->id]);
        Storage::disk('receipt_evidence')->put($uuid.'.jpg', 'original');
        ReceiptEvidenceAsset::create(['receipt_evidence_bundle_id' => $bundle->id, 'kind' => 'source_frame', 'sequence' => 0, 'disk' => 'receipt_evidence', 'path' => $uuid.'.jpg', 'mime_type' => 'image/jpeg', 'size_bytes' => 8, 'sha256' => hash('sha256', 'original')]);
        $report->items()->create(['sequence' => 0, 'item_name' => 'Saba Sardines 155g', 'quantity' => 1, 'unit_price' => $price, 'line_total' => $price, 'srp_id' => $this->bulletin->id, 'srp_match_json' => ['auto_matched' => true], 'uncertain_fields' => []]);
        return $report;
    }

    private function submit(ConsumerReport $report)
    {
        return $this->withHeader('X-Tracking-Token', 'tracking-'.$report->submission_uuid)->postJson('/api/public/reports/'.$report->report_reference.'/confirm-ocr', ['consumer_confirmed' => true]);
    }

    private function admin(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Evaluator', 'email' => 'assessment@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']));
    }

    public function test_clear_receipt_is_resolved_automatically_without_a_regulatory_finding(): void
    {
        $report = $this->receipt();
        $this->submit($report)->assertOk()->assertJsonPath('data.status', 'Resolved');
        $this->assertSame('no_violation', $report->fresh()->automatic_assessment_json['category']);
        $this->assertNull($report->fresh()->evaluator_confirmed_json);
        $this->assertSame(0, RegulatoryFinding::count());
        $this->assertSame(0, $this->store->fresh()->recidivism_index);
        $this->assertDatabaseHas('report_status_histories', ['consumer_report_id' => $report->id, 'new_status' => 'Resolved', 'actor_type' => 'system']);
        $this->assertDatabaseHas('audit_events', ['action' => 'report.automatically_assessed', 'actor_id' => null]);
        $counts = [CitizenTip::count(), ReportStatusHistory::count(), AuditEvent::count()];
        $this->submit($report)->assertOk()->assertJsonPath('data.status', 'Resolved');
        $this->assertSame($counts, [CitizenTip::count(), ReportStatusHistory::count(), AuditEvent::count()]);
    }

    public function test_overprice_and_mixed_receipt_are_detected_but_not_confirmed(): void
    {
        $report = $this->receipt(22);
        $report->items()->create(['sequence' => 1, 'item_name' => 'UNKNOWN', 'unit_price' => 10, 'uncertain_fields' => ['item_name']]);
        $this->submit($report)->assertOk();
        $this->admin();
        $this->getJson('/api/admin/reports?filter=violations')->assertOk()->assertJsonPath('data.0.category', 'violations')->assertJsonPath('meta.filter_counts.confirmed_findings', 0);
        $this->assertSame(0, RegulatoryFinding::count());
        $this->assertSame('Submitted', $report->fresh()->status);
    }

    public function test_uncertain_extraction_and_missing_dates_never_auto_close(): void
    {
        foreach ([['transaction_date' => null], ['warnings' => [['code' => 'GEMINI_FALLBACK_USED', 'message' => 'Verify extraction']], 'manual_review_required' => true], ['merchant' => ['status' => 'unverified']], ['evidence_assessment' => ['is_receipt' => true, 'legibility' => 'partially_readable', 'problems' => ['blur']]]] as $raw) {
            $report = $this->receipt(20, $raw);
            $this->submit($report)->assertOk();
            $this->assertSame('Submitted', $report->fresh()->status);
            $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
        }
    }

    public function test_dti_confirmation_moves_detection_to_confirmed_findings(): void
    {
        $report = $this->receipt(22);
        $this->submit($report)->assertOk();
        $this->admin();
        $item = $report->items()->first();
        $this->postJson('/api/admin/reports/'.$report->id.'/decision', ['action' => 'validate', 'reason' => 'Verified against the receipt.', 'item_decisions' => [['item_id' => $item->id, 'commodity_key' => $this->bulletin->commodity_key, 'receipt_price' => 22, 'observed_at' => '2026-07-20', 'regulatory_finding' => 'confirmed_violation']]])->assertOk()->assertJsonPath('data.category', 'confirmed_findings');
        $this->getJson('/api/admin/reports?filter=violations')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/admin/reports?filter=confirmed_findings')->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(1, $this->store->fresh()->recidivism_index);
    }

    public function test_unmatched_uncertain_and_missing_prices_or_references_stay_for_review(): void
    {
        foreach ([['srp_id' => null], ['uncertain_fields' => ['unit_price']], ['possible_duplicate_of' => 1], ['unit_price' => null, 'quantity' => 2], ['srp_match_json' => ['auto_matched' => false]]] as $changes) {
            $report = $this->receipt(20);
            $report->items()->first()->update($changes);
            $this->submit($report)->assertOk();
            $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
        }
        $report = $this->receipt(20, ['transaction_date' => '2025-01-01']);
        $this->submit($report)->assertOk();
        $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_pending_batch_previews_without_writes_and_applies_once_preserving_decisions_and_assignments(): void
    {
        $pending = $this->receipt(20);
        $pending->update(['status' => 'Submitted']);
        $decided = $this->receipt(20);
        $decided->update(['status' => 'Under initial evaluation', 'evaluator_confirmed_json' => ['regulatory_finding' => 'insufficient_evidence']]);
        $assigned = $this->receipt(20);
        $assigned->update(['status' => 'Submitted']);
        $admin = User::create(['name' => 'Manager', 'email' => 'batch@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        FieldVerificationRequest::create(['consumer_report_id' => $assigned->id, 'store_id' => $this->store->id, 'requested_by' => $admin->id, 'status' => 'open', 'reason' => 'Verify', 'context_json' => [], 'requested_at' => now()]);
        $this->artisan('reports:assess-pending')->expectsOutputToContain('No Violations: 1')->assertSuccessful();
        $this->assertNull($pending->fresh()->automatic_assessment_json);
        $this->assertSame(0, AuditEvent::count());
        $this->artisan('reports:assess-pending', ['--apply' => true])->assertSuccessful();
        $this->assertSame('Resolved', $pending->fresh()->status);
        $this->assertNull($decided->fresh()->automatic_assessment_json);
        $this->assertNull($assigned->fresh()->automatic_assessment_json);
        $this->artisan('reports:assess-pending', ['--apply' => true])->expectsOutputToContain('No Violations: 0')->assertSuccessful();
        $this->assertSame(1, AuditEvent::count());
    }

    public function test_categories_and_counts_are_exclusive_across_pages_and_store_scope(): void
    {
        $this->submit($this->receipt(22))->assertOk();
        $this->submit($this->receipt(20))->assertOk();
        $this->submit($this->receipt(20, ['transaction_date' => null]))->assertOk();
        $completed = $this->receipt();
        $completed->update(['status' => 'Under regulatory review']);
        $this->admin();
        $response = $this->getJson('/api/admin/reports?filter=violations&per_page=1&store_id='.$this->store->id)->assertOk()->assertJsonCount(1, 'data');
        $response->assertJsonPath('meta.total', 2)->assertJsonPath('meta.filter_counts.violations', 2)->assertJsonPath('meta.filter_counts.no_violation', 1)->assertJsonPath('meta.filter_counts.to_review', 1)->assertJsonPath('meta.filter_counts.confirmed_findings', 0)->assertJsonPath('meta.filter_counts.all', 4);
        $this->getJson('/api/admin/reports?filter=all&date_from=2026-07-20&date_to=2026-07-20')->assertOk()->assertJsonPath('meta.filter_counts.all', 3);
    }

    public function test_manual_insufficient_evidence_does_not_mean_no_violation(): void
    {
        $report = $this->receipt(22);
        $this->submit($report)->assertOk();
        $this->admin();
        $this->postJson('/api/admin/reports/'.$report->id.'/decision', ['action' => 'validate', 'reason' => 'Cannot identify product.', 'item_decisions' => [['item_id' => $report->items()->first()->id, 'receipt_price' => 22, 'observed_at' => '2026-07-20', 'regulatory_finding' => 'insufficient_evidence']]])->assertOk()->assertJsonPath('data.category', 'to_review');
        $this->getJson('/api/admin/reports?filter=no_violation')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_missing_audit_rolls_back_submission_and_automatic_resolution(): void
    {
        $report = $this->receipt(20);
        Schema::drop('audit_events');
        $this->submit($report)->assertStatus(503);
        $this->assertSame('Ready for confirmation', $report->fresh()->status);
        $this->assertNull($report->fresh()->automatic_assessment_json);
        $this->assertSame(0, CitizenTip::count());
        $this->assertSame(0, ReportStatusHistory::count());
    }

    public function test_pending_receipt_with_compromised_originals_cannot_assert_a_reliable_violation(): void
    {
        $report = $this->receipt(22);
        $report->update(['status' => 'Submitted']);
        $asset = $report->evidenceBundle->assets()->first();
        Storage::disk('receipt_evidence')->put($asset->path, 'changed');
        $this->artisan('reports:assess-pending', ['--apply' => true])->assertSuccessful();
        $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_bundle_review_warnings_are_retained_even_if_the_raw_mirror_has_none(): void
    {
        $report = $this->receipt(20);
        $result = $report->evidenceBundle->processing_result_json;
        $result['warnings'] = [['code' => 'GEMINI_FALLBACK_USED', 'message' => 'Verify extraction against photos.']];
        $report->evidenceBundle->update(['processing_result_json' => $result]);
        $this->submit($report)->assertOk();
        $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_unknown_quantity_cannot_turn_a_line_total_into_a_reliable_unit_price(): void
    {
        $report = $this->receipt(20);
        $report->items()->first()->update(['unit_price' => null, 'observed_price' => 20, 'quantity' => null]);
        $this->submit($report)->assertOk();
        $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_automatically_resolved_report_displays_the_reference_used_for_its_assessment(): void
    {
        $report = $this->receipt(20);
        $this->submit($report)->assertOk();
        $this->bulletin->update(['baseline_price' => 19]);
        $this->admin();
        $this->getJson('/api/admin/reports?filter=no_violation')->assertOk()
            ->assertJsonPath('data.0.items.0.reference.value', 21.5)
            ->assertJsonPath('data.0.items.0.reference.is_above_reference', false);
    }

    public function test_uncertain_receipt_date_cannot_support_a_detected_violation(): void
    {
        foreach ([['transaction_date_uncertain' => true], ['warnings' => [['code' => 'FIELDS_UNCERTAIN', 'message' => 'Some values are uncertain.']]]] as $raw) {
            $report = $this->receipt(22, $raw);
            $this->submit($report)->assertOk();
            $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
        }
    }

    public function test_known_receipt_date_allows_a_reliable_overprice_despite_another_uncertain_item(): void
    {
        $report = $this->receipt(22, ['transaction_date_uncertain' => false, 'manual_review_required' => true, 'warnings' => [['code' => 'FIELDS_UNCERTAIN', 'message' => 'Another line is uncertain.']]]);
        $report->items()->create(['sequence' => 1, 'item_name' => 'UNKNOWN', 'unit_price' => 10, 'uncertain_fields' => ['item_name']]);
        $this->submit($report)->assertOk();
        $this->assertSame('violations', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_unknown_receipt_quality_cannot_support_a_detected_violation(): void
    {
        $report = $this->receipt(22, ['evidence_assessment' => null]);
        $this->submit($report)->assertOk();
        $this->assertSame('to_review', $report->fresh()->automatic_assessment_json['category']);
    }

    public function test_pending_violation_uses_the_current_reference_for_dti_checking(): void
    {
        $report = $this->receipt(22);
        $this->submit($report)->assertOk();
        $this->bulletin->update(['baseline_price' => 23]);
        $this->admin();
        $this->getJson('/api/admin/reports?filter=violations')->assertOk()
            ->assertJsonPath('data.0.items.0.reference.value', 23)
            ->assertJsonPath('data.0.items.0.reference.is_above_reference', false)
            ->assertJsonPath('data.0.automatic_assessment_json.items.0.reference.value', 21.5);
    }
}
