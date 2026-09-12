<?php

namespace Tests\Unit;

use App\Services\Receipt\Extraction\ReceiptReconciler;
use PHPUnit\Framework\TestCase;

class ReceiptReconcilerTest extends TestCase
{
    private function item(?float $quantity, ?int $unit, ?int $line, bool $duplicate = false): array
    {
        return ['quantity' => $quantity, 'unit_price_cents' => $unit, 'line_total_cents' => $line, 'possible_duplicate' => $duplicate];
    }

    public function test_the_gaisano_receipt_reconciles_thirteen_line_totals_to_608_50(): void
    {
        $lines = [11175, 2700, 2750, 2750, 1900, 7025, 13050, 3500, 1550, 1550, 3000, 4975, 4925];
        $items = array_map(fn (int $cents) => $this->item(1.0, $cents, $cents), $lines);

        $result = (new ReceiptReconciler)->reconcile($items, null, [], [], 60850);

        $this->assertSame('matched', $result['status']);
        $this->assertSame('matched', $result['checks']['expected_vs_total']);
        $this->assertSame('matched', $result['checks']['line_arithmetic']);
        $this->assertSame('unavailable', $result['checks']['items_vs_subtotal']);
        $this->assertSame('608.50', $result['items_sum']);
    }

    public function test_discounts_are_subtracted_as_positive_magnitudes(): void
    {
        $result = (new ReceiptReconciler)->reconcile([$this->item(1.0, 10000, 10000)], null, [1000], [], 9000);

        $this->assertSame('matched', $result['checks']['expected_vs_total']);
    }

    public function test_senior_citizen_vat_exemption_and_discount_reconcile_via_adjustments(): void
    {
        // Gross 112.00 incl. VAT; VAT exemption 12.00; 20% SC discount on 100.00 = 20.00; total 80.00.
        $result = (new ReceiptReconciler)->reconcile(
            [$this->item(1.0, 11200, 11200)], 11200, [2000], [['direction' => 'subtract', 'cents' => 1200]], 8000,
        );

        $this->assertSame('matched', $result['status']);
        $this->assertSame('matched', $result['checks']['items_vs_subtotal']);
    }

    public function test_rounding_adjustment_and_weighted_quantity(): void
    {
        $result = (new ReceiptReconciler)->reconcile(
            [$this->item(0.525, 12000, 6300)], null, [], [['direction' => 'subtract', 'cents' => 25]], 6275,
        );

        $this->assertSame('matched', $result['checks']['line_arithmetic']);
        $this->assertSame('matched', $result['checks']['expected_vs_total']);
    }

    public function test_mismatches_are_reported_never_rejected(): void
    {
        $result = (new ReceiptReconciler)->reconcile([$this->item(2.0, 5500, 10000)], null, [], [], 12000);

        $this->assertSame('mismatch', $result['status']);
        $this->assertSame('mismatch', $result['checks']['line_arithmetic']);
        $this->assertSame('mismatch', $result['checks']['expected_vs_total']);
        $this->assertSame(['mismatch'], $result['lines']);
    }

    public function test_missing_values_make_checks_unavailable_instead_of_guessed(): void
    {
        $result = (new ReceiptReconciler)->reconcile([$this->item(null, null, 4500), $this->item(1.0, 1000, null)], null, [], [], 5500);

        $this->assertSame('unavailable', $result['status']);
        $this->assertSame(['unavailable', 'unavailable'], $result['lines']);
        $this->assertNull($result['items_sum']);

        $unreadableDiscount = (new ReceiptReconciler)->reconcile([$this->item(1.0, 4500, 4500)], null, [null], [], 4000);
        $this->assertSame('unavailable', $unreadableDiscount['checks']['expected_vs_total']);
    }

    public function test_possible_duplicates_are_excluded_but_reported_when_they_explain_the_total(): void
    {
        $items = [$this->item(1.0, 1550, 1550), $this->item(1.0, 1550, 1550, true), $this->item(1.0, 3000, 3000)];

        $result = (new ReceiptReconciler)->reconcile($items, null, [], [], 6100);

        $this->assertSame('mismatch', $result['checks']['expected_vs_total']);
        $this->assertTrue($result['duplicates_are_likely_genuine']);
        $this->assertSame('45.50', $result['items_sum']);
    }

    public function test_possible_duplicates_are_reported_when_they_explain_a_printed_subtotal(): void
    {
        $items = [$this->item(1.0, 1550, 1550), $this->item(1.0, 1550, 1550, true), $this->item(1.0, 3000, 3000)];

        $result = (new ReceiptReconciler)->reconcile($items, 6100, [], [], 6100);

        $this->assertSame('mismatch', $result['checks']['items_vs_subtotal']);
        $this->assertTrue($result['duplicates_are_likely_genuine']);

        $unexplained = (new ReceiptReconciler)->reconcile($items, 5000, [], [], 5000);
        $this->assertFalse($unexplained['duplicates_are_likely_genuine']);
    }

    public function test_one_centavo_tolerance(): void
    {
        $this->assertSame('matched', (new ReceiptReconciler)->reconcile([$this->item(1.0, 1000, 1000)], null, [], [], 1001)['status']);
        $this->assertSame('mismatch', (new ReceiptReconciler)->reconcile([$this->item(1.0, 1000, 1000)], null, [], [], 1002)['status']);
    }
}
