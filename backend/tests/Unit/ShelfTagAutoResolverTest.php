<?php

namespace Tests\Unit;

use App\Services\Ocr\ShelfTagAutoResolver;
use PHPUnit\Framework\TestCase;

class ShelfTagAutoResolverTest extends TestCase
{
    public function test_reliable_price_and_clear_strong_candidate_auto_resolve(): void
    {
        $resolver = new ShelfTagAutoResolver();

        $result = $resolver->decide([
            ['id' => 10, 'match_score' => 95, 'match_level' => 'STRONG', 'match_basis' => 'NAME_ABBREVIATION'],
            ['id' => 11, 'match_score' => 70, 'match_level' => 'POSSIBLE', 'match_basis' => 'TOKEN_SIMILARITY'],
        ], '23.50', 92);

        $this->assertTrue($result['auto_resolved']);
        $this->assertSame(10, $result['product_id']);
        $this->assertNull($result['recovery_reason']);
    }

    public function test_close_runner_up_stays_in_inline_product_recovery(): void
    {
        $resolver = new ShelfTagAutoResolver();

        $result = $resolver->decide([
            ['id' => 10, 'match_score' => 95, 'match_level' => 'STRONG', 'match_basis' => 'NAME_ABBREVIATION'],
            ['id' => 11, 'match_score' => 82, 'match_level' => 'STRONG', 'match_basis' => 'NAME_ABBREVIATION'],
        ], '23.50', 92);

        $this->assertFalse($result['auto_resolved']);
        $this->assertSame('AMBIGUOUS_PRODUCT', $result['recovery_reason']);
    }

    public function test_exact_text_match_does_not_override_a_close_exact_runner_up(): void
    {
        $resolver = new ShelfTagAutoResolver();

        $result = $resolver->decide([
            ['id' => 10, 'match_score' => 170, 'match_level' => 'STRONG', 'match_basis' => 'NAME_EXACT'],
            ['id' => 11, 'match_score' => 165, 'match_level' => 'STRONG', 'match_basis' => 'ALIAS_EXACT'],
        ], '23.50', 92);

        $this->assertFalse($result['auto_resolved']);
        $this->assertSame('AMBIGUOUS_PRODUCT', $result['recovery_reason']);
    }

    public function test_low_confidence_price_is_preserved_but_not_auto_resolved(): void
    {
        $resolver = new ShelfTagAutoResolver();

        $result = $resolver->decide([
            ['id' => 10, 'match_score' => 110, 'match_level' => 'STRONG', 'match_basis' => 'ALIAS_EXACT'],
        ], '23.50', 72);

        $this->assertFalse($result['auto_resolved']);
        $this->assertSame('PRICE_UNCERTAIN', $result['recovery_reason']);
        $this->assertSame('23.50', $result['detected_price_string']);
    }
}
