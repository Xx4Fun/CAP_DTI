<?php

namespace App\Services\Receipt\Evaluation;

use App\Services\Receipt\Extraction\ReceiptAmount;

/**
 * Scores a validated extraction against a human-transcribed ground truth and aggregates a corpus run.
 *
 * Ground-truth conventions: amounts are printed strings ("27.50"); null means "not printed or not readable", so any
 * extracted value there is invented. `other_amounts` lists printed non-item amounts (cash, change, VATable sales) so
 * a real number put in the wrong place counts as wrong, not invented. A ground-truth key that is absent is not scored.
 */
final class ReceiptEvaluationScorer
{
    /** Gemini 3.8 Flash list prices per 1M tokens, valid until 2026-12-31 (they double on 2027-01-01). */
    public const INPUT_USD_PER_MILLION = 0.75;

    public const OUTPUT_USD_PER_MILLION = 3.75;

    /** Phase 2 targets from the extraction plan (section 10). */
    public const TARGETS = [
        'invented_values' => 0,
        'exact_numeric_accuracy' => 0.98,
        /** Share of printed numbers the extraction actually returned, so a silent model cannot pass on accuracy alone. */
        'numeric_completeness' => 0.95,
        'item_recall_clean' => 0.95,
        'total_accuracy' => 0.98,
        'merchant_accuracy' => 0.95,
        'single_section_p95_ms' => 30000,
    ];

    private const NAME_SIMILARITY = 0.85;

