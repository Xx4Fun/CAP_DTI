<?php

namespace App\Services\Admin;

use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Services\FieldReferenceResolver;

class TemporalAnalyticsService
{
    public function __construct(
        private readonly TemporalSrpResolver $resolver,
        private readonly FieldReferenceResolver $references,
    ) {}

    /**
     * Reference for a row that did not capture its own, as it stood at that time: an emergency ceiling in force
     * replaces the SRP and its allowance (unavailable ceiling: no reference rather than assuming the SRP), and
     * otherwise the SRP revision then in effect, falling back to the caller's value when none resolves.
     *
     * @return array{0: mixed, 1: string}
     */
    private function uncapturedReference(?SrpBulletin $bulletin, \DateTimeInterface $at, mixed $srp): array
    {
        $reference = $bulletin ? $this->references->resolve($bulletin, $at) : null;

        return ($reference['type'] ?? null) === 'emergency_ceiling'
            ? [$reference['value'], 'emergency_ceiling']
            : [$reference['value'] ?? $srp, 'standard_srp'];
    }

    public function forStore(Store $store, ?string $commodityKey, \DateTimeInterface $asOf): array
    {
        $from = (clone $asOf)->modify('-4 weeks');
        $rows = collect();
        $findings = RegulatoryFinding::where('store_id', $store->id)->where('decision', 'confirmed')
            ->whereBetween('observed_at', [$from, $asOf])->get();
        // A confirmed field item is already plotted as its verified inspection below; it marks that row instead of
        // adding a second point labelled as a receipt.
        $confirmedFieldItems = $findings->where('source_type', MonitoringRecordItem::FINDING_SOURCE)->pluck('source_id')->map(fn ($id) => (int) $id)->flip();
        foreach ($findings->where('source_type', '!=', MonitoringRecordItem::FINDING_SOURCE) as $finding) {
            $srp = $finding->srp_bulletin_id ? SrpBulletin::find($finding->srp_bulletin_id) : null;
            if ($commodityKey && $srp?->commodity_key !== $commodityKey) {
                continue;
            }
            // Plot the reference the finding was decided against. Re-resolving here redrew history
            // whenever a bulletin was revised, and could not represent an emergency ceiling at all.
            $baseline = $finding->reference_value
                ?? ($commodityKey ? $this->resolver->resolve($commodityKey, $finding->observed_at)?->baseline_price : $srp?->baseline_price);
            $referenceType = $finding->reference_type;
            if ($referenceType === null) {
                // Decided before findings recorded their reference.
                [$baseline, $referenceType] = $this->uncapturedReference($srp, $finding->observed_at, $baseline);
            }
            $rows->push(['date' => $finding->observed_at->format('Y-m-d'), 'price' => $finding->observed_price, 'srp' => $baseline, 'source' => 'Validated receipt', 'reference_type' => $referenceType,
                'commodity_key' => $srp?->commodity_key, 'commodity_name' => $srp?->commodity_name]);
        }
        $inspections = TemporalInspection::with('bulletin')->where('store_id', $store->id)
            ->where('validation_status', 'verified')->whereNotNull('officer_signature')->where('officer_signature', '!=', '')
            ->whereBetween('inspection_timestamp', [$from, $asOf])->get();
        foreach ($inspections as $inspection) {
            if ($commodityKey && $inspection->bulletin?->commodity_key !== $commodityKey) {
                continue;
            }
            $captured = $inspection->monitoring_record_item_id
                ? MonitoringRecordItem::find($inspection->monitoring_record_item_id)
                : MonitoringRecordItem::query()->where('srp_id', $inspection->srp_id)
                    ->whereHas('record', fn ($record) => $record->where('store_id', $store->id)
                        ->where('status', 'accepted')->where('finalized_at', $inspection->inspection_timestamp))
                    ->first();
            if ($captured) {
                [$reference, $referenceType] = [$captured->reference_value, $captured->reference_type];
            } else {
                $resolved = $commodityKey ? $this->resolver->resolve($commodityKey, $inspection->inspection_timestamp) : $inspection->bulletin;
                [$reference, $referenceType] = $this->uncapturedReference($inspection->bulletin, $inspection->inspection_timestamp, $resolved?->baseline_price);
            }
            $rows->push([
                'date' => $inspection->inspection_timestamp->format('Y-m-d'),
                'price' => $inspection->recorded_price,
                'srp' => $reference,
                'source' => 'Verified field inspection',
                'reference_type' => $referenceType,
                'reference_source' => $captured?->reference_source,
                'confirmed' => $captured !== null && $confirmedFieldItems->has($captured->id),
                'commodity_key' => $inspection->bulletin?->commodity_key,
                'commodity_name' => $inspection->bulletin?->commodity_name,
            ]);
        }
        $rows = $rows->sortBy('date')->values();

        return [
            'labels' => $rows->pluck('date'), 'price_series' => $rows->pluck('price'),
            'srp_series' => $rows->pluck('srp'), 'table_rows' => $rows,
            'recidivism_count' => ReportReviewService::confirmedCaseCount($store->id),
        ];
    }
}
