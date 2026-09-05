<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptItemExtractor;
use PHPUnit\Framework\TestCase;

class ReceiptItemExtractorTest extends TestCase
{
    public function test_rejects_names_without_letters_and_keeps_unknown_confidence_null(): void
    {
        $items = (new ReceiptItemExtractor)->extract([
            '$ 8.50',
            '12345 9.00',
            '??? 10.00',
            'RICE 45.00',
        ]);

        $this->assertCount(1, $items);
        $this->assertSame('RICE', $items[0]['item_name']);
        $this->assertNull($items[0]['ocr_confidence']);
    }

    public function test_analysis_preserves_rejected_price_like_lines(): void
    {
        $analysis = (new ReceiptItemExtractor)->analyze(['RICE 45.00', '$ 8.50', 'TOTAL 45.00']);

        $this->assertSame(['RICE'], array_column($analysis['items'], 'item_name'));
        $this->assertSame(['$ 8.50'], $analysis['rejected_lines']);
    }
}
