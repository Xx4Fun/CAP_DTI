<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptFrameSampler;
use PHPUnit\Framework\TestCase;

class ReceiptFrameSamplerTest extends TestCase
{
    public function test_sampling_covers_the_full_thirty_second_video_without_a_six_second_frame_cap(): void
    {
        $plan = (new ReceiptFrameSampler)->plan(30.0);

        $this->assertSame(2.0, $plan['frames_per_second']);
        $this->assertSame(60, $plan['expected_frames']);
        $this->assertSame(12, $plan['window_count']);
        $this->assertSame(29.5, $plan['last_frame_seconds']);
    }

    public function test_short_video_still_produces_two_chronological_windows(): void
    {
        $plan = (new ReceiptFrameSampler)->plan(1.0);

        $this->assertSame(2, $plan['expected_frames']);
        $this->assertSame(2, $plan['window_count']);
        $this->assertSame(0.5, $plan['last_frame_seconds']);
    }
}

