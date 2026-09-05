<?php

namespace App\Services\Receipt;

class ReceiptOcrResultSelector
{
    private const TECHNICAL_STATUSES = ['OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_FAILED'];

    public function select(array $primary, array $fallback): array
    {
        return $this->selectedPass($primary, $fallback) === 'fallback' ? $fallback : $primary;
    }

    public function selectedPass(array $primary, array $fallback): string
    {
        if ($this->isTechnical($primary) && $this->isTechnical($fallback)) {
            return 'fallback';
        }

        return $this->score($fallback) > $this->score($primary) ? 'fallback' : 'primary';
    }

    public function isTechnical(array $result): bool
    {
        return in_array($result['status'] ?? null, self::TECHNICAL_STATUSES, true);
    }

    private function score(array $result): array
    {
        if (($result['status'] ?? null) !== 'OCR_SUCCESS') {
            return [0, 0, 0, 0.0];
        }

        $words = array_filter($result['words'] ?? [], 'is_array');
        $confidences = array_values(array_filter(array_column($words, 'confidence'), 'is_numeric'));
        $confidence = $confidences === [] ? 0.0 : array_sum($confidences) / count($confidences);
        $lines = array_values(array_filter($result['lines'] ?? [], 'is_string'));

        return [
            1,
            count((new ReceiptItemExtractor)->extract($lines)),
            (new ReceiptTotalExtractor)->extract($lines) !== null ? 1 : 0,
            $confidence,
        ];
    }
}
