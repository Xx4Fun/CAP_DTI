<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PublicCommodityStorePricesTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_it_returns_latest_verified_store_prices_with_temporal_delta(): void
    {
        Carbon::setTestNow('2026-11-20 10:00:00');

        $commodity = SrpBulletin::create([
            'commodity_name' => '555 Sardines (155g)',
            'category' => 'Canned Fish',
            'unit' => '155g',
            'commodity_key' => 'sardines-555-155g',
            'baseline_price' => 24.50,
            'effective_date' => '2026-08-01',
            'is_active' => true,
        ]);

        $store1 = Store::create([
            'store_name' => 'Puregold San Jose',
            'address' => 'San Angel, San Jose',
            'latitude' => 10.74,
            'longitude' => 121.94,
            'is_active' => true,
            'is_verified' => true,
        ]);

        $store2 = Store::create([
            'store_name' => 'CPT Mart',
            'address' => 'Bancal, San Jose',
            'latitude' => 10.75,
            'longitude' => 121.95,
            'is_active' => true,
            'is_verified' => true,
        ]);

        // Prior inspection for Puregold
        TemporalInspection::create([
            'store_id' => $store1->id,
            'srp_id' => $commodity->id,
            'recorded_price' => 24.50,
            'is_flagged' => false,
            'inspection_timestamp' => '2026-11-05 09:00:00',
            'officer_signature' => 'sig-puregold-prev.png',
            'validation_status' => 'verified',
        ]);

        // Latest inspection for Puregold (unchanged)
        TemporalInspection::create([
            'store_id' => $store1->id,
            'srp_id' => $commodity->id,
            'recorded_price' => 24.50,
            'is_flagged' => false,
            'inspection_timestamp' => '2026-11-18 10:00:00',
            'officer_signature' => 'sig-puregold-latest.png',
            'validation_status' => 'verified',
        ]);

        // Prior inspection for CPT Mart
        TemporalInspection::create([
            'store_id' => $store2->id,
            'srp_id' => $commodity->id,
            'recorded_price' => 24.00,
            'is_flagged' => false,
            'inspection_timestamp' => '2026-10-20 09:00:00',
            'officer_signature' => 'sig-cpt-prev.png',
            'validation_status' => 'verified',
        ]);

        // Latest inspection for CPT Mart (+2.00 increase)
        TemporalInspection::create([
            'store_id' => $store2->id,
            'srp_id' => $commodity->id,
            'recorded_price' => 26.00,
            'is_flagged' => true,
            'inspection_timestamp' => '2026-11-17 11:00:00',
            'officer_signature' => 'sig-cpt-latest.png',
            'validation_status' => 'verified',
        ]);

        $response = $this->getJson("/api/public/commodities/{$commodity->id}/store-prices");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.commodity_id', $commodity->id)
            ->assertJsonCount(2, 'data.stores');

        // Puregold: 24.50, unchanged
        $puregold = collect($response->json('data.stores'))->firstWhere('store_id', $store1->id);
        $this->assertEquals(24.50, $puregold['recorded_price']);
        $this->assertEquals(24.50, $puregold['previous_price']);
        $this->assertEquals(0.00, $puregold['price_change']);
        $this->assertEquals('unchanged', $puregold['change_direction']);
        $this->assertEquals('at_srp', $puregold['compliance_status']);

        // CPT Mart: 26.00, increased
        $cpt = collect($response->json('data.stores'))->firstWhere('store_id', $store2->id);
        $this->assertEquals(26.00, $cpt['recorded_price']);
        $this->assertEquals(24.00, $cpt['previous_price']);
        $this->assertEquals(2.00, $cpt['price_change']);
        $this->assertEquals('increase', $cpt['change_direction']);
        $this->assertEquals('above_srp', $cpt['compliance_status']);
    }

    public function test_it_excludes_unverified_or_unsigned_inspections(): void
    {
        $commodity = SrpBulletin::create([
            'commodity_name' => 'Rice 1kg',
            'unit' => 'kg',
            'baseline_price' => 50.00,
            'effective_date' => '2026-08-01',
            'is_active' => true,
        ]);

        $store = Store::create([
            'store_name' => 'Draft Store',
            'address' => 'San Jose',
            'latitude' => 10.74,
            'longitude' => 121.94,
            'is_active' => true,
        ]);

        // Unverified inspection
        TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $commodity->id,
            'recorded_price' => 55.00,
            'is_flagged' => false,
            'inspection_timestamp' => '2026-11-18 10:00:00',
            'officer_signature' => null,
            'validation_status' => 'pending',
        ]);

        $response = $this->getJson("/api/public/commodities/{$commodity->id}/store-prices");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(0, 'data.stores');
    }
}
