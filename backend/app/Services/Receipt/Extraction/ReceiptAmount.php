<?php

namespace App\Services\Receipt\Extraction;

/** Strict parsing of extracted amounts and quantities. Values are normalized for format only, never altered. */
final class ReceiptAmount
{
    /**
     * Parses a printed money amount into integer centavos. Accepts "1234.50", grouped "1,234.50", and comma-decimal
     * "608,50", with an optional currency prefix and trailing VAT flag. Returns null for anything else.
     *
     * @return array{cents: int, negative: bool}|null
     */
    public static function money(?string $value): ?array
    {
        if ($value === null) {
            return null;
        }
        $text = strtoupper(trim($value));
        $negative = false;
        if (preg_match('/^\((.*)\)$/', $text, $match)) {
            $negative = true;
            $text = trim($match[1]);
        }
        if (str_starts_with($text, '-')) {
            $negative = true;
            $text = ltrim(substr($text, 1));
        } elseif (str_ends_with($text, '-')) {
            $negative = true;
            $text = rtrim(substr($text, 0, -1));
        }
        $text = trim((string) preg_replace('/^(?:PHP|₱|P)\s*/u', '', $text));
        $text = (string) preg_replace('/(?<=\d)[TVXZE]$/', '', $text);

        if (preg_match('/^\d{1,7}\.\d{2}$/', $text) !== 1) {
            if (preg_match('/^\d{1,3}(?:,\d{3})+\.\d{2}$/', $text) === 1) {
                $text = str_replace(',', '', $text);
            } elseif (preg_match('/^\d{1,7},\d{2}$/', $text) === 1) {
                $text = str_replace(',', '.', $text);
            } else {
                return null;
            }
        }
        [$whole, $fraction] = explode('.', $text);
        if (strlen($whole) > 7) {
            return null;
        }

        return ['cents' => (int) $whole * 100 + (int) $fraction, 'negative' => $negative];
    }

    /** Parses a quantity (e.g. "2", "0.525"); returns null unless 0 < q <= 9999 with at most three decimals. */
    public static function quantity(?string $value): ?float
    {
        if ($value === null || preg_match('/^\d{1,6}(?:\.\d{1,3})?$/', trim($value)) !== 1) {
            return null;
        }
        $quantity = (float) trim($value);

        return $quantity > 0 && $quantity <= 9999 ? $quantity : null;
    }

    public static function format(int $cents): string
    {
        return sprintf('%d.%02d', intdiv($cents, 100), $cents % 100);
    }
}
