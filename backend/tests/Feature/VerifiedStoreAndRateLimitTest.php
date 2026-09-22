<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class VerifiedStoreAndRateLimitTest extends TestCase
{
    use RefreshDatabase;

    private Store $activeVerifiedStore;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Cache::flush();
        RateLimiter::clear('ocr_rate:127.0.0.1');

        $this->activeVerifiedStore = Store::create([
            'dti_sec_number' => 'SEC-ACT-1001',
            'store_name' => 'Antique Central Supermarket',
            'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
            'recidivism_index' => 0,
            'is_active' => true,
            'is_verified' => true,
        ]);

        $this->bulletin = SrpBulletin::create([
            'commodity_name' => 'Saba Sardines 155g',
            'baseline_price' => 23.50,
            'effective_date' => '2026-07-20',
            'is_active' => true,
        ]);
    }

    public function test_active_approved_verified_public_store_accepted()
    {
        $file = UploadedFile::fake()->create('tag.jpg', 200, 'image/jpeg');

        $response = $this->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'image' => $file,
        ]);

        $response->assertStatus(200)
                 ->assertJsonPath('success', true)
                 ->assertJsonPath('data.store.id', $this->activeVerifiedStore->id)
                 ->assertJsonPath('data.store.is_verified', true);
    }

    public function test_inactive_or_unverified_or_missing_store_rejected_with_http_422()
    {
        $file = UploadedFile::fake()->create('tag.jpg', 200, 'image/jpeg');

        // 1. Inactive store
        $inactiveStore = Store::create([
            'dti_sec_number' => 'SEC-INACT-1002',
            'store_name' => 'Inactive Store',
            'owner_name' => 'Pedro Penduko',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
            'recidivism_index' => 0,
            'is_active' => false,
            'is_verified' => true,
        ]);

        $res1 = $this->postJson('/api/public/scan-tag', [
            'store_id' => $inactiveStore->id,
            'image' => $file,
        ]);
        $res1->assertStatus(422)
             ->assertJsonPath('success', false)
             ->assertJsonPath('message', 'The selected establishment is unverified, inactive, or not eligible for public price checking.');

        // 2. Unverified store
        $unverifiedStore = Store::create([
            'dti_sec_number' => 'SEC-UNVER-1003',
            'store_name' => 'Unverified Store',
            'owner_name' => 'Maria Clara',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
            'recidivism_index' => 0,
            'is_active' => true,
            'is_verified' => false,
        ]);

        $res2 = $this->postJson('/api/public/scan-tag', [
            'store_id' => $unverifiedStore->id,
            'image' => $file,
        ]);
        $res2->assertStatus(422)
             ->assertJsonPath('success', false)
             ->assertJsonPath('message', 'The selected establishment is unverified, inactive, or not eligible for public price checking.');

        // 3. Missing store ID
        $res3 = $this->postJson('/api/public/scan-tag', [
            'store_id' => 999999,
            'image' => $file,
        ]);
        $res3->assertStatus(422)
             ->assertJsonPath('success', false)
             ->assertJsonPath('message', 'The selected establishment is unverified, inactive, or not eligible for public price checking.');
    }

    public function test_duplicate_scan_uuid_lock_rejects_second_request_with_http_429()
    {
        $scanUuid = (string) Str::uuid();
        $file1 = UploadedFile::fake()->create('tag1.jpg', 200, 'image/jpeg');
        $file2 = UploadedFile::fake()->create('tag2.jpg', 200, 'image/jpeg');

        // First scan request succeeds
        $res1 = $this->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'scan_uuid' => $scanUuid,
            'image' => $file1,
        ]);
        $res1->assertStatus(200);

        // Immediate second scan request with same scan_uuid is rejected with HTTP 429
        $res2 = $this->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'scan_uuid' => $scanUuid,
            'image' => $file2,
        ]);
        $res2->assertStatus(429)
             ->assertJsonPath('success', false)
             ->assertJsonPath('message', 'A scan operation is currently in progress for this scan UUID.');
    }

    public function test_rate_limit_burst_threshold_returns_http_429()
    {
        $file = UploadedFile::fake()->create('tag.jpg', 200, 'image/jpeg');

        // Send 10 requests (burst limit)
        for ($i = 0; $i < 10; $i++) {
            $uuid = (string) Str::uuid();
            $res = $this->postJson('/api/public/scan-tag', [
                'store_id' => $this->activeVerifiedStore->id,
                'scan_uuid' => $uuid,
                'image' => $file,
            ]);
            $res->assertStatus(200);
        }

        // 11th request triggers rate limiter
        $uuid11 = (string) Str::uuid();
        $res11 = $this->withHeader('Origin', 'https://customer-pwa-six.vercel.app')->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'scan_uuid' => $uuid11,
            'image' => $file,
        ]);

        $res11->assertStatus(429)
              ->assertJsonPath('success', false)
              ->assertJsonPath('message', 'Rate limit exceeded. Please wait a moment before taking another scan.');

        $this->assertTrue($res11->headers->has('Retry-After'));
        $this->assertStringContainsString('Retry-After', $res11->headers->get('Access-Control-Expose-Headers', ''));
    }

    public function test_compare_price_has_its_own_limit_separate_from_ocr_scans()
    {
        $payload = [
            'store_id' => $this->activeVerifiedStore->id,
            'srp_bulletin_id' => $this->bulletin->id,
            'displayed_price' => 24.00,
        ];

        for ($i = 0; $i < 30; $i++) {
            $this->postJson('/api/public/compare-price', $payload)->assertStatus(200);
        }

        $this->postJson('/api/public/compare-price', $payload)->assertStatus(429);

        // Live comparisons must not use up the OCR scan allowance.
        $this->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'image' => UploadedFile::fake()->create('tag.jpg', 200, 'image/jpeg'),
        ])->assertStatus(200);
    }

    public function test_public_payload_does_not_contain_dti_sec_number_or_owner_name()
    {
        // 1. Check establishments endpoint
        $res1 = $this->getJson('/api/public/establishments');
        $res1->assertStatus(200);

        $storeData1 = $res1->json('data.0');
        $this->assertArrayHasKey('id', $storeData1);
        $this->assertArrayHasKey('store_name', $storeData1);
        $this->assertArrayHasKey('address', $storeData1);
        $this->assertArrayHasKey('latitude', $storeData1);
        $this->assertArrayHasKey('longitude', $storeData1);
        $this->assertArrayHasKey('is_verified', $storeData1);

        $this->assertArrayNotHasKey('dti_sec_number', $storeData1);
        $this->assertArrayNotHasKey('owner_name', $storeData1);
        $this->assertArrayNotHasKey('recidivism_index', $storeData1);

        // 2. Check scan-tag endpoint payload
        $file = UploadedFile::fake()->create('tag.jpg', 200, 'image/jpeg');
        $res2 = $this->postJson('/api/public/scan-tag', [
            'store_id' => $this->activeVerifiedStore->id,
            'image' => $file,
        ]);
        $res2->assertStatus(200);

        $storeData2 = $res2->json('data.store');
        $this->assertArrayHasKey('id', $storeData2);
        $this->assertArrayHasKey('store_name', $storeData2);
        $this->assertArrayHasKey('address', $storeData2);
        $this->assertArrayHasKey('latitude', $storeData2);
        $this->assertArrayHasKey('longitude', $storeData2);
        $this->assertArrayHasKey('is_verified', $storeData2);

        $this->assertArrayNotHasKey('dti_sec_number', $storeData2);
        $this->assertArrayNotHasKey('owner_name', $storeData2);
        $this->assertArrayNotHasKey('recidivism_index', $storeData2);
    }
}
