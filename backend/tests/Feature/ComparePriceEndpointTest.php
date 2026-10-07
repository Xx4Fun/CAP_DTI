<?php

namespace Tests\Feature;

use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ComparePriceEndpointTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;
    private SrpBulletin $rice;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-09-10 02:00:00');
        Cache::flush();

        $this->store = Store::create([
            'dti_sec_number' => 'SEC-CMP-1', 'store_name' => 'Compare Mart', 'owner_name' => 'Owner',
            'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'San Jose, Antique',
            'is_active' => true, 'is_verified' => true,
        ]);
        $this->rice = SrpBulletin::create([
            'commodity_name' => 'Rice', 'unit' => 'kg', 'commodity_key' => 'rice',
            'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function compare(float $price)
    {
        return $this->postJson('/api/public/compare-price', [
            'store_id' => $this->store->id,
            'srp_bulletin_id' => $this->rice->id,
            'displayed_price' => $price,
        ]);
    }

    private function activeEmergency(): RegulatoryEmergency
    {
        $admin = User::create([
            'name' => 'Admin', 'email' => 'cmp-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator',
        ]);

        return RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-01',
            'declaration_reference' => 'DECL-CMP', 'status' => 'active', 'active_scope_key' => 'systemwide',
            'confirmed_at' => '2026-09-01 00:00:00', 'responsible_admin_id' => $admin->id,
        ]);
    }

    public function test_normal_mode_compares_against_current_srp(): void
    {
        $this->compare(52)->assertOk()
            ->assertJsonPath('data.reference_price', 50)
            ->assertJsonPath('data.regulatory_label', 'Current SRP')
            ->assertJsonPath('data.comparison_status', 'ABOVE_SRP')
            ->assertJsonPath('data.is_above_reference', true)
            ->assertJsonPath('data.difference_pesos', 2)
            ->assertJsonPath('data.previous_verified_price', null);
    }

    public function test_emergency_with_price_record_compares_against_the_frozen_price(): void
    {
        $emergency = $this->activeEmergency();
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice',
            'price_type' => 'PRICE_FREEZE', 'authoritative_price' => 45, 'effective_from' => '2026-09-01',
            'location' => 'San Jose de Buenavista, Antique', 'declaration_reference' => 'DECL-CMP',
            'source_reference' => 'FREEZE-SOURCE', 'created_by' => $emergency->responsible_admin_id,
        ]);

        $this->compare(48)->assertOk()
            ->assertJsonPath('data.reference_price', 45)
            ->assertJsonPath('data.baseline_price', 50)
            ->assertJsonPath('data.regulatory_label', 'Official frozen price reference')
            ->assertJsonPath('data.regulatory_mode', 'EMERGENCY_PRICE_FREEZE')
            ->assertJsonPath('data.comparison_status', 'ABOVE_SRP')
            ->assertJsonPath('data.difference_pesos', 3);
    }

    public function test_emergency_without_price_record_fails_closed(): void
    {
        $this->activeEmergency();

        $this->compare(48)->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status', 'REFERENCE_UNAVAILABLE');
    }

    public function test_legacy_calamity_toggle_never_relabels_the_srp(): void
    {
        Cache::put('state_of_calamity', true);

        $this->compare(48)->assertOk()->assertJsonPath('data.reference_price', 50);
    }

    public function test_previous_price_only_uses_verified_signed_inspections(): void
    {
        TemporalInspection::create([
            'store_id' => $this->store->id, 'srp_id' => $this->rice->id, 'recorded_price' => 49,
            'is_flagged' => false, 'inspection_timestamp' => '2026-09-01 01:00:00',
            'officer_signature' => 'signed', 'validation_status' => 'verified',
        ]);
        TemporalInspection::create([
            'store_id' => $this->store->id, 'srp_id' => $this->rice->id, 'recorded_price' => 70,
            'is_flagged' => false, 'inspection_timestamp' => '2026-09-08 01:00:00',
            'officer_signature' => 'signed',
        ]);

        $this->compare(50)->assertOk()
            ->assertJsonPath('data.previous_verified_price', 49)
            ->assertJsonPath('data.previous_recorded_date', '01 Sep 2026');
    }

    public function test_rejects_exponent_precision_and_oversized_prices(): void
    {
        foreach (['1e3', '12.345', '99999999999999999999'] as $price) {
            $this->postJson('/api/public/compare-price', [
                'store_id' => $this->store->id,
                'srp_bulletin_id' => $this->rice->id,
                'displayed_price' => $price,
            ])->assertStatus(422)->assertJsonValidationErrors('displayed_price');
        }
    }

    public function test_stale_bulletin_id_uses_the_currently_effective_revision_throughout(): void
    {
        $revision = SrpBulletin::create([
            'commodity_name' => 'Rice', 'unit' => 'kg', 'commodity_key' => 'rice',
            'baseline_price' => 55, 'effective_date' => '2026-09-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026-B',
        ]);
        TemporalInspection::create([
            'store_id' => $this->store->id, 'srp_id' => $revision->id, 'recorded_price' => 54,
            'is_flagged' => false, 'inspection_timestamp' => '2026-09-05 01:00:00',
            'officer_signature' => 'signed', 'validation_status' => 'verified',
        ]);

        $this->compare(55)->assertOk()
            ->assertJsonPath('data.product.id', $revision->id)
            ->assertJsonPath('data.baseline_price', 55)
            ->assertJsonPath('data.reference_price', 55)
            ->assertJsonPath('data.comparison_status', 'MATCHES_SRP')
            ->assertJsonPath('data.previous_verified_price', 54);
    }
}
