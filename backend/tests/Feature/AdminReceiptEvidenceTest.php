<?php

namespace Tests\Feature;

use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminReceiptEvidenceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('receipt_evidence');
        $this->admin = User::create([
            'name' => 'Receipt Evaluator',
            'email' => 'receipt-evaluator@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-RECEIPT-ADMIN',
            'store_name' => 'Receipt Admin Mart',
            'owner_name' => 'Store Owner',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
            'recidivism_index' => 0,
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_admin_queue_excludes_unconfirmed_drafts_and_returns_confirmed_items(): void
    {
        $draft = $this->createReport('DRAFT', 'Ready for confirmation', false);
        $submitted = $this->createReport('SUBMITTED', 'Submitted', true);
        $submitted->items()->create([
            'sequence' => 0,
            'item_name' => 'Rice',
            'observed_price' => 45,
            'consumer_confirmed' => true,
        ]);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.report_reference', $submitted->report_reference)
            ->assertJsonPath('data.0.items.0.item_name', 'Rice');

        $this->assertDatabaseHas('consumer_reports', ['id' => $draft->id, 'status' => 'Ready for confirmation']);
    }

    public function test_admin_evidence_manifest_hides_paths_and_audits_authorized_asset_download(): void
    {
        $report = $this->createReport('EVIDENCE', 'Submitted', true);
        $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/frame.jpg";
        Storage::disk('receipt_evidence')->put($path, 'private-frame');
        $asset = ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'extracted_frame',
            'sequence' => 0,
            'disk' => 'receipt_evidence',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => strlen('private-frame'),
            'sha256' => hash('sha256', 'private-frame'),
        ]);

        $manifest = $this->getJson("/api/admin/reports/{$report->id}/evidence-manifest")
            ->assertOk()
            ->assertJsonPath('data.assets.0.id', $asset->id)
            ->assertJsonPath('data.assets.0.kind', 'extracted_frame')
            ->assertJsonMissingPath('data.assets.0.path');
        $this->assertStringNotContainsString($path, $manifest->getContent());

        $this->get("/api/admin/reports/{$report->id}/evidence-assets/{$asset->id}")->assertOk();
        $this->assertDatabaseHas('audit_events', [
            'action' => 'report.evidence_asset_accessed',
            'subject_id' => $report->id,
        ]);
    }

    public function test_private_evidence_download_fails_closed_when_audit_storage_is_unavailable(): void
    {
        $report = $this->createReport('AUDIT-DOWN', 'Submitted', true);
        $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/frame.jpg";
        Storage::disk('receipt_evidence')->put($path, 'private-frame');
        $asset = ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'extracted_frame',
            'sequence' => 0,
            'disk' => 'receipt_evidence',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => strlen('private-frame'),
            'sha256' => hash('sha256', 'private-frame'),
        ]);
        Schema::drop('audit_events');

        $this->get("/api/admin/reports/{$report->id}/evidence-assets/{$asset->id}")
            ->assertStatus(503)
            ->assertJsonPath('message', 'Audit trail is unavailable. Private evidence cannot be accessed safely.');
    }

    public function test_per_item_decisions_create_findings_but_count_one_receipt_incident(): void
    {
        $rice = SrpBulletin::create([
            'commodity_name' => 'Rice', 'commodity_key' => 'rice-1kg', 'unit' => 'kg',
            'baseline_price' => 42, 'effective_date' => '2026-08-01', 'is_active' => true,
        ]);
        $sugar = SrpBulletin::create([
            'commodity_name' => 'Sugar', 'commodity_key' => 'sugar-1kg', 'unit' => 'kg',
            'baseline_price' => 65, 'effective_date' => '2026-08-01', 'is_active' => true,
        ]);
        $report = $this->createReport('ITEMS', 'Submitted', true);
        $riceItem = $report->items()->create(['sequence' => 0, 'item_name' => 'Rice', 'observed_price' => 55, 'srp_id' => $rice->id, 'consumer_confirmed' => true]);
        $sugarItem = $report->items()->create(['sequence' => 1, 'item_name' => 'Sugar', 'observed_price' => 80, 'srp_id' => $sugar->id, 'consumer_confirmed' => true]);

        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'validate',
            'reason' => 'Each confirmed receipt line was reviewed against the applicable bulletin.',
            'item_decisions' => [
                ['item_id' => $riceItem->id, 'commodity_key' => 'rice-1kg', 'commodity_name' => 'Rice', 'receipt_price' => 55, 'observed_at' => '2026-08-16', 'regulatory_finding' => 'confirmed_violation'],
                ['item_id' => $sugarItem->id, 'commodity_key' => 'sugar-1kg', 'commodity_name' => 'Sugar', 'receipt_price' => 80, 'observed_at' => '2026-08-16', 'regulatory_finding' => 'confirmed_violation'],
            ],
        ])->assertOk();

        $this->assertSame(2, RegulatoryFinding::where('source_type', 'consumer_report_item')->where('decision', 'confirmed')->count());
        $this->store->refresh();
        $this->assertSame(1, $this->store->recidivism_index);
    }

    private function createReport(string $suffix, string $status, bool $submitted): ConsumerReport
    {
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'finalized',
            'token_hash' => hash('sha256', 'capture-'.$suffix),
            'expires_at' => now()->addHour(),
            'is_used' => true,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(),
            'capture_session_id' => $session->id,
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => $submitted ? 'confirmed' : 'ready',
            'processing_result_json' => ['continuity' => ['status' => 'ready'], 'merchant' => ['status' => 'matched']],
        ]);

        return ConsumerReport::create([
            'report_reference' => 'REP-ADMIN-'.$suffix,
            'tracking_token_hash' => hash('sha256', 'tracking-'.$suffix),
            'store_id' => $this->store->id,
            'submission_uuid' => 'submission-'.$suffix,
            'capture_session_id' => $session->id,
            'receipt_evidence_bundle_id' => $bundle->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => $submitted ? 'confirmed' : 'ready',
            'status' => $status,
            'submitted_at' => $submitted ? now() : null,
            'privacy_notice_version' => '1.0',
        ]);
    }
}
