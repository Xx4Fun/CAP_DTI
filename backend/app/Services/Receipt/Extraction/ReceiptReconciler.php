<?php

namespace App\Services\Receipt\Extraction;

/**
 * Objective arithmetic checks on an extraction, computed by the backend. Each check is matched, mismatch, or
 * unavailable; a mismatch never rejects a receipt, since discounts, weighed goods, promotions, or incomplete
 * extraction can explain differences. All amounts are integer centavos with a one-centavo tolerance.
 */
final class ReceiptReconciler
{
    public const MATCHED = 'matched';

    public const MISMATCH = 'mismatch';

    public const UNAVAILABLE = 'unavailable';

    private const TOLERANCE_CENTS = 1;

    /**
     * @param  array<int, array{quantity: ?float, unit_price_cents: ?int, line_total_cents: ?int, possible_duplicate: bool}>  $items
     * @param  array<int, ?int>  $discountCents  positive magnitudes; null when unreadable
     * @param  array<int, array{direction: string, cents: ?int}>  $adjustments
     * @return array<string, mixed>
     */
    public function reconcile(array $items, ?int $subtotalCents, array $discountCents, array $adjustments, ?int $totalCents): array
    {
        $lines = [];
        foreach ($items as $index => $item) {
            $lines[$index] = $item['quantity'] === null || $item['unit_price_cents'] === null || $item['line_total_cents'] === null
                ? self::UNAVAILABLE
                : $this->compare((int) round($item['quantity'] * $item['unit_price_cents']), $item['line_total_cents']);
        }

        $counted = array_filter($items, fn (array $item) => ! $item['possible_duplicate']);
        $itemsSum = $this->sum($counted);
        $itemsSumWithDuplicates = $this->sum($items);

        $checks = [
            'line_arithmetic' => $this->aggregate($lines),
            'items_vs_subtotal' => $subtotalCents === null || $itemsSum === null ? self::UNAVAILABLE : $this->compare($itemsSum, $subtotalCents),
            'expected_vs_total' => $this->expectedVsTotal($subtotalCents ?? $itemsSum, $discountCents, $adjustments, $totalCents),
        ];
        $overall = $this->aggregate(array_values($checks));

        $duplicatesGenuine = false;
        if (count($counted) !== count($items) && $itemsSumWithDuplicates !== null) {
            // Repeated scans are real purchases on many POS receipts: report when counting them reconciles.
            $duplicatesGenuine = $subtotalCents !== null
                ? $checks['items_vs_subtotal'] === self::MISMATCH && $this->compare($itemsSumWithDuplicates, $subtotalCents) === self::MATCHED
                : $checks['expected_vs_total'] === self::MISMATCH
                    && $this->expectedVsTotal($itemsSumWithDuplicates, $discountCents, $adjustments, $totalCents) === self::MATCHED;
        }

        return [
            'status' => $overall,
            'checks' => $checks,
            'lines' => $lines,
            'items_sum' => $itemsSum === null ? null : ReceiptAmount::format($itemsSum),
            'duplicates_are_likely_genuine' => $duplicatesGenuine,
        ];
    }

    private function expectedVsTotal(?int $baseCents, array $discountCents, array $adjustments, ?int $totalCents): string
    {
        if ($baseCents === null || $totalCents === null || in_array(null, $discountCents, true)
            || in_array(null, array_column($adjustments, 'cents'), true)) {
            return self::UNAVAILABLE;
        }
        $expected = $baseCents - array_sum($discountCents);
        foreach ($adjustments as $adjustment) {
            $expected += $adjustment['direction'] === 'add' ? $adjustment['cents'] : -$adjustment['cents'];
        }

        return $this->compare($expected, $totalCents);
    }

    /** Sum of line totals, or null when there are no items or any line total is unreadable. */
    private function sum(array $items): ?int
    {
        if ($items === [] || in_array(null, array_column($items, 'line_total_cents'), true)) {
            return null;
        }

        return array_sum(array_column($items, 'line_total_cents'));
    }

    private function compare(int $actual, int $expected): string
    {
        return abs($actual - $expected) <= self::TOLERANCE_CENTS ? self::MATCHED : self::MISMATCH;
    }

    /** @param array<int, string> $statuses */
    private function aggregate(array $statuses): string
    {
        if (in_array(self::MISMATCH, $statuses, true)) {
            return self::MISMATCH;
        }

        return in_array(self::MATCHED, $statuses, true) ? self::MATCHED : self::UNAVAILABLE;
    }
}
