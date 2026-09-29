<?php

namespace App\Services\Receipt;

class ReceiptMerchantMatcher
{
    private const GENERIC_TOKENS = ['store', 'stores', 'mart', 'market', 'grocery', 'supermarket', 'branch', 'official', 'receipt'];

    private const LEGAL_TOKENS = ['inc', 'corp', 'corporation', 'co', 'company', 'ltd', 'enterprise', 'enterprises', 'trading', 'the', 'and', 'of'];

    /** Receipt boilerplate: never an acronym for the store, never evidence that a merchant name was read. */
    private const RECEIPT_NOISE = ['vat', 'tin', 'reg', 'min', 'pos', 'ptu', 'tel', 'non', 'sn', 'or', 'si', 'no',
        'official', 'sales', 'invoice', 'receipt', 'cashier', 'date', 'time', 'total', 'address'];

    public function match(?string $storeName, ?string $ownerName, array $headerLines): array
    {
        $observed = array_values(array_filter(
            array_map('trim', array_slice($headerLines, 0, 6)),
            fn (string $line) => $line !== '' && preg_match('/\d+[.,]\d{2}\s*$/', $line) !== 1,
        ));

        $partial = false;
        foreach (array_filter([$storeName, $ownerName]) as $expected) {
            $result = $this->nameMatches((string) $expected, $observed);
            $partial = $partial || $result === 'partial';
            if ($result === 'matched') {
                $matchingLines = array_values(array_unique(array_filter($observed, fn (string $line) => $this->nameMatches((string) $expected, [$line]) === 'matched')));

                return [
                    'status' => 'matched',
                    'expected_store' => $storeName,
                    'observed' => $observed,
                    'display_name' => count($matchingLines) === 1 ? $matchingLines[0] : null,
                ];
            }
        }

        $meaningful = array_filter($this->words(implode(' ', $observed)), fn (string $word) => strlen($word) >= 3
            && ! ctype_digit($word)
            && ! in_array($word, [...self::GENERIC_TOKENS, ...self::LEGAL_TOKENS, ...self::RECEIPT_NOISE], true));

        // Part of the name was read (e.g. brand-only "PUREGOLD" for "Puregold Price Club"): not proof of a different store.
        return [
            'status' => $meaningful === [] || $partial ? 'unverified' : 'mismatch',
            'expected_store' => $storeName,
            'observed' => $observed,
            'display_name' => null,
        ];
    }

    /** Whether a line names the expected merchant, using the same token threshold as match(). */
    public function mentions(?string $expected, string $line): bool
    {
        $expectedTokens = $this->tokens((string) $expected);

        return $expectedTokens !== []
            && count(array_intersect($expectedTokens, $this->tokens($line))) / count($expectedTokens) >= 0.5;
    }

    /**
     * Tolerates receipt shortcuts: short brands (SM), acronyms (RSC), abbreviations (GEN MDSE, SUPERMKT),
     * spacing (PURE GOLD) and one-character OCR slips (PUREG0LD).
     * ponytail: naive abbreviation rules; add a per-store alias column if real receipts still miss.
     *
     * @param  array<int, string>  $lines
     * @return 'matched'|'partial'|null partial: a strong word matched but below the 0.5 threshold
     */
    private function nameMatches(string $expected, array $lines): ?string
    {
        $all = array_values(array_filter($this->words($expected), fn (string $word) => ! ctype_digit($word)));
        $distinct = array_values(array_unique(array_diff($all, self::GENERIC_TOKENS, self::LEGAL_TOKENS)));
        $generic = array_values(array_unique(array_intersect($all, self::GENERIC_TOKENS)));
        $lineWords = array_map(fn (string $line) => $this->words($line), $lines);

        if ($distinct === []) {
            $whole = implode('', $this->words($expected));

            return strlen($whole) >= 5 && in_array($whole, array_map(fn (array $words) => implode('', $words), $lineWords), true) ? 'matched' : null;
        }

        $acronymHits = $this->acronymHits($all, $lineWords);
        $hits = [];
        foreach ($distinct as $token) {
            $hitLines = array_keys(array_filter($lineWords, fn (array $words) => $this->tokenMatches($token, $words)));
            $viaAcronym = isset($acronymHits[$token]);
            if ($hitLines !== [] || $viaAcronym) {
                $hits[] = ['lines' => $hitLines, 'strong' => $viaAcronym || ! $this->isWeak($token)];
            }
        }

        $strong = in_array(true, array_column($hits, 'strong'), true);
        if (count($hits) / count($distinct) < 0.5) {
            return $strong ? 'partial' : null;
        }
        if ($strong) {
            return 'matched';
        }

        // Only short alphabetic brands matched (e.g. "SM"): the same line must also name the store type.
        foreach ($hits as $hit) {
            foreach ($hit['lines'] as $i) {
                foreach ($generic as $word) {
                    if ($this->tokenMatches($word, $lineWords[$i])) {
                        return 'matched';
                    }
                }
            }
        }

        return null;
    }

