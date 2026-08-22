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
            if ($trimmed === '' || $this->isNonItemLine(strtolower($trimmed))) {
                continue;
            }
            if (! preg_match('/(?:PHP|P|₱)?\s*(\(?-?\d{1,7}(?:[.,]\d{2})\)?-?)\s*$/iu', $trimmed, $matches, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            $rawPrice = $matches[1][0];
            $negative = str_starts_with($rawPrice, '-') || str_ends_with($rawPrice, '-')
                || (str_starts_with($rawPrice, '(') && str_ends_with($rawPrice, ')'));
            $priceText = str_replace(',', '.', (string) preg_replace('/[^0-9.,]/', '', $rawPrice));
            $itemName = trim(substr($trimmed, 0, $matches[0][1]), " \t\n\r\0\x0B.-:");
            if ($itemName === '' || $this->isNonItemLine(strtolower($itemName))) {
                continue;
            }

            $quantity = null;
            if (preg_match('/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|@)\s*\d+(?:[.,]\d{2})\s*$/i', $itemName, $quantityMatch, PREG_OFFSET_CAPTURE)) {
                $quantity = (float) str_replace(',', '.', $quantityMatch[1][0]);
                $itemName = trim(substr($itemName, 0, $quantityMatch[0][1]));
            }
            if (preg_match('/\b(?:discount|disc|promo|coupon|rebate)\b/i', $itemName)) {
                $negative = true;
            }

            $items[] = [
                'sequence' => count($items),
                'raw_text' => $trimmed,
                'item_name' => $itemName,
                'quantity' => $quantity,
                'unit' => null,
                'observed_price' => ($negative ? -1 : 1) * (float) $priceText,
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
