<?php

namespace Tests\Feature;

use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\Ocr\ShelfTagComparisonService;
use App\Support\MonitoringPeriod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class PriceFreezeSynchronizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_draft_future_unconfirmed_and_cancelled_declarations_do_not_activate_status(): void
    {
        Carbon::setTestNow('2026-10-07 02:00:00');
        try {
            $admin = User::factory()->create(['role' => 'dti_evaluator']);
            $this->actingAs($admin);
            Cache::put('state_of_calamity', true);
            $declaration = RegulatoryEmergency::create(['location' => 'Systemwide', 'starts_on' => '2026-10-07', 'declaration_reference' => 'TRANSITIONS', 'status' => 'draft', 'responsible_admin_id' => $admin->id]);
            foreach ([
                ['status' => 'draft', 'confirmed_at' => null, 'starts_on' => '2026-10-07'],
                ['status' => 'active', 'confirmed_at' => null, 'starts_on' => '2026-10-07'],
                ['status' => 'active', 'confirmed_at' => '2026-10-06 00:00:00', 'starts_on' => '2026-10-08'],
                ['status' => 'cancelled', 'confirmed_at' => '2026-10-06 00:00:00', 'starts_on' => '2026-10-07'],
            ] as $state) {
                $declaration->update($state);
                $this->getJson('/api/public/config')->assertOk()->assertJsonPath('data.state_of_calamity', false);
                $this->getJson('/api/calamity')->assertOk()->assertJsonPath('state_of_calamity', false);
                $this->getJson('/api/admin/overview')->assertOk()->assertJsonPath('data.active_emergencies', 0);
            }
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_formal_freeze_status_and_prices_agree_and_expire_after_the_inclusive_manila_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-07 23:59:59', 'Asia/Manila'));
        try {
            $admin = User::factory()->create(['role' => 'dti_evaluator']);
            $store = Store::create(['dti_sec_number' => 'PF-SYNC', 'store_name' => 'Test Mart', 'owner_name' => 'Owner', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true, 'is_verified' => true]);
            $product = SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true, 'price_freeze_applicable' => true]);
            $emergency = RegulatoryEmergency::create(['location' => 'Systemwide', 'starts_on' => '2026-10-07', 'ends_on' => '2026-10-07', 'declaration_reference' => 'PF-SYNC', 'status' => 'active', 'confirmed_at' => '2026-10-06 00:00:00', 'responsible_admin_id' => $admin->id]);
            Cache::put('state_of_calamity', false);
            $this->getJson('/api/public/config')->assertOk()->assertJsonPath('data.state_of_calamity', true);
            $this->actingAs($admin)->getJson('/api/admin/overview')->assertOk()->assertJsonPath('data.active_emergencies', 1);
            $this->getJson('/api/public/commodities')->assertOk()->assertJsonPath('data.0.reference.status', 'unavailable');
            RegulatoryPriceRecord::create(['regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC', 'authoritative_price' => 45, 'effective_from' => '2026-10-07', 'effective_until' => '2026-10-07', 'location' => 'Systemwide', 'declaration_reference' => 'PF-SYNC', 'source_reference' => 'Confirmed APC', 'created_by' => $admin->id]);
            $this->getJson('/api/public/commodities')->assertOk()->assertJsonPath('data.0.reference.value', 45);
            $this->postJson('/api/public/compare-price', ['store_id' => $store->id, 'srp_bulletin_id' => $product->id, 'displayed_price' => 48])->assertOk()->assertJsonPath('data.reference_price', 45);
            $tag = app(ShelfTagComparisonService::class)->compare($store, $product, '48.00', 'OCR', 'USER_CONFIRMED');
            $this->assertSame('45.00', $tag['reference_price']);
            $this->assertSame('EMERGENCY_PRICE_FREEZE', $tag['regulatory_mode']);
            $this->assertSame('daily', MonitoringPeriod::current()['cadence']);
            Carbon::setTestNow(Carbon::parse('2026-10-08 00:00:00', 'Asia/Manila'));
            Cache::put('state_of_calamity', true);
            $this->getJson('/api/public/config')->assertOk()->assertJsonPath('data.state_of_calamity', false);
            $this->getJson('/api/admin/overview')->assertOk()->assertJsonPath('data.active_emergencies', 0);
            $this->assertSame('weekly', MonitoringPeriod::current()['cadence']);
        } finally {
            Carbon::setTestNow();
        }
    }
}
