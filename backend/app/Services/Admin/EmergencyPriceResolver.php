<?php

namespace App\Services\Admin;

use App\Models\RegulatoryPriceRecord;

class EmergencyPriceResolver
{
    public function resolve(string $commodityKey, string $location, string|\DateTimeInterface $observedAt): array
    {
        $record = RegulatoryPriceRecord::query()
            ->whereHas('emergency', fn ($query) => $query
                ->whereIn('status', ['active', 'ended'])
                ->whereDate('starts_on', '<=', $observedAt)
                ->where(fn ($dates) => $dates->whereNull('ends_on')->orWhereDate('ends_on', '>=', $observedAt))
            )
            ->where('commodity_key', $commodityKey)
            ->whereDate('effective_from', '<=', $observedAt)
            ->where(fn ($q) => $q->whereNull('effective_until')->orWhereDate('effective_until', '>=', $observedAt))
            ->latest('effective_from')->first();
        if (!$record) return ['status' => 'REGULATORY_PRICE_UNAVAILABLE', 'label' => null, 'value' => null];
        return [
            'status' => 'REGULATORY_PRICE_FOUND',
            'label' => ['APC' => 'APC ceiling', 'SRP' => 'SRP held as Price Freeze ceiling'][$record->price_type] ?? 'Frozen prevailing price',
            'value' => $record->authoritative_price, 'source_reference' => $record->source_reference,
        ];
    }
}
