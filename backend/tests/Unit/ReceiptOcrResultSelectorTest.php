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
}

