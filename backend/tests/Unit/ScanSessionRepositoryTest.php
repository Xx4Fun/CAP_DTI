<?php

namespace Tests\Unit;

use App\Services\Ocr\ScanSessionRepository;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ScanSessionRepositoryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_put_and_get_session_data(): void
    {
        $repository = new ScanSessionRepository();
        $scanId = 'scan_test_123456';

        $payload = [
            'scan_id' => $scanId,
            'scan_uuid' => '550e8400-e29b-41d4-a716-446655440000',
            'store_id' => 42,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            'allowed_candidate_product_ids' => [10, 20],
            'manual_product_ids' => [],
            'detected_price_centavos' => 2350,
            'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR',
            'product_source' => 'OCR',
            'correlation_id' => 'corr_999',
        ];

        $putResult = $repository->put($scanId, $payload);
        $this->assertTrue($putResult);

        $retrieved = $repository->get($scanId);
        $this->assertNotNull($retrieved);
        $this->assertEquals($scanId, $retrieved['scan_id']);
        $this->assertEquals('550e8400-e29b-41d4-a716-446655440000', $retrieved['scan_uuid']);
        $this->assertEquals(42, $retrieved['store_id']);
        $this->assertEquals('OCR_PRODUCT_AND_PRICE_DETECTED', $retrieved['ocr_status']);
        $this->assertEquals([10, 20], $retrieved['allowed_candidate_product_ids']);
        $this->assertEmpty($retrieved['manual_product_ids']);
        $this->assertEquals(2350, $retrieved['detected_price_centavos']);
        $this->assertEquals('23.50', $retrieved['detected_price_string']);
        $this->assertEquals('OCR', $retrieved['detected_price_source']);
        $this->assertEquals('OCR', $retrieved['product_source']);
        $this->assertFalse($retrieved['consumed_state']); // Default consumed_state should be false
        $this->assertEquals('corr_999', $retrieved['correlation_id']);
        $this->assertIsInt($retrieved['created_at']);
        $this->assertIsInt($retrieved['expires_at']);
    }

    public function test_consumed_state_is_false_initially_and_updated_to_true_by_consume(): void
    {
        $repository = new ScanSessionRepository();
        $scanId = 'scan_test_consume';

        $repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => 1,
            'allowed_candidate_product_ids' => [5],
        ]);

        $initial = $repository->get($scanId);
        $this->assertFalse($initial['consumed_state']);

        $consumedResult = $repository->consume($scanId);
        $this->assertTrue($consumedResult);

        $updated = $repository->get($scanId);
        $this->assertTrue($updated['consumed_state']);
    }

    public function test_add_manual_product_id_appends_to_manual_product_ids_and_leaves_allowed_candidates_untouched(): void
    {
        $repository = new ScanSessionRepository();
        $scanId = 'scan_test_manual';

        $repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => 1,
            'allowed_candidate_product_ids' => [101, 102],
            'manual_product_ids' => [],
        ]);

        $result = $repository->addManualProductId($scanId, 505);
        $this->assertTrue($result);

        $updated = $repository->get($scanId);
        $this->assertEquals([101, 102], $updated['allowed_candidate_product_ids']);
        $this->assertEquals([505], $updated['manual_product_ids']);

        // Add another manual product ID and check uniqueness
        $repository->addManualProductId($scanId, 506);
        $repository->addManualProductId($scanId, 505); // Duplicate should be de-duped

        $final = $repository->get($scanId);
        $this->assertEquals([101, 102], $final['allowed_candidate_product_ids']);
        $this->assertEquals([505, 506], $final['manual_product_ids']);
    }

    public function test_get_returns_null_for_unknown_or_expired_session_ids(): void
    {
        $repository = new ScanSessionRepository(ttlSeconds: 1); // 1 second TTL
        $scanId = 'scan_test_expire';

        $this->assertNull($repository->get('non_existent_scan_id'));

        $repository->put($scanId, [
            'scan_id' => $scanId,
            'store_id' => 1,
        ]);

        $this->assertNotNull($repository->get($scanId));

        // Sleep to test expiration
        sleep(2);

        $this->assertNull($repository->get($scanId));
    }

    public function test_forget_removes_session(): void
    {
        $repository = new ScanSessionRepository();
        $scanId = 'scan_test_forget';

        $repository->put($scanId, ['scan_id' => $scanId]);
        $this->assertNotNull($repository->get($scanId));

        $forgetResult = $repository->forget($scanId);
        $this->assertTrue($forgetResult);

        $this->assertNull($repository->get($scanId));
    }

    public function test_consume_returns_false_for_unknown_session(): void
    {
        $repository = new ScanSessionRepository();
        $this->assertFalse($repository->consume('unknown_id'));
    }

    public function test_add_manual_product_id_returns_false_for_unknown_session(): void
    {
        $repository = new ScanSessionRepository();
        $this->assertFalse($repository->addManualProductId('unknown_id', 123));
    }
}