    /** @return array<string, mixed> */
    public function score(array $expected, array $result): array
    {
        $details = [];
        $numbers = ['correct' => 0, 'wrong' => 0, 'missed' => 0, 'invented' => 0];
        $inventedFields = [];
        $printed = $this->printedAmounts($expected);
        $expectedItems = array_values((array) ($expected['items'] ?? []));
        $extracted = array_values((array) ($result['items'] ?? []));

        // Pair ground-truth lines with extracted lines: name and line total first, then name alone.
        $pairs = [];
        $free = array_keys($extracted);
        // Named lines are paired first: a ground-truth line whose name was unreadable matches any name, so it must not
        // take a row that an named line matches exactly.
        $order = array_keys($expectedItems);
        usort($order, fn ($a, $b) => (($expectedItems[$a]['name'] ?? null) === null ? 1 : 0) <=> (($expectedItems[$b]['name'] ?? null) === null ? 1 : 0));
        foreach ([true, false] as $samePrice) {
            foreach ($order as $e) {
                $item = $expectedItems[$e];
                if (isset($pairs[$e]) || (! $samePrice && ($item['name'] ?? null) === null)) {
                    continue;
                }
                foreach ($free as $slot => $x) {
                    if ($this->namesMatch($item, $extracted[$x]['item_name'] ?? null)
                        && (! $samePrice || $this->textCents($item['line_total'] ?? null) === $this->floatCents($extracted[$x]['line_total'] ?? null))) {
                        $pairs[$e] = $x;
                        unset($free[$slot]);
                        break;
                    }
                }
            }
        }

        $namesExact = 0;
        $genuineFlagged = 0;
        foreach ($expectedItems as $e => $item) {
            $label = 'item '.($e + 1);
            if (! isset($pairs[$e])) {
                $numbers['missed'] += count(array_filter([$item['quantity'] ?? null, $item['unit_price'] ?? null, $item['line_total'] ?? null],
                    fn ($value) => $value !== null));
                $details[] = "{$label} not extracted";

                continue;
            }
            $row = $extracted[$pairs[$e]];
            if (($item['name'] ?? null) === null) {
                if (($row['item_name'] ?? null) !== null) {
                    $inventedFields[] = "{$label} name";
                }
            } elseif ($this->namesMatch($item, $row['item_name'] ?? null, exact: true)) {
                $namesExact++;
            }
            if (($row['possible_duplicate_of'] ?? null) !== null) {
                $genuineFlagged++;
                $details[] = "{$label} is a real purchase but was flagged as a possible overlap duplicate";
            }
            // A row cannot excuse a fabricated amount with its own counterpart: copying a line total into a unit price
            // that is not printed is an invented per-unit price, which is exactly the value DTI compares to the SRP.
            // The counterpart is removed wherever it appears, so a coincidence elsewhere (e.g. the receipt total) cannot
            // downgrade it either.
            $this->compare($numbers, $details, "{$label} quantity", ReceiptAmount::quantity($item['quantity'] ?? null), $row['quantity'] ?? null, money: false);
            $this->compare($numbers, $details, "{$label} unit_price", $this->textCents($item['unit_price'] ?? null), $this->floatCents($row['unit_price'] ?? null),
                printed: $this->without($printed, $this->textCents($item['line_total'] ?? null)));
            $this->compare($numbers, $details, "{$label} line_total", $this->textCents($item['line_total'] ?? null), $this->floatCents($row['line_total'] ?? null),
                printed: $this->without($printed, $this->textCents($item['unit_price'] ?? null)));
        }

        $falseItems = 0;
        $overlapFlagged = 0;
        foreach ($free as $x) {
            $row = $extracted[$x];
            if (($row['possible_duplicate_of'] ?? null) !== null) {
                $overlapFlagged++;

                continue;
            }
            $falseItems++;
            $details[] = 'extra line '.json_encode($row['item_name'] ?? null, JSON_UNESCAPED_UNICODE);
            foreach (['unit_price', 'line_total'] as $field) {
                $cents = $this->floatCents($row[$field] ?? null);
                if ($cents !== null && ! in_array($cents, $printed, true)) {
                    $numbers['invented']++;
                    $details[] = "extra line {$field} ".ReceiptAmount::format($cents).' is not printed on the receipt';
                }
            }
        }

        $truthTotal = $this->textCents($expected['total'] ?? null);
        $gotTotal = $this->textCents($result['total'] ?? null);
        if (array_key_exists('total', $expected)) {
            $this->compare($numbers, $details, 'total', $truthTotal, $gotTotal, printed: $printed);
        }
        if (array_key_exists('subtotal', $expected)) {
            $this->compare($numbers, $details, 'subtotal', $this->textCents($expected['subtotal']), $this->textCents($result['subtotal'] ?? null), printed: $printed);
        }
        if (array_key_exists('discounts', $expected)) {
            $this->compareDiscounts($numbers, $details, (array) $expected['discounts'], (array) ($result['discounts'] ?? []), $printed);
        }

        $merchantCorrect = null;
        if (array_key_exists('merchant', $expected)) {
            $merchant = $result['merchant']['display_name'] ?? null;
            if ($expected['merchant'] !== null) {
                $merchantCorrect = $merchant !== null && $this->similar($merchant, $expected['merchant']);
            } elseif ($merchant !== null) {
                $inventedFields[] = 'merchant';
            }
        }
        $dateCorrect = null;
        if (array_key_exists('transaction_date', $expected)) {
            $date = $result['transaction_date'] ?? null;
            if ($expected['transaction_date'] !== null) {
                $dateCorrect = $date === $expected['transaction_date'];
            } elseif ($date !== null) {
                $inventedFields[] = 'transaction_date';
            }
        }
        if (array_key_exists('receipt_number', $expected)) {
            $number = $result['receipt_number'] ?? null;
            if ($expected['receipt_number'] === null && $number !== null) {
                $inventedFields[] = 'receipt_number';
            } elseif ($expected['receipt_number'] !== null && ($number === null || $this->compact($number) !== $this->compact($expected['receipt_number']))) {
                $details[] = 'receipt_number expected '.json_encode($expected['receipt_number']).' got '.json_encode($number);
            }
        }
        foreach ($inventedFields as $field) {
            $details[] = "{$field} invented (not printed or not readable)";
        }

        return [
            'status_correct' => ($result['status'] ?? null) === ($expected['status'] ?? 'ready'),
            'reason_correct' => ($result['reason_code'] ?? null) === ($expected['reason_code'] ?? null),
            'items_expected' => count($expectedItems),
            'items_paired' => count($pairs),
            'names_exact' => $namesExact,
            'false_items' => $falseItems,
            'overlap_lines_flagged' => $overlapFlagged,
            'genuine_lines_flagged' => $genuineFlagged,
            'numeric' => $numbers,
            'invented_fields' => $inventedFields,
            'total_correct' => $truthTotal === null ? null : $gotTotal === $truthTotal,
            'merchant_correct' => $merchantCorrect,
            'date_correct' => $dateCorrect,
            'reconciliation' => $result['reconciliation']['status'] ?? 'unavailable',
            'details' => $details,
        ];
    }

