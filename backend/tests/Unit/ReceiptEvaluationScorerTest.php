<?php

namespace Tests\Unit;

use App\Services\Receipt\Evaluation\ReceiptEvaluationScorer;
use PHPUnit\Framework\TestCase;

class ReceiptEvaluationScorerTest extends TestCase
{
    private function expected(array $overrides = []): array
    {
        return array_replace([
            'status' => 'ready',
            'merchant' => 'PROBE TEST MART',
            'transaction_date' => '2026-09-10',
            'items' => [
                ['name' => 'RICE 1KG', 'quantity' => '1', 'unit_price' => '45.00', 'line_total' => '45.00'],
                ['name' => 'SARDINES 155G', 'quantity' => '2', 'unit_price' => '35.00', 'line_total' => '70.00'],
                ['name' => 'CANDY', 'quantity' => '1', 'unit_price' => '12.50', 'line_total' => '12.50'],
            ],
            'total' => '127.50',
            'other_amounts' => ['200.00', '72.50'],
        ], $overrides);
    }

    private static function item(?string $name, ?float $quantity, ?float $unit, ?float $line, ?int $duplicateOf = null): array
    {
        return ['item_name' => $name, 'quantity' => $quantity, 'unit_price' => $unit, 'line_total' => $line, 'possible_duplicate_of' => $duplicateOf];
    }

    private function extraction(array $overrides = []): array
    {
        return array_replace([
            'status' => 'ready',
            'reason_code' => null,
            'items' => [self::item('RICE 1KG', 1, 45.0, 45.0), self::item('SARDINES 155G', 2, 35.0, 70.0), self::item('CANDY', 1, 12.5, 12.5)],
            'total' => '127.50',
            'subtotal' => null,
            'discounts' => [],
            'merchant' => ['display_name' => 'PROBE TEST MART'],
            'transaction_date' => '2026-09-10',
            'reconciliation' => ['status' => 'matched'],
        ], $overrides);
    }

    public function test_a_faithful_extraction_scores_perfectly(): void
    {
        $score = (new ReceiptEvaluationScorer)->score($this->expected(), $this->extraction());

        $this->assertSame(3, $score['items_paired']);
        $this->assertSame(3, $score['names_exact']);
        $this->assertSame(['correct' => 10, 'wrong' => 0, 'missed' => 0, 'invented' => 0], $score['numeric']);
        $this->assertSame(0, $score['false_items']);
        $this->assertSame([], $score['invented_fields']);
        $this->assertTrue($score['total_correct']);
        $this->assertTrue($score['merchant_correct']);
        $this->assertTrue($score['date_correct']);
        $this->assertTrue($score['status_correct']);
        $this->assertSame([], $score['details']);
    }

    public function test_wrong_missed_and_fabricated_values_are_told_apart(): void
    {
        $score = (new ReceiptEvaluationScorer)->score($this->expected(), $this->extraction(['items' => [
            self::item('RICE 1KG', 1, 45.0, 45.0),
            self::item('SARDINES 155G', 2, 35.0, 78.0),
            self::item('CASH', null, null, 200.0),
            self::item('THANK YOU', null, null, 99.99),
        ]]));

        $this->assertSame(2, $score['items_paired']);
        $this->assertSame(2, $score['false_items']);
        // 45/1/45 + 2/35 correct; 78.00 wrong; CANDY's three values missed; 99.99 is printed nowhere; CASH 200.00 is printed.
        $this->assertSame(['correct' => 6, 'wrong' => 1, 'missed' => 3, 'invented' => 1], $score['numeric']);
        $this->assertContains('item 2 line_total wrong: expected 70.00 got 78.00', $score['details']);
        $this->assertContains('extra line line_total 99.99 is not printed on the receipt', $score['details']);
    }

