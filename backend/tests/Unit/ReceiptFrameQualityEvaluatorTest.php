<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptFrameQualityEvaluator;
use PHPUnit\Framework\TestCase;

class ReceiptFrameQualityEvaluatorTest extends TestCase
{
    public function test_prefers_exposed_high_detail_frames_over_flat_or_dark_frames(): void
    {
        $evaluator = new ReceiptFrameQualityEvaluator;
        $sharp = $evaluator->scoreMatrix([
            [20, 235, 20, 235],
            [235, 20, 235, 20],
            [20, 235, 20, 235],
            [235, 20, 235, 20],
        ]);
        $flat = $evaluator->scoreMatrix(array_fill(0, 4, array_fill(0, 4, 128)));
        $dark = $evaluator->scoreMatrix(array_fill(0, 4, array_fill(0, 4, 5)));

        $this->assertTrue($sharp['acceptable']);
        $this->assertFalse($flat['acceptable']);
        $this->assertFalse($dark['acceptable']);
        $this->assertGreaterThan($flat['score'], $sharp['score']);
    }
}
