<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ConsumerReportEditingAndAuditTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('receipt_evidence');
        $this->store = Store::create([
            'store_name' => 'San Jose Grocery',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
        ]);
        $this->bulletin = SrpBulletin::create([
            'commodity_name' => 'Saba Sardines',
            'commodity_key' => 'saba-sardines-155g',
            'unit' => '155g',
            'baseline_price' => 21.50,
            'effective_date' => '2026-01-01',
            'is_active' => true,
        ]);
    }

    private function createReport(float $price = 21.50): ConsumerReport
    {
        $uuid = (string) Str::uuid();
        $session = CaptureSession::create([
            'session_uuid' => $uuid,
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'finalized',
            'token_hash' => hash('sha256', $uuid),
            'expires_at' => now()->addHour(),
            'is_used' => true,
        ]);

        $result = [
            'transaction_date' => '2026-07-20',
            'merchant' => ['status' => 'matched', 'display_name' => 'San Jose Grocery'],
            'warnings' => [],
            'manual_review_required' => false,
            'evidence_assessment' => ['is_receipt' => true, 'legibility' => 'clear', 'problems' => []],
        ];

        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => $uuid,
            'capture_session_id' => $session->id,
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'ready',
            'processing_result_json' => $result,
        ]);

        $report = ConsumerReport::create([
            'report_reference' => 'REP-'.$uuid,
            'tracking_token_hash' => hash('sha256', 'tracking-'.$uuid),
            'store_id' => $this->store->id,
            'submission_uuid' => $uuid,
            'capture_session_id' => $session->id,
            'receipt_evidence_bundle_id' => $bundle->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'ready',
            'status' => 'Ready for confirmation',
            'raw_ocr_json' => $result,
            'privacy_notice_version' => '1.0',
        ]);
        $bundle->update(['consumer_report_id' => $report->id]);

        Storage::disk('receipt_evidence')->put($uuid.'.jpg', 'original-photo');
        ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $bundle->id,
            'kind' => 'source_frame',
            'sequence' => 0,
            'disk' => 'receipt_evidence',
            'path' => $uuid.'.jpg',
            'mime_type' => 'image/jpeg',
            'size_bytes' => 14,
            'sha256' => hash('sha256', 'original-photo'),
        ]);

        $report->items()->create([
            'sequence' => 0,
            'item_name' => 'Saba Sardines',
            'quantity' => 1,
            'unit' => '155g',
            'unit_price' => $price,
            'line_total' => $price,
            'srp_id' => $this->bulletin->id,
            'srp_match_json' => ['auto_matched' => true],
            'uncertain_fields' => [],
        ]);

        return $report;
    }

    public function test_confirm_without_edits_records_unaltered_submission()
    {
        $report = $this->createReport(21.50);

        $response = $this->withHeader('X-Tracking-Token', 'tracking-'.$report->submission_uuid)
            ->postJson('/api/public/reports/'.$report->report_reference.'/confirm-ocr', [
                'consumer_confirmed' => true,
            ]);

        $response->assertOk();
        $report->refresh();

        // Clean unedited reports can auto-resolve to 'Resolved'
        $this->assertEquals('Resolved', $report->status);
        $this->assertFalse(data_get($report->consumer_confirmed_json, 'has_edits'));
        $item = $report->items->first();
        $this->assertTrue($item->consumer_confirmed);
        $this->assertNull($item->consumer_correction_json);
        $this->assertFalse(AuditEvent::where('action', 'report.consumer_edited')->exists());
    }

    public function test_confirm_with_edits_records_audit_trail_and_prevents_auto_resolve()
    {
        $report = $this->createReport(21.50);

        $response = $this->withHeader('X-Tracking-Token', 'tracking-'.$report->submission_uuid)
            ->postJson('/api/public/reports/'.$report->report_reference.'/confirm-ocr', [
                'consumer_confirmed' => true,
                'items' => [
                    [
                        'sequence' => 0,
                        'item_name' => 'Saba Sardines Green 155g',
                        'quantity' => 2,
                        'unit' => '155g',
                        'unit_price' => 21.50,
                        'line_total' => 43.00,
                    ],
                ],
            ]);

        $response->assertOk();
        $report->refresh();

        // 1. ConsumerReport-level audit state
        $this->assertTrue(data_get($report->consumer_confirmed_json, 'has_edits'));
        $this->assertEquals(1, data_get($report->consumer_confirmed_json, 'edited_items_count'));

        // 2. Item-level audit diff
        $item = $report->items->first();
        $this->assertTrue($item->consumer_confirmed);
        $this->assertEquals('Saba Sardines Green 155g', $item->item_name);
        $this->assertEquals(2.0, (float) $item->quantity);
        $this->assertEquals(43.00, (float) $item->line_total);
        $this->assertNotNull($item->consumer_correction_json);

        $correction = $item->consumer_correction_json;
        $this->assertContains('item_name', $correction['fields_changed']);
        $this->assertContains('quantity', $correction['fields_changed']);
        $this->assertContains('line_total', $correction['fields_changed']);
        $this->assertEquals('Saba Sardines', $correction['original']['item_name']);
        $this->assertEquals('Saba Sardines Green 155g', $correction['edited']['item_name']);

        // 3. AuditEvent is created
        $audit = AuditEvent::where('action', 'report.consumer_edited')->first();
        $this->assertNotNull($audit);
        $this->assertEquals($report->report_reference, $audit->metadata['report_reference']);

        // 4. CitizenTip receives has_consumer_edits
        $tip = CitizenTip::where('store_id', $this->store->id)->latest('id')->first();
        $this->assertTrue(data_get($tip->extracted_text_json, 'has_consumer_edits'));

        // 5. Assessment safety: cannot auto-resolve as 'no_violation' even if price is <= SRP
        $this->assertNotEquals('Resolved', $report->status);
        $this->assertEquals('to_review', $report->automatic_assessment_json['category']);
        $this->assertContains(
            'Consumer manually edited receipt items. Mandatory DTI officer review required.',
            $report->automatic_assessment_json['reasons']
        );
    }

    public function test_dti_admin_sees_consumer_edited_badges_and_diff()
    {
        $report = $this->createReport(21.50);

        $this->withHeader('X-Tracking-Token', 'tracking-'.$report->submission_uuid)
            ->postJson('/api/public/reports/'.$report->report_reference.'/confirm-ocr', [
                'consumer_confirmed' => true,
                'items' => [
                    [
                        'sequence' => 0,
                        'item_name' => 'Saba Sardines Premium',
                        'quantity' => 1,
                        'unit' => '155g',
                        'unit_price' => 26.00, // Above SRP 21.50
                        'line_total' => 26.00,
                    ],
                ],
            ]);

        $admin = User::create([
            'name' => 'DTI Officer',
            'email' => 'admin_review@dti.test',
            'password' => 'password',
            'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/reports?filter=all');
        $response->assertOk();

        $rows = $response->json('data');
        $reportRow = collect($rows)->firstWhere('report_reference', $report->report_reference);
        $this->assertNotNull($reportRow);
        $this->assertTrue($reportRow['has_consumer_edits']);
        $this->assertNotNull($reportRow['consumer_confirmed_json']);

        $itemRow = $reportRow['items'][0];
        $this->assertTrue($itemRow['is_consumer_edited']);
        $this->assertNotNull($itemRow['consumer_correction']);
        $this->assertEquals('Saba Sardines Premium', $itemRow['item_name']);
        $this->assertEquals('Saba Sardines', $itemRow['consumer_correction']['original']['item_name']);
    }
}
