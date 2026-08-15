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
        $merchants = array_values(array_unique(array_filter(array_map(
            fn (array $frame) => $this->normalize((string) ($frame['merchant'] ?? '')),
            $frames,
        ))));
        if (count($merchants) > 1) {
            $reasons[] = 'merchant_mismatch';
        }

        $overlapPairs = 0;
        $pairCount = count($frames) - 1;
        for ($index = 0; $index < $pairCount; $index++) {
            $currentLines = array_filter(array_map([$this, 'normalize'], $frames[$index]['lines']));
            $nextLines = array_filter(array_map([$this, 'normalize'], $frames[$index + 1]['lines']));
            if (array_intersect($currentLines, $nextLines) !== []) {
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

    private function normalize(string $value): string
    {
        $normalized = preg_replace('/[^a-z0-9]+/i', ' ', strtolower(trim($value)));

        return trim((string) preg_replace('/\s+/', ' ', (string) $normalized));
    }
}
