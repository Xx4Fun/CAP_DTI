<?php

namespace Tests\Feature;

use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\SrpBulletin;
use App\Models\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicPwaTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::create([
            'dti_sec_number' => 'SEC-PWA-1001',
            'store_name' => 'San Jose Central Mart',
            'owner_name' => 'Juana Dela Cruz',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'Main Street, San Jose',
            'recidivism_index' => 0,
        ]);

        $this->bulletin = SrpBulletin::create([
            'commodity_name' => 'Premium Milled Rice',
            'baseline_price' => 42.00,
            'effective_date' => '2026-07-20',
            'is_active' => true,
        ]);

        Storage::fake('local');
    }

    public function test_can_get_public_config()
    {
        $response = $this->getJson('/api/public/config');
        $response->assertStatus(200)
                 ->assertJsonPath('data.app_name', 'PRICE-Watch')
                 ->assertJsonPath('data.privacy_notice_version', '1.0');
    }

    public function test_can_search_public_commodities()
    {
        $response = $this->getJson('/api/public/commodities?query=Rice');
        $response->assertStatus(200)
                 ->assertJsonCount(1, 'data')
                 ->assertJsonPath('data.0.commodity_name', 'Premium Milled Rice');
    }

    public function test_can_search_public_establishments()
    {
        $response = $this->getJson('/api/public/establishments?query=Central');
        $response->assertStatus(200)
                 ->assertJsonCount(1, 'data')
                 ->assertJsonPath('data.0.store_name', 'San Jose Central Mart');
    }

    public function test_can_create_capture_session()
    {
        $response = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
        ]);

        $response->assertStatus(201)
                 ->assertJsonStructure([
                     'data' => ['capture_session_id', 'session_uuid', 'capture_token', 'expires_at']
                 ]);

        $this->assertDatabaseHas('capture_sessions', [
            'store_id' => $this->store->id,
            'is_used' => false,
        ]);
    }

    public function test_can_create_store_locked_continuous_receipt_capture_session()
    {
        config()->set('services.receipt_capture.enabled', true);
        $response = $this->postJson('/api/public/capture-session', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.capture_mode', 'continuous_video_v1')
            ->assertJsonPath('data.store_id', $this->store->id)
            ->assertJsonPath('data.limits.max_duration_seconds', 30)
            ->assertJsonPath('data.limits.max_video_bytes', 25 * 1024 * 1024)
            ->assertJsonPath('data.limits.min_frames', 2)
            ->assertJsonPath('data.limits.max_frames', 12);

        $this->assertDatabaseHas('capture_sessions', [
            'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'open',
            'is_used' => false,
        ]);
    }

    public function test_can_submit_formal_report_and_enforce_idempotency()
    {
        // 1. Request Capture Session
        $sessionRes = $this->postJson('/api/public/capture-session', ['store_id' => $this->store->id]);
        $token = $sessionRes->json('data.capture_token');
        $sessionId = $sessionRes->json('data.capture_session_id');

        $submissionUuid = 'sub-uuid-123456';
        $fakeFile = UploadedFile::fake()->create('receipt.jpg', 100, 'image/jpeg');

        // 2. Submit Report
        $response = $this->postJson('/api/public/reports', [
            'submission_uuid' => $submissionUuid,
            'capture_token' => $token,
            'store_id' => $this->store->id,
            'image' => $fakeFile,
            'privacy_notice_version' => '1.0',
            'extracted_text_json' => json_encode(['lines' => ['Rice 45.00']]),
        ]);

        $response->assertStatus(201)
                 ->assertJsonStructure([
                     'data' => ['report_reference', 'secret_tracking_token', 'status']
                 ]);

        $ref = $response->json('data.report_reference');
        $trkToken = $response->json('data.secret_tracking_token');

        // 3. Replay same submission_uuid (Idempotency test)
        $replayRes = $this->postJson('/api/public/reports', [
            'submission_uuid' => $submissionUuid,
            'capture_token' => $token,
            'store_id' => $this->store->id,
            'image' => $fakeFile,
            'privacy_notice_version' => '1.0',
        ]);

        $replayRes->assertStatus(200)
                  ->assertJsonPath('data.report_reference', $ref);

        $this->postJson('/api/public/reports', [
            'submission_uuid' => $submissionUuid,
            'capture_token' => 'wrong-capture-token',
        ])->assertForbidden();

        // 4. Track report with reference and secret token
        $trackRes = $this->getJson("/api/public/reports/track?reference={$ref}&token={$trkToken}");
        $trackRes->assertStatus(200)
                 ->assertJsonPath('data.report_reference', $ref)
                 ->assertJsonPath('data.current_status', 'Submitted');
    }
}
