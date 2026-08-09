<?php

namespace Tests\Feature;

use App\Models\ItemAlias;
use App\Models\SrpBulletin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicCommodityAliasSearchTest extends TestCase
{
    use RefreshDatabase;

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
