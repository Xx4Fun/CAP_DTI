<?php

namespace App\Services\Receipt\Extraction;

/**
 * Structured-output contract for receipt extraction: the JSON Schema sent to the provider and a PHP structural check
 * applied to every response before any value is trusted.
 */
final class ReceiptExtractionSchema
{
    private const NULLABLE_STRING = ['type' => ['string', 'null']];

    private const UNCERTAIN_TEXT = [
        'type' => 'object',
        'properties' => ['text' => self::NULLABLE_STRING, 'uncertain' => ['type' => 'boolean']],
        'required' => ['text', 'uncertain'],
    ];

    private const AMOUNT_LINE = [
        'type' => 'object',
        'properties' => ['amount' => self::NULLABLE_STRING, 'source_line' => self::NULLABLE_STRING, 'uncertain' => ['type' => 'boolean']],
        'required' => ['amount', 'source_line', 'uncertain'],
    ];

    public const ITEM_FIELDS = ['raw_description', 'quantity', 'unit_price', 'line_total'];

    /** @return array<string, mixed> */
    public static function jsonSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'evidence' => [
                    'type' => 'object',
                    'properties' => [
                        'legibility' => ['type' => 'string', 'enum' => ['clear', 'partially_readable', 'unreadable']],
                        'is_receipt' => ['type' => 'boolean'],
                        'problems' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => [
                            'blurry', 'glare', 'too_dark', 'cropped_top', 'cropped_bottom', 'cropped_side', 'crumpled',
                        ]]],
                        'total_region_visible' => ['type' => ['boolean', 'null']],
                    ],
                    'required' => ['legibility', 'is_receipt', 'problems', 'total_region_visible'],
                ],
                'merchant' => self::UNCERTAIN_TEXT,
                'transaction_date' => self::UNCERTAIN_TEXT,
                'receipt_number' => self::UNCERTAIN_TEXT,
                'items' => ['type' => 'array', 'items' => [
                    'type' => 'object',
                    'properties' => [
                        'raw_description' => self::NULLABLE_STRING,
                        'quantity' => self::NULLABLE_STRING,
                        'unit_price' => self::NULLABLE_STRING,
                        'line_total' => self::NULLABLE_STRING,
                        'source_lines' => ['type' => 'array', 'items' => ['type' => 'string']],
                        'section' => ['type' => 'integer'],
                        'uncertain_fields' => ['type' => 'array', 'items' => ['type' => 'string', 'enum' => self::ITEM_FIELDS]],
                        'possible_duplicate_of' => ['type' => ['integer', 'null'], 'description' => '0-based position of the earlier item in this items array'],
                    ],
                    'required' => ['raw_description', 'quantity', 'unit_price', 'line_total', 'source_lines', 'section', 'uncertain_fields', 'possible_duplicate_of'],
                ]],
                'subtotal' => self::AMOUNT_LINE,
                'discounts' => ['type' => 'array', 'items' => [
                    'type' => 'object',
                    'properties' => [
                        'description' => self::NULLABLE_STRING,
                        'amount' => self::NULLABLE_STRING,
                        'source_line' => self::NULLABLE_STRING,
                        'uncertain' => ['type' => 'boolean'],
                    ],
                    'required' => ['description', 'amount', 'source_line', 'uncertain'],
                ]],
                'adjustments' => ['type' => 'array', 'items' => [
                    'type' => 'object',
                    'properties' => [
                        'kind' => ['type' => 'string', 'enum' => ['vat_exemption', 'rounding', 'service_charge', 'other']],
                        'direction' => ['type' => 'string', 'enum' => ['add', 'subtract']],
                        'amount' => self::NULLABLE_STRING,
                        'source_line' => self::NULLABLE_STRING,
                        'uncertain' => ['type' => 'boolean'],
                    ],
                    'required' => ['kind', 'direction', 'amount', 'source_line', 'uncertain'],
                ]],
                'total' => self::AMOUNT_LINE,
                'sections' => ['type' => 'array', 'items' => [
                    'type' => 'object',
                    'properties' => [
                        'index' => ['type' => 'integer'],
                        'overlaps_previous' => ['type' => 'string', 'enum' => ['yes', 'no', 'unknown']],
                    ],
                    'required' => ['index', 'overlaps_previous'],
                ]],
            ],
            'required' => ['evidence', 'merchant', 'transaction_date', 'receipt_number', 'items', 'subtotal', 'discounts', 'adjustments', 'total', 'sections'],
        ];
    }

    /** Structural check of a decoded response; values are validated separately and never trusted here. */
    public static function isValid(mixed $payload): bool
    {
        if (! is_array($payload)) {
            return false;
        }
        $evidence = $payload['evidence'] ?? null;
        if (! is_array($evidence)
            || ! in_array($evidence['legibility'] ?? null, ['clear', 'partially_readable', 'unreadable'], true)
            || ! is_bool($evidence['is_receipt'] ?? null)
            || ! self::isListOfStrings($evidence['problems'] ?? null)
            || ! self::isNullableOf($evidence, 'total_region_visible', 'is_bool')) {
            return false;
        }
        foreach (['merchant', 'transaction_date', 'receipt_number'] as $field) {
            if (! self::isUncertainText($payload[$field] ?? null)) {
                return false;
            }
        }
        foreach (['subtotal', 'total'] as $field) {
            if (! self::isAmountLine($payload[$field] ?? null)) {
                return false;
            }
        }
        foreach (['items', 'discounts', 'adjustments', 'sections'] as $list) {
            if (! is_array($payload[$list] ?? null) || ! array_is_list($payload[$list])) {
                return false;
            }
        }
        foreach ($payload['items'] as $item) {
            if (! is_array($item) || ! self::isListOfStrings($item['source_lines'] ?? null) || ! is_int($item['section'] ?? null)
                || ! self::isListOfStrings($item['uncertain_fields'] ?? null)
                || ! self::isNullableOf($item, 'possible_duplicate_of', 'is_int')) {
                return false;
            }
            foreach (self::ITEM_FIELDS as $field) {
                if (! array_key_exists($field, $item) || ! (is_string($item[$field]) || $item[$field] === null)) {
                    return false;
                }
            }
        }
        foreach ($payload['discounts'] as $discount) {
            if (! is_array($discount) || ! is_bool($discount['uncertain'] ?? null)
                || ! self::isNullableOf($discount, 'amount', 'is_string')
                || ! self::isNullableOf($discount, 'description', 'is_string')
                || ! self::isNullableOf($discount, 'source_line', 'is_string')) {
                return false;
            }
        }
        foreach ($payload['adjustments'] as $adjustment) {
            if (! is_array($adjustment) || ! in_array($adjustment['direction'] ?? null, ['add', 'subtract'], true)
                || ! in_array($adjustment['kind'] ?? null, ['vat_exemption', 'rounding', 'service_charge', 'other'], true)
                || ! is_bool($adjustment['uncertain'] ?? null)
                || ! self::isNullableOf($adjustment, 'amount', 'is_string')
                || ! self::isNullableOf($adjustment, 'source_line', 'is_string')) {
                return false;
            }
        }
        foreach ($payload['sections'] as $section) {
            if (! is_array($section) || ! is_int($section['index'] ?? null)
                || ! in_array($section['overlaps_previous'] ?? null, ['yes', 'no', 'unknown'], true)) {
                return false;
            }
        }

        return true;
    }

    private static function isListOfStrings(mixed $value): bool
    {
        return is_array($value) && array_is_list($value) && array_filter($value, fn ($entry) => ! is_string($entry)) === [];
    }

    /** The key must be present, holding either null or a value accepted by $check. */
    private static function isNullableOf(array $values, string $key, callable $check): bool
    {
        return array_key_exists($key, $values) && ($values[$key] === null || $check($values[$key]));
    }

    private static function isUncertainText(mixed $value): bool
    {
        return is_array($value) && array_key_exists('text', $value)
            && (is_string($value['text']) || $value['text'] === null) && is_bool($value['uncertain'] ?? null);
    }

    private static function isAmountLine(mixed $value): bool
    {
        return is_array($value) && self::isNullableOf($value, 'amount', 'is_string')
            && self::isNullableOf($value, 'source_line', 'is_string') && is_bool($value['uncertain'] ?? null);
    }
}
