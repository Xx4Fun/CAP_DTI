<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Services\Ocr\ScanSessionRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

class ManualSelectEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected SrpBulletin $activeProduct;
    protected SrpBulletin $inactiveProduct;
    protected ScanSessionRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        $this->repository = app(ScanSessionRepository::class);

        $this->activeProduct = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $this->inactiveProduct = SrpBulletin::create([
            'commodity_name' => 'Discontinued Item 100g',
            'category' => 'Canned Fish',
            'unit' => '100 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 15.00,
            'effective_date' => '2025-01-01',
            'is_active' => false,
        ]);
    }

    public function test_manual_select_endpoint_success_returns_200_and_updates_session(): void
    {
        $scanId = 'scan_' . Str::uuid();

        // Seed session fixture in ScanSessionRepository
        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'scan_uuid' => (string) Str::uuid(),
            'store_id' => 1,
            'ocr_status' => 'NO_RELIABLE_PRODUCT_MATCH',
            'allowed_candidate_product_ids' => [],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'consumed_state' => false,
        ]);

        $response = $this->postJson('/api/public/scan-tag/manual-select', [
            'scan_id' => $scanId,
            'product_id' => $this->activeProduct->id,
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'product_id' => $this->activeProduct->id,
                'product_source' => 'MANUAL_SEARCH',
            ]
        ]);

        // Assert ScanSessionRepository has product_id in manual_product_ids array
        // while allowed_candidate_product_ids remains empty []
        $updatedSession = $this->repository->get($scanId);
        $this->assertNotNull($updatedSession);
        $this->assertContains($this->activeProduct->id, $updatedSession['manual_product_ids']);
        $this->assertEmpty($updatedSession['allowed_candidate_product_ids']);
        $this->assertEquals('MANUAL_SEARCH', $updatedSession['product_source']);
    }

    public function test_manual_select_endpoint_returns_422_for_unknown_or_consumed_session(): void
    {
        // 1. Unknown session
        $response = $this->postJson('/api/public/scan-tag/manual-select', [
            'scan_id' => 'scan_non_existent',
            'product_id' => $this->activeProduct->id,
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'success' => false,
            'message' => 'Scan session not found, expired, or already consumed.',
        ]);

        // 2. Consumed session
        $scanId = 'scan_' . Str::uuid();
        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => 1,
            'ocr_status' => 'NO_RELIABLE_PRODUCT_MATCH',
            'allowed_candidate_product_ids' => [],
            'manual_product_ids' => [],
            'consumed_state' => true,
        ]);

        $responseConsumed = $this->postJson('/api/public/scan-tag/manual-select', [
            'scan_id' => $scanId,
            'product_id' => $this->activeProduct->id,
        ]);

        $responseConsumed->assertStatus(422);
        $responseConsumed->assertJson([
            'success' => false,
            'message' => 'Scan session not found, expired, or already consumed.',
        ]);
    }

    public function test_manual_select_endpoint_returns_422_for_inactive_or_missing_product(): void
    {
        $scanId = 'scan_' . Str::uuid();
        $this->repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => 1,
            'ocr_status' => 'NO_RELIABLE_PRODUCT_MATCH',
            'allowed_candidate_product_ids' => [],
            'manual_product_ids' => [],
            'consumed_state' => false,
        ]);

        // 1. Inactive product
        $responseInactive = $this->postJson('/api/public/scan-tag/manual-select', [
            'scan_id' => $scanId,
            'product_id' => $this->inactiveProduct->id,
        ]);

        $responseInactive->assertStatus(422);
        $responseInactive->assertJson([
            'success' => false,
            'message' => 'The selected commodity is invalid or inactive.',
        ]);

        // 2. Non-existent product
        $responseMissing = $this->postJson('/api/public/scan-tag/manual-select', [
            'scan_id' => $scanId,
            'product_id' => 999999,
        ]);

        $responseMissing->assertStatus(422);
        $responseMissing->assertJson([
            'success' => false,
            'message' => 'The selected commodity is invalid or inactive.',
        ]);
    }
}
