<?php

namespace App\Services\Receipt;

class ReceiptContinuityAnalyzer
{
    /**
     * @param  array<int, array{sequence:int, merchant:?string, lines:array<int,string>}>  $frames
     * @return array{status:string, continuity_score:float, reasons:array<int,string>}
     */
    public function analyze(array $frames): array
    {
        usort($frames, fn (array $left, array $right) => $left['sequence'] <=> $right['sequence']);

        if (count($frames) < 2) {
            return ['status' => 'needs_recapture', 'continuity_score' => 0.0, 'reasons' => ['insufficient_frames']];
        }

        $reasons = [];

        $overlapPairs = 0;
        $pairCount = count($frames) - 1;
        for ($index = 0; $index < $pairCount; $index++) {
            if ($this->hasFuzzyOverlap($frames[$index]['lines'], $frames[$index + 1]['lines'])) {
                $overlapPairs++;
            } else {
                $reasons[] = 'missing_adjacent_overlap';
            }
        }

        $score = $pairCount > 0 ? round($overlapPairs / $pairCount, 4) : 0.0;
        $reasons = array_values(array_unique($reasons));

        return [
            'status' => $reasons === [] ? 'ready' : 'needs_recapture',
            'continuity_score' => $score,
            'reasons' => $reasons,
        ];
    }

    private function hasFuzzyOverlap(array $currentLines, array $nextLines): bool
    {
        foreach ($currentLines as $currentLine) {
            $current = $this->normalize((string) $currentLine);
            $currentTokens = $this->tokens($current);
            if ($currentTokens === []) {
                continue;
            }

            foreach ($nextLines as $nextLine) {
                $next = $this->normalize((string) $nextLine);
                if ($current === $next && $current !== '') {
                    return true;
                }

                $nextTokens = $this->tokens($next);
                $denominator = max(count($currentTokens), count($nextTokens));
                if ($denominator > 0 && count(array_intersect($currentTokens, $nextTokens)) / $denominator >= 0.6) {
                    return true;
                }
            }
        }

        return false;
    }

    private function tokens(string $value): array
    {
        $tokens = preg_split('/\s+/', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_filter(
            $tokens,
            fn (string $token) => strlen($token) >= 2 && ! ctype_digit($token),
        )));
    }

    private function normalize(string $value): string
    {
        $normalized = preg_replace('/[^a-z0-9]+/i', ' ', strtolower(trim($value)));

        return trim((string) preg_replace('/\s+/', ' ', (string) $normalized));
    }
}
