<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptOcrResultSelector;
use PHPUnit\Framework\TestCase;

class ReceiptOcrResultSelectorTest extends TestCase
{
    public function test_prefers_the_successful_pass_with_more_usable_text(): void
    {
        $primary = ['status' => 'OCR_SUCCESS', 'lines' => ['RICE 45.00'], 'words' => [['confidence' => 91]]];
        $fallback = ['status' => 'OCR_SUCCESS', 'lines' => ['RICE 45.00', 'SUGAR 70.00'], 'words' => [['confidence' => 76], ['confidence' => 80]]];

        $result = (new ReceiptOcrResultSelector)->select($primary, $fallback);

        $this->assertSame($fallback, $result);
    }

    public function test_preserves_technical_failure_when_both_passes_cannot_run(): void
    {
        $result = (new ReceiptOcrResultSelector)->select(
            ['status' => 'OCR_TIMEOUT', 'lines' => [], 'words' => []],
            ['status' => 'OCR_UNAVAILABLE', 'lines' => [], 'words' => []],
        );

        $this->assertSame('OCR_UNAVAILABLE', $result['status']);
    }

    public function test_ranks_plausible_items_then_total_then_measured_confidence_and_primary_wins_ties(): void
    {
        $selector = new ReceiptOcrResultSelector;
        $primary = ['status' => 'OCR_SUCCESS', 'lines' => ['SHOP', 'RICE 45.00', 'TOTAL 45.00'], 'words' => [['confidence' => 60]]];
        $fallback = ['status' => 'OCR_SUCCESS', 'lines' => ['SHOP', 'RICE 45.00', 'SUGAR 70.00'], 'words' => [['confidence' => 99]]];

        $this->assertSame('fallback', $selector->selectedPass($primary, $fallback));
        $this->assertSame('primary', $selector->selectedPass($primary, $primary));
    }

    public function test_pos_layout_scoring_counts_two_line_items_only_when_enabled(): void
    {
        $selector = new ReceiptOcrResultSelector;
        $primary = ['status' => 'OCR_SUCCESS', 'lines' => ['SHOP', 'RICE 45.00'], 'words' => [['confidence' => 99]]];
        $fallback = ['status' => 'OCR_SUCCESS', 'lines' => ['004793487 1 111.75 111.75T', 'CALLA PWD', '004663895 1 27.00 27.00T', 'COBRA BERRY'], 'words' => [['confidence' => 50]]];

        $this->assertSame('primary', $selector->selectedPass($primary, $fallback));
        $this->assertSame('fallback', $selector->selectedPass($primary, $fallback, true));
    }

    public function test_pos_scoring_excludes_lines_naming_the_known_merchant(): void
    {
        $selector = new ReceiptOcrResultSelector;
        $primary = ['status' => 'OCR_SUCCESS', 'lines' => ['004793487 1 111.75 111.75T', 'GAISANO GRAND ANTIQUE'], 'words' => [['confidence' => 99]]];
        $fallback = ['status' => 'OCR_SUCCESS', 'lines' => ['RICE 45.00'], 'words' => [['confidence' => 50]]];

        $this->assertSame('primary', $selector->selectedPass($primary, $fallback, true));
        $this->assertSame('fallback', $selector->selectedPass($primary, $fallback, true, ['Gaisano Grand Mall of Antique']));
    }

    public function test_ranking_reuses_production_item_and_total_rules(): void
    {
        $selector = new ReceiptOcrResultSelector;
        $primary = ['status' => 'OCR_SUCCESS', 'lines' => ['PHP 8.50', 'PHP 9.00', 'AMOUNT DUE 17.50'], 'words' => [['confidence' => 99]]];
        $fallback = ['status' => 'OCR_SUCCESS', 'lines' => ['RICE 10.00', 'TOTAL 10.00'], 'words' => [['confidence' => 50]]];

        $this->assertSame('fallback', $selector->selectedPass($primary, $fallback));
    }
}
