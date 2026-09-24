<?php

namespace App\Services\Admin;

use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;

class TemporalAnalyticsService
{
    public function __construct(private readonly TemporalSrpResolver $resolver) {}

    public function forStore(Store $store, ?string $commodityKey, \DateTimeInterface $asOf): array
    {
        $from = (clone $asOf)->modify('-4 weeks');
        $rows = collect();
        $findings = RegulatoryFinding::where('store_id', $store->id)->where('decision', 'confirmed')
            ->whereBetween('observed_at', [$from, $asOf])->get();
        foreach ($findings as $finding) {
            $srp = $finding->srp_bulletin_id ? SrpBulletin::find($finding->srp_bulletin_id) : null;
            if ($commodityKey && $srp?->commodity_key !== $commodityKey) {
                continue;
            }
            // Plot the reference the finding was decided against. Re-resolving here redrew history
            // whenever a bulletin was revised, and could not represent an emergency ceiling at all.
            $baseline = $finding->reference_value
                ?? ($commodityKey ? $this->resolver->resolve($commodityKey, $finding->observed_at)?->baseline_price : $srp?->baseline_price);
            $rows->push(['date' => $finding->observed_at->format('Y-m-d'), 'price' => $finding->observed_price, 'srp' => $baseline, 'source' => 'Validated receipt']);
        }
        $inspections = TemporalInspection::with('bulletin')->where('store_id', $store->id)
            ->where('validation_status', 'verified')->whereNotNull('officer_signature')->where('officer_signature', '!=', '')
            ->whereBetween('inspection_timestamp', [$from, $asOf])->get();
        foreach ($inspections as $inspection) {
            if ($commodityKey && $inspection->bulletin?->commodity_key !== $commodityKey) {
                continue;
            }
            $captured = MonitoringRecordItem::query()->where('srp_id', $inspection->srp_id)
                ->whereHas('record', fn ($record) => $record->where('store_id', $store->id)
                    ->where('status', 'accepted')->where('finalized_at', $inspection->inspection_timestamp))
                ->first();
            $resolved = $captured ? null : ($commodityKey ? $this->resolver->resolve($commodityKey, $inspection->inspection_timestamp) : $inspection->bulletin);
            $rows->push([
                'date' => $inspection->inspection_timestamp->format('Y-m-d'),
                'price' => $inspection->recorded_price,
                'srp' => $captured?->reference_value ?? $resolved?->baseline_price,
                'source' => 'Verified field inspection',
                'reference_type' => $captured?->reference_type,
                'reference_source' => $captured?->reference_source,
            ]);
        }
        $rows = $rows->sortBy('date')->values();

        return [
            'labels' => $rows->pluck('date'), 'price_series' => $rows->pluck('price'),
            'srp_series' => $rows->pluck('srp'), 'table_rows' => $rows,
            'recidivism_count' => RegulatoryFinding::where('store_id', $store->id)->where('decision', 'confirmed')->count(),
        ];
    }
}