    /**
     * @param  array<int, array{categories?: array, sections?: int, failure?: ?string, duration_ms?: ?int, usage?: array, score?: ?array}>  $runs
     * @return array<string, mixed>
     */
    public function aggregate(array $runs): array
    {
        $scored = array_values(array_filter($runs, fn (array $run) => is_array($run['score'] ?? null)));
        $clean = array_values(array_filter($scored, fn (array $run) => in_array('clean', $run['categories'] ?? [], true)));
        $sum = fn (callable $pick, array $from) => array_sum(array_map($pick, $from));
        $numeric = fn (string $key) => $sum(fn (array $run) => $run['score']['numeric'][$key], $scored);
        $rate = fn (int|float $hit, int|float $of) => $of > 0 ? round($hit / $of, 4) : null;
        $flagRate = function (string $key) use ($scored, $rate) {
            $flags = array_values(array_filter(array_map(fn (array $run) => $run['score'][$key], $scored), fn ($flag) => $flag !== null));

            return $rate(count(array_filter($flags)), count($flags));
        };
        $paired = fn (array $from) => $sum(fn (array $run) => $run['score']['items_paired'], $from);
        $expected = fn (array $from) => $sum(fn (array $run) => $run['score']['items_expected'], $from);
        $falseItems = $sum(fn (array $run) => $run['score']['false_items'], $scored);
        $durations = fn (array $from) => array_values(array_filter(array_map(fn (array $run) => $run['duration_ms'] ?? null, $from), 'is_int'));
        $tokens = fn (string $key) => $sum(fn (array $run) => (int) ($run['usage'][$key] ?? 0), $runs);

        $metrics = [
            'runs' => count($runs),
            'scored_runs' => count($scored),
            'failures' => array_count_values(array_values(array_filter(array_column($runs, 'failure'), 'is_string'))),
            'invented_values' => $scored === [] ? null : $numeric('invented') + $sum(fn (array $run) => count($run['score']['invented_fields']), $scored),
            'invented_numeric' => $numeric('invented'),
            'exact_numeric_accuracy' => $rate($numeric('correct'), $numeric('correct') + $numeric('wrong')),
            'numeric_completeness' => $rate($numeric('correct') + $numeric('wrong'), $numeric('correct') + $numeric('wrong') + $numeric('missed')),
            'wrong_values' => $numeric('wrong'),
            'missed_values' => $numeric('missed'),
            'item_recall' => $rate($paired($scored), $expected($scored)),
            'item_recall_clean' => $rate($paired($clean), $expected($clean)),
            'item_precision' => $rate($paired($scored), $paired($scored) + $falseItems),
            'names_exact' => $rate($sum(fn (array $run) => $run['score']['names_exact'], $scored), $paired($scored)),
            'false_items' => $falseItems,
            'overlap_lines_flagged' => $sum(fn (array $run) => $run['score']['overlap_lines_flagged'], $scored),
            'genuine_lines_flagged' => $sum(fn (array $run) => $run['score']['genuine_lines_flagged'], $scored),
            'total_accuracy' => $flagRate('total_correct'),
            'merchant_accuracy' => $flagRate('merchant_correct'),
            'date_accuracy' => $flagRate('date_correct'),
            'status_accuracy' => $flagRate('status_correct'),
            'reconciliation_matched' => $rate(count(array_filter($scored, fn (array $run) => $run['score']['reconciliation'] === 'matched')), count($scored)),
            'latency_p50_ms' => $this->percentile($durations($scored), 50),
            'latency_p95_ms' => $this->percentile($durations($scored), 95),
            'single_section_p95_ms' => $this->percentile($durations(array_filter($scored, fn (array $run) => ($run['sections'] ?? 0) === 1)), 95),
            'tokens' => ['input' => $tokens('input_tokens'), 'output' => $tokens('output_tokens'), 'thought' => $tokens('thought_tokens')],
        ];
        // Thinking tokens are billed at the output rate.
        $metrics['estimated_cost_usd'] = round(($metrics['tokens']['input'] * self::INPUT_USD_PER_MILLION
            + ($metrics['tokens']['output'] + $metrics['tokens']['thought']) * self::OUTPUT_USD_PER_MILLION) / 1_000_000, 4);

        $met = [
            'invented_values' => fn ($value) => $value <= self::TARGETS['invented_values'],
            'exact_numeric_accuracy' => fn ($value) => $value >= self::TARGETS['exact_numeric_accuracy'],
            'numeric_completeness' => fn ($value) => $value >= self::TARGETS['numeric_completeness'],
            'item_recall_clean' => fn ($value) => $value >= self::TARGETS['item_recall_clean'],
            'total_accuracy' => fn ($value) => $value >= self::TARGETS['total_accuracy'],
            'merchant_accuracy' => fn ($value) => $value >= self::TARGETS['merchant_accuracy'],
            'single_section_p95_ms' => fn ($value) => $value <= self::TARGETS['single_section_p95_ms'],
        ];
        foreach ($met as $name => $test) {
            $value = $metrics[$name];
            $metrics['targets'][$name] = ['value' => $value, 'target' => self::TARGETS[$name], 'met' => $value === null ? null : $test($value)];
        }

        return $metrics;
    }

