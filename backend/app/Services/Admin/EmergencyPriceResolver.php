<?php

namespace App\Services\Admin;

use App\Models\RegulatoryPriceRecord;
use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;

class EmergencyPriceResolver
{
    public function resolve(string $commodityKey, string $location, string|\DateTimeInterface $observedAt): array
    {
        $instant = CarbonImmutable::parse($observedAt, MonitoringWeek::TIMEZONE);
        $date = $instant->setTimezone(MonitoringWeek::TIMEZONE)->toDateString();
        $record = RegulatoryPriceRecord::query()
            ->whereHas('emergency', fn ($query) => $query->effectiveAt($instant))
            ->where('commodity_key', $commodityKey)
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_until')->orWhereDate('effective_until', '>=', $date))
            ->latest('effective_from')->first();
        if (!$record) return ['status' => 'REGULATORY_PRICE_UNAVAILABLE', 'label' => null, 'value' => null];
        return [
            'status' => 'REGULATORY_PRICE_FOUND',
            'label' => ['APC' => 'APC ceiling', 'SRP' => 'SRP held as Price Freeze ceiling'][$record->price_type] ?? 'Frozen prevailing price',
            'value' => $record->authoritative_price, 'source_reference' => $record->source_reference,
        ];
    }
}
