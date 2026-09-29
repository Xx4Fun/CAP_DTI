<?php

namespace App\Services\Receipt;

use App\Models\ConsumerReportItem;
use App\Models\SrpBulletin;
use App\Services\Admin\TemporalSrpResolver;
use App\Services\FieldReferenceResolver;

/**
 * Compares a receipt line's unit price against the regulatory reference that applied on the date of
 * purchase, and states the arithmetic: above, within, or no reference available.
 *
 * The reference is resolved in two steps because the two resolvers answer different questions:
 * TemporalSrpResolver finds which bulletin revision applied on a date, FieldReferenceResolver decides
 * whether that bulletin's ordinary SRP or an emergency APC/frozen ceiling governs. Shelf-tag scanning
 * uses RegulatoryPriceResolver instead, which reads a *current* calamity flag — right for a shopper
 * standing in a store, wrong for a receipt dated weeks ago.
 *
 * This states a comparison. It never decides a violation: `is_above_reference` is arithmetic, and a
 * DTI evaluator still records the finding.
 */
class ReceiptPriceComparison
{
    public function __construct(
        private readonly TemporalSrpResolver $temporalResolver,
        private readonly FieldReferenceResolver $referenceResolver,
    ) {
    }

    /**
     * Resolve the authoritative reference for a commodity on a date.
     *
     * @return array<string, mixed> The resolver payload, plus a `version` hash for staleness checks.
     */
    public function referenceFor(?string $commodityKey, string|\DateTimeInterface|null $observedAt): array
    {
        $unavailable = [
            'status' => 'unavailable', 'type' => null, 'label' => 'No applicable reference',
            'value' => null, 'source' => null, 'effective_date' => null, 'source_id' => null,
            'srp_bulletin_id' => null, 'version' => null,
        ];

        if (! $commodityKey || ! $observedAt) {
            return $unavailable;
        }

        $bulletin = $this->temporalResolver->resolve($commodityKey, $observedAt);

        if (! $bulletin) {
            return $unavailable;
        }

        $reference = $this->referenceResolver->resolve($bulletin, $observedAt);

        return $reference + [
            // The bulletin carries commodity identity even when an emergency record supplies the
            // governing price, so readers that group findings by commodity keep working.
            'srp_bulletin_id' => (int) $bulletin->id,
            'version' => $this->referenceResolver->version($reference),
        ];
    }

    /**
     * The full per-item payload the review panel renders: the resolved reference plus the verdict.
     *
     * @return array<string, mixed>
     */
    public function forItem(ConsumerReportItem $item, string|\DateTimeInterface|null $observedAt): array
    {
        $bulletin = $item->srp;
        $reference = $this->referenceFor($bulletin?->commodity_key, $observedAt);

        return $reference + $this->verdict($this->unitPriceOf($item), $reference) + [
            'commodity_key' => $bulletin?->commodity_key,
            'commodity_name' => $bulletin?->commodity_name ?? $item->item_name,
            'auto_matched' => (bool) ($item->srp_match_json['auto_matched'] ?? false),
            'match_candidates' => $item->srp_match_json['candidates'] ?? [],
        ];
    }

    /**
     * Receipt unit price compared against the reference value.
     *
     * Every field is null when either side is unknown: an item with no resolvable reference reads
     * "no reference", never a false "within reference".
     *
     * @return array{receipt_unit_price: float|null, peso_difference: float|null, percent_difference: float|null, is_above_reference: bool|null}
     */
    public function verdict(?float $unitPrice, array $reference): array
    {
        $referenceValue = ($reference['status'] ?? null) === 'available' ? $reference['value'] : null;

        if ($unitPrice === null || $referenceValue === null) {
            return [
                'receipt_unit_price' => $unitPrice,
                'peso_difference' => null,
                'percent_difference' => null,
                'is_above_reference' => null,
            ];
        }

        // Centavos, so a float representation cannot turn an exact match into a one-centavo overprice.
        $difference = (int) round($unitPrice * 100) - (int) round(((float) $referenceValue) * 100);

        return [
            'receipt_unit_price' => $unitPrice,
            'peso_difference' => round($difference / 100, 2),
            'percent_difference' => $referenceValue > 0
                ? round(($difference / ((float) $referenceValue * 100)) * 100, 1)
                : null,
            'is_above_reference' => $difference > 0,
        ];
    }

    /**
     * Per-unit price of a receipt line: the extracted unit price, or the line total when exactly one
     * unit was bought. Any other quantity without a unit price is unknown, and stays unknown — a
     * multi-unit line total is not a unit price. Mirrors suggestedUnitPrice() in the review panel.
     */
    public function unitPriceOf(ConsumerReportItem $item): ?float
    {
        if ($item->unit_price !== null) {
            return (float) $item->unit_price;
        }

        $quantity = $item->quantity === null ? null : (float) $item->quantity;

        return ($quantity === null || $quantity === 1.0) && $item->observed_price !== null
            ? (float) $item->observed_price
            : null;
    }

    /** The bulletin that carries commodity identity for a finding, resolved for the observation date. */
    public function bulletinFor(?string $commodityKey, string|\DateTimeInterface|null $observedAt): ?SrpBulletin
    {
        return $commodityKey && $observedAt
            ? $this->temporalResolver->resolve($commodityKey, $observedAt)
            : null;
    }
}
