<?php

namespace App\Services\Receipt;

class ReceiptOcrResultSelector
{
    private const TECHNICAL_STATUSES = ['OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_FAILED'];

    /** @param array<int, string> $merchantNames */
    public function select(array $primary, array $fallback, bool $posLayout = false, array $merchantNames = []): array
    {
        return $this->selectedPass($primary, $fallback, $posLayout, $merchantNames) === 'fallback' ? $fallback : $primary;
    }

    /** @param array<int, string> $merchantNames Same store context as final extraction, so scoring counts the same items. */
    public function selectedPass(array $primary, array $fallback, bool $posLayout = false, array $merchantNames = []): string
    {
        if ($this->isTechnical($primary) && $this->isTechnical($fallback)) {
            return 'fallback';
        }

        return $this->score($fallback, $posLayout, $merchantNames) > $this->score($primary, $posLayout, $merchantNames) ? 'fallback' : 'primary';
    }

    public function isTechnical(array $result): bool
    {
        return in_array($result['status'] ?? null, self::TECHNICAL_STATUSES, true);
    }

    private function score(array $result, bool $posLayout, array $merchantNames): array
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
            count((new ReceiptItemExtractor)->analyze($lines, $posLayout, $merchantNames)['items']),
            (new ReceiptTotalExtractor)->extract($lines) !== null ? 1 : 0,
            $confidence,
        ];
    }
}
