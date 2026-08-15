<?php

namespace App\Services\Receipt;

class ReceiptTextAggregator
{
    /** @param array<int, array<int, string>> $frameLines */
    public function merge(array $frameLines): array
    {
        $merged = [];
        foreach ($frameLines as $lines) {
            $lines = array_values(array_filter(array_map('trim', $lines), fn (string $line) => $line !== ''));
            if ($merged === []) {
                $merged = $lines;

                continue;
            }

            $overlap = $this->largestOverlap($merged, $lines);
            $merged = array_merge($merged, array_slice($lines, $overlap));
        }

        return $merged;
    }

    private function largestOverlap(array $merged, array $next): int
    {
        $max = min(count($merged), count($next), 5);
        for ($length = $max; $length > 0; $length--) {
            $suffix = array_map([$this, 'normalize'], array_slice($merged, -$length));
            $prefix = array_map([$this, 'normalize'], array_slice($next, 0, $length));
            if ($suffix === $prefix) {
                return $length;
            }
        }

        return 0;
    }

    private function normalize(string $value): string
    {
        return strtolower(trim((string) preg_replace('/\s+/', ' ', $value)));
    }
}