    private function compare(array &$numbers, array &$details, string $label, int|float|null $truth, int|float|null $got, bool $money = true, array $printed = []): void
    {
        $show = fn (int|float $value) => $money ? ReceiptAmount::format((int) $value) : (string) $value;
        if ($got === null) {
            if ($truth !== null) {
                $numbers['missed']++;
                $details[] = "{$label} missed";
            }

            return;
        }
        if ($truth === null) {
            // A number printed elsewhere on the receipt was put in the wrong field: wrong, not invented.
            if ($money && in_array((int) $got, $printed, true)) {
                $numbers['wrong']++;
                $details[] = "{$label} wrong: {$show($got)} is printed on the receipt but not as this value";

                return;
            }
            $numbers['invented']++;
            $details[] = "{$label} invented: {$show($got)} (not printed or not readable)";

            return;
        }
        if ($money ? $truth === $got : abs($truth - $got) < 0.0005) {
            $numbers['correct']++;

            return;
        }
        $numbers['wrong']++;
        $details[] = "{$label} wrong: expected {$show($truth)} got {$show($got)}";
    }

    private function compareDiscounts(array &$numbers, array &$details, array $truth, array $got, array $printed): void
    {
        $remaining = array_values(array_filter(array_map(fn ($amount) => $this->textCents(is_string($amount) ? $amount : null), $truth), fn ($cents) => $cents !== null));
        foreach ($got as $discount) {
            $cents = $this->textCents(is_array($discount) ? ($discount['amount'] ?? null) : null);
            if ($cents === null) {
                continue;
            }
            $at = array_search($cents, $remaining, true);
            if ($at !== false) {
                $numbers['correct']++;
                unset($remaining[$at]);
            } elseif (in_array($cents, $printed, true)) {
                $numbers['wrong']++;
                $details[] = 'discount '.ReceiptAmount::format($cents).' is a printed amount but not a discount';
            } else {
                $numbers['invented']++;
                $details[] = 'discount '.ReceiptAmount::format($cents).' is not printed on the receipt';
            }
        }
        $numbers['missed'] += count($remaining);
        if ($remaining !== []) {
            $details[] = count($remaining).' discount(s) missed';
        }
    }

    /**
     * The printed amounts with every occurrence of one value removed.
     *
     * @param  array<int, int>  $printed
     * @return array<int, int>
     */
    private function without(array $printed, ?int $cents): array
    {
        return $cents === null ? $printed : array_values(array_filter($printed, fn (int $amount) => $amount !== $cents));
    }

    /** @return array<int, int> Every amount printed on the receipt, in centavos. */
    private function printedAmounts(array $expected): array
    {
        $amounts = [$expected['total'] ?? null, $expected['subtotal'] ?? null, ...(array) ($expected['discounts'] ?? []), ...(array) ($expected['other_amounts'] ?? [])];
        foreach ((array) ($expected['items'] ?? []) as $item) {
            array_push($amounts, $item['unit_price'] ?? null, $item['line_total'] ?? null);
        }

        return array_values(array_filter(array_map(fn ($amount) => $this->textCents(is_string($amount) ? $amount : null), $amounts), fn ($cents) => $cents !== null));
    }

    private function namesMatch(array $item, ?string $got, bool $exact = false): bool
    {
        if (($item['name'] ?? null) === null) {
            return true;
        }
        if ($got === null) {
            return false;
        }
        $truth = $this->compact($item['name']);
        $value = $this->compact($got);
        if (($item['name_match'] ?? 'full') === 'prefix') {
            $value = substr($value, 0, strlen($truth));
        }

        return $value !== '' && ($value === $truth || (! $exact && $this->ratio($value, $truth) >= self::NAME_SIMILARITY));
    }

    private function similar(string $a, string $b): bool
    {
        return $this->ratio($this->compact($a), $this->compact($b)) >= self::NAME_SIMILARITY;
    }

    private function ratio(string $a, string $b): float
    {
        $length = max(strlen($a), strlen($b));

        return $length === 0 ? 1.0 : 1 - levenshtein($a, $b) / $length;
    }

    private function compact(string $text): string
    {
        return (string) preg_replace('/[^A-Z0-9]/', '', strtoupper($text));
    }

    private function textCents(?string $amount): ?int
    {
        return ReceiptAmount::money($amount)['cents'] ?? null;
    }

    private function floatCents(int|float|null $amount): ?int
    {
        return $amount === null ? null : (int) round($amount * 100);
    }

    /** Nearest-rank percentile. */
    private function percentile(array $values, int $percent): ?int
    {
        if ($values === []) {
            return null;
        }
        sort($values);

        return $values[max(0, (int) ceil($percent / 100 * count($values)) - 1)];
    }
}
