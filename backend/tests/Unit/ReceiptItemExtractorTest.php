<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptItemExtractor;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ReceiptItemExtractorTest extends TestCase
{
    /** Exact layout of the Gaisano Grand Mall of Antique receipt used for OCR tuning. */
    private const GAISANO = [
        'ITEM QTY PRICE TOTAL',
        '004793487   1   111.75   111.75T',
        'CALLA PWD F/C ROSE GARDEN',
        '004663895   1   27.00   27.00T',
        'COBRA BERRY BLAST 350ML/3',
        '003022126   1   27.50   27.50T',
        'SISTERS NET SIDE NIGHT-US',
        'Total   P608.50',
        'Cash   1,000.00',
        'CHANGE ====> 391.50',
        'Cashier   70033',
        'No Of Items   13',
        'VATable Sales   P543.30',
    ];

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

    public function test_pos_layout_pairs_sku_rows_with_the_next_name_line(): void
    {
        $items = (new ReceiptItemExtractor)->analyze(self::GAISANO, true)['items'];

        $this->assertSame(
            ['CALLA PWD F/C ROSE GARDEN', 'COBRA BERRY BLAST 350ML/3', 'SISTERS NET SIDE NIGHT-US'],
            array_column($items, 'item_name'),
        );
        $this->assertSame([111.75, 27.0, 27.5], array_column($items, 'observed_price'));
        $this->assertSame([1.0, 1.0, 1.0], array_column($items, 'quantity'));
        $this->assertSame("004793487   1   111.75   111.75T\nCALLA PWD F/C ROSE GARDEN", $items[0]['raw_text']);
        foreach (['TOTAL', 'CASH', 'CHANGE', 'CASHIER', 'NO OF ITEMS', 'VATABLE'] as $footer) {
            foreach ($items as $item) {
                $this->assertStringNotContainsStringIgnoringCase($footer, $item['item_name']);
            }
        }
    }

    public function test_default_mode_keeps_todays_output_for_the_pos_layout(): void
    {
        $items = (new ReceiptItemExtractor)->extract(self::GAISANO);

        $this->assertSame(['VATable Sales'], array_column($items, 'item_name'));
        $this->assertSame([543.3], array_column($items, 'observed_price'));
    }

    public static function flagSuffixes(): array
    {
        return array_combine(
            ['T', 'V', 'X', 'Z', 'E', 'I', 'l', '|', '7', '1'],
            array_map(fn ($flag) => [$flag], ['T', 'V', 'X', 'Z', 'E', 'I', 'l', '|', '7', '1']),
        );
    }

    #[DataProvider('flagSuffixes')]
    public function test_every_vat_flag_form_parses_on_the_two_line_layout(string $flag): void
    {
        $items = (new ReceiptItemExtractor)->analyze(["004793487 1 111.75 111.75{$flag}", 'CALLA PWD F/C ROSE GARDEN'], true)['items'];

        $this->assertCount(1, $items);
        $this->assertSame('CALLA PWD F/C ROSE GARDEN', $items[0]['item_name']);
        $this->assertSame(111.75, $items[0]['observed_price']);
    }

    public function test_flag_stripping_never_alters_a_genuine_two_decimal_price(): void
    {
        $items = (new ReceiptItemExtractor)->analyze(['RICE 12.50', 'SUGAR 45.00T'], true)['items'];

        $this->assertSame([12.5, 45.0], array_column($items, 'observed_price'));
        $this->assertSame(['RICE', 'SUGAR'], array_column($items, 'item_name'));
    }

    public static function nonPosRows(): array
    {
        return [
            'double flag' => ['004793487 1 111.75 111.75TT'],
            'letter inside the SKU' => ['00479A487 1 111.75 111.75T'],
            'letter-bearing prefix' => ['QTY 1 111.75 111.75T'],
        ];
    }

    #[DataProvider('nonPosRows')]
    public function test_rows_failing_the_letter_free_signature_are_never_paired(string $row): void
    {
        $items = (new ReceiptItemExtractor)->analyze([$row, 'CALLA PWD F/C ROSE GARDEN'], true)['items'];

        $this->assertNotContains('CALLA PWD F/C ROSE GARDEN', array_column($items, 'item_name'));
    }

    public function test_orphan_row_after_a_merchant_header_is_rejected_and_the_header_is_never_an_item(): void
    {
        $analysis = (new ReceiptItemExtractor)->analyze(['GAISANO GRAND MALL', '004793487 1 111.75 111.75T', 'Total P111.75'], true);

        $this->assertSame([], $analysis['items']);
        $this->assertSame(['004793487 1 111.75 111.75T'], $analysis['rejected_lines']);
    }

    public static function ineligibleNextLines(): array
    {
        return [
            'TIN line' => ['VAT Registered TIN 004-272-277-006'],
            'serial line' => ['Serial #3JKHG04'],
            'date line' => ['09/11/2026 10:32 AM'],
            'closing text' => ['THANK YOU FOR SHOPPING'],
            'address' => ['BAGUMBAYAN, SAN JOSE, ANTIQUE 5700'],
            'promotion' => ['PROMO BUY ONE TAKE ONE'],
            'textual date' => ['11 Sep 2026'],
            'long textual date' => ['September 11 2026'],
            'merchant header' => ['GAISANO GRAND MALL'],
            'company header' => ["DYNASTY MGMT. AND DEV'T CORP."],
        ];
    }

    public function test_pos_row_is_not_paired_with_a_line_naming_the_known_merchant(): void
    {
        $lines = ['004793487 1 111.75 111.75T', 'GAISANO GRAND ANTIQUE'];

        $this->assertSame([], (new ReceiptItemExtractor)->analyze($lines, true, ['Gaisano Grand Mall of Antique'])['items']);
        $this->assertSame(['GAISANO GRAND ANTIQUE'], array_column((new ReceiptItemExtractor)->analyze($lines, true)['items'], 'item_name'));
    }

    #[DataProvider('ineligibleNextLines')]
    public function test_pos_row_is_not_paired_with_non_product_text(string $next): void
    {
        $items = (new ReceiptItemExtractor)->analyze(['004793487 1 111.75 111.75T', $next], true)['items'];

        $this->assertSame([], $items);
    }

    public function test_non_pos_numeric_lines_are_never_paired_with_a_following_name(): void
    {
        $analysis = (new ReceiptItemExtractor)->analyze(['70033', 'CALLA PWD F/C ROSE GARDEN', '13', 'COBRA BERRY', '49.75', 'SISTERS NET'], true);

        $this->assertSame([], $analysis['items']);
        $this->assertSame(['49.75'], $analysis['rejected_lines']);
    }

    public function test_ocr_damaged_sku_rows_and_short_noise_names_are_rejected_in_pos_layout(): void
    {
        $lines = ['003644049 i 15.50 15.501', 'POS HYDRATING GLOW (GREEN', 'Te 30,501', 'EGG 9.00'];

        $analysis = (new ReceiptItemExtractor)->analyze($lines, true);

        $this->assertSame(['EGG'], array_column($analysis['items'], 'item_name'));
        $this->assertSame(['003644049 i 15.50 15.501', 'Te 30,501'], $analysis['rejected_lines']);
        // Default mode keeps today's one-letter minimum.
        $this->assertSame(['Te', 'EGG'], array_column((new ReceiptItemExtractor)->extract(['Te 30.50', 'EGG 9.00']), 'item_name'));
    }
}
