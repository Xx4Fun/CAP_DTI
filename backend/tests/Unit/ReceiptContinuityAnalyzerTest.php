<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptContinuityAnalyzer;
use PHPUnit\Framework\TestCase;

class ReceiptContinuityAnalyzerTest extends TestCase
{
    public function test_accepts_ordered_frames_with_merchant_consistency_and_text_overlap(): void
    {
        $result = (new ReceiptContinuityAnalyzer)->analyze([
            ['sequence' => 0, 'merchant' => 'Receipt Test Mart', 'lines' => ['RECEIPT TEST MART', 'RICE 45.00', 'SUGAR 70.00']],
            ['sequence' => 1, 'merchant' => 'Receipt Test Mart', 'lines' => ['SUGAR 70.00', 'COFFEE 50.00', 'TOTAL 165.00']],
        ]);

        $this->assertSame('ready', $result['status']);
        $this->assertSame([], $result['reasons']);
        $this->assertGreaterThanOrEqual(0.5, $result['continuity_score']);
    }

    public function test_merchant_text_does_not_participate_in_continuity(): void
    {
        $result = (new ReceiptContinuityAnalyzer)->analyze([
            ['sequence' => 0, 'merchant' => 'Store One', 'lines' => ['STORE ONE', 'RICE 45.00']],
            ['sequence' => 1, 'merchant' => 'Store Two', 'lines' => ['STORE TWO', 'RICE 45.00']],
        ]);

        $this->assertSame('ready', $result['status']);
        $this->assertNotContains('merchant_mismatch', $result['reasons']);
    }

    public function test_accepts_minor_ocr_variations_in_adjacent_overlap(): void
    {
        $result = (new ReceiptContinuityAnalyzer)->analyze([
            ['sequence' => 0, 'merchant' => null, 'lines' => ['BROWN SUGAR 1KG 70.50', 'PREMIUM RICE 45.00']],
            ['sequence' => 1, 'merchant' => null, 'lines' => ['BROWN SUG4R 1KG 70.50', 'COFFEE 50.00']],
        ]);

        $this->assertSame('ready', $result['status']);
        $this->assertSame([], $result['reasons']);
    }

    public function test_rejects_adjacent_frames_without_receipt_overlap(): void
    {
        $result = (new ReceiptContinuityAnalyzer)->analyze([
            ['sequence' => 0, 'merchant' => null, 'lines' => ['RICE 45.00', 'SUGAR 70.00']],
            ['sequence' => 1, 'merchant' => null, 'lines' => ['SOAP 30.00', 'SHAMPOO 90.00']],
        ]);

        $this->assertSame('needs_recapture', $result['status']);
        $this->assertContains('missing_adjacent_overlap', $result['reasons']);
    }
}
