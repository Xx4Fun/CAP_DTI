<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptMerchantMatcher;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ReceiptMerchantMatcherTest extends TestCase
{
    public function test_matches_store_name_or_registered_owner_from_header_lines(): void
    {
        $matcher = new ReceiptMerchantMatcher;

        $this->assertSame('matched', $matcher->match('Juan Grocery Store', 'Juan Dela Cruz', [
            'JUAN GROCERY - SAN JOSE BRANCH', 'TIN 123-456',
        ])['status']);
        $this->assertSame('matched', $matcher->match('Barangay Mart', 'Juan Dela Cruz', [
            'JUAN DELA CRUZ', 'OFFICIAL RECEIPT',
        ])['status']);
    }

    public function test_does_not_guess_a_merchant_from_item_lines(): void
    {
        $result = (new ReceiptMerchantMatcher)->match('Receipt Test Mart', 'Test Owner', [
            'PREMIUM RICE 45.00', 'BROWN SUGAR 70.50',
        ]);

        $this->assertSame('unverified', $result['status']);
        $this->assertNull($result['display_name']);
    }

    public function test_exposes_only_one_actual_unambiguous_matching_header_line(): void
    {
        $matcher = new ReceiptMerchantMatcher;

        $matched = $matcher->match('Juan Grocery Store', null, ['JUAN GROCERY - SAN JOSE BRANCH', 'OFFICIAL RECEIPT']);
        $ambiguous = $matcher->match('Juan Grocery Store', null, ['JUAN GROCERY', 'JUAN STORE']);

        $this->assertSame('JUAN GROCERY - SAN JOSE BRANCH', $matched['display_name']);
        $this->assertNull($ambiguous['display_name']);
        // The same header read from two receipt sections is still one name.
        $this->assertSame('PUREGOLD', $matcher->match('Puregold', null, ['PUREGOLD', 'PUREGOLD'])['display_name']);
    }

    public static function receiptShortcuts(): array
    {
        return [
            'short brand with store type' => ['SM Supermarket', null, ['SM SUPERMARKET - ANTIQUE']],
            'abbreviated store type' => ['SM Supermarket', null, ['SM SUPERMKT']],
            'acronym and abbreviations' => ['Juan Dela Cruz General Merchandise', null, ['JDC GEN. MDSE']],
            'company acronym' => ['Robinsons Supermarket Corporation', null, ['RSC']],
            'split brand and legal suffix' => ['Puregold Price Club', null, ['PURE GOLD PRICE CLUB INC.']],
            'one-character OCR slip' => ['Puregold Price Club', null, ['PUREG0LD PRICE CLUB']],
            'apostrophe and abbreviation' => ["Robinson's Supermarket", null, ['ROBINSONS SUPERMKT']],
            'alphanumeric short name' => ['X12 Store', null, ['| X12 |']],
            'boilerplate word with store type' => ['Sales Store', null, ['SALES STORE ANTIQUE']],
            'accented name' => ['Peña Enterprises', null, ['PEÑA ENTERPRISES']],
        ];
    }

    #[DataProvider('receiptShortcuts')]
    public function test_matches_shortened_store_names(string $store, ?string $owner, array $header): void
    {
        $this->assertSame('matched', (new ReceiptMerchantMatcher)->match($store, $owner, $header)['status']);
    }

    public static function differentStores(): array
    {
        return [
            'different brand' => ['Puregold Price Club', null, ['MERCURY DRUG CORP'], 'mismatch'],
            'short brand inside a longer word' => ['SM Supermarket', null, ['SMART PHARMACY'], 'mismatch'],
            'same store type only' => ['SM Supermarket', null, ['WALTERMART SUPERMARKET'], 'mismatch'],
            'short brand without store type, also via owner' => ['SM Supermarket', 'SM Retail Inc', ['SM DEPARTMENT STORE'], 'mismatch'],
            'brand and store type on different lines' => ['SM Supermarket', null, ['WALTERMART SUPERMARKET', 'POS ID SM'], 'mismatch'],
            'generic-only name' => ['Supermarket', null, ['NCCC SUPERMARKET'], 'mismatch'],
            'brand inside a longer word' => ['Metro Market', null, ['METROPOLIS CAFE'], 'mismatch'],
            'store name made of boilerplate' => ['Sales Store', null, ['SALES INVOICE'], 'unverified'],
            'boilerplate is not an acronym' => ['Valley Agri Trading', null, ['VAT REG TIN 123-456-789'], 'unverified'],
            'official receipt' => ['Puregold Price Club', null, ['OFFICIAL RECEIPT'], 'unverified'],
            'sales invoice' => ['Puregold Price Club', null, ['SALES INVOICE'], 'unverified'],
            'brand only, rest of name missing' => ['Puregold Price Club', null, ['PUREGOLD'], 'unverified'],
        ];
    }

    #[DataProvider('differentStores')]
    public function test_does_not_match_a_different_store_or_boilerplate(string $store, ?string $owner, array $header, string $status): void
    {
        $this->assertSame($status, (new ReceiptMerchantMatcher)->match($store, $owner, $header)['status']);
    }
}
