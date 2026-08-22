<?php

namespace Tests\Feature;

use App\Models\ItemAlias;
use App\Models\SrpBulletin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCommodityAliasSearchTest extends TestCase
{
    use RefreshDatabase;

    public function test_identity_search_ignores_category_only_matches_and_tolerates_a_missing_character(): void
    {
        $absolute = SrpBulletin::create([
            'commodity_name' => 'Bottled Water - Distilled Water - Absolute (1L)',
            'category' => 'Bottled Water - Distilled Water',
            'unit' => '1L',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 25.00,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Bottled Water - Distilled Water - Aqua Pure (1L)',
            'category' => 'Bottled Water - Distilled Water',
            'unit' => '1L',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 24.00,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=water&match_mode=identity&limit=5')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->getJson('/api/public/commodities?query=bsolut&match_mode=identity&limit=5')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $absolute->id);
    }

    public function test_identity_search_ranks_exact_and_alias_matches_and_honors_the_limit(): void
    {
        $exact = SrpBulletin::create([
            'commodity_name' => 'Absolute',
            'category' => 'Bottled Water',
            'unit' => '500mL',
            'baseline_price' => 15.00,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);
        $aliased = SrpBulletin::create([
            'commodity_name' => 'Pure Drop',
            'category' => 'Bottled Water',
            'unit' => '1L',
            'baseline_price' => 20.00,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);
        ItemAlias::create([
            'alias_name' => 'Absolute Refill',
            'srp_bulletin_id' => $aliased->id,
        ]);

        foreach (range(1, 5) as $index) {
            SrpBulletin::create([
                'commodity_name' => "Absolute Choice {$index}",
                'category' => 'Bottled Water',
                'unit' => '1L',
                'baseline_price' => 20 + $index,
                'effective_date' => now()->subDay()->toDateString(),
                'is_active' => true,
            ]);
        }

        $response = $this->getJson('/api/public/commodities?query=absolute&match_mode=identity&limit=5');

        $response->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('data.0.id', $exact->id);
        $this->assertContains($aliased->id, collect($response->json('data'))->pluck('id')->all());
    }

    public function test_public_product_search_finds_current_product_by_shelf_label_alias(): void
    {
        $product = SrpBulletin::create([
            'commodity_name' => 'Nescafe Classic Instant Coffee 100 g',
            'category' => 'Coffee',
            'unit' => '100 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 95.00,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);
        ItemAlias::create([
            'alias_name' => 'NESC CLSSIC',
            'srp_bulletin_id' => $product->id,
        ]);

        $response = $this->getJson('/api/public/commodities?query=NESC%20CLSSIC');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.id', $product->id);
        $response->assertJsonPath('data.0.commodity_name', 'Nescafe Classic Instant Coffee 100 g');
    }
}
