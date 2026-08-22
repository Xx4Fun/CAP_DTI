<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptTotalExtractor;
use PHPUnit\Framework\TestCase;

class ReceiptTotalExtractorTest extends TestCase
{
    public function test_extracts_the_payable_total_not_subtotal_cash_or_change(): void
    {
        $total = (new ReceiptTotalExtractor)->extract([
            'SUBTOTAL 110.00', 'VAT 5.50', 'TOTAL 115.50', 'CASH 200.00', 'CHANGE 84.50',
        ]);

        $this->assertSame(115.50, $total);
    }

    public function test_returns_null_when_no_explicit_total_is_present(): void
    {
        $this->assertNull((new ReceiptTotalExtractor)->extract(['RICE 45.00', 'SUGAR 70.50']));
    }
}

