<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Services\Ocr\ScanSessionRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

class CompareEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected Store $store;
    protected SrpBulletin $product;
    protected ScanSessionRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        $this->repository = app(ScanSessionRepository::class);

        $this->store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'San Jose Grocery',
            'owner_name' => 'Juan Dela Cruz',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7449,
            'longitude' => 121.9839,
            'is_active' => true,
            'is_verified' => true,
        ]);

        $this->product = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);
    }

    public function test_successful_compare_returns_200_peso_difference_and_disclaimer(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'scan_uuid' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
                'displayed_price' => '23.50',
                'reference_price' => '21.50',
                'regulatory_label' => 'Current SRP',
                'regulatory_mode' => 'NORMAL_SRP',
                'peso_difference' => '2.00',
                'percent_difference' => '9.3',
                'is_above_reference' => true,
                'product_source' => 'OCR',
                'price_source' => 'USER_CONFIRMED',
                'disclaimer' => 'This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.',
            ]
        ]);
    }

    public function test_session_is_marked_consumed_after_comparison(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'scan_uuid' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $payload = [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ];

        // First call succeeds
        $firstResponse = $this->postJson('/api/public/scan-tag/compare', $payload);
        $firstResponse->assertStatus(200);

        // Second call fails with 422
        $secondResponse = $this->postJson('/api/public/scan-tag/compare', $payload);
        $secondResponse->assertStatus(422);
        $secondResponse->assertJson([
            'success' => false,
            'message' => 'Scan session not found, expired, or already consumed.',
        ]);
    }

    public function test_unauthorized_product_not_in_candidate_list_returns_422(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'scan_uuid' => (string) Str::uuid(),
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [9999], // Not including $this->product->id
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
            'message' => 'Selected product was not identified by OCR for this scan session.',
        ]);
    }

    public function test_mismatched_store_id_returns_422(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $otherStore = Store::create([
            'dti_sec_number' => 'SEC-99999',
            'store_name' => 'Other Store',
            'owner_name' => 'Jane Doe',
            'address' => 'San Jose',
            'latitude' => 10.7,
            'longitude' => 121.9,
            'is_active' => true,
            'is_verified' => true,
        ]);

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $otherStore->id, // Mismatched store ID
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
            'message' => 'Store ID does not match scan session store.',
        ]);
    }

    public function test_changed_ocr_price_submitted_as_user_confirmed_returns_422(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50', // OCR detected 23.50
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        // User submits 25.00 but labels it USER_CONFIRMED (should be USER_CORRECTED)
        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '25.00',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
            'message' => 'Invalid price source for detected OCR price state.',
        ]);
    }

    public function test_missing_ocr_price_submitted_as_user_confirmed_returns_422(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'ocr_status' => 'PRODUCT_DETECTED_PRICE_MISSING',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => null,
            'detected_price_string' => null, // OCR did NOT detect price
            'detected_price_source' => null,
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        // User submits price but labels it USER_CONFIRMED (should be USER_ENTERED)
        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'OCR',
            'price_source' => 'USER_CONFIRMED',
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
            'message' => 'Invalid price source for detected OCR price state.',
        ]);
    }

    public function test_successful_compare_with_manual_search_and_user_entered_price(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'ocr_status' => 'NO_RELIABLE_PRODUCT_MATCH',
            'allowed_candidate_product_ids' => [],
            'manual_product_ids' => [$this->product->id],
            'detected_price_centavos' => null,
            'detected_price_string' => null,
            'product_source' => 'MANUAL_SEARCH',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '23.50',
            'product_source' => 'MANUAL_SEARCH',
            'price_source' => 'USER_ENTERED',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'product_source' => 'MANUAL_SEARCH',
                'price_source' => 'USER_ENTERED',
            ]
        ]);
    }

    public function test_successful_compare_with_corrected_price(): void
    {
        $scanId = 'scan_' . Str::uuid();

        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [$this->product->id],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId,
            'store_id' => $this->store->id,
            'product_id' => $this->product->id,
            'displayed_price' => '24.00',
            'product_source' => 'OCR',
            'price_source' => 'USER_CORRECTED',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'displayed_price' => '24.00',
                'reference_price' => '21.50',
                'peso_difference' => '2.50',
                'product_source' => 'OCR',
                'price_source' => 'USER_CORRECTED',
            ]
        ]);
    }
}
