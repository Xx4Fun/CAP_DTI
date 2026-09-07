<?php

namespace Tests\Unit;

use App\Support\MonitoringWeek;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

class MonitoringWeekTest extends TestCase
{
    public function test_manila_week_uses_monday_boundaries_converted_to_utc(): void
    {
        $week = MonitoringWeek::for(Carbon::parse('2026-09-13 23:59:59', 'Asia/Manila'));

        $this->assertSame('Asia/Manila', $week['timezone']);
        $this->assertSame('2026-09-06T16:00:00+00:00', $week['starts_at']->toIso8601String());
        $this->assertSame('2026-09-13T16:00:00+00:00', $week['ends_at']->toIso8601String());
    }

    public function test_following_monday_starts_a_new_week(): void
    {
        $week = MonitoringWeek::for(Carbon::parse('2026-09-14 00:00:00', 'Asia/Manila'));

        $this->assertSame('2026-09-13T16:00:00+00:00', $week['starts_at']->toIso8601String());
        $this->assertSame('2026-09-20T16:00:00+00:00', $week['ends_at']->toIso8601String());
    }
}
