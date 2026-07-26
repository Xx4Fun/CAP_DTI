<?php

namespace Tests\Unit;

use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\TemporalInspection;
use App\Services\Ocr\HistoricalPriceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HistoricalPriceResolverTest extends TestCase
{
    use RefreshDatabase;

    protected HistoricalPriceResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new HistoricalPriceResolver();
    }

    public function test_queries_latest_verified_field_monitoring_record_and_selects_newest_price(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-HIST-001',
            'store_name' => 'San Jose Supermarket',
            'owner_name' => 'Maria Santos',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose, Antique',
        ]);

        $product = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'baseline_price' => 20.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        // Older inspection (10 days ago @ 20.00)
        TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $product->id,
            'recorded_price' => 20.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(10),
            'officer_signature' => 'sig_officer_abc',
            'vendor_signature' => 'sig_vendor_xyz',
        ]);

        // Newer inspection (2 days ago @ 20.50)
        $newerInspection = TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $product->id,
            'recorded_price' => 20.50,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(2),
            'officer_signature' => 'sig_officer_abc',
            'vendor_signature' => 'sig_vendor_xyz',
        ]);

        $resolved = $this->resolver->resolve($store, $product);

        $this->assertTrue($resolved['has_history']);
        $this->assertEquals('VERIFIED_HISTORY_FOUND', $resolved['status']);
        $this->assertEquals('20.50', $resolved['previous_verified_price']);
        $this->assertEquals(2050, $resolved['previous_verified_centavos']);
        $this->assertEquals(now()->subDays(2)->format('Y-m-d'), $resolved['verification_date']);
        $this->assertEquals($newerInspection->id, $resolved['inspection_id']);
        $this->assertEquals('OFFICIAL_DTI_INSPECTION', $resolved['source_type']);
    }

    public function test_wrong_store_or_wrong_product_returns_no_verified_history(): void
    {
        $storeA = Store::create([
            'dti_sec_number' => 'SEC-HIST-002',
            'store_name' => 'Store Alpha',
            'owner_name' => 'Owner Alpha',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose, Antique',
        ]);

        $storeB = Store::create([
            'dti_sec_number' => 'SEC-HIST-003',
            'store_name' => 'Store Beta',
            'owner_name' => 'Owner Beta',
            'latitude' => 10.7420,
            'longitude' => 121.9390,
            'address' => 'San Jose, Antique',
        ]);

        $productA = SrpBulletin::create([
            'commodity_name' => 'Product Alpha 100g',
            'baseline_price' => 15.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $productB = SrpBulletin::create([
            'commodity_name' => 'Product Beta 200g',
            'baseline_price' => 30.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        // Inspection for Store A and Product A only
        TemporalInspection::create([
            'store_id' => $storeA->id,
            'srp_id' => $productA->id,
            'recorded_price' => 15.50,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(1),
            'officer_signature' => 'sig_officer_123',
        ]);

        // Query Store B with Product A (Wrong store)
        $resolvedWrongStore = $this->resolver->resolve($storeB, $productA);
        $this->assertFalse($resolvedWrongStore['has_history']);
        $this->assertEquals('NO_VERIFIED_HISTORY', $resolvedWrongStore['status']);
        $this->assertNull($resolvedWrongStore['previous_verified_price']);

        // Query Store A with Product B (Wrong product)
        $resolvedWrongProduct = $this->resolver->resolve($storeA, $productB);
        $this->assertFalse($resolvedWrongProduct['has_history']);
        $this->assertEquals('NO_VERIFIED_HISTORY', $resolvedWrongProduct['status']);
        $this->assertNull($resolvedWrongProduct['previous_verified_price']);
    }

    public function test_store_and_product_with_zero_inspections_returns_no_verified_history(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-HIST-004',
            'store_name' => 'Empty Inspection Mart',
            'owner_name' => 'Pedro Penduko',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose, Antique',
        ]);

        $product = SrpBulletin::create([
            'commodity_name' => 'Empty Product 50g',
            'baseline_price' => 10.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $resolved = $this->resolver->resolve($store, $product);

        $this->assertFalse($resolved['has_history']);
        $this->assertEquals('NO_VERIFIED_HISTORY', $resolved['status']);
        $this->assertNull($resolved['previous_verified_price']);
        $this->assertNull($resolved['previous_verified_centavos']);
        $this->assertNull($resolved['verification_date']);
        $this->assertNull($resolved['inspection_id']);
        $this->assertNull($resolved['source_type']);
    }

    public function test_accepts_integer_ids_for_store_and_product(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-HIST-005',
            'store_name' => 'Numeric ID Mart',
            'owner_name' => 'Juana Dela Cruz',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose, Antique',
        ]);

        $product = SrpBulletin::create([
            'commodity_name' => 'Numeric Product 100g',
            'baseline_price' => 45.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $inspection = TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $product->id,
            'recorded_price' => 44.50,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(3),
            'officer_signature' => 'sig_officer_int',
        ]);

        $resolved = $this->resolver->resolve($store->id, $product->id);

        $this->assertTrue($resolved['has_history']);
        $this->assertEquals('VERIFIED_HISTORY_FOUND', $resolved['status']);
        $this->assertEquals('44.50', $resolved['previous_verified_price']);
        $this->assertEquals(4450, $resolved['previous_verified_centavos']);
        $this->assertEquals($inspection->id, $resolved['inspection_id']);
    }

    public function test_rejects_unsigned_or_missing_signature_inspections(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-HIST-006',
            'store_name' => 'Unsigned Inspection Mart',
            'owner_name' => 'Unsigned Owner',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose, Antique',
        ]);

        $product = SrpBulletin::create([
            'commodity_name' => 'Unsigned Item 500g',
            'baseline_price' => 100.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        // Un-signed inspection (null signature)
        TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $product->id,
            'recorded_price' => 95.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(1),
            'officer_signature' => null,
        ]);

        // Empty signature inspection
        TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $product->id,
            'recorded_price' => 95.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(2),
            'officer_signature' => '',
        ]);

        $resolved = $this->resolver->resolve($store, $product);

        $this->assertFalse($resolved['has_history']);
        $this->assertEquals('NO_VERIFIED_HISTORY', $resolved['status']);
    }
}
