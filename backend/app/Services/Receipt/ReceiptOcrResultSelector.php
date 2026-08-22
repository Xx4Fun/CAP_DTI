<?php

namespace App\Services\Receipt;

class ReceiptOcrResultSelector
{
    private const TECHNICAL_STATUSES = ['OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_FAILED'];

    public function select(array $primary, array $fallback): array
    {
        if ($this->isTechnical($primary) && $this->isTechnical($fallback)) {
            return $fallback;
        }

        return $this->score($fallback) > $this->score($primary) ? $fallback : $primary;
    }

    public function isTechnical(array $result): bool
    {
        return in_array($result['status'] ?? null, self::TECHNICAL_STATUSES, true);
    }

    private function score(array $result): float
    {
        if (($result['status'] ?? null) !== 'OCR_SUCCESS') {
            return 0.0;
        }

        $words = array_filter($result['words'] ?? [], 'is_array');
        $confidence = $words === [] ? 0.0 : array_sum(array_column($words, 'confidence')) / count($words);

        return count(array_filter($result['lines'] ?? [], 'is_string')) * 1000 + count($words) * 10 + $confidence;
    }
}

