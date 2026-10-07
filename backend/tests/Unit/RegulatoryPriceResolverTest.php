<?php

namespace Tests\Unit;

use App\Models\SrpBulletin;
use App\Services\Ocr\RegulatoryPriceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class RegulatoryPriceResolverTest extends TestCase
{
    use RefreshDatabase;

    protected RegulatoryPriceResolver $resolver;

    protected function setUp(): void
    {
        parent::setUp();
        $this->resolver = new RegulatoryPriceResolver();
    }

    public function test_normal_srp_resolution_returns_current_srp_label_and_exact_baseline_price(): void
    {
        Cache::put('state_of_calamity', false);

        $product = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $resolved = $this->resolver->resolve($product);

        $this::assertEquals('REGULATORY_PRICE_FOUND', $resolved['status']);
        $this::assertEquals('Current SRP', $resolved['label']);
        $this::assertEquals('21.50', $resolved['value_string']);
        $this::assertEquals(2150, $resolved['value_centavos']);
        $this::assertEquals('NORMAL_SRP', $resolved['regulatory_mode']);
        $this::assertEquals('2026-05-11', $resolved['effective_date']);
    }

    public function test_emergency_mode_returns_regulatory_price_unavailable_and_does_not_label_srp_baseline_as_frozen(): void
    {
        $admin = \App\Models\User::factory()->create(['role' => 'dti_evaluator']);
        \App\Models\RegulatoryEmergency::create([
            'location' => 'Systemwide', 'starts_on' => now('Asia/Manila')->toDateString(),
            'declaration_reference' => 'RESOLVER-TEST', 'status' => 'active',
            'confirmed_at' => now()->subMinute(), 'responsible_admin_id' => $admin->id,
        ]);

        $product = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
            'price_freeze_applicable' => true,
        ]);

        $resolved = $this->resolver->resolve($product);

        $this::assertEquals('REGULATORY_PRICE_UNAVAILABLE', $resolved['status']);
        $this::assertNull($resolved['label']);
        $this::assertNull($resolved['value_string']);
        $this::assertNull($resolved['value_centavos']);
        $this::assertEquals('EMERGENCY_PRICE_FREEZE', $resolved['regulatory_mode']);
        $this::assertEquals(
            'No authoritative reference price is on record for this commodity.',
            $resolved['message']
        );

        // STRICT REQUIREMENT VERIFICATION:
        // Must NEVER reuse normal SRP baseline_price and relabel it as "Frozen prevailing price" or "Current APC ceiling".
        $this::assertNotEquals('Frozen prevailing price', $resolved['label']);
        $this::assertNotEquals('Current APC ceiling', $resolved['label']);
        $this::assertNotEquals('21.50', $resolved['value_string']);
    }

    public function test_legacy_cache_flag_does_not_override_formal_status(): void
    {
        Cache::put('state_of_calamity', false);

        $product = SrpBulletin::create([
            'commodity_name' => 'Mega Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        Cache::put('state_of_calamity', true);
        $resolved = $this->resolver->resolve($product);

        $this::assertEquals('REGULATORY_PRICE_FOUND', $resolved['status']);
        $this::assertEquals('NORMAL_SRP', $resolved['regulatory_mode']);
        $this::assertEquals('21.00', $resolved['value_string']);
    }

    public function test_null_product_returns_regulatory_price_unavailable(): void
    {
        Cache::put('state_of_calamity', false);

        $resolved = $this->resolver->resolve(null);

        $this::assertEquals('REGULATORY_PRICE_UNAVAILABLE', $resolved['status']);
        $this::assertNull($resolved['label']);
        $this::assertNull($resolved['value_string']);
        $this::assertEquals('NORMAL_SRP', $resolved['regulatory_mode']);
    }
}
