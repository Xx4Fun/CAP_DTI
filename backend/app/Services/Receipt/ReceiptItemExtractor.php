<?php

namespace App\Services\Receipt;

class ReceiptItemExtractor
{
    private const NON_ITEM_LABELS = [
        'total', 'subtotal', 'vat', 'tax', 'cash', 'change', 'tender', 'amount due', 'balance',
    ];

    /** Extra non-item labels for Philippine POS receipts (posLayout only, so other modes keep today's rules). */
    private const POS_NON_ITEM_LABELS = ['vatable', 'no of items', 'cashier'];

    private const MONEY = '\d{1,7}[.,]\d{2}';

    /** Next-line text that can never be an item name for a POS row (receipt header, footer, and identifiers). */
    private const PAIRING_EXCLUSIONS = '/\b(?:TIN|MIN|SERIAL|DATE|OR\s*NO|SOLD\s*TO|ADDRESS|CASHIER|TERMINAL|THANK|WELCOME|VISIT|PROMO|POINTS|MEMBER|SAVE|CORP|INC|MGMT|MALL|BRANCH|SUPERMARKET)\b/i';

    /**
     * Whether a structured-extraction item description is really a receipt header, footer, payment, identifier,
     * date, or address line. Unlike POS pairing, size and price tokens inside product names are allowed.
     */
    public static function isNonProductText(string $text): bool
    {
        $lower = strtolower(trim($text));
        foreach ([...self::NON_ITEM_LABELS, ...self::POS_NON_ITEM_LABELS] as $label) {
            if (preg_match('/\b'.preg_quote($label, '/').'\b/i', $lower) === 1) {
                return true;
            }
        }

        return preg_match('/\b(?:TIN|MIN|SERIAL|SOLD\s*TO|ADDRESS|THANK\s+YOU)\b/i', $text) === 1
            || (new ReceiptDateExtractor)->containsDate($text)
            || substr_count($text, ',') >= 2
            || preg_match('/,.*\b\d{4}$/', $text) === 1;
    }

    /** @param array<int, string> $lines */
    public function extract(array $lines): array
    {
        return $this->analyze($lines)['items'];
    }

