<?php

namespace App\Services\Receipt;

class ReceiptTotalExtractor
{
    public function extract(array $lines): ?float
    {
        $matches = [];
        foreach ($lines as $line) {
            if (preg_match('/\b(?:grand\s+)?total\b(?!\s+(?:items?|qty))[^0-9]*(\d{1,9}(?:[.,]\d{2}))\s*$/i', (string) $line, $match)) {
                $matches[] = (float) str_replace(',', '.', $match[1]);
            }
        }

        return $matches === [] ? null : end($matches);
    }
}

