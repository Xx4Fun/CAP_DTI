<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PublicCommodityHistoryTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_it_returns_effective_versions_for_a_keyed_commodity(): void
    {
        Carbon::setTestNow('2026-08-22 10:00:00');

        $previous = $this->bulletin([
            'baseline_price' => 23.00,
            'effective_date' => '2026-06-01',
            'source_reference' => 'Bulletin June',
        ]);
        $current = $this->bulletin([
            'baseline_price' => 25.00,
            'effective_date' => '2026-08-01',
            'source_reference' => 'Bulletin August',
        ]);

        $this->bulletin(['baseline_price' => 26.00, 'effective_date' => '2026-09-01']);
        $this->bulletin(['baseline_price' => 21.00, 'effective_date' => '2026-04-01', 'is_active' => false]);
        $this->bulletin(['baseline_price' => 99.00, 'effective_date' => '2026-07-01', 'commodity_key' => 'other-item']);

        $response = $this->getJson("/api/public/commodities/{$current->id}/history");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.commodity_id', $current->id)
            ->assertJsonCount(2, 'data.history')
            ->assertJsonPath('data.history.0.id', $current->id)
            ->assertJsonPath('data.history.0.baseline_price', 25)
            ->assertJsonPath('data.history.0.effective_date', '2026-08-01')
            ->assertJsonPath('data.history.1.id', $previous->id)
            ->assertJsonPath('data.history.1.baseline_price', 23);
    }

    public function test_it_falls_back_to_exact_name_and_unit_for_legacy_records(): void
    {
        Carbon::setTestNow('2026-08-22 10:00:00');

        $this->bulletin([
            'commodity_name' => 'Legacy Coffee',
            'unit' => '100 g',
            'commodity_key' => null,
            'baseline_price' => 50.00,
            'effective_date' => '2026-05-01',
        ]);
        $current = $this->bulletin([
            'commodity_name' => 'Legacy Coffee',
            'unit' => '100 g',
            'commodity_key' => null,
            'baseline_price' => 55.00,
            'effective_date' => '2026-08-01',
        ]);
        $this->bulletin([
            'commodity_name' => 'Legacy Coffee',
            'unit' => '200 g',
            'commodity_key' => null,
            'baseline_price' => 90.00,
            'effective_date' => '2026-07-01',
        ]);

        $this->getJson("/api/public/commodities/{$current->id}/history")
            ->assertOk()
            ->assertJsonCount(2, 'data.history')
            ->assertJsonPath('data.history.0.baseline_price', 55)
            ->assertJsonPath('data.history.1.baseline_price', 50);
    }

    public function test_it_returns_one_version_and_rejects_an_unknown_commodity(): void
    {
        Carbon::setTestNow('2026-08-22 10:00:00');
        $current = $this->bulletin();

        $this->getJson("/api/public/commodities/{$current->id}/history")
            ->assertOk()
            ->assertJsonCount(1, 'data.history');

        $this->getJson('/api/public/commodities/999999/history')->assertNotFound();
    }

    private function bulletin(array $overrides = []): SrpBulletin
    {
        return SrpBulletin::create(array_merge([
            'commodity_name' => 'Absolute Distilled Water',
            'category' => 'Bottled Water',
            'unit' => '1 L',
            'commodity_key' => 'absolute-distilled-water-1l',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 25.00,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI SRP Bulletin',
            'is_active' => true,
        ], $overrides));
    }
}
