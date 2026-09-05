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
