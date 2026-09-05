<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptMerchantMatcher;
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
    }
}
