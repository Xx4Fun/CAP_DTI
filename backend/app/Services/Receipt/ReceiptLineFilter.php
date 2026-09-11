<?php

namespace App\Services\Receipt;

/** Drops OCR noise lines (background texture, stray marks) while keeping any line with a money amount. */
class ReceiptLineFilter
{
    /** @param array<int, string> $lines */
    public function filter(array $lines): array
    {
        return array_values(array_filter($lines, fn ($line) => is_string($line) && $this->keeps($line)));
    }

    /** @param array<int, string> $lines */
    public function readableRatio(array $lines): float
    {
        return $lines === [] ? 0.0 : count($this->filter($lines)) / count($lines);
    }

    public function keeps(string $line): bool
    {
        if (preg_match('/\d[.,]\d{2}/', $line) === 1) {
            return true;
        }
        $alphanumeric = preg_match_all('/[\p{L}\p{N}]/u', $line);
        $visible = preg_match_all('/\S/u', $line);

        return $alphanumeric >= 3 && $alphanumeric / max(1, $visible) >= 0.5;
    }
}
