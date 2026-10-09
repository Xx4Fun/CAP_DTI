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

    /**
     * Earliest instant a prior observation may carry and still count as "the previous record": the start of the
     * period preceding the one containing $at. Crossing a cadence change (an emergency declared between visits)
     * yields a daily preceding period, so a weekly-era observation falls out of window sooner. That follows the
     * period model and is intended.
     */
    public static function comparableSince(CarbonInterface|string $at): CarbonImmutable
    {
        $current = self::for(CarbonImmutable::parse($at, MonitoringWeek::TIMEZONE));

        return CarbonImmutable::instance(self::for(
            CarbonImmutable::instance($current['starts_at'])->subSecond()
        )['starts_at']);
    }

    // Records that count toward a period's routine completion: same protocol, finalized inside the window.
    public static function constrainPeriod($query, array $period)
    {
        return self::constrainProtocol($query, $period['protocol_mode'])
            ->where('finalized_at', '>=', $period['starts_at'])->where('finalized_at', '<', $period['ends_at']);
    }

    public static function constrainProtocol($query, string $mode)
    {
        return $mode === 'emergency'
            ? $query->where('protocol_mode', 'emergency')
            : $query->where(fn ($protocol) => $protocol->where('protocol_mode', 'standard')->orWhereNull('protocol_mode'));
    }

    public static function effectiveEmergency(CarbonInterface|string $at): ?RegulatoryEmergency
    {
        return RegulatoryEmergency::query()->effectiveAt($at)
            ->latest('starts_on')->latest('id')->first();
    }
}
