<?php

namespace App\Support;

use App\Models\RegulatoryEmergency;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

final class MonitoringPeriod
{
    public static function for(CarbonInterface $at): array
    {
        $local = CarbonImmutable::instance($at)->setTimezone(MonitoringWeek::TIMEZONE);
        $emergency = self::effectiveEmergency($local);

        if (! $emergency) {
            return [
                ...MonitoringWeek::for($local),
                'cadence' => 'weekly',
                'protocol_mode' => 'standard',
                'declaration_reference' => null,
            ];
        }

        return [
            'timezone' => MonitoringWeek::TIMEZONE,
            'starts_at' => $local->startOfDay()->utc(),
            'ends_at' => $local->startOfDay()->addDay()->utc(),
            'cadence' => 'daily',
            'protocol_mode' => 'emergency',
            'declaration_reference' => $emergency->declaration_reference,
        ];
    }

    public static function current(): array
    {
        return self::for(now(MonitoringWeek::TIMEZONE));
    }

    public static function constrainProtocol($query, string $mode)
    {
        return $mode === 'emergency'
            ? $query->where('protocol_mode', 'emergency')
            : $query->where(fn ($protocol) => $protocol->where('protocol_mode', 'standard')->orWhereNull('protocol_mode'));
    }

    public static function effectiveEmergency(CarbonInterface|string $at): ?RegulatoryEmergency
    {
        $instant = CarbonImmutable::parse($at, MonitoringWeek::TIMEZONE);
        $date = $instant->setTimezone(MonitoringWeek::TIMEZONE)->toDateString();

        return RegulatoryEmergency::query()
            ->whereIn('status', ['active', 'ended'])
            ->whereNotNull('confirmed_at')
            ->where('confirmed_at', '<=', $instant->utc())
            ->whereDate('starts_on', '<=', $date)
            ->where(fn ($query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $date))
            ->latest('starts_on')->latest('id')->first();
    }
}
