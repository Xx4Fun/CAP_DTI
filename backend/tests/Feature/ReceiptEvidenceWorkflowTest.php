<?php

namespace Tests\Feature;

use App\Jobs\ProcessReceiptEvidence;
use App\Jobs\PurgeAbandonedReceiptCaptures;
use App\Jobs\SendReceiptStatusNotification;
use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use App\Models\WebPushSubscription;
use App\Services\Receipt\ReceiptEvidencePipeline;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Receipt\ReceiptContinuityAnalyzer;
use App\Services\Receipt\ReceiptFrameQualityEvaluator;
use App\Services\Receipt\ReceiptFrameSampler;
use App\Services\Receipt\ReceiptItemExtractor;
use App\Services\Receipt\ReceiptMerchantMatcher;
use App\Services\Receipt\ReceiptOcrResultSelector;
use App\Services\Receipt\ReceiptPushMessage;
use App\Services\Receipt\ReceiptPushSender;
use App\Services\Receipt\ReceiptTextAggregator;
use App\Services\Receipt\ReceiptTotalExtractor;
use App\Services\Receipt\ReceiptVideoInspector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Mockery;
use Tests\TestCase;

class ReceiptEvidenceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::create([
            'dti_sec_number' => 'SEC-RECEIPT-1001',
            'store_name' => 'Receipt Test Mart',
            'owner_name' => 'Test Owner',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose de Buenavista',
            'recidivism_index' => 0,
        ]);

        Storage::fake('receipt_evidence');
        config()->set('services.receipt_capture.enabled', true);
    }

    public function test_continuous_capture_uploads_a_private_hashed_video_asset(): void
    {
        $sessionResponse = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ]);

        $sessionId = $sessionResponse->json('data.capture_session_id');
        $captureToken = $sessionResponse->json('data.capture_token');
        $video = UploadedFile::fake()->create('long-receipt.webm', 1, 'video/webm');
        $expectedHash = hash_file('sha256', $video->getRealPath());

        $response = $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'original_video',
                'sequence' => 0,
                'asset' => $video,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.kind', 'original_video')
            ->assertJsonPath('data.sequence', 0)
            ->assertJsonPath('data.sha256', $expectedHash)
            ->assertJsonMissingPath('data.path');

        $assetPath = ReceiptEvidenceAsset::firstOrFail()->path;
        Storage::disk('receipt_evidence')->assertExists($assetPath);

        $this->assertDatabaseHas('receipt_evidence_bundles', [
            'capture_session_id' => $sessionId,
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'collecting',
        ]);
        $this->assertDatabaseHas('receipt_evidence_assets', [
            'kind' => 'original_video',
            'sequence' => 0,
            'disk' => 'receipt_evidence',
            'sha256' => $expectedHash,
        ]);
    }

    public function test_continuous_capture_is_feature_flagged_and_asset_upload_requires_the_session_secret(): void
    {
        config()->set('services.receipt_capture.enabled', false);
        $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ])->assertNotFound();

        config()->set('services.receipt_capture.enabled', true);
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ])->assertCreated();
        $this->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
            'kind' => 'original_video',
            'sequence' => 0,
            'asset' => UploadedFile::fake()->create('receipt.webm', 1, 'video/webm'),
        ])->assertForbidden();
    }

    public function test_continuous_capture_rejects_an_unverified_store_and_noncanonical_video_sequence(): void
    {
        $this->store->update(['is_verified' => false]);
        $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ])->assertUnprocessable();

        $this->store->update(['is_verified' => true]);
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ])->assertCreated();
        $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'original_video', 'sequence' => 1,
                'asset' => UploadedFile::fake()->create('receipt.webm', 1, 'video/webm'),
            ])->assertUnprocessable();
    }

    public function test_asset_upload_retry_is_idempotent_and_does_not_expose_private_storage_paths(): void
    {
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
        ]);
        $uri = '/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets';
        $headers = ['X-Capture-Token' => $session->json('data.capture_token')];

        $first = $this->withHeaders($headers)->postJson($uri, [
            'kind' => 'source_frame', 'sequence' => 0,
            'asset' => UploadedFile::fake()->image('first.jpg'),
        ])->assertCreated()->assertJsonMissingPath('data.path');
        $second = $this->withHeaders($headers)->postJson($uri, [
            'kind' => 'source_frame', 'sequence' => 0,
            'asset' => UploadedFile::fake()->image('replacement.jpg'),
        ])->assertOk()->assertJsonMissingPath('data.path');

        $this->assertSame($first->json('data.asset_id'), $second->json('data.asset_id'));
        $this->assertDatabaseCount('receipt_evidence_assets', 1);
    }

    public function test_guided_capture_accepts_one_original_receipt_image(): void
    {
        Queue::fake();
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
        ])->assertCreated()->assertJsonPath('data.limits.min_frames', 1);

        $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'source_frame',
                'sequence' => 0,
                'asset' => UploadedFile::fake()->image('full-receipt.jpg', 1080, 1920),
            ])->assertCreated();

        $this->postJson('/api/public/reports', [
            'submission_uuid' => 'guided-single-image-1',
            'capture_token' => $session->json('data.capture_token'),
            'privacy_notice_version' => '1.0',
            'tracking_token' => 'trk_guided_single_image_1234567890',
            'resume_token' => 'rsm_guided_single_image_1234567890',
        ])->assertCreated()->assertJsonPath('data.status', 'Processing receipt');
    }

    public function test_user_can_cancel_an_unsubmitted_capture_and_its_private_assets_are_deleted(): void
    {
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
        ]);
        $id = $session->json('data.capture_session_id');
        $token = $session->json('data.capture_token');
        $this->withHeader('X-Capture-Token', $token)->postJson("/api/public/capture-sessions/{$id}/assets", [
            'kind' => 'source_frame', 'sequence' => 0,
            'asset' => UploadedFile::fake()->image('receipt.jpg'),
        ])->assertCreated();
        $path = ReceiptEvidenceAsset::firstOrFail()->path;

        $this->withHeader('X-Capture-Token', $token)
            ->deleteJson("/api/public/capture-sessions/{$id}")
            ->assertOk();

        Storage::disk('receipt_evidence')->assertMissing($path);
        $this->assertDatabaseMissing('capture_sessions', ['id' => $id]);
        $this->assertDatabaseCount('receipt_evidence_assets', 0);
    }

    public function test_retention_job_purges_only_abandoned_unsubmitted_capture_evidence(): void
    {
        $abandoned = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(), 'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1', 'processing_status' => 'uploading',
            'token_hash' => hash('sha256', 'abandoned'), 'expires_at' => now()->subHours(25), 'is_used' => false,
            'created_at' => now()->subHours(25), 'updated_at' => now()->subHours(25),
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(), 'capture_session_id' => $abandoned->id,
            'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1', 'processing_status' => 'collecting',
        ]);
        $path = "receipt-evidence/{$bundle->evidence_uuid}/source-frame.jpg";
        Storage::disk('receipt_evidence')->put($path, 'frame');
        ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $bundle->id, 'kind' => 'source_frame', 'sequence' => 0,
            'disk' => 'receipt_evidence', 'path' => $path, 'mime_type' => 'image/jpeg',
            'size_bytes' => 5, 'sha256' => hash('sha256', 'frame'),
        ]);

        (new PurgeAbandonedReceiptCaptures(24))->handle();

        Storage::disk('receipt_evidence')->assertMissing($path);
        $this->assertDatabaseMissing('capture_sessions', ['id' => $abandoned->id]);
    }

    public function test_continuous_capture_creates_a_processing_draft_without_entering_dti_queue(): void
    {
        Queue::fake();

        $sessionResponse = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ]);
        $sessionId = $sessionResponse->json('data.capture_session_id');
        $captureToken = $sessionResponse->json('data.capture_token');

        $video = UploadedFile::fake()->create('long-receipt.webm', 1, 'video/webm');
        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'original_video',
                'sequence' => 0,
                'asset' => $video,
            ])->assertCreated();

        $response = $this->postJson('/api/public/reports', [
            'submission_uuid' => 'continuous-submission-1001',
            'capture_token' => $captureToken,
            'privacy_notice_version' => '1.0',
            'store_id' => Store::create([
                'dti_sec_number' => 'SEC-SPOOF', 'store_name' => 'Spoof Store', 'owner_name' => 'Other',
                'latitude' => 10.7, 'longitude' => 122.0, 'address' => 'Elsewhere', 'recidivism_index' => 0,
            ])->id,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.status', 'Processing receipt')
            ->assertJsonPath('data.submitted_at', null)
            ->assertJsonStructure(['data' => [
                'report_reference',
                'secret_tracking_token',
                'device_resume_token',
                'created_at',
            ]]);

        $reference = $response->json('data.report_reference');
        $this->assertDatabaseHas('consumer_reports', [
            'report_reference' => $reference,
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'status' => 'Processing receipt',
            'processing_status' => 'queued',
            'submitted_at' => null,
        ]);
        $this->assertDatabaseCount('citizen_tips', 0);
        Queue::assertPushed(ProcessReceiptEvidence::class, fn (ProcessReceiptEvidence $job) => $job->reportReference === $reference);
    }

    public function test_client_generated_report_credentials_survive_an_idempotent_submission_replay(): void
    {
        Queue::fake();
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id, 'capture_mode' => 'continuous_video_v1',
        ])->assertCreated();
        $captureToken = $session->json('data.capture_token');
        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'original_video', 'sequence' => 0,
                'asset' => UploadedFile::fake()->create('receipt.webm', 1, 'video/webm'),
            ])->assertCreated();

        $payload = [
            'submission_uuid' => 'client-credential-replay-1',
            'capture_token' => $captureToken,
            'privacy_notice_version' => '1.0',
            'tracking_token' => 'trk_client_generated_12345678901234567890',
            'resume_token' => 'rsm_client_generated_12345678901234567890',
        ];
        $this->postJson('/api/public/reports', $payload)
            ->assertCreated()
            ->assertJsonPath('data.secret_tracking_token', $payload['tracking_token'])
            ->assertJsonPath('data.device_resume_token', $payload['resume_token']);
        $this->postJson('/api/public/reports', $payload)
            ->assertOk()
            ->assertJsonPath('data.secret_tracking_token', $payload['tracking_token'])
            ->assertJsonPath('data.device_resume_token', $payload['resume_token']);

        $this->assertDatabaseCount('consumer_reports', 1);
    }

    public function test_processing_job_publishes_reviewable_items_without_submitting_the_report(): void
    {
        Queue::fake();
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'finalized',
            'token_hash' => hash('sha256', 'capture-token'),
            'expires_at' => now()->addMinutes(15),
            'is_used' => true,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(),
            'capture_session_id' => $session->id,
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'queued',
        ]);
        $report = ConsumerReport::create([
            'report_reference' => 'REP-20260816-JOB1',
            'tracking_token_hash' => hash('sha256', 'tracking-token'),
            'resume_token_hash' => hash('sha256', 'resume-token'),
            'store_id' => $this->store->id,
            'submission_uuid' => 'job-submission-1',
            'capture_session_id' => $session->id,
            'receipt_evidence_bundle_id' => $bundle->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'queued',
            'status' => 'Processing receipt',
            'privacy_notice_version' => '1.0',
        ]);

        $pipeline = Mockery::mock(ReceiptEvidencePipeline::class);
        $pipeline->shouldReceive('process')->once()->andReturn([
            'status' => 'ready',
            'lines' => ['RICE 45.00', 'SUGAR 70.50'],
            'items' => [
                ['sequence' => 0, 'raw_text' => 'RICE 45.00', 'item_name' => 'RICE', 'quantity' => null, 'unit' => null, 'observed_price' => 45.0, 'ocr_confidence' => 0.91],
                ['sequence' => 1, 'raw_text' => 'SUGAR 70.50', 'item_name' => 'SUGAR', 'quantity' => null, 'unit' => null, 'observed_price' => 70.5, 'ocr_confidence' => 0.88],
            ],
            'continuity' => ['status' => 'ready', 'continuity_score' => 1.0, 'reasons' => []],
            'merchant' => ['status' => 'matched'],
        ]);

        (new ProcessReceiptEvidence($report->report_reference))->handle($pipeline);

        $report->refresh();
        $this->assertSame('Ready for confirmation', $report->status);
        $this->assertSame('ready', $report->processing_status);
        $this->assertNull($report->submitted_at);
        $this->assertCount(2, $report->items);
        $this->assertDatabaseCount('citizen_tips', 0);
        $this->assertDatabaseHas('report_status_histories', [
            'consumer_report_id' => $report->id,
            'new_status' => 'Ready for confirmation',
        ]);
        Queue::assertPushed(SendReceiptStatusNotification::class, fn (SendReceiptStatusNotification $job) => $job->reportReference === $report->report_reference
            && $job->status === 'Ready for confirmation'
        );
    }

    public function test_single_clear_image_with_uncertain_extraction_stays_reviewable_without_a_stitched_derivative(): void
    {
        Queue::fake();
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1',
        ])->assertCreated();
        $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'source_frame', 'sequence' => 0,
                'asset' => UploadedFile::fake()->image('receipt.jpg', 1080, 1920),
            ])->assertCreated();
        $response = $this->postJson('/api/public/reports', [
            'submission_uuid' => 'pipeline-single-clear-1',
            'capture_token' => $session->json('data.capture_token'),
            'privacy_notice_version' => '1.0',
        ])->assertCreated();
        $report = ConsumerReport::where('report_reference', $response->json('data.report_reference'))->firstOrFail();

        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->twice()->andReturn([
            'status' => 'OCR_SUCCESS', 'raw_text' => "UNKNOWN SHOP\nTHANK YOU",
            'lines' => ['UNKNOWN SHOP', 'THANK YOU'], 'words' => [],
        ]);
        $pipeline = new ReceiptEvidencePipeline(
            app(ReceiptVideoInspector::class), app(ShelfTagImagePreprocessor::class), $ocr,
            app(ReceiptContinuityAnalyzer::class), app(ReceiptTextAggregator::class),
            app(ReceiptItemExtractor::class), app(ReceiptFrameQualityEvaluator::class),
            app(ReceiptFrameSampler::class), app(ReceiptOcrResultSelector::class),
            app(ReceiptMerchantMatcher::class), app(ReceiptTotalExtractor::class),
        );

        $result = $pipeline->process($report);

        $this->assertSame('ready', $result['status']);
        $this->assertSame('not_required', $result['continuity']['status']);
        $this->assertTrue($result['manual_review_required']);
        $this->assertEqualsCanonicalizing(
            ['STORE_NOT_CONFIRMED', 'ITEMS_NOT_FOUND', 'TOTAL_NOT_FOUND'],
            array_column($result['warnings'], 'code'),
        );
        $this->assertFalse($report->evidenceBundle->assets()->where('kind', 'stitched_preview')->exists());
    }

    public function test_guided_overlap_uncertainty_is_reviewable_and_preserves_both_ocr_passes(): void
    {
        [$report] = $this->createReadyReport('OVERLAP', false);
        $report->update(['capture_mode' => 'guided_photos_v1']);
        foreach ([0, 1] as $sequence) {
            $contents = file_get_contents(base_path('tests/Fixtures/shelf_tag_saba.png'));
            $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/source-{$sequence}.jpg";
            Storage::disk('receipt_evidence')->put($path, $contents);
            ReceiptEvidenceAsset::create([
                'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
                'kind' => 'source_frame', 'sequence' => $sequence, 'disk' => 'receipt_evidence',
                'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($contents),
                'sha256' => hash('sha256', $contents),
                'metadata_json' => ['quality' => ['acceptable' => true]],
            ]);
        }
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->andReturnValues([
            ['status' => 'OCR_SUCCESS', 'raw_text' => 'SHOP A', 'lines' => ['SHOP A'], 'words' => [['confidence' => 90]]],
            ['status' => 'OCR_SUCCESS', 'raw_text' => 'SHOP A ALT', 'lines' => ['SHOP A ALT'], 'words' => [['confidence' => 80]]],
            ['status' => 'OCR_SUCCESS', 'raw_text' => 'TOTAL 10.00', 'lines' => ['TOTAL 10.00'], 'words' => [['confidence' => 90]]],
            ['status' => 'OCR_SUCCESS', 'raw_text' => 'TOTAL 10.00 ALT', 'lines' => ['TOTAL 10.00 ALT'], 'words' => [['confidence' => 80]]],
        ]);
        $pipeline = new ReceiptEvidencePipeline(
            app(ReceiptVideoInspector::class), app(ShelfTagImagePreprocessor::class), $ocr,
            app(ReceiptContinuityAnalyzer::class), app(ReceiptTextAggregator::class),
            app(ReceiptItemExtractor::class), app(ReceiptFrameQualityEvaluator::class),
            app(ReceiptFrameSampler::class), app(ReceiptOcrResultSelector::class),
            app(ReceiptMerchantMatcher::class), app(ReceiptTotalExtractor::class),
        );

        $result = $pipeline->process($report);

        $this->assertSame('ready', $result['status']);
        $this->assertSame('unverified', $result['continuity']['status']);
        $this->assertContains('INCOMPLETE_SCAN', array_column($result['warnings'], 'code'));
        $this->assertTrue($result['manual_review_required']);
        $this->assertSame('primary', $result['ocr'][0]['selected_pass']);
        $this->assertSame('SHOP A', $result['ocr'][0]['passes'][0]['result']['raw_text']);
        $this->assertSame('SHOP A ALT', $result['ocr'][0]['passes'][1]['result']['raw_text']);
    }

    public function test_mixed_valid_and_rejected_item_lines_warn_that_extraction_is_incomplete(): void
    {
        [$report] = $this->createReadyReport('MIXEDITEM', false);
        $contents = file_get_contents(base_path('tests/Fixtures/shelf_tag_saba.png'));
        $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/source-0.jpg";
        Storage::disk('receipt_evidence')->put($path, $contents);
        ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'source_frame', 'sequence' => 0, 'disk' => 'receipt_evidence',
            'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($contents),
            'sha256' => hash('sha256', $contents), 'metadata_json' => ['quality' => ['acceptable' => true]],
        ]);
        $ocrResult = [
            'status' => 'OCR_SUCCESS', 'raw_text' => "JUAN GROCERY\nRICE 45.00\n$ 8.50\nTOTAL 45.00",
            'lines' => ['JUAN GROCERY', 'RICE 45.00', '$ 8.50', 'TOTAL 45.00'],
            'words' => [['confidence' => 90]],
        ];
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        // The primary already yields an item and a total, so the guided fallback pass is skipped.
        $ocr->shouldReceive('scan')->once()->andReturn($ocrResult);
        $pipeline = new ReceiptEvidencePipeline(
            app(ReceiptVideoInspector::class), app(ShelfTagImagePreprocessor::class), $ocr,
            app(ReceiptContinuityAnalyzer::class), app(ReceiptTextAggregator::class),
            app(ReceiptItemExtractor::class), app(ReceiptFrameQualityEvaluator::class),
            app(ReceiptFrameSampler::class), app(ReceiptOcrResultSelector::class),
            app(ReceiptMerchantMatcher::class), app(ReceiptTotalExtractor::class),
        );

        $result = $pipeline->process($report);

        $this->assertSame('skipped', $result['ocr'][0]['passes'][1]['status']);
        $this->assertSame(['RICE'], array_column($result['items'], 'item_name'));
        $this->assertSame(['$ 8.50'], $result['rejected_item_lines']);
        $this->assertContains('OCR_INCOMPLETE', array_column($result['warnings'], 'code'));
        $this->assertTrue($result['manual_review_required']);
    }

    public function test_technical_ocr_failure_is_not_reported_as_a_bad_capture(): void
    {
        Queue::fake();
        [$report, $resumeToken] = $this->createReadyReport('OCRFAIL');
        $report->update(['status' => 'Processing receipt', 'processing_status' => 'queued']);
        $report->evidenceBundle->update(['processing_status' => 'queued']);
        $pipeline = Mockery::mock(ReceiptEvidencePipeline::class);
        $pipeline->shouldReceive('process')->once()->andReturn([
            'status' => 'failed', 'reason_code' => 'OCR_UNAVAILABLE', 'lines' => [], 'items' => [],
        ]);

        (new ProcessReceiptEvidence($report->report_reference))->handle($pipeline);

        $report->refresh();
        $this->assertSame('Processing failed', $report->status);
        $this->assertSame('failed', $report->processing_status);
        $this->assertSame('OCR_UNAVAILABLE', $report->evidenceBundle->failure_code);
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertOk()
            ->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.can_retry_processing', true)
            ->assertJsonPath('data.failure_reason', null)
            ->assertJsonPath('data.recapture_reason', null);
    }

    public function test_device_resume_token_reads_processing_status_but_an_invalid_token_is_rejected(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('RESUME1');

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertOk()
            ->assertJsonPath('data.report_reference', $report->report_reference)
            ->assertJsonPath('data.status', 'Ready for confirmation')
            ->assertJsonMissingPath('data.evidence_path');

        $this->withHeader('X-Report-Resume-Token', 'wrong-token')
            ->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertForbidden();
    }

    public function test_review_adds_attempt_merchant_display_name_and_nullable_actual_transaction_date(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('REVIEWMETA');
        $report->forceFill(['raw_ocr_json' => [
            'lines' => ['JUAN GROCERY', 'RICE 45.00'],
            'metadata' => ['transactionDate' => '2026-09-04'],
        ]])->save();
        $report->evidenceBundle->update([
            'attempt_number' => 3,
            'processing_result_json' => ['merchant' => [
                'status' => 'matched', 'display_name' => 'JUAN GROCERY', 'observed' => ['JUAN GROCERY'],
            ]],
        ]);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()
            ->assertJsonPath('data.attempt_number', 3)
            ->assertJsonPath('data.merchant.display_name', 'JUAN GROCERY')
            ->assertJsonPath('data.transaction_date', '2026-09-04')
            ->assertJsonMissingPath('data.processing_result');

        $report->forceFill(['raw_ocr_json' => ['lines' => ['RICE 45.00']]])->save();
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()->assertJsonPath('data.transaction_date', null);
    }

    public function test_processing_message_uses_latest_history_without_reordering_the_timeline(): void
    {
        [$report, $token] = $this->createReadyReport('STATUSORDER');
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        foreach ([['Processing receipt', 'Receipt uploaded and queued.', now()->subMinute()],
            ['Processing failed', 'Receipt processing failed. Please retry.', now()]] as [$status, $message, $createdAt]) {
            $history = $report->statusHistories()->create([
                'new_status' => $status, 'public_message' => $message,
                'actor_type' => 'system',
            ]);
            $history->forceFill(['created_at' => $createdAt])->save();
        }
        $this->withHeader('X-Report-Resume-Token', $token)
            ->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertOk()->assertJsonPath('data.message', 'Receipt processing failed. Please retry.');
        $this->assertSame(['Processing receipt', 'Processing failed'], $report->statusHistories()->pluck('new_status')->all());
    }

    public function test_customer_confirmation_is_read_only_submits_ready_items_once_and_revokes_device_resume_token(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('CONFIRM1');
        $report->items()->create([
            'sequence' => 0,
            'raw_text' => 'RICE 45.00',
            'item_name' => 'RICE',
            'observed_price' => 45.00,
            'ocr_confidence' => 0.91,
        ]);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()
            ->assertJsonPath('data.items.0.item_name', 'RICE')
            ->assertJsonMissingPath('data.evidence_path');

        $payload = ['consumer_confirmed' => true];

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", $payload)
            ->assertOk()
            ->assertJsonPath('data.status', 'Submitted');

        $report->refresh();
        $this->assertSame('Submitted', $report->status);
        $this->assertNotNull($report->submitted_at);
        $this->assertNull($report->resume_token_hash);
        $this->assertDatabaseHas('consumer_report_items', [
            'consumer_report_id' => $report->id,
            'sequence' => 0,
            'item_name' => 'RICE',
            'consumer_confirmed' => false,
            'consumer_correction_json' => null,
        ]);
        $this->assertNull($report->consumer_confirmed_json);
        $this->assertDatabaseCount('citizen_tips', 1);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", $payload)
            ->assertForbidden();
        $this->assertDatabaseCount('citizen_tips', 1);
    }

    public function test_customer_cannot_change_ocr_items_during_confirmation(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('READONLY');
        $report->items()->create([
            'sequence' => 0, 'raw_text' => 'RICE 45.00', 'item_name' => 'RICE',
            'observed_price' => 45.00, 'ocr_confidence' => 0.91,
        ]);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", [
                'consumer_confirmed' => true,
                'confirmed_items' => [[
                    'sequence' => 0, 'item_name' => 'CHANGED RICE', 'observed_price' => 1.00,
                ]],
            ])
            ->assertUnprocessable();

        $this->assertDatabaseHas('consumer_report_items', [
            'consumer_report_id' => $report->id, 'item_name' => 'RICE', 'observed_price' => 45.00,
        ]);
    }

    public function test_customer_cannot_send_any_receipt_value_during_confirmation(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('NOMUTATE');

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", [
                'consumer_confirmed' => true,
                'store' => 'Changed Store',
                'items' => [['item_name' => 'Invented Item', 'observed_price' => 1]],
                'total' => 1,
            ])->assertUnprocessable();

        $this->assertSame('Ready for confirmation', $report->fresh()->status);
    }

    public function test_clear_evidence_with_no_parsed_items_can_be_submitted_for_admin_review(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('NOITEMS');

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", [
                'consumer_confirmed' => true,
            ])->assertOk()->assertJsonPath('data.status', 'Submitted');

        $this->assertDatabaseCount('citizen_tips', 1);
    }

    public function test_report_cannot_be_submitted_when_its_original_evidence_is_missing(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('NOEVID', false);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", [
                'consumer_confirmed' => true,
            ])->assertConflict();

        $this->assertSame('Ready for confirmation', $report->fresh()->status);
    }

    public function test_report_cannot_be_submitted_when_original_bytes_no_longer_match_the_server_hash(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('TAMPERED');
        $asset = $report->evidenceBundle->assets()->where('kind', 'source_frame')->firstOrFail();
        Storage::disk($asset->disk)->put($asset->path, 'changed-after-upload');

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", [
                'consumer_confirmed' => true,
            ])->assertConflict();

        $this->assertSame('Ready for confirmation', $report->fresh()->status);
    }

    public function test_customer_review_exposes_only_original_source_images_from_the_current_bundle(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('ORIGINAL', false);
        $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/source-0.jpg";
        Storage::disk('receipt_evidence')->put($path, 'original-receipt-image');
        $asset = ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'source_frame',
            'sequence' => 0,
            'disk' => 'receipt_evidence',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'size_bytes' => strlen('original-receipt-image'),
            'sha256' => hash('sha256', 'original-receipt-image'),
        ]);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()
            ->assertJsonPath('data.evidence.0.id', $asset->id)
            ->assertJsonPath('data.evidence.0.sequence', 0)
            ->assertJsonMissingPath('data.evidence.0.path')
            ->assertJsonMissingPath('data.evidence.0.sha256');

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->get("/api/public/reports/{$report->report_reference}/evidence-assets/{$asset->id}")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/jpeg')
            ->assertHeader('Cache-Control', 'no-store, private');
        $this->withHeader('X-Report-Resume-Token', 'wrong-token')
            ->get("/api/public/reports/{$report->report_reference}/evidence-assets/{$asset->id}")
            ->assertForbidden();

        Storage::disk($asset->disk)->put($asset->path, 'changed-after-upload');
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->get("/api/public/reports/{$report->report_reference}/evidence-assets/{$asset->id}")
            ->assertConflict();
    }

    public function test_processing_status_exposes_a_safe_recapture_reason_and_retry_flag(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('REASON1', false);
        $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/source-0.jpg";
        Storage::disk('receipt_evidence')->put($path, 'poor-original-image');
        $asset = ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'source_frame', 'sequence' => 0, 'disk' => 'receipt_evidence',
            'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen('poor-original-image'),
            'sha256' => hash('sha256', 'poor-original-image'),
        ]);
        $report->update(['status' => 'Needs recapture', 'processing_status' => 'needs_recapture']);
        $report->evidenceBundle->update([
            'processing_status' => 'needs_recapture',
            'failure_code' => 'TEXT_UNREADABLE',
            'processing_result_json' => ['status' => 'needs_recapture', 'reason_code' => 'TEXT_UNREADABLE'],
        ]);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertOk()
            ->assertJsonPath('data.recapture_reason.code', 'TEXT_UNREADABLE')
            ->assertJsonPath('data.can_recapture', true)
            ->assertJsonPath('data.evidence.0.id', $asset->id)
            ->assertJsonPath('data.evidence.0.sequence', 0)
            ->assertJsonMissingPath('data.evidence.0.path')
            ->assertJsonPath('data.submitted_at', null);
    }

    public function test_recapture_reuses_the_report_reference_and_preserves_attempt_history(): void
    {
        Queue::fake();
        [$report, $resumeToken] = $this->createReadyReport('RECAP01', false);
        $report->evidenceBundle->update(['consumer_report_id' => $report->id, 'attempt_number' => 1]);
        foreach ([0, 1] as $sequence) {
            $contents = 'original-section-'.$sequence;
            $path = "receipt-evidence/{$report->evidenceBundle->evidence_uuid}/source-{$sequence}.jpg";
            Storage::disk('receipt_evidence')->put($path, $contents);
            ReceiptEvidenceAsset::create([
                'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
                'kind' => 'source_frame', 'sequence' => $sequence, 'disk' => 'receipt_evidence',
                'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($contents),
                'sha256' => hash('sha256', $contents),
            ]);
        }

        $session = $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['replace_sequence' => 1])
            ->assertCreated()
            ->assertJsonPath('data.capture_mode', 'guided_photos_v1')
            ->assertJsonPath('data.upload_sequence', 1)
            ->assertJsonPath('data.carried_sequences.0', 0);
        $sessionId = $session->json('data.capture_session_id');
        $captureToken = $session->json('data.capture_token');

        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'source_frame', 'sequence' => 1,
                'asset' => UploadedFile::fake()->image('replacement.jpg', 1080, 1920),
            ])->assertCreated();

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/recapture", [
                'capture_token' => $captureToken,
            ])->assertOk()
            ->assertJsonPath('data.report_reference', $report->report_reference)
            ->assertJsonPath('data.status', 'Processing receipt');
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/recapture", [
                'capture_token' => $captureToken,
            ])->assertOk()
            ->assertJsonPath('data.report_reference', $report->report_reference);

        $report->refresh();
        $this->assertSame('Processing receipt', $report->status);
        $this->assertSame(2, $report->evidenceBundle->attempt_number);
        $this->assertDatabaseCount('consumer_reports', 1);
        $this->assertDatabaseCount('receipt_evidence_bundles', 2);
        $this->assertDatabaseHas('receipt_evidence_assets', [
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'source_frame',
            'sequence' => 0,
        ]);
        Queue::assertPushed(ProcessReceiptEvidence::class, fn ($job) => $job->reportReference === $report->report_reference);
        Queue::assertPushed(ProcessReceiptEvidence::class, 1);
    }

    public function test_processing_failure_can_retry_the_same_immutable_evidence(): void
    {
        Queue::fake();
        [$report, $resumeToken] = $this->createReadyReport('RETRYOCR');
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle->update(['processing_status' => 'failed', 'failure_code' => 'OCR_TIMEOUT']);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/retry-processing")
            ->assertOk()
            ->assertJsonPath('data.status', 'Processing receipt');

        $this->assertSame('queued', $report->fresh()->processing_status);
        Queue::assertPushed(ProcessReceiptEvidence::class, fn ($job) => $job->reportReference === $report->report_reference);
    }

    public function test_customer_can_register_an_encrypted_push_subscription_for_their_draft(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('PUSH001');
        $subscription = [
            'endpoint' => 'https://push.example.test/subscriptions/device-123',
            'expirationTime' => null,
            'keys' => [
                'p256dh' => 'test-p256dh-key',
                'auth' => 'test-auth-key',
            ],
        ];

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/push-subscription", [
                'subscription' => $subscription,
            ])
            ->assertCreated()
            ->assertJsonPath('data.notifications_enabled', true);

        $this->assertDatabaseHas('web_push_subscriptions', [
            'endpoint_hash' => hash('sha256', $subscription['endpoint']),
        ]);
        $stored = DB::table('web_push_subscriptions')->value('subscription_json');
        $this->assertStringNotContainsString($subscription['endpoint'], $stored);
        $this->assertDatabaseHas('consumer_report_push_subscriptions', [
            'consumer_report_id' => $report->id,
        ]);
    }

    public function test_notification_job_sends_a_safe_payload_and_records_success(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('PUSHJOB');
        $subscriptionPayload = [
            'endpoint' => 'https://push.example.test/subscriptions/job-device',
            'expirationTime' => null,
            'keys' => ['p256dh' => 'p256dh', 'auth' => 'auth'],
        ];
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/push-subscription", [
                'subscription' => $subscriptionPayload,
            ])->assertCreated();

        $sender = Mockery::mock(ReceiptPushSender::class);
        $sender->shouldReceive('send')->once()->withArgs(function (WebPushSubscription $subscription, array $payload) use ($report) {
            $encoded = json_encode($payload);

            return $subscription->endpoint_hash === hash('sha256', 'https://push.example.test/subscriptions/job-device')
                && $payload['data']['url'] === "/reports/{$report->report_reference}/review"
                && ! str_contains($encoded, 'rsm_')
                && ! str_contains($encoded, 'trk_');
        })->andReturn(['success' => true, 'expired' => false, 'skipped' => false, 'reason' => 'Created']);

        (new SendReceiptStatusNotification($report->report_reference, 'Ready for confirmation'))
            ->handle(new ReceiptPushMessage, $sender);

        $this->assertNotNull(WebPushSubscription::first()->last_success_at);
    }

    public function test_guided_frame_upload_rejects_declared_dimensions_above_the_safe_decode_limit(): void
    {
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1',
        ])->assertCreated();
        $upload = fn (int $width, int $height) => $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'source_frame', 'sequence' => 0,
                'asset' => UploadedFile::fake()->createWithContent('frame.png', $this->headerOnlyPng($width, $height)),
            ]);

        $upload(4001, 10)->assertStatus(422)->assertJsonPath('message', 'Receipt frames may not exceed 4 megapixels.');
        $upload(2001, 2000)->assertStatus(422)->assertJsonPath('message', 'Receipt frames may not exceed 4 megapixels.');
        // A declared-but-empty image passes the size check but cannot be decoded.
        $upload(100, 100)->assertStatus(422)->assertJsonPath('message', 'Receipt frames must be readable JPEG, PNG, or WebP images.');
        $this->assertDatabaseCount('receipt_evidence_assets', 0);

        // The largest accepted frame is a real, fully decodable 2000×2000 image (the PWA's maximum).
        $image = imagecreatetruecolor(2000, 2000);
        imagefill($image, 0, 0, imagecolorallocate($image, 250, 250, 250));
        ob_start();
        imagepng($image, null, 9);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);
        $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'source_frame', 'sequence' => 0,
                'asset' => UploadedFile::fake()->createWithContent('frame.png', $bytes),
            ])->assertCreated();
    }

    public function test_customer_review_reads_the_top_level_raw_ocr_transaction_date(): void
    {
        [$report, $resumeToken] = $this->createReadyReport('RAWDATE');
        $report->forceFill(['raw_ocr_json' => ['lines' => ['RICE 45.00'], 'transaction_date' => '2026-09-06']])->save();

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()->assertJsonPath('data.transaction_date', '2026-09-06');
    }

    public function test_processing_job_persists_transaction_date_for_customer_and_admin_readers(): void
    {
        Queue::fake();
        [$report, $resumeToken] = $this->createReadyReport('TXNDATE');
        $report->update(['status' => 'Processing receipt', 'processing_status' => 'queued']);
        $pipeline = Mockery::mock(ReceiptEvidencePipeline::class);
        $pipeline->shouldReceive('process')->once()->andReturn([
            'status' => 'ready', 'reason_code' => null, 'lines' => ['DATE 09/04/2026', 'RICE 45.00'], 'items' => [],
            'transaction_date' => '2026-09-04', 'merchant' => ['status' => 'unverified'], 'warnings' => [],
            'manual_review_required' => false,
        ]);

        (new ProcessReceiptEvidence($report->report_reference))->handle($pipeline);

        $this->assertSame('2026-09-04', $report->refresh()->raw_ocr_json['transaction_date']);
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()->assertJsonPath('data.transaction_date', '2026-09-04');
    }

    public function test_video_evidence_and_reports_are_refused_once_the_capture_flag_is_off(): void
    {
        $session = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ])->assertCreated();
        $sessionId = $session->json('data.capture_session_id');
        $captureToken = $session->json('data.capture_token');
        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'original_video', 'sequence' => 0,
                'asset' => UploadedFile::fake()->create('receipt.webm', 1, 'video/webm'),
            ])->assertCreated();

        // The retired path is switched off while a video session is still open.
        config()->set('services.receipt_capture.enabled', false);

        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'original_video', 'sequence' => 0,
                'asset' => UploadedFile::fake()->create('receipt.webm', 1, 'video/webm'),
            ])->assertNotFound();
        $submissionUuid = (string) Str::uuid();
        $this->postJson('/api/public/reports', [
            'submission_uuid' => $submissionUuid,
            'capture_token' => $captureToken,
            'store_id' => $this->store->id,
            'privacy_notice_version' => '1.1',
        ])->assertNotFound();

        $this->assertSame(0, ConsumerReport::count());
        $this->assertSame(1, ReceiptEvidenceAsset::where('kind', 'original_video')->count());

        // Proves both refusals above came from the flag and not from some other 404: the same call succeeds with it on.
        // The queue is faked because processing a real video needs FFmpeg, which this assertion is not about.
        Queue::fake();
        config()->set('services.receipt_capture.enabled', true);
        $this->postJson('/api/public/reports', [
            'submission_uuid' => $submissionUuid,
            'capture_token' => $captureToken,
            'store_id' => $this->store->id,
            'privacy_notice_version' => '1.1',
        ])->assertCreated();
        $this->assertSame(1, ConsumerReport::count());
    }

    public function test_guided_capture_still_works_while_video_capture_is_disabled(): void
    {
        config()->set('services.receipt_capture.enabled', false);

        $session = $this->postJson('/api/public/capture-session', ['store_id' => $this->store->id])->assertCreated();
        $sessionId = $session->json('data.capture_session_id');
        $captureToken = $session->json('data.capture_token');
        $this->assertSame('guided_photos_v1', $session->json('data.capture_mode'));

        $this->withHeader('X-Capture-Token', $captureToken)
            ->postJson("/api/public/capture-sessions/{$sessionId}/assets", [
                'kind' => 'source_frame', 'sequence' => 0,
                'asset' => UploadedFile::fake()->image('receipt.jpg', 1080, 1920),
            ])->assertCreated();
        $this->postJson('/api/public/reports', [
            'submission_uuid' => (string) Str::uuid(),
            'capture_token' => $captureToken,
            'store_id' => $this->store->id,
            'privacy_notice_version' => '1.1',
        ])->assertCreated();

        $this->assertSame(1, ConsumerReport::count());
    }

    public function test_a_historical_video_report_still_processes_and_is_reviewable_with_the_flag_off(): void
    {
        // Retiring new video capture must never strand reports captured while it was allowed.
        config()->set('services.receipt_capture.enabled', false);
        [$report, $resumeToken] = $this->createReadyReport('VIDEOFLAGOFF', false);
        $report->update(['capture_mode' => 'continuous_video_v1', 'status' => 'Processing receipt', 'processing_status' => 'queued']);

        $pipeline = Mockery::mock(ReceiptEvidencePipeline::class);
        $pipeline->shouldReceive('process')->once()->andReturn([
            'status' => 'ready', 'reason_code' => null, 'lines' => ['RICE 45.00'], 'items' => [],
            'transaction_date' => null, 'merchant' => ['status' => 'unverified'], 'warnings' => [],
            'manual_review_required' => false,
        ]);
        (new ProcessReceiptEvidence($report->report_reference))->handle($pipeline);

        $this->assertSame('Ready for confirmation', $report->refresh()->status);
        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk();
    }

    public function test_historical_video_keeps_the_legacy_ocr_path_and_extraction_rules(): void
    {
        [$report] = $this->createReadyReport('VIDEOLEGACY', false);
        $report->update(['capture_mode' => 'continuous_video_v1']);
        Storage::disk('receipt_evidence')->put('video.webm', 'video-bytes');
        ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'original_video', 'sequence' => 0, 'disk' => 'receipt_evidence', 'path' => 'video.webm',
            'mime_type' => 'video/webm', 'size_bytes' => 11, 'sha256' => hash('sha256', 'video-bytes'),
        ]);
        $fixture = base_path('tests/Fixtures/shelf_tag_saba.png');
        $inspector = Mockery::mock(ReceiptVideoInspector::class);
        $inspector->shouldReceive('inspect')->once()->andReturn(['duration_seconds' => 1.0]);
        $sampler = Mockery::mock(ReceiptFrameSampler::class);
        $sampler->shouldReceive('extract')->once()->andReturnUsing(function ($video, string $pattern) use ($fixture) {
            $paths = [];
            foreach ([1, 2] as $number) {
                copy($fixture, $paths[] = sprintf($pattern, $number));
            }

            return $paths;
        });
        $evaluator = Mockery::mock(ReceiptFrameQualityEvaluator::class);
        $evaluator->shouldReceive('select')->once()->andReturnUsing(fn (array $paths) => array_map(
            fn (string $path, int $sequence) => ['path' => $path, 'source_sequence' => $sequence, 'quality' => ['acceptable' => true, 'score' => 1]],
            $paths, array_keys($paths),
        ));
        $frameLines = [
            ['Wy', 'SHARED LINE', '004793487 1 111.75 111.75T', 'CALLA PWD F/C ROSE GARDEN'],
            ['SHARED LINE', 'VATable Sales P543.30', '09/04/2026'],
        ];
        $calls = [];
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->times(4)->andReturnUsing(function ($path, array $options) use (&$calls, $frameLines) {
            $calls[] = $options;
            $lines = $frameLines[intdiv(count($calls) - 1, 2)];

            return ['status' => 'OCR_SUCCESS', 'raw_text' => implode("\n", $lines), 'lines' => $lines, 'words' => [['confidence' => 90]]];
        });
        $pipeline = new ReceiptEvidencePipeline(
            $inspector, app(ShelfTagImagePreprocessor::class), $ocr,
            app(ReceiptContinuityAnalyzer::class), app(ReceiptTextAggregator::class),
            app(ReceiptItemExtractor::class), $evaluator, $sampler, app(ReceiptOcrResultSelector::class),
            app(ReceiptMerchantMatcher::class), app(ReceiptTotalExtractor::class),
        );

        $result = $pipeline->process($report->fresh());

        $this->assertSame([6, 11, 6, 11], array_column($calls, 'psm'));
        foreach ($calls as $options) {
            $this->assertSame(['psm', 'minimum_confidence', 'timeout_seconds'], array_keys($options));
        }
        $this->assertSame('ready', $result['status']);
        $this->assertSame('ready', $result['continuity']['status']);
        $this->assertContains('Wy', $result['lines']);
        $this->assertSame(['VATable Sales'], array_column($result['items'], 'item_name'));
        $this->assertArrayNotHasKey('line_filter', $result['ocr'][0]);
        // The one accepted historical change: a previously always-null field is now populated.
        $this->assertSame('2026-09-04', $result['transaction_date']);
    }

    public function test_historical_video_replaced_after_submission_fails_integrity_before_inspection(): void
    {
        [$report] = $this->createReadyReport('VIDEOHASH', false);
        $report->update(['capture_mode' => 'continuous_video_v1']);
        Storage::disk('receipt_evidence')->put('video.webm', 'tampered-bytes');
        ReceiptEvidenceAsset::create([
            'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id,
            'kind' => 'original_video', 'sequence' => 0, 'disk' => 'receipt_evidence', 'path' => 'video.webm',
            'mime_type' => 'video/webm', 'size_bytes' => 11, 'sha256' => hash('sha256', 'video-bytes'),
        ]);
        $inspector = Mockery::mock(ReceiptVideoInspector::class);
        $inspector->shouldNotReceive('inspect');
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldNotReceive('scan');
        $pipeline = new ReceiptEvidencePipeline(
            $inspector, app(ShelfTagImagePreprocessor::class), $ocr,
            app(ReceiptContinuityAnalyzer::class), app(ReceiptTextAggregator::class),
            app(ReceiptItemExtractor::class), app(ReceiptFrameQualityEvaluator::class),
            app(ReceiptFrameSampler::class), app(ReceiptOcrResultSelector::class),
            app(ReceiptMerchantMatcher::class), app(ReceiptTotalExtractor::class),
        );

        $result = $pipeline->process($report->fresh());

        $this->assertSame('failed', $result['status']);
        $this->assertSame('EVIDENCE_INTEGRITY_FAILED', $result['reason_code']);
        $this->assertSame(['kind' => 'original_video', 'sequence' => 0], $result['diagnostics']['integrity_failure']);
    }

    public function test_integrity_failure_is_not_retryable_and_recovers_only_through_a_fresh_capture(): void
    {
        Queue::fake();
        [$report, $resumeToken] = $this->createReadyReport('INTEGRITY');
        $report->update(['status' => 'Processing receipt', 'processing_status' => 'queued']);
        $pipeline = Mockery::mock(ReceiptEvidencePipeline::class);
        $pipeline->shouldReceive('process')->once()->andReturn([
            'status' => 'failed', 'reason_code' => 'EVIDENCE_INTEGRITY_FAILED', 'lines' => [], 'items' => [],
        ]);
        (new ProcessReceiptEvidence($report->report_reference))->handle($pipeline);
        $base = "/api/public/reports/{$report->report_reference}";
        $headers = ['X-Report-Resume-Token' => $resumeToken];

        $this->withHeaders($headers)->getJson("{$base}/processing")->assertOk()
            ->assertJsonPath('data.status', 'Processing failed')
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.can_recapture', true)
            ->assertJsonPath('data.failure_reason.code', 'EVIDENCE_INTEGRITY_FAILED')
            ->assertJsonPath('data.message', 'The stored receipt photos failed an integrity check and cannot be processed again. Capture the receipt again.');
        $this->withHeaders($headers)->postJson("{$base}/retry-processing")->assertStatus(409);
        $this->withHeaders($headers)->postJson("{$base}/recapture-session", ['replace_sequence' => 0])->assertStatus(422);
        Queue::assertNotPushed(ProcessReceiptEvidence::class);

        $session = $this->withHeaders($headers)->postJson("{$base}/recapture-session", ['restart' => true])
            ->assertCreated()->assertJsonPath('data.capture_action', 'full');
        $this->withHeader('X-Capture-Token', $session->json('data.capture_token'))
            ->postJson('/api/public/capture-sessions/'.$session->json('data.capture_session_id').'/assets', [
                'kind' => 'source_frame', 'sequence' => 0, 'asset' => UploadedFile::fake()->image('receipt.jpg', 1080, 1920),
            ])->assertCreated();
        $this->withHeaders($headers)->postJson("{$base}/recapture", ['capture_token' => $session->json('data.capture_token')])
            ->assertOk()->assertJsonPath('data.status', 'Processing receipt');

        Queue::assertPushed(ProcessReceiptEvidence::class);
        $this->assertSame(2, $report->refresh()->evidenceBundle->attempt_number);
    }

    private function headerOnlyPng(int $width, int $height): string
    {
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

        return "\x89PNG\r\n\x1a\n".$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0)).$chunk('IEND', '');
    }

    public function test_clear_store_mismatch_blocks_review_and_confirmation_without_submission_writes(): void
    {
        [$report, $token] = $this->createReadyReport('WRONGSTORE');
        $report->evidenceBundle->update(['processing_result_json' => [
            'merchant' => ['status' => 'mismatch', 'display_name' => 'Mercury Drug', 'uncertain' => false],
        ]]);
        $base = "/api/public/reports/{$report->report_reference}";
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("{$base}/review")
            ->assertOk()->assertJsonPath('data.can_submit', false)
            ->assertJsonPath('data.can_change_store', true)
            ->assertJsonPath('data.submission_block_reason.code', 'STORE_MISMATCH');
        $this->postJson("{$base}/confirm-ocr", ['consumer_confirmed' => true])
            ->assertUnprocessable()->assertJsonPath('code', 'STORE_MISMATCH');
        $report->refresh();
        $this->assertNull($report->submitted_at);
        $this->assertNull($report->consumer_confirmed_at);
        $this->assertNull($report->automatic_assessment_json);
        $this->assertNotNull($report->resume_token_hash);
        $this->assertDatabaseCount('citizen_tips', 0);
        $this->assertDatabaseCount('report_status_histories', 0);
    }

    public function test_uncertain_missing_and_partial_merchants_remain_submittable(): void
    {
        foreach ([
            ['status' => 'mismatch', 'display_name' => 'Mercury Drug', 'uncertain' => true],
            ['status' => 'mismatch', 'display_name' => null],
            ['status' => 'unverified', 'display_name' => 'JUAN'],
            ['status' => 'matched', 'display_name' => 'Juan Grocery'],
        ] as $index => $merchant) {
            [$report, $token] = $this->createReadyReport('UNCERTAIN'.$index);
            $report->evidenceBundle->update(['processing_result_json' => ['merchant' => $merchant]]);
            $this->withHeader('X-Report-Resume-Token', $token)
                ->getJson("/api/public/reports/{$report->report_reference}/review")
                ->assertOk()->assertJsonPath('data.can_submit', true)->assertJsonPath('data.submission_block_reason', null);
            $this->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", ['consumer_confirmed' => true])->assertOk();
        }
    }

    public function test_store_correction_rechecks_saved_extraction_preserves_evidence_and_is_idempotent(): void
    {
        Queue::fake();
        \Illuminate\Support\Facades\Http::preventStrayRequests();
        [$report, $token] = $this->createReadyReport('CHANGE');
        $target = Store::create(['dti_sec_number' => 'SEC-MERCURY', 'store_name' => 'Mercury Drug', 'owner_name' => 'Mercury Drug Corp', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94]);
        $result = [
            'merchant' => ['status' => 'mismatch', 'display_name' => 'MERCURY DRUG', 'observed' => ['MERCURY DRUG', 'SAN JOSE'], 'uncertain' => false],
            'warnings' => [\App\Services\Receipt\ReceiptWarning::make('STORE_NOT_CONFIRMED'), \App\Services\Receipt\ReceiptWarning::make('TOTAL_MISMATCH')],
            'manual_review_required' => true, 'total' => '45.00', 'extraction_raw' => ['merchant' => ['text' => 'MERCURY DRUG', 'uncertain' => false]],
        ];
        $report->evidenceBundle->update(['processing_result_json' => $result, 'extraction_calls' => 1]);
        $report->update(['raw_ocr_json' => $result]);
        $item = $report->items()->create(['sequence' => 0, 'item_name' => 'Rice', 'observed_price' => 45]);
        $originalAssets = $report->evidenceBundle->assets()->get()->toArray();
        $credentials = [$report->tracking_token_hash, $report->resume_token_hash];
        $base = "/api/public/reports/{$report->report_reference}/store";
        $payload = ['store_id' => $target->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1];
        $this->withHeader('X-Report-Resume-Token', $token)->postJson($base, $payload)
            ->assertOk()->assertJsonPath('data.store.id', $target->id)
            ->assertJsonPath('data.merchant.status', 'matched')->assertJsonPath('data.can_submit', true)
            ->assertJsonPath('data.warnings.0.code', 'TOTAL_MISMATCH');
        $this->postJson($base, $payload)->assertOk();
        $report->refresh()->load('evidenceBundle');
        $this->assertSame($target->id, $report->store_id);
        $this->assertSame($this->store->id, $report->captureSession->store_id);
        $this->assertSame($this->store->id, $report->evidenceBundle->store_id);
        $this->assertSame($originalAssets, $report->evidenceBundle->assets()->get()->toArray());
        $this->assertSame($credentials, [$report->tracking_token_hash, $report->resume_token_hash]);
        $this->assertSame('45.00', $report->raw_ocr_json['total']);
        $this->assertSame($result['extraction_raw'], $report->evidenceBundle->processing_result_json['extraction_raw']);
        $this->assertSame('matched', $report->raw_ocr_json['merchant']['status']);
        $this->assertSame($result['merchant']['observed'], $report->raw_ocr_json['merchant']['observed']);
        $this->assertTrue($report->raw_ocr_json['manual_review_required']);
        $this->assertSame('Rice', $item->fresh()->item_name);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        $this->assertDatabaseCount('audit_events', 1);
        $this->assertDatabaseHas('audit_events', ['action' => 'report.store_changed', 'subject_id' => $report->id]);
        Queue::assertNotPushed(ProcessReceiptEvidence::class);
    }

    public function test_store_correction_rejects_stale_invalid_and_submitted_requests(): void
    {
        [$report, $token] = $this->createReadyReport('STALESTORE');
        $base = "/api/public/reports/{$report->report_reference}/store";
        $payload = ['store_id' => $this->store->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1];
        $this->withHeader('X-Report-Resume-Token', $token)->postJson($base, [...$payload, 'expected_attempt_number' => 2])->assertConflict();
        $this->postJson($base, [...$payload, 'expected_store_id' => 99999])->assertConflict();
        $this->postJson($base, [...$payload, 'store_id' => 99999])->assertUnprocessable();
        $this->postJson($base, [...$payload, 'merchant' => 'Invented'])->assertUnprocessable();
        $report->update(['status' => 'Resolved', 'consumer_confirmed_at' => now(), 'submitted_at' => now()]);
        $this->postJson($base, $payload)->assertConflict();
        $this->assertDatabaseCount('audit_events', 0);
        $this->withHeader('X-Report-Resume-Token', 'invalid')->postJson($base, $payload)->assertForbidden();
    }

    public function test_submitted_receipt_is_viewable_with_tracking_credential_after_evaluation(): void
    {
        [$report, $token] = $this->createReadyReport('VIEWONLY');
        $savedItem = ['sequence' => 0, 'item_name' => 'RICE', 'observed_price' => 45];
        $report->evidenceBundle->update(['processing_result_json' => ['items' => [$savedItem], 'merchant' => ['status' => 'matched']]]);
        $report->update(['status' => 'Resolved', 'consumer_confirmed_at' => now(), 'submitted_at' => now(), 'resume_token_hash' => null]);
        $report->items()->create(['sequence' => 0, 'item_name' => 'DTI corrected name', 'observed_price' => 12]);
        $base = "/api/public/reports/{$report->report_reference}";
        $this->withHeader('X-Tracking-Token', 'tracking-VIEWONLY')->getJson("{$base}/review")
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('data.read_only', true)->assertJsonPath('data.can_submit', false)
            ->assertJsonPath('data.can_change_store', false)->assertJsonPath('data.items.0.item_name', 'RICE')
            ->assertJsonPath('data.items.0.observed_price', 45)->assertJsonMissingPath('data.evaluator_confirmed_json');
        $asset = $report->evidenceBundle->assets()->first();
        $this->get("{$base}/evidence-assets/{$asset->id}")->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->withHeader('X-Tracking-Token', 'invalid')->getJson("{$base}/review")->assertForbidden();
        $this->withHeader('X-Tracking-Token', '')->withHeader('X-Report-Resume-Token', $token)->getJson("{$base}/review")->assertForbidden();
    }

    public function test_historical_receipt_does_not_present_evaluator_items_as_saved_extraction(): void
    {
        [$report] = $this->createReadyReport('HISTORICAL');
        $report->evidenceBundle->update(['processing_result_json' => null]);
        $report->update(['status' => 'Resolved', 'consumer_confirmed_at' => now(), 'submitted_at' => now(), 'resume_token_hash' => null]);
        $report->items()->create(['sequence' => 0, 'item_name' => 'DTI corrected name', 'observed_price' => 12]);
        $base = "/api/public/reports/{$report->report_reference}";
        $this->withHeader('X-Tracking-Token', 'tracking-HISTORICAL')->getJson("{$base}/review")
            ->assertOk()->assertJsonPath('data.read_only', true)
            ->assertJsonPath('data.results_available', false)->assertJsonPath('data.items', []);
        $asset = $report->evidenceBundle->assets()->first();
        Storage::disk($asset->disk)->delete($asset->path);
        $this->get("{$base}/evidence-assets/{$asset->id}")->assertNotFound();
    }

    public function test_confirmation_rechecks_the_corrected_store_and_uncertainty_is_never_cleared(): void
    {
        [$report, $token] = $this->createReadyReport('RECHECK');
        $target = Store::create(['dti_sec_number' => 'SEC-OTHER', 'store_name' => 'Another Grocery', 'owner_name' => 'Another Corp', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94]);
        $saved = ['merchant' => ['status' => 'matched', 'display_name' => 'Juan Grocery', 'uncertain' => false], 'warnings' => []];
        $report->evidenceBundle->update(['processing_result_json' => $saved]);
        $report->update(['raw_ocr_json' => $saved]);
        $base = "/api/public/reports/{$report->report_reference}";
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("{$base}/store", [
            'store_id' => $target->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1,
        ])->assertOk()->assertJsonPath('data.can_submit', false);
        $this->postJson("{$base}/confirm-ocr", ['consumer_confirmed' => true])->assertUnprocessable()->assertJsonPath('code', 'STORE_MISMATCH');
        $this->assertDatabaseCount('citizen_tips', 0);
        $result = $report->evidenceBundle->fresh()->processing_result_json;
        $result['merchant']['uncertain'] = true;
        $report->evidenceBundle->update(['processing_result_json' => $result]);
        $this->postJson("{$base}/store", ['store_id' => $this->store->id, 'expected_store_id' => $target->id, 'expected_attempt_number' => 1])
            ->assertOk()->assertJsonPath('data.merchant.uncertain', true)->assertJsonPath('data.manual_review_required', true);
    }

    public function test_store_change_removes_only_store_warning_from_both_saved_results(): void
    {
        [$report, $token] = $this->createReadyReport('ONLYWARNING');
        $target = Store::create(['dti_sec_number' => 'SEC-WARNING', 'store_name' => 'Mercury Drug', 'owner_name' => 'Mercury Corp', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94]);
        $report->evidenceBundle->update(['processing_result_json' => [
            'merchant' => ['status' => 'mismatch', 'display_name' => 'MERCURY DRUG', 'uncertain' => false],
            'manual_review_required' => true, 'warnings' => [\App\Services\Receipt\ReceiptWarning::make('STORE_NOT_CONFIRMED')],
        ]]);
        // An older compact raw result lacks warning details; the bundle remains the authoritative source.
        $report->update(['raw_ocr_json' => ['manual_review_required' => true]]);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/store", [
            'store_id' => $target->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1,
        ])->assertOk()->assertJsonPath('data.warnings', [])->assertJsonPath('data.manual_review_required', false);
        $this->assertFalse($report->fresh()->raw_ocr_json['manual_review_required']);
    }

    public function test_store_correction_rechecks_submission_after_the_store_lock(): void
    {
        [$report, $token] = $this->createReadyReport('CONFIRM-RACE');
        $target = Store::create(['dti_sec_number' => 'SEC-RACE', 'store_name' => 'Other Store', 'owner_name' => 'Other Owner', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94]);
        $interleaved = false;
        // Simulate confirmation winning between credential lookup and the locked report read.
        Store::retrieved(function (Store $store) use ($report, $target, &$interleaved) {
            if ($interleaved || $store->id !== $target->id) return;
            $interleaved = true;
            ConsumerReport::whereKey($report->id)->update(['consumer_confirmed_at' => now(), 'submitted_at' => now(), 'status' => 'Submitted']);
        });
        try {
            $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/store", [
                'store_id' => $target->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1,
            ])->assertConflict();
        } finally {
            \Illuminate\Support\Facades\Event::forget('eloquent.retrieved: '.Store::class);
        }
        $this->assertTrue($interleaved);
        $this->assertSame($this->store->id, $report->fresh()->store_id);
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_store_correction_rolls_back_when_audit_persistence_fails(): void
    {
        [$report, $token] = $this->createReadyReport('AUDITSTORE');
        $target = Store::create(['dti_sec_number' => 'SEC-AUDIT', 'store_name' => 'Another Store', 'owner_name' => 'Another Corp', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94]);
        $original = $report->evidenceBundle->processing_result_json;
        $this->mock(\App\Services\Admin\AuditTrailService::class)->shouldReceive('recordAs')->once()->andReturn(null);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/store", [
            'store_id' => $target->id, 'expected_store_id' => $this->store->id, 'expected_attempt_number' => 1,
        ])->assertStatus(503);
        $this->assertSame($this->store->id, $report->fresh()->store_id);
        $this->assertSame($original, $report->evidenceBundle->fresh()->processing_result_json);
    }

    private function createReadyReport(string $suffix, bool $withEvidence = true): array
    {
        $resumeToken = 'rsm_'.Str::random(32);
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'finalized',
            'token_hash' => hash('sha256', 'capture-'.$suffix),
            'expires_at' => now()->addMinutes(15),
            'is_used' => true,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(),
            'capture_session_id' => $session->id,
            'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'ready',
            'processing_result_json' => [
                'continuity' => ['status' => 'ready', 'continuity_score' => 1.0, 'reasons' => []],
                'merchant' => ['status' => 'matched'],
            ],
        ]);
        $report = ConsumerReport::create([
            'report_reference' => 'REP-20260816-'.$suffix,
            'tracking_token_hash' => hash('sha256', 'tracking-'.$suffix),
            'resume_token_hash' => hash('sha256', $resumeToken),
            'store_id' => $this->store->id,
            'submission_uuid' => 'submission-'.$suffix,
            'capture_session_id' => $session->id,
            'receipt_evidence_bundle_id' => $bundle->id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'ready',
            'status' => 'Ready for confirmation',
            'raw_ocr_json' => ['lines' => ['RICE 45.00']],
            'privacy_notice_version' => '1.0',
        ]);
        $bundle->update(['consumer_report_id' => $report->id, 'attempt_number' => 1]);
        if ($withEvidence) {
            $contents = 'original-receipt-'.$suffix;
            $path = "receipt-evidence/{$bundle->evidence_uuid}/source-0.jpg";
            Storage::disk('receipt_evidence')->put($path, $contents);
            ReceiptEvidenceAsset::create([
                'receipt_evidence_bundle_id' => $bundle->id,
                'kind' => 'source_frame', 'sequence' => 0, 'disk' => 'receipt_evidence',
                'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($contents),
                'sha256' => hash('sha256', $contents),
            ]);
        }

        return [$report, $resumeToken];
    }
}
