<?php

namespace Tests\Unit;

use App\Services\Receipt\Extraction\ReceiptAmount;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ReceiptAmountTest extends TestCase
{
    public static function moneyForms(): array
    {
        return [
            'plain' => ['608.50', 60850, false],
            'grouped thousands' => ['1,234.50', 123450, false],
            'comma decimal' => ['608,50', 60850, false],
            'peso prefix' => ['P608.50', 60850, false],
            'peso sign' => ['₱ 45.00', 4500, false],
            'VAT flag suffix' => ['111.75T', 11175, false],
            'leading minus' => ['-50.00', 5000, true],
            'parentheses' => ['(20.00)', 2000, true],
            'trailing minus' => ['15.00-', 1500, true],
        ];
    }

    #[DataProvider('moneyForms')]
    public function test_money_forms_are_normalized_to_centavos(string $input, int $cents, bool $negative): void
    {
        $this->assertSame(['cents' => $cents, 'negative' => $negative], ReceiptAmount::money($input));
    }

    public static function invalidMoney(): array
    {
        return [['1.234,50'], ['12,345'], ['45'], ['45.5'], ['abc'], [''], ['12345678.00'], ['1,23.45']];
    }

    #[DataProvider('invalidMoney')]
    public function test_ambiguous_or_malformed_money_is_rejected_not_guessed(string $input): void
    {
        $this->assertNull(ReceiptAmount::money($input));
    }

    public function test_quantities_allow_weighted_values_within_bounds(): void
    {
        $this->assertSame(2.0, ReceiptAmount::quantity('2'));
        $this->assertSame(0.525, ReceiptAmount::quantity('0.525'));
        $this->assertNull(ReceiptAmount::quantity('0'));
        $this->assertNull(ReceiptAmount::quantity('10000'));
        $this->assertNull(ReceiptAmount::quantity('1.2345'));
        $this->assertNull(ReceiptAmount::quantity('two'));
        $this->assertNull(ReceiptAmount::quantity(null));
        $this->assertSame('608.50', ReceiptAmount::format(60850));
    }
}
