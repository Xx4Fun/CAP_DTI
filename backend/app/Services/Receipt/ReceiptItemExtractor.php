<?php

namespace App\Services\Receipt;

class ReceiptItemExtractor
{
    private const NON_ITEM_LABELS = [
        'total', 'subtotal', 'vat', 'tax', 'cash', 'change', 'tender', 'amount due', 'balance',
    ];

    /** @param array<int, string> $lines */
    public function extract(array $lines): array
    {
        $items = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            $lower = strtolower($trimmed);
            if ($trimmed === '' || $this->isNonItemLine($lower)) {
                continue;
            }
            if (! preg_match('/(?:PHP|P|₱)?\s*(\d{1,7}(?:[.,]\d{2}))\s*$/iu', $trimmed, $matches, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            $priceText = str_replace(',', '.', $matches[1][0]);
            $itemName = trim(substr($trimmed, 0, $matches[0][1]), " \t\n\r\0\x0B.-:");
            if ($itemName === '' || $this->isNonItemLine(strtolower($itemName))) {
                continue;
            }

            $items[] = [
                'sequence' => count($items),
                'raw_text' => $trimmed,
                'item_name' => $itemName,
                'quantity' => null,
                'unit' => null,
                'observed_price' => (float) $priceText,
                'ocr_confidence' => 0.8,
            ];
        }

        return $items;
    }

    private function isNonItemLine(string $line): bool
    {
        foreach (self::NON_ITEM_LABELS as $label) {
            if (preg_match('/\b'.preg_quote($label, '/').'\b/i', $line) === 1) {
                return true;
            }
        }

        return false;
    }
}
