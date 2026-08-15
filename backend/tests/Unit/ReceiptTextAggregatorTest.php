<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptItemExtractor;
use App\Services\Receipt\ReceiptTextAggregator;
use PHPUnit\Framework\TestCase;

class ReceiptTextAggregatorTest extends TestCase
{
    public function test_merges_ordered_frame_lines_without_repeating_overlap(): void
    {
        $lines = (new ReceiptTextAggregator)->merge([
            ['RECEIPT TEST MART', 'RICE 45.00', 'SUGAR 70.00'],
            ['SUGAR 70.00', 'COFFEE 50.00', 'TOTAL 165.00'],
        ]);

        $this->assertSame([
            'RECEIPT TEST MART',
            'RICE 45.00',
            'SUGAR 70.00',
            'COFFEE 50.00',
            'TOTAL 165.00',
        ], $lines);
    }

    public function test_extracts_item_prices_but_excludes_receipt_totals(): void
    {
        $items = (new ReceiptItemExtractor)->extract([
            'RECEIPT TEST MART',
            'Premium Rice 1kg 45.00',
            'Brown Sugar ₱70.50',
            'TOTAL 115.50',
        ]);

        $this->assertCount(2, $items);
        $this->assertSame('Premium Rice 1kg', $items[0]['item_name']);
        $this->assertSame(45.0, $items[0]['observed_price']);
        $this->assertSame('Brown Sugar', $items[1]['item_name']);
        $this->assertSame(70.5, $items[1]['observed_price']);
    }
}
