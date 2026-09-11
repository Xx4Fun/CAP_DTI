<?php

namespace Tests\Unit;

use App\Services\Receipt\Extraction\ReceiptExtractionSchema;
use App\Services\Receipt\Extraction\ReceiptExtractionValidator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReceiptExtractionValidatorTest extends TestCase
{
    /** A full-schema extraction payload with overridable parts. */
    public static function payload(array $overrides = []): array
    {
        $base = [
            'evidence' => ['legibility' => 'clear', 'is_receipt' => true, 'problems' => [], 'total_region_visible' => true],
            'merchant' => ['text' => 'GAISANO GRAND MALL OF ANTIQUE', 'uncertain' => false],
            'transaction_date' => ['text' => '09/10/2026 14:05', 'uncertain' => false],
            'receipt_number' => ['text' => 'OR 000123', 'uncertain' => false],
            'items' => [
                self::item('CALLA PWD F/C ROSE GARDEN', '1', '111.75', '111.75', ['004793487 1 111.75 111.75T', 'CALLA PWD F/C ROSE GARDEN']),
                self::item('COBRA BERRY BLAST 350ML/3', '2', '27.00', '54.00', ['004663895 2 27.00 54.00T', 'COBRA BERRY BLAST 350ML/3']),
            ],
            'subtotal' => ['amount' => null, 'source_line' => null, 'uncertain' => false],
            'discounts' => [],
            'adjustments' => [],
            'total' => ['amount' => '165.75', 'source_line' => 'Total P165.75', 'uncertain' => false],
            'sections' => [['index' => 1, 'overlaps_previous' => 'unknown']],
        ];

        return array_replace($base, $overrides);
    }

    public static function item(?string $name, ?string $qty, ?string $unit, ?string $line, array $source, int $section = 1, array $uncertain = [], ?int $duplicateOf = null): array
    {
        return ['raw_description' => $name, 'quantity' => $qty, 'unit_price' => $unit, 'line_total' => $line,
            'source_lines' => $source, 'section' => $section, 'uncertain_fields' => $uncertain, 'possible_duplicate_of' => $duplicateOf];
    }

    private function validate(array $payload, array $context = []): array
    {
        $this->assertTrue(ReceiptExtractionSchema::isValid($payload), 'fixture must match the schema');

        return (new ReceiptExtractionValidator)->validate($payload, $context + ['store_name' => 'Gaisano Grand Mall of Antique', 'frame_count' => 1]);
    }

    private function codes(array $result): array
    {
        return array_column($result['warnings'], 'code');
    }

    public function test_clear_consistent_extraction_is_ready_with_backend_reconciliation(): void
    {
        $result = $this->validate(self::payload());

        $this->assertSame('ready', $result['status']);
        $this->assertSame(['CALLA PWD F/C ROSE GARDEN', 'COBRA BERRY BLAST 350ML/3'], array_column($result['items'], 'item_name'));
        $this->assertSame([111.75, 54.0], array_column($result['items'], 'line_total'));
        $this->assertSame([111.75, 27.0], array_column($result['items'], 'unit_price'));
        $this->assertSame([111.75, 54.0], array_column($result['items'], 'observed_price'));
        $this->assertSame([null, null], array_column($result['items'], 'ocr_confidence'));
        $this->assertSame("004793487 1 111.75 111.75T\nCALLA PWD F/C ROSE GARDEN", $result['items'][0]['raw_text']);
        $this->assertSame(165.75, $result['detected_total']);
        $this->assertSame('matched', $result['reconciliation']['status']);
        $this->assertSame('2026-09-10', $result['transaction_date']);
        $this->assertSame('OR 000123', $result['receipt_number']);
        $this->assertSame('matched', $result['merchant']['status']);
        $this->assertSame('GAISANO GRAND MALL OF ANTIQUE', $result['merchant']['display_name']);
        $this->assertSame([], $this->codes($result));
        $this->assertFalse($result['manual_review_required']);
        $this->assertSame(['status' => 'not_assessed', 'continuity_score' => null, 'reasons' => []], $result['continuity']);
    }

    public function test_unparseable_values_become_null_and_uncertain_without_being_guessed(): void
    {
        $payload = self::payload(['items' => [self::item('RICE 1KG', 'two', '45.0', '45.00', ['RICE 1KG 45.00'])],
            'total' => ['amount' => '45.00', 'source_line' => 'TOTAL 45.00', 'uncertain' => false]]);

        $result = $this->validate($payload);

        $this->assertNull($result['items'][0]['quantity']);
        $this->assertNull($result['items'][0]['unit_price']);
        $this->assertSame(['quantity', 'unit_price'], $result['items'][0]['uncertain_fields']);
        $this->assertContains('FIELDS_UNCERTAIN', $this->codes($result));
    }

    public function test_values_missing_from_the_cited_source_lines_are_flagged_uncertain(): void
    {
        $payload = self::payload(['items' => [self::item('SARDINES 155G', '1', '35.00', '35.00', ['000333444 1 30.00 30.00T', 'SARDINES 155G'])],
            'total' => ['amount' => '35.00', 'source_line' => 'TOTAL 35.00', 'uncertain' => false]]);

        $result = $this->validate($payload);

        $this->assertSame(['line_total'], $result['items'][0]['uncertain_fields']);
        $this->assertSame('inconsistent_source', $result['item_flags'][0]['line_total']);
    }

    public function test_negative_line_becomes_a_discount_not_an_item(): void
    {
        $payload = self::payload(['items' => [
            self::item('RICE 1KG', '1', '100.00', '100.00', ['RICE 1KG 100.00']),
            self::item('PROMO DISC', null, null, '-10.00', ['PROMO DISC -10.00']),
        ], 'total' => ['amount' => '90.00', 'source_line' => 'TOTAL 90.00', 'uncertain' => false]]);

        $result = $this->validate($payload);

        $this->assertSame(['RICE 1KG'], array_column($result['items'], 'item_name'));
        $this->assertSame('10.00', $result['discounts'][0]['amount']);
        $this->assertSame('matched', $result['reconciliation']['checks']['expected_vs_total']);
    }

    public static function nonProductDescriptions(): array
    {
        return [['VATable Sales'], ['Cashier 70033'], ['TIN 004-272-277-006'], ['09/10/2026'], ['BAGUMBAYAN, SAN JOSE, ANTIQUE 5700'], ['THANK YOU']];
    }

    #[DataProvider('nonProductDescriptions')]
    public function test_header_footer_and_identifier_lines_are_never_items(string $description): void
    {
        $payload = self::payload(['items' => [self::item($description, null, null, '10.00', [$description.' 10.00'])],
            'total' => ['amount' => null, 'source_line' => null, 'uncertain' => false]]);

        $result = $this->validate($payload);

        $this->assertSame([], $result['items']);
        $this->assertNotEmpty($result['rejected_item_lines']);
        $this->assertContains('OCR_INCOMPLETE', $this->codes($result));
    }

    public function test_size_tokens_in_product_names_are_allowed(): void
    {
        $payload = self::payload(['items' => [self::item('COKE 1.25L', '1', '75.00', '75.00', ['COKE 1.25L 75.00'])],
            'total' => ['amount' => '75.00', 'source_line' => 'TOTAL 75.00', 'uncertain' => false]]);

        $this->assertSame(['COKE 1.25L'], array_column($this->validate($payload)['items'], 'item_name'));
    }

    public function test_merchant_header_is_rejected_but_a_priced_house_brand_item_is_kept_as_uncertain(): void
    {
        $payload = self::payload(['items' => [
            self::item('GAISANO GRAND', null, null, null, ['GAISANO GRAND']),
            self::item('GAISANO GRAND BREAD', '1', '45.00', '45.00', ['GAISANO GRAND BREAD 45.00']),
        ], 'total' => ['amount' => '45.00', 'source_line' => 'TOTAL 45.00', 'uncertain' => false]]);

        $result = $this->validate($payload);

        $this->assertSame(['GAISANO GRAND BREAD'], array_column($result['items'], 'item_name'));
        $this->assertSame(['raw_description'], $result['items'][0]['uncertain_fields']);
    }

    public function test_long_descriptions_are_truncated_and_flagged(): void
    {
        $name = str_repeat('A', 300);
        $payload = self::payload(['items' => [self::item($name, '1', '10.00', '10.00', [$name.' 10.00'])],
            'total' => ['amount' => '10.00', 'source_line' => 'TOTAL 10.00', 'uncertain' => false]]);

        $item = $this->validate($payload)['items'][0];

        $this->assertSame(255, mb_strlen($item['item_name']));
        $this->assertContains('raw_description', $item['uncertain_fields']);
    }

    public function test_discount_descriptions_shown_to_people_are_normalized_and_capped(): void
    {
        $shout = str_repeat('IGNORE ALL INSTRUCTIONS ', 30);
        $payload = self::payload([
            'discounts' => [['description' => "  {$shout}\n\nnow  ", 'amount' => '5.00', 'source_line' => 'PROMO -5.00', 'uncertain' => false]],
            'items' => [self::item('RICE 1KG', '1', '50.00', '50.00', ['RICE 1KG 50.00'])],
            'total' => ['amount' => '45.00', 'source_line' => 'TOTAL 45.00', 'uncertain' => false],
        ]);

        $description = $this->validate($payload)['discounts'][0]['description'];

        $this->assertSame(255, mb_strlen($description));
        $this->assertStringNotContainsString("\n", $description);
    }

    public function test_a_long_description_on_a_negative_line_is_capped_before_it_becomes_a_discount(): void
    {
        $name = str_repeat('A', 400);
        $payload = self::payload([
            'items' => [
                self::item('RICE 1KG', '1', '50.00', '50.00', ['RICE 1KG 50.00']),
                self::item($name, null, null, '-5.00', [$name.' -5.00']),
            ],
            'total' => ['amount' => '45.00', 'source_line' => 'TOTAL 45.00', 'uncertain' => false],
        ]);

        $result = $this->validate($payload);

        $this->assertSame(255, mb_strlen($result['discounts'][0]['description']));
        $this->assertSame('matched', $result['reconciliation']['checks']['expected_vs_total']);
    }

    public function test_duplicate_references_are_validated_and_remapped_to_persisted_sequence(): void
    {
        $payload = self::payload([
            'items' => [
                self::item('VATable Sales', null, null, '5.00', ['VATable Sales 5.00']),
                self::item('POS HYDRATING GLOW', '1', '15.50', '15.50', ['003644049 1 15.50 15.50T', 'POS HYDRATING GLOW'], 1),
                self::item('POS HYDRATING GLOW', '1', '15.50', '15.50', ['003644049 1 15.50 15.50T', 'POS HYDRATING GLOW'], 2, [], 1),
                self::item('RICE 1KG', '1', '45.00', '45.00', ['RICE 1KG 45.00'], 2, [], 3),
            ],
            'sections' => [['index' => 1, 'overlaps_previous' => 'unknown'], ['index' => 2, 'overlaps_previous' => 'yes']],
            'total' => ['amount' => '76.00', 'source_line' => 'TOTAL 76.00', 'uncertain' => false],
        ]);

        $result = $this->validate($payload, ['frame_count' => 2]);

        $this->assertSame([0, 1, 2], array_column($result['items'], 'sequence'));
        $this->assertSame([null, 0, null], array_column($result['items'], 'possible_duplicate_of'));
        $this->assertContains('raw_description', $result['items'][2]['uncertain_fields']);
        $this->assertContains('POSSIBLE_DUPLICATE_LINES', $this->codes($result));
        $this->assertTrue($result['reconciliation']['duplicates_are_likely_genuine']);
    }

    public function test_date_is_parsed_deterministically_from_the_printed_text(): void
    {
        $this->assertNull($this->validate(self::payload(['transaction_date' => ['text' => '13/45/2026', 'uncertain' => false]]))['transaction_date']);
        $this->assertSame('2026-09-04', $this->validate(self::payload(['transaction_date' => ['text' => 'Sep 4, 2026', 'uncertain' => false]]))['transaction_date']);
    }

    public function test_missing_merchant_and_total_stay_null_and_are_never_filled_from_the_store_record(): void
    {
        $result = $this->validate(self::payload([
            'merchant' => ['text' => null, 'uncertain' => true],
            'total' => ['amount' => null, 'source_line' => null, 'uncertain' => true],
        ]));

        $this->assertNull($result['merchant']['display_name']);
        $this->assertNotSame('matched', $result['merchant']['status']);
        $this->assertNull($result['detected_total']);
        $this->assertContains('TOTAL_NOT_FOUND', $this->codes($result));
        $this->assertContains('STORE_NOT_CONFIRMED', $this->codes($result));
    }

    public function test_arithmetic_mismatch_is_a_warning_not_a_rejection(): void
    {
        $result = $this->validate(self::payload(['total' => ['amount' => '999.00', 'source_line' => 'TOTAL 999.00', 'uncertain' => false]]));

        $this->assertSame('ready', $result['status']);
        $this->assertSame('mismatch', $result['reconciliation']['status']);
        $this->assertContains('TOTAL_MISMATCH', $this->codes($result));
    }

    public static function recaptureDecisions(): array
    {
        return [
            'not a receipt' => [['legibility' => 'clear', 'is_receipt' => false, 'problems' => [], 'total_region_visible' => null], true, true, 'needs_recapture', 'INSUFFICIENT_FRAMES'],
            'unreadable with nothing usable' => [['legibility' => 'unreadable', 'is_receipt' => true, 'problems' => ['blurry'], 'total_region_visible' => null], false, false, 'needs_recapture', 'TEXT_UNREADABLE'],
            'total cut off and unreadable' => [['legibility' => 'clear', 'is_receipt' => true, 'problems' => ['cropped_bottom'], 'total_region_visible' => false], true, false, 'needs_recapture', 'RECEIPT_INCOMPLETE'],
            'unreadable but items readable' => [['legibility' => 'unreadable', 'is_receipt' => true, 'problems' => ['glare'], 'total_region_visible' => true], true, false, 'ready', null],
            'partially readable' => [['legibility' => 'partially_readable', 'is_receipt' => true, 'problems' => ['crumpled'], 'total_region_visible' => true], true, true, 'ready', null],
        ];
    }

    #[DataProvider('recaptureDecisions')]
    public function test_ordered_recapture_decision_table(array $evidence, bool $withItems, bool $withTotal, string $status, ?string $reason): void
    {
        $payload = self::payload([
            'evidence' => $evidence,
            'items' => $withItems ? self::payload()['items'] : [],
            'total' => $withTotal ? self::payload()['total'] : ['amount' => null, 'source_line' => null, 'uncertain' => true],
        ]);

        $result = $this->validate($payload);

        $this->assertSame($status, $result['status']);
        $this->assertSame($reason, $result['reason_code']);
    }

    public function test_repeated_recapture_for_the_same_reason_becomes_reviewable_with_a_warning(): void
    {
        $payload = self::payload(['evidence' => ['legibility' => 'clear', 'is_receipt' => true, 'problems' => ['cropped_bottom'], 'total_region_visible' => false],
            'total' => ['amount' => null, 'source_line' => null, 'uncertain' => true]]);

        $first = $this->validate($payload, ['prior_recapture_reasons' => ['RECEIPT_INCOMPLETE']]);
        $third = $this->validate($payload, ['prior_recapture_reasons' => ['RECEIPT_INCOMPLETE', 'RECEIPT_INCOMPLETE']]);

        $this->assertSame('needs_recapture', $first['status']);
        $this->assertSame('ready', $third['status']);
        $this->assertContains('RECEIPT_INCOMPLETE', $this->codes($third));
    }

    public function test_multi_section_without_overlap_warns_incomplete_scan(): void
    {
        $result = $this->validate(self::payload(['sections' => [['index' => 1, 'overlaps_previous' => 'unknown'], ['index' => 2, 'overlaps_previous' => 'no']]]), ['frame_count' => 2]);

        $this->assertSame('ready', $result['status']);
        $this->assertContains('INCOMPLETE_SCAN', $this->codes($result));
    }

    public function test_first_section_and_single_photo_overlap_answers_never_warn_incomplete_scan(): void
    {
        $firstSection = $this->validate(self::payload(['sections' => [['index' => 1, 'overlaps_previous' => 'no'], ['index' => 2, 'overlaps_previous' => 'yes']]]), ['frame_count' => 2]);
        $singlePhoto = $this->validate(self::payload(['sections' => [['index' => 1, 'overlaps_previous' => 'no']]]));

        $this->assertNotContains('INCOMPLETE_SCAN', $this->codes($firstSection));
        $this->assertNotContains('INCOMPLETE_SCAN', $this->codes($singlePhoto));
        $this->assertSame([], $this->codes($singlePhoto));
    }

    public static function flaggedEvidence(): array
    {
        return [
            'problem listed' => [['legibility' => 'clear', 'is_receipt' => true, 'problems' => ['glare'], 'total_region_visible' => true]],
            'partially readable' => [['legibility' => 'partially_readable', 'is_receipt' => true, 'problems' => [], 'total_region_visible' => true]],
            'total read from an invisible region' => [['legibility' => 'clear', 'is_receipt' => true, 'problems' => [], 'total_region_visible' => false]],
        ];
    }

    #[DataProvider('flaggedEvidence')]
    public function test_values_from_flagged_evidence_always_require_manual_review(array $evidence): void
    {
        $result = $this->validate(self::payload(['evidence' => $evidence]));

        $this->assertSame('ready', $result['status']);
        $this->assertContains('EVIDENCE_QUALITY', $this->codes($result));
        $this->assertTrue($result['manual_review_required']);
    }

    public function test_out_of_range_sections_are_clamped_and_flagged(): void
    {
        $payload = self::payload(['items' => [self::item('RICE 1KG', '1', '45.00', '45.00', ['RICE 1KG 45.00'], 7)],
            'total' => ['amount' => '45.00', 'source_line' => 'TOTAL 45.00', 'uncertain' => false]]);

        $result = $this->validate($payload, ['frame_count' => 2]);

        $this->assertSame(2, $result['items'][0]['section']);
        $this->assertSame('invalid_section', $result['item_flags'][0]['raw_description']);
    }

    public function test_duplicate_reference_to_an_unrelated_line_is_rejected(): void
    {
        $payload = self::payload([
            'items' => [
                self::item('SARDINES 155G', '1', '30.00', '30.00', ['SARDINES 155G 30.00'], 1),
                self::item('RICE 1KG', '1', '45.00', '45.00', ['RICE 1KG 45.00'], 2, [], 0),
            ],
            'sections' => [['index' => 1, 'overlaps_previous' => 'unknown'], ['index' => 2, 'overlaps_previous' => 'yes']],
            'total' => ['amount' => '75.00', 'source_line' => 'TOTAL 75.00', 'uncertain' => false],
        ]);

        $result = $this->validate($payload, ['frame_count' => 2]);

        $this->assertNull($result['items'][1]['possible_duplicate_of']);
        $this->assertSame('invalid_duplicate_reference', $result['item_flags'][1]['raw_description']);
        $this->assertSame('matched', $result['reconciliation']['status']);
    }

    public static function malformedPayloads(): array
    {
        $item = self::item('RICE 1KG', '1', '45.00', '45.00', ['RICE 1KG 45.00']);

        return [
            'non-string source line' => [['items' => [[...$item, 'source_lines' => [['nested']]]]]],
            'non-string uncertain field' => [['items' => [[...$item, 'uncertain_fields' => [1]]]]],
            'numeric item amount' => [['items' => [[...$item, 'line_total' => 45.0]]]],
            'string duplicate reference' => [['items' => [[...$item, 'possible_duplicate_of' => '0']]]],
            'missing duplicate reference' => [['items' => [array_diff_key($item, ['possible_duplicate_of' => true])]]],
            'numeric discount amount' => [['discounts' => [['description' => 'PROMO', 'amount' => 10, 'source_line' => null, 'uncertain' => false]]]],
            'unknown adjustment kind' => [['adjustments' => [['kind' => 'tip', 'direction' => 'add', 'amount' => '1.00', 'source_line' => null, 'uncertain' => false]]]],
            'numeric total' => [['total' => ['amount' => 165.75, 'source_line' => null, 'uncertain' => false]]],
            'non-string evidence problem' => [['evidence' => ['legibility' => 'clear', 'is_receipt' => true, 'problems' => [true], 'total_region_visible' => true]]],
            'object items' => [['items' => ['first' => $item]]],
        ];
    }

    #[DataProvider('malformedPayloads')]
    public function test_schema_check_rejects_malformed_elements(array $overrides): void
    {
        $this->assertFalse(ReceiptExtractionSchema::isValid(self::payload($overrides)));
    }

    public function test_subtotal_and_total_uncertainty_is_exposed(): void
    {
        // An unparseable subtotal the model did not flag must still require review.
        $misread = $this->validate(self::payload([
            'subtotal' => ['amount' => '16S.75', 'source_line' => 'SUBTOTAL 16S.75', 'uncertain' => false],
        ]));

        $this->assertNull($misread['subtotal']);
        $this->assertTrue($misread['subtotal_uncertain']);
        $this->assertFalse($misread['total_uncertain']);
        $this->assertContains('FIELDS_UNCERTAIN', $this->codes($misread));
        $this->assertTrue($misread['manual_review_required']);

        $flagged = $this->validate(self::payload(['total' => ['amount' => '165.75', 'source_line' => 'Total P165.75', 'uncertain' => true]]));
        $this->assertSame('165.75', $flagged['total']);
        $this->assertTrue($flagged['total_uncertain']);
        $this->assertContains('FIELDS_UNCERTAIN', $this->codes($flagged));
    }
}
