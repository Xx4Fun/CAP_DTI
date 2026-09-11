<?php

namespace App\Services\Receipt\Extraction;

use App\Services\Receipt\ReceiptDateExtractor;
use App\Services\Receipt\ReceiptItemExtractor;
use App\Services\Receipt\ReceiptMerchantMatcher;
use App\Services\Receipt\ReceiptWarning;

/**
 * Deterministic validation of a structured extraction. Provider output is treated as untrusted: values are parsed
 * strictly, never altered beyond format normalization, never invented, and arithmetic is recomputed here.
 */
class ReceiptExtractionValidator
{
    private const MAX_ITEMS = 60;

    private const MAX_NAME_LENGTH = 255;

    private const MAX_RAW_TEXT_LENGTH = 2000;

    public function __construct(
        private readonly ReceiptReconciler $reconciler = new ReceiptReconciler,
        private readonly ReceiptMerchantMatcher $merchantMatcher = new ReceiptMerchantMatcher,
        private readonly ReceiptDateExtractor $dateExtractor = new ReceiptDateExtractor,
    ) {}

    /**
     * @param  array<string, mixed>  $payload  Structure already checked by ReceiptExtractionSchema.
     * @param  array{store_name?: ?string, owner_name?: ?string, frame_count?: int, prior_recapture_reasons?: array<int, string>}  $context
     * @return array<string, mixed> Result in the pipeline's result shape.
     */
    public function validate(array $payload, array $context): array
    {
        $merchantNames = array_values(array_filter([$context['store_name'] ?? null, $context['owner_name'] ?? null], 'is_string'));
        $warnings = [];
        $rejected = [];
        $extraDiscounts = [];
        $kept = [];
        $sectionOverlap = [];
        foreach ($payload['sections'] as $section) {
            $sectionOverlap[(int) $section['index']] = $section['overlaps_previous'];
        }

        foreach (array_slice($payload['items'], 0, self::MAX_ITEMS, true) as $modelIndex => $item) {
            $sourceLines = array_values(array_filter(array_map(fn ($line) => trim((string) $line), $item['source_lines']), 'strlen'));
            $sourceText = implode("\n", $sourceLines);
            $uncertain = array_values(array_intersect((array) $item['uncertain_fields'], ReceiptExtractionSchema::ITEM_FIELDS));
            $reasons = [];

            $description = is_string($item['raw_description']) ? trim((string) preg_replace('/\s+/u', ' ', $item['raw_description'])) : null;
            $description = $description === '' ? null : $description;
            $quantity = ReceiptAmount::quantity($item['quantity']);
            $unitPrice = ReceiptAmount::money($item['unit_price']);
            $lineTotal = ReceiptAmount::money($item['line_total']);
            foreach (['quantity' => $quantity, 'unit_price' => $unitPrice, 'line_total' => $lineTotal] as $field => $parsed) {
                if ($item[$field] !== null && $parsed === null) {
                    $uncertain[] = $field;
                    $reasons[$field] = 'unparseable';
                }
            }

            // A negative line (void or in-line discount) is a discount, not a purchased item.
            if ($lineTotal !== null && $lineTotal['negative']) {
                $extraDiscounts[] = ['description' => $description, 'cents' => $lineTotal['cents'], 'source_line' => $sourceLines[0] ?? null,
                    'uncertain' => in_array('line_total', $uncertain, true)];

                continue;
            }
            if ($description === null && $lineTotal === null) {
                $rejected[] = $this->capped($sourceText);

                continue;
            }
            if ($description !== null && $this->isNonProduct($description, $sourceText, $merchantNames, $uncertain, $reasons)) {
                $rejected[] = $this->capped($sourceText !== '' ? $sourceText : $description);

                continue;
            }

            // Internal consistency only: the values should appear in the verbatim lines the provider cited.
            $normalizedSource = $this->normalize($sourceText);
            if ($lineTotal !== null && ! $this->containsAmount($normalizedSource, $lineTotal['cents'])) {
                $uncertain[] = 'line_total';
                $reasons['line_total'] ??= 'inconsistent_source';
            }
            if ($description !== null && ! str_contains($normalizedSource, $this->normalize($description))) {
                $uncertain[] = 'raw_description';
                $reasons['raw_description'] ??= 'inconsistent_source';
            }
            if ($description !== null && mb_strlen($description) > self::MAX_NAME_LENGTH) {
                $description = mb_substr($description, 0, self::MAX_NAME_LENGTH);
                $uncertain[] = 'raw_description';
                $reasons['raw_description'] = 'truncated';
            }

            $kept[$modelIndex] = [
                'model_index' => $modelIndex,
                'section' => max(1, (int) $item['section']),
                'possible_duplicate_of' => $item['possible_duplicate_of'],
                'item_name' => $description,
                'raw_text' => $this->capped($sourceText),
                'source_lines' => $sourceLines,
                'quantity' => $quantity,
                'unit_price_cents' => $unitPrice['cents'] ?? null,
                'line_total_cents' => $lineTotal['cents'] ?? null,
                'uncertain_fields' => array_values(array_unique($uncertain)),
                'uncertain_reasons' => $reasons,
            ];
        }
        if (count($payload['items']) > self::MAX_ITEMS) {
            $warnings[] = 'OCR_INCOMPLETE';
        }

        // Validate overlap-duplicate references, then remap them to persisted sequence numbers.
        $sequenceOf = array_flip(array_keys($kept));
        foreach ($kept as $modelIndex => $item) {
            $reference = $item['possible_duplicate_of'];
            if ($reference === null) {
                continue;
            }
            $target = $kept[$reference] ?? null;
            $valid = is_int($reference) && $reference < $modelIndex && $target !== null
                && $item['section'] - $target['section'] === 1
                && ($sectionOverlap[$item['section']] ?? 'unknown') !== 'no';
            $kept[$modelIndex]['possible_duplicate_of'] = $valid ? $sequenceOf[$reference] : null;
            if (! $valid) {
                $kept[$modelIndex]['uncertain_fields'] = array_values(array_unique([...$item['uncertain_fields'], 'raw_description']));
                $kept[$modelIndex]['uncertain_reasons']['raw_description'] ??= 'invalid_duplicate_reference';
            }
        }

        $subtotal = ReceiptAmount::money($payload['subtotal']['amount']);
        $total = ReceiptAmount::money($payload['total']['amount']);
        $discounts = [];
        foreach ($payload['discounts'] as $discount) {
            $parsed = ReceiptAmount::money(is_string($discount['amount'] ?? null) ? $discount['amount'] : null);
            $discounts[] = ['description' => $discount['description'] ?? null, 'cents' => $parsed['cents'] ?? null,
                'source_line' => $discount['source_line'] ?? null, 'uncertain' => (bool) $discount['uncertain'] || $parsed === null];
        }
        $discounts = [...$discounts, ...$extraDiscounts];
        $adjustments = [];
        foreach ($payload['adjustments'] as $adjustment) {
            $parsed = ReceiptAmount::money(is_string($adjustment['amount'] ?? null) ? $adjustment['amount'] : null);
            $adjustments[] = ['kind' => $adjustment['kind'] ?? 'other', 'direction' => $adjustment['direction'], 'cents' => $parsed['cents'] ?? null,
                'source_line' => $adjustment['source_line'] ?? null, 'uncertain' => (bool) ($adjustment['uncertain'] ?? false) || $parsed === null];
        }

        $reconciliation = $this->reconciler->reconcile(
            array_values(array_map(fn (array $item) => [
                'quantity' => $item['quantity'],
                'unit_price_cents' => $item['unit_price_cents'],
                'line_total_cents' => $item['line_total_cents'],
                'possible_duplicate' => $item['possible_duplicate_of'] !== null,
            ], $kept)),
            $subtotal['cents'] ?? null,
            array_column($discounts, 'cents'),
            array_map(fn (array $adjustment) => ['direction' => $adjustment['direction'], 'cents' => $adjustment['cents']], $adjustments),
            $total['cents'] ?? null,
        );

        $merchantText = $payload['merchant']['text'];
        $merchant = $this->merchantMatcher->match($context['store_name'] ?? null, $context['owner_name'] ?? null,
            is_string($merchantText) && trim($merchantText) !== '' ? [trim($merchantText)] : []);
        $merchant['display_name'] = is_string($merchantText) ? ReceiptWarning::cleanDisplayName($merchantText) : null;
        $merchant['uncertain'] = (bool) $payload['merchant']['uncertain'];

        $dateText = $payload['transaction_date']['text'];
        $transactionDate = is_string($dateText) ? $this->dateExtractor->extract([$dateText]) : null;
        $receiptNumber = is_string($payload['receipt_number']['text']) ? mb_substr(trim($payload['receipt_number']['text']), 0, 100) : null;

        $items = array_values($kept);
        $anyUncertain = $merchant['uncertain'] || (bool) $payload['transaction_date']['uncertain'] || (bool) $payload['total']['uncertain']
            || (bool) $payload['subtotal']['uncertain'] || (is_string($dateText) && $transactionDate === null)
            || in_array(true, array_map(fn (array $item) => $item['uncertain_fields'] !== [], $items), true)
            || in_array(true, array_column($discounts, 'uncertain'), true) || in_array(true, array_column($adjustments, 'uncertain'), true);

        if ($items === []) {
            $warnings[] = 'ITEMS_NOT_FOUND';
        }
        if ($total === null) {
            $warnings[] = 'TOTAL_NOT_FOUND';
        }
        if (in_array(ReceiptReconciler::MISMATCH, [$reconciliation['checks']['items_vs_subtotal'], $reconciliation['checks']['expected_vs_total']], true)) {
            $warnings[] = 'TOTAL_MISMATCH';
        }
        if ($reconciliation['checks']['line_arithmetic'] === ReceiptReconciler::MISMATCH) {
            $warnings[] = 'LINE_ARITHMETIC_MISMATCH';
        }
        if (($merchant['status'] ?? null) !== 'matched') {
            $warnings[] = 'STORE_NOT_CONFIRMED';
        }
        if ($rejected !== [] || $payload['evidence']['legibility'] === 'partially_readable') {
            $warnings[] = 'OCR_INCOMPLETE';
        }
        if ($anyUncertain) {
            $warnings[] = 'FIELDS_UNCERTAIN';
        }
        if (in_array(true, array_map(fn (array $item) => $item['possible_duplicate_of'] !== null, $items), true)) {
            $warnings[] = 'POSSIBLE_DUPLICATE_LINES';
        }
        if (in_array('no', $sectionOverlap, true)) {
            $warnings[] = 'INCOMPLETE_SCAN';
        }

        [$status, $reasonCode] = $this->classify($payload['evidence'], $items, $total, $context['prior_recapture_reasons'] ?? [], $warnings);
        $warnings = array_map(fn (string $code) => ReceiptWarning::make($code), array_values(array_unique($warnings)));

        $lines = [];
        foreach ($items as $item) {
            array_push($lines, ...$item['source_lines']);
        }
        if (is_string($payload['total']['source_line']) && trim($payload['total']['source_line']) !== '') {
            $lines[] = trim($payload['total']['source_line']);
        }

        return [
            'status' => $status,
            'reason_code' => $reasonCode,
            'lines' => $lines,
            'items' => array_map(fn (array $item, int $sequence) => [
                'sequence' => $sequence,
                'raw_text' => $item['raw_text'],
                'item_name' => $item['item_name'],
                'quantity' => $item['quantity'],
                'unit' => null,
                'observed_price' => $item['line_total_cents'] === null ? null : $item['line_total_cents'] / 100.0,
                'unit_price' => $item['unit_price_cents'] === null ? null : $item['unit_price_cents'] / 100.0,
                'line_total' => $item['line_total_cents'] === null ? null : $item['line_total_cents'] / 100.0,
                'uncertain_fields' => $item['uncertain_fields'] === [] ? null : $item['uncertain_fields'],
                'section' => $item['section'],
                'possible_duplicate_of' => $item['possible_duplicate_of'],
                'ocr_confidence' => null,
            ], $items, array_keys($items)),
            'item_flags' => array_map(fn (array $item) => $item['uncertain_reasons'], $items),
            'rejected_item_lines' => $rejected,
            'detected_total' => $total === null ? null : $total['cents'] / 100.0,
            'item_sum' => $reconciliation['items_sum'] === null ? null : (float) $reconciliation['items_sum'],
            'transaction_date' => $transactionDate,
            'receipt_number' => $receiptNumber,
            'subtotal' => $subtotal === null ? null : ReceiptAmount::format($subtotal['cents']),
            'discounts' => array_map(fn (array $discount) => [...$discount, 'amount' => $discount['cents'] === null ? null : ReceiptAmount::format($discount['cents'])], $discounts),
            'adjustments' => array_map(fn (array $adjustment) => [...$adjustment, 'amount' => $adjustment['cents'] === null ? null : ReceiptAmount::format($adjustment['cents'])], $adjustments),
            'total' => $total === null ? null : ReceiptAmount::format($total['cents']),
            'reconciliation' => $reconciliation,
            'evidence_assessment' => $payload['evidence'],
            'merchant' => $merchant,
            'continuity' => ['status' => 'not_assessed', 'continuity_score' => null, 'reasons' => []],
            'warnings' => $warnings,
            'manual_review_required' => $warnings !== [],
            'frames_processed' => (int) ($context['frame_count'] ?? 0),
        ];
    }

