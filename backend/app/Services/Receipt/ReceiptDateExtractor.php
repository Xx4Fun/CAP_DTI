<?php

namespace App\Services\Receipt;

use DateTimeImmutable;
use DateTimeInterface;

class ReceiptDateExtractor
{
    private const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?';

    /**
     * Returns the receipt transaction date as YYYY-MM-DD, preferring a line labelled as a date.
     * Numeric dates are read month-first (MM/DD/YYYY), the common Philippine POS convention.
     *
     * @param  array<int, string>  $lines
     */
    public function extract(array $lines, ?DateTimeInterface $today = null): ?string
    {
        $latest = DateTimeImmutable::createFromInterface($today ?? now())->modify('+1 day')->format('Y-m-d');
        $first = null;
        foreach ($lines as $line) {
            foreach ($this->datesIn((string) $line) as $date) {
                if ($date < '2000-01-01' || $date > $latest) {
                    continue;
                }
                if (preg_match('/\b(?:date|txn|trans)/i', (string) $line) === 1) {
                    return $date;
                }
                $first ??= $date;
            }
        }

        return $first;
    }

    /** Whether the line holds a calendar date in any supported format (used to keep date lines out of item names). */
    public function containsDate(string $line): bool
    {
        return $this->datesIn($line) !== [];
    }

    /** @return array<int, string> valid calendar dates in reading order */
    private function datesIn(string $line): array
    {
        $month = self::MONTH;
        $patterns = [
            '/(?<!\d)(?<y>\d{4})[-\/](?<m>\d{1,2})[-\/](?<d>\d{1,2})(?!\d)/',
            '/(?<!\d)(?<m>\d{1,2})[-\/](?<d>\d{1,2})[-\/](?<y>\d{4}|\d{2})(?!\d)/',
            "/\\b(?<mn>{$month})\\s+(?<d>\\d{1,2}),?\\s+(?<y>\\d{4})(?!\\d)/i",
            "/(?<!\\d)(?<d>\\d{1,2})[\\s-]+(?<mn>{$month})[\\s-]+(?<y>\\d{4}|\\d{2})(?!\\d)/i",
        ];
        $found = [];
        foreach ($patterns as $pattern) {
            preg_match_all($pattern, $line, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
            foreach ($matches as $match) {
                $year = (int) $match['y'][0];
                $year += strlen($match['y'][0]) === 2 ? 2000 : 0;
                $monthNumber = isset($match['mn']) && $match['mn'][0] !== ''
                    ? $this->monthNumber($match['mn'][0])
                    : (int) $match['m'][0];
                $day = (int) $match['d'][0];
                if (checkdate($monthNumber, $day, $year)) {
                    $found[$match[0][1]] ??= sprintf('%04d-%02d-%02d', $year, $monthNumber, $day);
                }
            }
        }
        ksort($found);

        return array_values($found);
    }

    private function monthNumber(string $name): int
    {
        $prefix = strtolower(substr($name, 0, 3));

        return array_search($prefix, ['', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], true) ?: 0;
    }
}
