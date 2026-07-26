<?php

namespace App\Services\Ocr;

class ShelfTagTextNormalizer
{
    /**
     * Normalize OCR text noise and currency formats.
     */
    public static function normalizeText(string $text): string
    {
        // Replace unicode non-breaking spaces with standard space
        $text = str_replace(["\xC2\xA0", "\xA0"], ' ', $text);
        // Replace unicode multiplication symbol with 'x'
        $text = str_replace(['×', '✕'], 'x', $text);
        // Trim multiple spaces
        return trim(preg_replace('/\s+/', ' ', $text));
    }

    /**
     * Strip currency anchors and normalize numeric price representation.
     * Supports formats: ₱23.50, P23.50, PHP 23.50, 23.50, 23,50, ₱23, 23.5.
     * Returns 2-decimal formatted string e.g. '23.50', or null if invalid.
     */
    public static function normalizePrice(string $priceRaw): ?string
    {
        $cleaned = trim($priceRaw);
        if ($cleaned === '') {
            return null;
        }

        // Remove currency symbols & anchor words at start or end
        $cleaned = preg_replace('/^(?:PHP|SRP|PRICE|PESOS|PESO|[₱P\$])\s*/iu', '', $cleaned);
        $cleaned = preg_replace('/\s*(?:PHP|SRP|PRICE|PESOS|PESO|[₱P\$])$/iu', '', $cleaned);
        $cleaned = trim($cleaned);

        // Replace comma decimal separator (e.g., 23,50 or 23,5 -> 23.50 or 23.5)
        if (preg_match('/^(\d+),(\d{1,2})$/', $cleaned, $m)) {
            $cleaned = $m[1] . '.' . $m[2];
        }

        // Add decimal to pure integer (e.g., 23 -> 23.00)
        if (preg_match('/^(\d+)$/', $cleaned, $m)) {
            $cleaned = $m[1] . '.00';
        }

        // Normalize single digit decimal (e.g., 23.5 -> 23.50)
        if (preg_match('/^(\d+)\.(\d)$/', $cleaned, $m)) {
            $cleaned = $m[1] . '.' . $m[2] . '0';
        }

        // Verify valid formatted decimal string: \d+\.\d{2}
        if (!preg_match('/^(\d+)\.(\d{2})$/', $cleaned)) {
            return null;
        }

        // Reject negative or unrealistically huge numbers
        if ((float) $cleaned <= 0 || (float) $cleaned > 999999.99) {
            return null;
        }

        return $cleaned;
    }

    /**
     * Convert decimal price string ('23.50') safely to integer centavos (2350).
     * Strictly avoids binary floating point arithmetic to prevent rounding anomalies.
     */
    public static function toCentavos(string $decimalString): ?int
    {
        $decimalString = trim($decimalString);

        if (!preg_match('/^(\d+)\.(\d{2})$/', $decimalString, $m)) {
            return null;
        }

        $pesos = (int) $m[1];
        $centavos = (int) $m[2];

        return ($pesos * 100) + $centavos;
    }

    /**
     * Normalize package size units: g, kg, mL, L, pcs, pack, can, sachet.
     * Handles multipacks e.g. 155 g × 2 or 155g x 2 -> 155 g x 2.
     */
    public static function normalizePackageSize(string $text): ?string
    {
        $text = self::normalizeText($text);

        $unitsPattern = 'g|kg|ml|l|pcs|pack|can|sachet';
        // Matches number + unit + optional multipack modifier (x 2, ×2, etc.)
        $pattern = '/\b(\d+(?:\.\d+)?)\s*(' . $unitsPattern . ')(?:\s*([x]|pack of)\s*(\d+))?\b/i';

        if (preg_match($pattern, $text, $m)) {
            $num = $m[1];
            $unitRaw = strtolower($m[2]);

            $unitMap = [
                'g' => 'g',
                'kg' => 'kg',
                'ml' => 'mL',
                'l' => 'L',
                'pcs' => 'pcs',
                'pack' => 'pack',
                'can' => 'can',
                'sachet' => 'sachet',
            ];

            $unit = $unitMap[$unitRaw] ?? $unitRaw;
            $multi = isset($m[4]) && $m[4] !== '' ? ' x ' . $m[4] : '';

            return "{$num} {$unit}{$multi}";
        }

        return null;
    }

    /**
     * Extract the primary numeric size value from a package size string.
     * e.g. "155 g" -> 155.0, "1.5 L" -> 1.5
     */
    public static function extractPackageSizeNumber(string $text): ?float
    {
        $normalized = self::normalizePackageSize($text);
        if (!$normalized) {
            return null;
        }

        if (preg_match('/^(\d+(?:\.\d+)?)/', $normalized, $m)) {
            return (float) $m[1];
        }

        return null;
    }

    /**
     * Check if a token is a monetary anchor keyword or symbol.
     */
    public static function isAnchorToken(string $token): bool
    {
        $t = strtolower(trim($token));
        $cleanAnchor = preg_replace('/[^a-z₱]/u', '', $t);

        return in_array($t, ['₱', 'p', 'php', 'srp', 'price', 'pesos', 'peso', 'p.'], true) ||
               in_array($cleanAnchor, ['₱', 'php', 'srp', 'price', 'pesos', 'peso'], true);
    }
}