    public function test_values_for_fields_that_are_not_printed_count_as_invented(): void
    {
        $score = (new ReceiptEvaluationScorer)->score(
            $this->expected(['total' => null, 'transaction_date' => null, 'subtotal' => null]),
            $this->extraction(['total' => '999.99', 'subtotal' => null, 'transaction_date' => '2026-01-01']),
        );

        $this->assertSame(1, $score['numeric']['invented']);
        $this->assertSame(0, $score['numeric']['wrong']);
        $this->assertSame(['transaction_date'], $score['invented_fields']);
        $this->assertNull($score['total_correct']);
    }

    public function test_a_printed_amount_in_the_wrong_field_is_wrong_not_invented(): void
    {
        // 72.50 is printed on the receipt (other_amounts), just not as a subtotal.
        $score = (new ReceiptEvaluationScorer)->score(
            $this->expected(['subtotal' => null]),
            $this->extraction(['subtotal' => '72.50']),
        );

        $this->assertSame(0, $score['numeric']['invented']);
        $this->assertSame(1, $score['numeric']['wrong']);
        $this->assertContains('subtotal wrong: 72.50 is printed on the receipt but not as this value', $score['details']);
    }

    public function test_a_line_total_copied_into_an_unprinted_unit_price_is_invented(): void
    {
        // The per-unit price is what DTI compares to the SRP, so a fabricated one must not be excused as "wrong".
        $expected = $this->expected(['items' => [
            ['name' => 'SARDINES 155G', 'quantity' => '2', 'unit_price' => null, 'line_total' => '70.00'],
        ], 'total' => '70.00']);

        $score = (new ReceiptEvaluationScorer)->score($expected, $this->extraction([
            'items' => [self::item('SARDINES 155G', 2, 70.0, 70.0)],
            'total' => '70.00',
        ]));

        $this->assertSame(1, $score['numeric']['invented']);
        $this->assertSame(0, $score['numeric']['wrong']);
    }