    /**
     * @param  array<int, string>  $lines
     * @param  bool  $posLayout  Enables Philippine POS rules for guided receipts: VAT flag suffixes and
     *                           "SKU QTY PRICE TOTAL" rows whose item name is printed on the next line.
     * @param  array<int, string>  $merchantNames  Known store/owner names; lines naming them are never item names.
     */
    public function analyze(array $lines, bool $posLayout = false, array $merchantNames = []): array
    {
        $items = [];
        $rejectedLines = [];
        $lines = array_values($lines);
        $consumed = [];
        foreach ($lines as $index => $line) {
            if (isset($consumed[$index])) {
                continue;
            }
            $trimmed = trim($line);
            if ($trimmed === '' || $this->isNonItemLine(strtolower($trimmed), $posLayout)) {
                continue;
            }
            $rawText = $trimmed;
            if ($posLayout) {
                $trimmed = $this->stripFlagSuffix($trimmed);
                $row = $this->posRow($trimmed);
                $name = $row === null ? null : $this->pairableName($lines[$index + 1] ?? null, $merchantNames);
                if ($name !== null) {
                    $consumed[$index + 1] = true;
                    $items[] = [
                        'sequence' => count($items),
                        'raw_text' => $rawText."\n".trim($lines[$index + 1]),
                        'item_name' => $name,
                        'quantity' => $row['quantity'],
                        'unit' => null,
                        'observed_price' => $row['price'],
                        'ocr_confidence' => null,
                    ];
                    continue;
                }
            }
            if (! preg_match('/(?:PHP|P|₱)?\s*(\(?-?\d{1,7}(?:[.,]\d{2})\)?-?)\s*$/iu', $trimmed, $matches, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            $rawPrice = $matches[1][0];
            $negative = str_starts_with($rawPrice, '-') || str_ends_with($rawPrice, '-')
                || (str_starts_with($rawPrice, '(') && str_ends_with($rawPrice, ')'));
            $priceText = str_replace(',', '.', (string) preg_replace('/[^0-9.,]/', '', $rawPrice));
            $itemName = trim(substr($trimmed, 0, $matches[0][1]), " \t\n\r\0\x0B.-:");
            if ($itemName === '' || $this->isNonItemLine(strtolower($itemName), $posLayout)) {
                if ($itemName === '') {
                    $rejectedLines[] = $rawText;
                }
                continue;
            }

            $quantity = null;
            if (preg_match('/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:x|@)\s*\d+(?:[.,]\d{2})\s*$/i', $itemName, $quantityMatch, PREG_OFFSET_CAPTURE)) {
                $quantity = (float) str_replace(',', '.', $quantityMatch[1][0]);
                $itemName = trim(substr($itemName, 0, $quantityMatch[0][1]));
            }
            // POS names need three letters, like paired names: rejects OCR noise ("Te 30,501") and damaged SKU rows.
            if (preg_match('/\p{L}/u', $itemName) !== 1 || ($posLayout && preg_match_all('/\p{L}/u', $itemName) < 3)) {
                $rejectedLines[] = $rawText;
                continue;
            }
            if (preg_match('/\b(?:discount|disc|promo|coupon|rebate)\b/i', $itemName)) {
                $negative = true;
            }

            $items[] = [
                'sequence' => count($items),
                'raw_text' => $rawText,
                'item_name' => $itemName,
                'quantity' => $quantity,
                'unit' => null,
                'observed_price' => ($negative ? -1 : 1) * (float) $priceText,
                'ocr_confidence' => null,
            ];
        }

        return ['items' => $items, 'rejected_lines' => $rejectedLines];
    }

    /**
     * Removes at most one VAT/tax flag printed (or OCR'd) right after the final amount:
     * "111.75T" → "111.75", and "15.507" → "15.50" when a digit 7/1 forms an impossible third decimal.
     */
    private function stripFlagSuffix(string $line): string
    {
        if (preg_match('/'.self::MONEY.'[TVXZEIl|]$/u', $line) === 1
            || preg_match('/(?<![.,\d])\d{1,7}[.,]\d{2}[71]$/', $line) === 1) {
            return substr($line, 0, -1);
        }

        return $line;
    }

    /**
     * Matches a letter-free "SKU QTY [UNIT PRICE] LINE TOTAL" row (after suffix normalization).
     *
     * @return array{quantity: float, price: float}|null
     */
    private function posRow(string $line): ?array
    {
        $money = self::MONEY;
        if (preg_match('/\p{L}/u', $line) === 1
            || preg_match("/^[\\s\\p{P}]*\\d{5,}[\\s\\p{P}]*\\s+(\\d{1,3})\\s+(?:({$money})\\s+)?({$money})$/u", $line, $match) !== 1) {
            return null;
        }

        return ['quantity' => (float) $match[1], 'price' => (float) str_replace(',', '.', $match[3])];
    }

    /** @param array<int, string> $merchantNames */
    private function pairableName(?string $line, array $merchantNames): ?string
    {
        $name = trim((string) $line, " \t\n\r\0\x0B.-:");
        if ($name === ''
            || preg_match('/\d[.,]\d{2}/', $name) === 1
            || preg_match_all('/\p{L}/u', $name) < 3
            || $this->isNonItemLine(strtolower($name), true)
            || preg_match(self::PAIRING_EXCLUSIONS, $name) === 1
            || preg_match('/\d{1,4}[\/-]\d{1,2}[\/-]\d{1,4}/', $name) === 1
            || (new ReceiptDateExtractor)->containsDate($name)
            // Address lines: several comma-separated places, or a place followed by a 4-digit postal code.
            || substr_count($name, ',') >= 2
            || preg_match('/,.*\b\d{4}$/', $name) === 1) {
            return null;
        }
        $matcher = new ReceiptMerchantMatcher;
        foreach ($merchantNames as $merchant) {
            if ($matcher->mentions($merchant, $name)) {
                return null;
            }
        }

        return $name;
    }

    private function isNonItemLine(string $line, bool $posLayout = false): bool
    {
        foreach ($posLayout ? [...self::NON_ITEM_LABELS, ...self::POS_NON_ITEM_LABELS] : self::NON_ITEM_LABELS as $label) {
            if (preg_match('/\b'.preg_quote($label, '/').'\b/i', $line) === 1) {
                return true;
            }
        }

        return false;
    }
}
