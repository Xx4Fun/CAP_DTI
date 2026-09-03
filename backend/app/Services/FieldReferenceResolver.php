<?php

namespace App\Services;

use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;

class FieldReferenceResolver
{
    public function resolve(SrpBulletin $submittedBulletin, string|\DateTimeInterface $observedAt): array
    {
        $emergency = RegulatoryEmergency::query()
            ->whereIn('status', ['active', 'ended'])
            ->whereDate('starts_on', '<=', $observedAt)
            ->where(fn ($query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $observedAt))
            ->latest('starts_on')->latest('id')->first();

        if ($emergency) {
            $record = RegulatoryPriceRecord::query()
                ->where('regulatory_emergency_id', $emergency->id)
                ->where('commodity_key', $submittedBulletin->commodity_key)
                ->whereDate('effective_from', '<=', $observedAt)
                ->where(fn ($query) => $query->whereNull('effective_until')->orWhereDate('effective_until', '>=', $observedAt))
                ->latest('effective_from')->latest('id')->first();

            return $record ? [
                'status' => 'available', 'type' => 'emergency_ceiling',
                'label' => $record->price_type === 'APC' ? 'APC ceiling (provisional)' : 'Frozen price (provisional)',
                'value' => (float) $record->authoritative_price,
                'source' => $record->source_reference,
                'effective_date' => $record->effective_from->toDateString(),
            ] : [
                'status' => 'unavailable', 'type' => 'emergency_ceiling',
                'label' => 'Emergency reference unavailable', 'value' => null,
                'source' => $emergency->declaration_reference, 'effective_date' => null,
            ];
        }

        $bulletin = $submittedBulletin->commodity_key
            ? SrpBulletin::query()->where('commodity_key', $submittedBulletin->commodity_key)
                ->where('is_active', true)->whereDate('effective_date', '<=', $observedAt)
                ->latest('effective_date')->latest('id')->first()
            : $submittedBulletin;

        return $bulletin && $bulletin->baseline_price > 0 && $bulletin->effective_date ? [
            'status' => 'available', 'type' => 'standard_srp',
            'label' => 'SRP baseline (provisional)', 'value' => (float) $bulletin->baseline_price,
            'source' => $bulletin->source_reference, 'effective_date' => $bulletin->effective_date?->toDateString(),
        ] : [
            'status' => 'unavailable', 'type' => 'standard_srp',
            'label' => 'SRP reference unavailable', 'value' => null,
            'source' => null, 'effective_date' => null,
        ];
    }
}
