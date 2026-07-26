<?php

namespace App\Services\Admin;

use App\Models\RegulatoryFinding;
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
            $srp = $finding->srp_bulletin_id ? \App\Models\SrpBulletin::find($finding->srp_bulletin_id) : null;
            if ($commodityKey && $srp?->commodity_key !== $commodityKey) continue;
            $resolved = $commodityKey ? $this->resolver->resolve($commodityKey, $finding->observed_at) : $srp;
            $rows->push(['date' => $finding->observed_at->format('Y-m-d'), 'price' => $finding->observed_price, 'srp' => $resolved?->baseline_price, 'source' => 'Validated receipt']);
        }
        $inspections = TemporalInspection::with('bulletin')->where('store_id', $store->id)
            ->where('validation_status', 'verified')->whereNotNull('officer_signature')->where('officer_signature', '!=', '')
            ->whereBetween('inspection_timestamp', [$from, $asOf])->get();
        foreach ($inspections as $inspection) {
            if ($commodityKey && $inspection->bulletin?->commodity_key !== $commodityKey) continue;
            $resolved = $commodityKey ? $this->resolver->resolve($commodityKey, $inspection->inspection_timestamp) : $inspection->bulletin;
            $rows->push(['date' => $inspection->inspection_timestamp->format('Y-m-d'), 'price' => $inspection->recorded_price, 'srp' => $resolved?->baseline_price, 'source' => 'Verified field inspection']);
        }
        $rows = $rows->sortBy('date')->values();
        return [
            'labels' => $rows->pluck('date'), 'price_series' => $rows->pluck('price'),
            'srp_series' => $rows->pluck('srp'), 'table_rows' => $rows,
            'recidivism_count' => RegulatoryFinding::where('store_id', $store->id)->where('decision', 'confirmed')->count(),
        ];
    }
}
