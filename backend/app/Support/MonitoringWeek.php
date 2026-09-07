<?php

namespace App\Support;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

final class MonitoringWeek
{
    public const TIMEZONE = 'Asia/Manila';

    public static function for(CarbonInterface $now): array
    {
        $start = CarbonImmutable::instance($now)->setTimezone(self::TIMEZONE)->startOfWeek(CarbonInterface::MONDAY);

        return [
            'timezone' => self::TIMEZONE,
            'starts_at' => $start->utc(),
            'ends_at' => $start->addWeek()->utc(),
        ];
    }

    public static function current(): array
    {
        return self::for(now(self::TIMEZONE));
    }
}
