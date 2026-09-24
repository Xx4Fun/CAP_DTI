<?php

namespace Tests\Unit;

use App\Models\ItemAlias;
use App\Models\SrpBulletin;
use App\Services\Ocr\ShelfTagProductMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShelfTagProductMatcherTest extends TestCase
{
    use RefreshDatabase;

    protected ShelfTagProductMatcher $matcher;

    protected function setUp(): void
    {
        parent::setUp();
        $this->matcher = new ShelfTagProductMatcher();

        // Seed test SRP Bulletin products
        SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines with Chili 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 22.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        SrpBulletin::create([
            'commodity_name' => 'Mega Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);
    }

    public function test_exact_query_match_returns_strong_match_level_without_baseline_price(): void
    {
        $tokens = ['Saba', 'Philippines', 'Sardines', 'in', 'Tomato', 'Sauce'];
        $packageSize = '155 g';

        $candidates = $this->matcher->match($tokens, $packageSize);

        $this->assertNotEmpty($candidates);

        $topCandidate = $candidates[0];

        $this->assertEquals('Saba Philippines Sardines in Tomato Sauce 155 g', $topCandidate['commodity_name']);
        $this->assertEquals('STRONG', $topCandidate['match_level']);
        $this->assertGreaterThanOrEqual(70, $topCandidate['match_score']);

        // CRITICAL SECRECY REQUIREMENT:
        // Must NOT contain baseline_price or any pricing keys
        $this->assertArrayNotHasKey('baseline_price', $topCandidate);
        $this->assertArrayNotHasKey('price', $topCandidate);
        $this->assertArrayNotHasKey('srp', $topCandidate);

        // Verify exact expected keys. commodity_key is an identifier, not pricing: the DTI review
        // panel resolves a regulatory reference by exact key, so a candidate the evaluator picks
        // has to carry one.
        $expectedKeys = ['id', 'commodity_key', 'commodity_name', 'brand', 'category', 'package_size', 'unit', 'match_score', 'match_level', 'match_basis'];
        $this->assertEqualsCanonicalizing($expectedKeys, array_keys($topCandidate));
    }

    public function test_package_size_conflict_is_penalized_or_uncertain(): void
    {
        $tokens = ['Saba', 'Philippines', 'Sardines', 'in', 'Tomato', 'Sauce'];
        $packageSize = '420 g'; // Conflicting size (420g vs 155g)

        $candidates = $this->matcher->match($tokens, $packageSize);

        // If candidates are returned, none should have match_level 'STRONG'
        foreach ($candidates as $candidate) {
            $this->assertNotEquals('STRONG', $candidate['match_level']);

            if ($candidate['commodity_name'] === 'Saba Philippines Sardines in Tomato Sauce 155 g') {
                $this->assertEquals('SIZE_UNCERTAIN', $candidate['match_level']);
            }
        }
    }

    public function test_random_text_query_returns_empty_array(): void
    {
        $tokens = ['xyz999', 'random', 'nonsense', 'unrelated'];
        $packageSize = '999 kg';

        $candidates = $this->matcher->match($tokens, $packageSize);

        $this->assertIsArray($candidates);
        $this->assertEmpty($candidates);
    }

    public function test_variant_differentiation_tomato_sauce_vs_chili(): void
    {
        $chiliTokens = ['Saba', 'Philippines', 'Sardines', 'with', 'Chili'];
        $packageSize = '155 g';

        $candidates = $this->matcher->match($chiliTokens, $packageSize);

        $this->assertNotEmpty($candidates);

        // Top candidate must be the Chili variant
        $topCandidate = $candidates[0];
        $this->assertEquals('Saba Philippines Sardines with Chili 155 g', $topCandidate['commodity_name']);
        $this->assertEquals('STRONG', $topCandidate['match_level']);

        // Check if Tomato Sauce candidate score is lower
        foreach ($candidates as $candidate) {
            if ($candidate['commodity_name'] === 'Saba Philippines Sardines in Tomato Sauce 155 g') {
                $this->assertLessThan($topCandidate['match_score'], $candidate['match_score']);
            }
        }
    }

    public function test_candidates_carry_the_commodity_key_used_to_resolve_a_regulatory_reference(): void
    {
        $keyed = SrpBulletin::create([
            'commodity_name' => 'Alaska Evaporated Milk 370 mL',
            'category' => 'Milk', 'unit' => '370 mL', 'regulatory_classification' => 'BASIC_NECESSITY',
            'commodity_key' => 'alaska-evaporated-milk-370ml',
            'baseline_price' => 42.00, 'effective_date' => '2026-05-11', 'is_active' => true,
        ]);

        $candidates = $this->matcher->match(['ALSK', 'EVAP', 'MLK'], '370 mL');

        $this->assertSame($keyed->id, $candidates[0]['id']);
        $this->assertSame('alaska-evaporated-milk-370ml', $candidates[0]['commodity_key']);
    }

    public function test_a_bulletin_without_a_commodity_key_yields_a_null_key_rather_than_failing(): void
    {
        // commodity_key is nullable, so an active catalogue row may legitimately have none. The
        // matcher must still return it; callers that resolve by key decide it is unusable.
        SrpBulletin::create([
            'commodity_name' => 'Alaska Evaporated Milk 370 mL',
            'category' => 'Milk', 'unit' => '370 mL', 'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 42.00, 'effective_date' => '2026-05-11', 'is_active' => true,
        ]);

        $candidates = $this->matcher->match(['ALSK', 'EVAP', 'MLK'], '370 mL');

        $this->assertNotEmpty($candidates);
        $this->assertArrayHasKey('commodity_key', $candidates[0]);
        $this->assertNull($candidates[0]['commodity_key']);
    }

    public function test_exact_catalog_alias_resolves_abbreviated_shelf_label_as_strong_match(): void
    {
        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Nescafe Classic Instant Coffee 100 g',
            'category' => 'Coffee',
            'unit' => '100 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 95.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        ItemAlias::create([
            'alias_name' => 'NESC CLSSIC',
            'srp_bulletin_id' => $bulletin->id,
        ]);

        $candidates = $this->matcher->match(['NESC', 'CLSSIC'], '100 g');

        $this->assertNotEmpty($candidates);
        $this->assertSame($bulletin->id, $candidates[0]['id']);
        $this->assertSame('STRONG', $candidates[0]['match_level']);
        $this->assertSame('ALIAS_EXACT', $candidates[0]['match_basis']);
        $this->assertGreaterThanOrEqual(80, $candidates[0]['match_score']);
    }

    public function test_abbreviated_ocr_tokens_match_official_name_without_a_saved_alias(): void
    {
        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Alaska Evaporated Milk 370 mL',
            'category' => 'Milk',
            'unit' => '370 mL',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 42.00,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $candidates = $this->matcher->match(['ALSK', 'EVAP', 'MLK'], '370 mL');

        $this->assertNotEmpty($candidates);
        $this->assertSame($bulletin->id, $candidates[0]['id']);
        $this->assertSame('STRONG', $candidates[0]['match_level']);
        $this->assertSame('NAME_ABBREVIATION', $candidates[0]['match_basis']);
        $this->assertGreaterThanOrEqual(80, $candidates[0]['match_score']);
    }
}
