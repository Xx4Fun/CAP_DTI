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
use App\Services\Receipt\ReceiptPushMessage;
use App\Services\Receipt\ReceiptPushSender;
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

    public function test_customer_confirmation_submits_ready_items_once_and_revokes_device_resume_token(): void
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

        $payload = [
            'consumer_confirmed' => true,
            'confirmed_items' => [[
                'sequence' => 0,
                'item_name' => 'Premium Rice',
                'quantity' => 1,
                'unit' => 'kg',
                'observed_price' => 45.00,
            ]],
        ];

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
            'item_name' => 'Premium Rice',
            'consumer_confirmed' => true,
        ]);
        $this->assertDatabaseCount('citizen_tips', 1);

        $this->withHeader('X-Report-Resume-Token', $resumeToken)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", $payload)
            ->assertForbidden();
        $this->assertDatabaseCount('citizen_tips', 1);
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

    private function createReadyReport(string $suffix): array
    {
        $resumeToken = 'rsm_'.Str::random(32);
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'finalized',
            'token_hash' => hash('sha256', 'capture-'.$suffix),
            'expires_at' => now()->addMinutes(15),
            'is_used' => true,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(),
            'capture_session_id' => $session->id,
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
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
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'ready',
            'status' => 'Ready for confirmation',
            'raw_ocr_json' => ['lines' => ['RICE 45.00']],
            'privacy_notice_version' => '1.0',
        ]);

        return [$report, $resumeToken];
    }
}
