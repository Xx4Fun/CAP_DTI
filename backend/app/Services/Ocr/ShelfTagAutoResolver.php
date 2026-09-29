<?php

namespace App\Services\Ocr;

class ShelfTagAutoResolver
{
    public function decide(array $candidates, ?string $detectedPriceString, int $priceConfidence): array
    {
        $base = [
            'auto_resolved' => false,
            'product_id' => null,
            'recovery_reason' => null,
            'detected_price_string' => $detectedPriceString,
        ];

        if ($detectedPriceString === null || trim($detectedPriceString) === '') {
            return array_merge($base, [
                'recovery_reason' => empty($candidates) ? 'NO_TEXT' : 'PRICE_MISSING',
            ]);
        }

        if ($priceConfidence < 80) {
            return array_merge($base, ['recovery_reason' => 'PRICE_UNCERTAIN']);
        }

        if (empty($candidates)) {
            return array_merge($base, ['recovery_reason' => 'PRODUCT_MISSING']);
        }

        if (! $this->isClearStrongMatch($candidates)) {
            return array_merge($base, ['recovery_reason' => 'AMBIGUOUS_PRODUCT']);
        }

        return [
            'auto_resolved' => true,
            'product_id' => (int) $candidates[0]['id'],
            'recovery_reason' => null,
            'detected_price_string' => $detectedPriceString,
        ];
    }

    /**
     * Whether the top candidate is strong enough to accept without a human choosing it: a STRONG
     * match that also clears the runner-up by a wide margin. Shared with receipt-item matching,
     * which has no detected price string to gate on.
     */
    public function isClearStrongMatch(array $candidates): bool
    {
        if (empty($candidates)) {
            return false;
        }

        $top = $candidates[0];
        $topScore = (int) ($top['match_score'] ?? 0);
        $runnerUpScore = isset($candidates[1]) ? (int) ($candidates[1]['match_score'] ?? 0) : 0;

        return (string) ($top['match_level'] ?? 'POSSIBLE') === 'STRONG'
            && $topScore >= 80
            && ($topScore - $runnerUpScore) >= 20;
    }
}