    public function test_an_unreadable_name_never_takes_the_row_that_matches_a_named_line(): void
    {
        $expected = $this->expected([
            'items' => [
                ['name' => null, 'quantity' => '1', 'unit_price' => '15.50', 'line_total' => '15.50'],
                ['name' => 'SOAP', 'quantity' => '1', 'unit_price' => '15.50', 'line_total' => '15.50'],
            ],
            'total' => '31.00',
        ]);

        $score = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['total' => '31.00', 'items' => [
            self::item('SOAP', 1, 15.5, 15.5),
            self::item('RICE 1KG', 1, 15.5, 15.5),
        ]]));

        $this->assertSame(2, $score['items_paired']);
        $this->assertSame(0, $score['false_items']);
        $this->assertSame(0, $score['numeric']['missed']);
    }

    public function test_an_unreadable_name_must_stay_null(): void
    {
        $expected = $this->expected(['items' => [['name' => null, 'quantity' => '1', 'unit_price' => '45.00', 'line_total' => '45.00']], 'total' => '45.00']);

        $guessed = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['items' => [self::item('RICE 1KG', 1, 45.0, 45.0)], 'total' => '45.00']));
        $honest = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['items' => [self::item(null, 1, 45.0, 45.0)], 'total' => '45.00']));

        $this->assertSame(['item 1 name'], $guessed['invented_fields']);
        $this->assertSame([], $honest['invented_fields']);
        $this->assertSame(1, $honest['items_paired']);
    }

    public function test_overlap_duplicates_and_genuine_repeats(): void
    {
        $expected = $this->expected(['items' => [
            ['name' => 'POS HYDRATING GLOW', 'quantity' => '1', 'unit_price' => '15.50', 'line_total' => '15.50'],
            ['name' => 'POS HYDRATING GLOW', 'quantity' => '1', 'unit_price' => '15.50', 'line_total' => '15.50'],
        ], 'total' => '31.00']);

        $score = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['total' => '31.00', 'items' => [
            self::item('POS HYDRATING GLOW', 1, 15.5, 15.5),
            self::item('POS HYDRATING GLOW', 1, 15.5, 15.5, 0),
            self::item('POS HYDRATING GLOW', 1, 15.5, 15.5, 1),
        ]]));

        $this->assertSame(2, $score['items_paired']);
        $this->assertSame(0, $score['false_items']);
        $this->assertSame(1, $score['overlap_lines_flagged']);
        $this->assertSame(1, $score['genuine_lines_flagged']);
    }

    public function test_close_names_pair_and_prefix_names_ignore_an_unreadable_tail(): void
    {
        $expected = $this->expected(['items' => [
            ['name' => 'SARDINES 155G', 'quantity' => '1', 'unit_price' => '35.00', 'line_total' => '35.00'],
            ['name' => 'ESKINOL CLSR CLSSC GLOW', 'name_match' => 'prefix', 'quantity' => '1', 'unit_price' => '49.25', 'line_total' => '49.25'],
        ], 'total' => '84.25']);

        $score = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['total' => '84.25', 'items' => [
            self::item('SARDlNES 155G', 1, 35.0, 35.0),
            self::item('ESKINOL CLSR CLSSC GLOW 7', 1, 49.25, 49.25),
        ]]));

        $this->assertSame(2, $score['items_paired']);
        $this->assertSame(1, $score['names_exact']);
    }

    public function test_discounts_are_matched_as_a_multiset(): void
    {
        $expected = $this->expected(['discounts' => ['7.50'], 'total' => '120.00']);

        $score = (new ReceiptEvaluationScorer)->score($expected, $this->extraction(['total' => '120.00', 'discounts' => [['amount' => '7.50'], ['amount' => '3.00']]]));

        $this->assertSame(1, $score['numeric']['invented']);
        $this->assertContains('discount 3.00 is not printed on the receipt', $score['details']);
    }

    public function test_aggregate_reports_targets_latency_and_cost(): void
    {
        $scorer = new ReceiptEvaluationScorer;
        $perfect = $scorer->score($this->expected(), $this->extraction());
        $partial = $scorer->score($this->expected(), $this->extraction(['items' => [self::item('RICE 1KG', 1, 45.0, 45.0)], 'total' => '45.00']));

        $metrics = $scorer->aggregate([
            ['categories' => ['clean'], 'sections' => 1, 'failure' => null, 'duration_ms' => 9000, 'usage' => ['input_tokens' => 1000000, 'output_tokens' => 100000], 'score' => $perfect],
            ['categories' => ['faded_thermal'], 'sections' => 2, 'failure' => null, 'duration_ms' => 41000, 'usage' => [], 'score' => $partial],
            ['categories' => ['clean'], 'sections' => 1, 'failure' => 'GEMINI_RATE_LIMITED', 'duration_ms' => null, 'usage' => [], 'score' => null],
        ]);

        $this->assertSame(3, $metrics['runs']);
        $this->assertSame(2, $metrics['scored_runs']);
        $this->assertSame(['GEMINI_RATE_LIMITED' => 1], $metrics['failures']);
        $this->assertSame(1.0, $metrics['item_recall_clean']);
        $this->assertSame(round(4 / 6, 4), $metrics['item_recall']);
        $this->assertSame(0.5, $metrics['total_accuracy']);
        $this->assertSame(9000, $metrics['single_section_p95_ms']);
        $this->assertSame(41000, $metrics['latency_p95_ms']);
        $this->assertSame(1.125, $metrics['estimated_cost_usd']);
        // 13 correct + 1 wrong returned out of 20 printed values: a model that stays silent cannot pass.
        $this->assertSame(0.7, $metrics['numeric_completeness']);
        $this->assertFalse($metrics['targets']['numeric_completeness']['met']);
        $this->assertTrue($metrics['targets']['item_recall_clean']['met']);
        $this->assertFalse($metrics['targets']['total_accuracy']['met']);
        $this->assertTrue($metrics['targets']['invented_values']['met']);
    }

    public function test_aggregate_without_scored_runs_reports_no_data(): void
    {
        $metrics = (new ReceiptEvaluationScorer)->aggregate([['failure' => 'GEMINI_TIMEOUT', 'score' => null, 'usage' => []]]);

        $this->assertNull($metrics['targets']['invented_values']['met']);
        $this->assertNull($metrics['targets']['total_accuracy']['met']);
    }
}
