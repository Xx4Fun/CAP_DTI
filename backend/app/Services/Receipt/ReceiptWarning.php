<?php

namespace App\Services\Receipt;

/** Review warnings attached to receipt extraction results, shared by every extraction path. */
final class ReceiptWarning
{
    /** @return array{code: string, message: string} */
    public static function make(string $code): array
    {
        return ['code' => $code, 'message' => match ($code) {
            'OCR_INCOMPLETE' => 'One or more clear receipt sections could not be fully extracted by OCR.',
            'INCOMPLETE_SCAN' => 'Adjacent receipt section continuity could not be verified automatically.',
            'STORE_NOT_CONFIRMED' => 'The store name could not be confidently matched by OCR.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines were extracted.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not extracted.',
            'TOTAL_MISMATCH' => 'The extracted item amounts do not match the extracted total.',
            'FIELDS_UNCERTAIN' => 'Some extracted values could not be read with confidence. Check them against the receipt photos.',
            'POSSIBLE_DUPLICATE_LINES' => 'Some item lines may repeat across overlapping receipt sections.',
            'LINE_ARITHMETIC_MISMATCH' => 'For some items, quantity times unit price does not equal the line total.',
            default => 'The system extraction requires DTI review.',
        }];
    }

    /** Trims edge noise from an OCR'd merchant header; returns null when fewer than three letters remain. */
    public static function cleanDisplayName(string $name): ?string
    {
        $name = (string) preg_replace('/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/u', '', (string) preg_replace('/\s+/u', ' ', $name));

        return preg_match_all('/\p{L}/u', $name) >= 3 ? $name : null;
    }
}
