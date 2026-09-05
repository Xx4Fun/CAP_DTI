<?php

namespace App\Services\Receipt;

class ReceiptMerchantMatcher
{
    private const GENERIC_TOKENS = ['store', 'stores', 'mart', 'market', 'grocery', 'supermarket', 'branch', 'official', 'receipt'];

    public function match(?string $storeName, ?string $ownerName, array $headerLines): array
    {
        $observed = array_values(array_filter(
            array_map('trim', array_slice($headerLines, 0, 6)),
            fn (string $line) => $line !== '' && preg_match('/\d+[.,]\d{2}\s*$/', $line) !== 1,
        ));
        $observedTokens = $this->tokens(implode(' ', $observed));
        $matchingLines = [];

        foreach (array_filter([$storeName, $ownerName]) as $expected) {
            $expectedTokens = $this->tokens((string) $expected);
            if ($expectedTokens !== [] && count(array_intersect($expectedTokens, $observedTokens)) / count($expectedTokens) >= 0.5) {
                foreach ($observed as $line) {
                    $lineTokens = $this->tokens($line);
                    if (count(array_intersect($expectedTokens, $lineTokens)) / count($expectedTokens) >= 0.5) {
                        $matchingLines[$line] = true;
                    }
                }
                return [
                    'status' => 'matched',
                    'expected_store' => $storeName,
                    'observed' => $observed,
                    'display_name' => count($matchingLines) === 1 ? array_key_first($matchingLines) : null,
                ];
            }
        }

        return [
            'status' => $observedTokens === [] ? 'unverified' : 'mismatch',
            'expected_store' => $storeName,
            'observed' => $observed,
            'display_name' => null,
        ];
    }

    private function tokens(string $value): array
    {
        $tokens = preg_split('/[^a-z0-9]+/i', strtolower($value), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_unique(array_filter($tokens, fn (string $token) => strlen($token) >= 3
            && ! ctype_digit($token)
            && ! in_array($token, self::GENERIC_TOKENS, true))));
    }
}
