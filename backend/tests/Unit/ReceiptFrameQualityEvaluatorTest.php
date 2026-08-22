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

    public function test_selects_the_best_frame_from_each_chronological_window_instead_of_only_global_best_frames(): void
    {
        $evaluated = [
            ['path' => 'frame-000.jpg', 'source_sequence' => 0, 'quality' => ['score' => 2.0]],
            ['path' => 'frame-001.jpg', 'source_sequence' => 1, 'quality' => ['score' => 9.0]],
            ['path' => 'frame-002.jpg', 'source_sequence' => 2, 'quality' => ['score' => 20.0]],
            ['path' => 'frame-003.jpg', 'source_sequence' => 3, 'quality' => ['score' => 19.0]],
        ];

        $selected = (new ReceiptFrameQualityEvaluator)->selectEvaluated($evaluated, 2);

        $this->assertSame(['frame-001.jpg', 'frame-002.jpg'], array_column($selected, 'path'));
        $this->assertSame([1, 2], array_column($selected, 'source_sequence'));
    }
}
