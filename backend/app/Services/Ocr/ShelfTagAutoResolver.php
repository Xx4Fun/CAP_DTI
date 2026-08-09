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

        $top = $candidates[0];
        $topScore = (int) ($top['match_score'] ?? 0);
        $runnerUpScore = isset($candidates[1]) ? (int) ($candidates[1]['match_score'] ?? 0) : 0;
        $level = (string) ($top['match_level'] ?? 'POSSIBLE');
        $isClearStrongMatch = $level === 'STRONG' && $topScore >= 80 && ($topScore - $runnerUpScore) >= 20;

        if (!$isClearStrongMatch) {
            return array_merge($base, ['recovery_reason' => 'AMBIGUOUS_PRODUCT']);
        }

        return [
            'auto_resolved' => true,
            'product_id' => (int) $top['id'],
            'recovery_reason' => null,
            'detected_price_string' => $detectedPriceString,
        ];
    }
}