    /**
     * Ordered decision table: evidence problems with no usable content need recapture; everything else is reviewable.
     * After two consecutive recaptures for the same reason, the result becomes reviewable with a warning instead.
     *
     * @return array{0: string, 1: ?string}
     */
    private function classify(array $evidence, array $items, ?array $total, array $priorReasons, array &$warnings): array
    {
        $reason = match (true) {
            $evidence['is_receipt'] === false => 'INSUFFICIENT_FRAMES',
            $evidence['legibility'] === 'unreadable' && $items === [] && $total === null => 'TEXT_UNREADABLE',
            $evidence['total_region_visible'] === false && $total === null => 'RECEIPT_INCOMPLETE',
            default => null,
        };
        if ($reason === null) {
            return ['ready', null];
        }
        $recent = array_slice(array_values($priorReasons), 0, 2);
        if (count($recent) === 2 && $recent[0] === $reason && $recent[1] === $reason) {
            $warnings[] = $reason;

            return ['ready', null];
        }

        return ['needs_recapture', $reason];
    }

    private function isNonProduct(string $description, string $sourceText, array $merchantNames, array &$uncertain, array &$reasons): bool
    {
        if (ReceiptItemExtractor::isNonProductText($description)) {
            return true;
        }
        $matcher = $this->merchantMatcher;
        foreach ($merchantNames as $merchant) {
            if ($matcher->mentions($merchant, $description)) {
                // A header naming the store has no price; a priced line naming it is likely a house-brand product.
                if (preg_match('/\d[.,]\d{2}/', $sourceText) !== 1) {
                    return true;
                }
                $uncertain[] = 'raw_description';
                $reasons['raw_description'] = 'mentions_merchant';
            }
        }

        return false;
    }

    private function normalize(string $text): string
    {
        return strtoupper(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }

    private function containsAmount(string $normalizedSource, int $cents): bool
    {
        $plain = ReceiptAmount::format($cents);
        $grouped = number_format($cents / 100, 2, '.', ',');

        return str_contains($normalizedSource, $plain) || str_contains($normalizedSource, $grouped)
            || str_contains($normalizedSource, str_replace('.', ',', $plain));
    }

    private function capped(string $text): string
    {
        return mb_substr($text, 0, self::MAX_RAW_TEXT_LENGTH);
    }
}
