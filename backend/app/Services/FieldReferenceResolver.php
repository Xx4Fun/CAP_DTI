<?php

namespace App\Services;

use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Support\MonitoringPeriod;
use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;

class FieldReferenceResolver
{
    /** @var array<string, RegulatoryEmergency|null> Emergency in effect, per exact instant, for this instance only. */
    private array $emergencies = [];

    /** The key MonitoringPeriod::effectiveEmergency would resolve to: the exact instant, date-only read in Manila. */
    public static function instantKey(string|\DateTimeInterface $observedAt): string
    {
        return CarbonImmutable::parse($observedAt, MonitoringWeek::TIMEZONE)->utc()->toIso8601String();
    }

    public function version(array $reference): string
    {
        return hash('sha256', json_encode([
            $reference['status'], $reference['type'], $reference['source_id'] ?? null,
            $reference['value'], $reference['label'], $reference['source'], $reference['effective_date'],
        ], JSON_PRESERVE_ZERO_FRACTION));
    }

    /** @param bool $bulletinIsEffective The caller already resolved the revision in effect on this date. */
    public function resolve(SrpBulletin $submittedBulletin, string|\DateTimeInterface $observedAt, bool $bulletinIsEffective = false): array
    {
        $bulletin = $submittedBulletin->commodity_key && ! $bulletinIsEffective
            ? SrpBulletin::query()->where('commodity_key', $submittedBulletin->commodity_key)
                ->whereDate('effective_date', '<=', $observedAt)
                ->latest('effective_date')->latest('id')->first()
            : $submittedBulletin;
        $emergency = $this->effectiveEmergency($observedAt);

        if ($emergency && $bulletin?->price_freeze_applicable) {
            $record = RegulatoryPriceRecord::query()
                ->where('regulatory_emergency_id', $emergency->id)
                ->where('commodity_key', $submittedBulletin->commodity_key)
                ->whereDate('effective_from', '<=', $observedAt)
                ->where(fn ($query) => $query->whereNull('effective_until')->orWhereDate('effective_until', '>=', $observedAt))
                ->latest('effective_from')->latest('id')->first();

            return $record ? [
                'status' => 'available', 'type' => 'emergency_ceiling',
                'label' => $record->price_type === 'APC' ? 'Official APC / Price Freeze reference' : 'Official frozen price reference',
                'value' => (float) $record->authoritative_price,
                'source' => $record->source_reference,
                'effective_date' => $record->effective_from->toDateString(),
                'source_id' => $record->id,
            ] : [
                'status' => 'unavailable', 'type' => 'emergency_ceiling',
                'label' => 'Emergency reference unavailable', 'value' => null,
                'source' => $emergency->declaration_reference, 'effective_date' => null, 'source_id' => null,
            ];
        }

        return $bulletin && $bulletin->baseline_price > 0 && $bulletin->effective_date ? [
            'status' => 'available', 'type' => 'standard_srp',
            'label' => 'SRP baseline (provisional)', 'value' => (float) $bulletin->baseline_price,
            'source' => $bulletin->source_reference, 'effective_date' => $bulletin->effective_date?->toDateString(),
            'source_id' => $bulletin->id,
        ] : [
            'status' => 'unavailable', 'type' => 'standard_srp',
            'label' => 'SRP reference unavailable', 'value' => null,
            'source' => null, 'effective_date' => null, 'source_id' => null,
        ];
    }

    public function protocolAt(string|\DateTimeInterface $observedAt): array
    {
        $emergency = $this->effectiveEmergency($observedAt);

        return [
            'mode' => $emergency ? 'emergency' : 'standard',
            'reference' => $emergency?->declaration_reference,
        ];
    }

    private function effectiveEmergency(string|\DateTimeInterface $observedAt): ?RegulatoryEmergency
    {
        $key = self::instantKey($observedAt);

        return array_key_exists($key, $this->emergencies)
            ? $this->emergencies[$key]
            : $this->emergencies[$key] = MonitoringPeriod::effectiveEmergency($observedAt);
    }
}
