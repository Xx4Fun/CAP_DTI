<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptDateExtractor;
use DateTimeImmutable;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReceiptDateExtractorTest extends TestCase
{
    private function extract(array $lines): ?string
    {
        return (new ReceiptDateExtractor)->extract($lines, new DateTimeImmutable('2026-09-11'));
    }

    public static function formats(): array
    {
        return [
            'MM/DD/YYYY' => ['09/04/2026 10:32', '2026-09-04'],
            'MM-DD-YYYY' => ['09-04-2026', '2026-09-04'],
            'MM/DD/YY' => ['09/04/26', '2026-09-04'],
            'YYYY-MM-DD' => ['2026-09-04', '2026-09-04'],
            'YYYY/MM/DD' => ['2026/09/04', '2026-09-04'],
            'Mon DD, YYYY' => ['Sep 4, 2026', '2026-09-04'],
            'Month DD YYYY' => ['September 4 2026', '2026-09-04'],
            'DD Mon YYYY' => ['4 Sep 2026', '2026-09-04'],
            'DD-Mon-YY' => ['04-Sep-26', '2026-09-04'],
            'DD MONTH YYYY' => ['05 SEPTEMBER 2026', '2026-09-05'],
        ];
    }

    #[DataProvider('formats')]
    public function test_supported_formats_are_normalized_to_iso(string $line, string $expected): void
    {
        $this->assertSame($expected, $this->extract(['RICE 45.00', $line]));
    }

    public function test_impossible_future_and_ancient_dates_are_rejected(): void
    {
        $this->assertNull($this->extract(['02/30/2026']));
        $this->assertNull($this->extract(['09/13/2026']));
        $this->assertNull($this->extract(['01/01/1999']));
        $this->assertSame('2026-09-12', $this->extract(['09/12/2026']));
    }

    public function test_a_labelled_date_line_wins_over_an_earlier_unlabelled_date(): void
    {
        $this->assertSame('2026-09-03', $this->extract(['EXP 08/01/2026', 'DATE: 09/03/2026', 'TXN 09/02/2026']));
        $this->assertSame('2026-08-01', $this->extract(['EXP 08/01/2026', 'RICE 45.00']));
    }

    public function test_receipt_identifiers_and_missing_dates_yield_null(): void
    {
        $this->assertNull($this->extract([
            'VAT Registered TIN 004-272-277-006', 'MIN 24110709270607709', 'Serial #3JKHG04', 'Total P608.50',
        ]));
        $this->assertNull($this->extract([]));
    }
}