    /** @param array<int, string> $observedWords */
    private function tokenMatches(string $expected, array $observedWords): bool
    {
        // Split words ("PURE GOLD") must join into exactly the expected word, never a prefix of a longer one.
        for ($start = 0; $start < count($observedWords) - 1; $start++) {
            for ($joined = $observedWords[$start], $next = $start + 1; $next < count($observedWords) && strlen($joined) < strlen($expected); $next++) {
                $joined .= $observedWords[$next];
                if (strlen($expected) >= 5 && $joined === $expected) {
                    return true;
                }
            }
        }

        foreach ($observedWords as $word) {
            if ($word === $expected
                || (strlen($expected) >= 5 && levenshtein($word, $expected) <= 1)
                || (strlen($word) >= 3 && strlen($word) < strlen($expected) && $word[0] === $expected[0]
                    && strlen($word) * 3 >= strlen($expected) && $this->isSubsequence($word, $expected))) {
                return true;
            }
        }

        return false;
    }

    /**
     * Distinctive expected words covered by an observed acronym (RSC = Robinsons Supermarket Corporation).
     *
     * @param  array<int, string>  $expectedWords
     * @param  array<int, array<int, string>>  $lineWords
     * @return array<string, true>
     */
    private function acronymHits(array $expectedWords, array $lineWords): array
    {
        $hits = [];
        foreach (array_merge(...$lineWords ?: [[]]) as $word) {
            $length = strlen($word);
            if ($length < 3 || ctype_digit($word) || in_array($word, self::RECEIPT_NOISE, true)) {
                continue;
            }
            for ($start = 0; $start + $length <= count($expectedWords); $start++) {
                $run = array_slice($expectedWords, $start, $length);
                if (implode('', array_map(fn (string $w) => $w[0], $run)) === $word) {
                    foreach ($run as $covered) {
                        $hits[$covered] = true;
                    }
                }
            }
        }

        return $hits;
    }

    private function isSubsequence(string $needle, string $haystack): bool
    {
        $position = 0;
        foreach (str_split($needle) as $char) {
            $position = strpos($haystack, $char, $position);
            if ($position === false) {
                return false;
            }
            $position++;
        }

        return true;
    }

    /** Short alphabetic brands and receipt boilerplate words need a store-type word on the same line. */
    private function isWeak(string $token): bool
    {
        return (strlen($token) < 4 && ctype_alpha($token)) || in_array($token, self::RECEIPT_NOISE, true);
    }

    private function words(string $value): array
    {
        $value = str_replace(['&', "'", '’'], [' and ', '', ''], mb_strtolower($value));

        return preg_split('/[^\p{L}\p{N}]+/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }

    private function tokens(string $value): array
    {
        $tokens = preg_split('/[^a-z0-9]+/i', strtolower($value), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_filter($tokens, fn (string $token) => strlen($token) >= 3
            && ! ctype_digit($token)
            && ! in_array($token, self::GENERIC_TOKENS, true))));
    }
}
