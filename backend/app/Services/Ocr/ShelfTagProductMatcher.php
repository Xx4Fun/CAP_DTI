<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;

class ShelfTagProductMatcher
{
    /**
     * Common Philippine brand names in regulatory bulletins.
     */
    protected const KNOWN_BRANDS = [
        'Saba Philippines',
        'Saba',
        'Mega',
        '555',
        'Ligo',
        'Young\'s Town',
        'Century',
        'San Jose',
        'Nescafé',
        'Nescafe',
        'Alaska',
        'Bear Brand',
        'Birch Tree',
        'Star',
        'Argentina',
        'CDO',
        'Purefoods',
        'Datu Puti',
        'Silver Swan',
        'UFC',
        'Marca Piña',
        'Knorr',
        'Maggi',
        'Surf',
        'Breeze',
        'Tide',
        'Safeguard',
        'Palmolive',
        'Colgate',
        'Eden',
        'Cheez Whiz',
        'Reno',
        'Master',
        'Champion',
    ];

    /**
     * Stop words to ignore during token overlap scoring.
     */
    protected const STOP_WORDS = [
        'in', 'with', 'and', 'of', 'the', 'a', 'an', 'for', 'at', 'by', 'or', 'to', 'is', 'on',
    ];

    /**
     * Evaluate active SRP bulletins against OCR product tokens and package size.
     *
     * @param array|string $productInput OCR product tokens array or string text.
     * @param string|null $packageSize Normalized package size (e.g. '155 g').
     * @param array $options Additional execution options (e.g. limit, minScore).
     * @return array Array of matching candidates (without baseline_price).
     */
    public function matchCandidates(array|string $productInput, ?string $packageSize = null, array $options = []): array
    {
        return $this->match($productInput, $packageSize, $options);
    }

    public function match(array|string $productInput, ?string $packageSize = null, array $options = []): array
    {
        $bulletins = $this->activeBulletins();

        if ($bulletins->isEmpty()) {
            return [];
        }

        // Process inputs
        $queryTokens = $this->extractTokens($productInput);
        $queryRawText = implode(' ', $queryTokens);
        $queryMeaningfulTokens = $this->filterMeaningfulTokens($queryTokens);
        
        $queryPackageSizeStr = $packageSize ? ShelfTagTextNormalizer::normalizePackageSize($packageSize) : null;
        if (!$queryPackageSizeStr) {
            $queryPackageSizeStr = ShelfTagTextNormalizer::normalizePackageSize($queryRawText);
        }

        $querySizeNum = $queryPackageSizeStr ? ShelfTagTextNormalizer::extractPackageSizeNumber($queryPackageSizeStr) : null;
        $queryUnit = $this->extractUnitFromSizeString($queryPackageSizeStr);

        $candidates = [];

        foreach ($bulletins as $bulletin) {
            $evaluated = $this->evaluateCandidate(
                $bulletin,
                $queryRawText,
                $queryTokens,
                $queryMeaningfulTokens,
                $querySizeNum,
                $queryUnit
            );

            if ($evaluated !== null && $evaluated['match_score'] >= 35) {
                $candidates[] = $evaluated;
            }
        }

        // Sort candidates by match_score descending
        usort($candidates, function ($a, $b) {
            return $b['match_score'] <=> $a['match_score'];
        });

        $limit = $options['limit'] ?? 10;
        if ($limit > 0 && count($candidates) > $limit) {
            $candidates = array_slice($candidates, 0, $limit);
        }

        return $candidates;
    }

    /**
     * Held for the lifetime of this instance: a receipt is matched line by line, and reloading the
     * whole active catalogue per line turned one query into one per item.
     */
    protected ?\Illuminate\Support\Collection $activeBulletins = null;

    protected function activeBulletins(): \Illuminate\Support\Collection
    {
        return $this->activeBulletins ??= SrpBulletin::query()
            ->where('is_active', true)
            ->with('aliases')
            ->get();
    }

    /**
     * Evaluate a single SrpBulletin candidate against query signals.
     */
    protected function evaluateCandidate(
        SrpBulletin $bulletin,
        string $queryRawText,
        array $queryTokens,
        array $queryMeaningfulTokens,
        ?float $querySizeNum,
        ?string $queryUnit
    ): ?array {
        $commodityName = $bulletin->commodity_name;
        $brand = $this->detectBrand($commodityName);
        $candidatePackageSizeStr = ShelfTagTextNormalizer::normalizePackageSize($bulletin->unit ?? $commodityName);
        $candidateSizeNum = $candidatePackageSizeStr ? ShelfTagTextNormalizer::extractPackageSizeNumber($candidatePackageSizeStr) : null;
        $candidateUnit = $this->extractUnitFromSizeString($candidatePackageSizeStr ?? $bulletin->unit);
        
        $candidateTokens = $this->extractTokens($commodityName);
        $candidateMeaningfulTokens = $this->filterMeaningfulTokens($candidateTokens);

        $score = 0;
        $matchBasis = 'TOKEN_SIMILARITY';
        $hasExactCatalogMatch = false;
        $hasAbbreviationMatch = false;

        $normalizedQuery = $this->cleanPhraseForComparison($queryRawText);
        $normalizedName = $this->cleanPhraseForComparison($commodityName);
        if ($normalizedQuery !== '' && $normalizedQuery === $normalizedName) {
            $score += 100;
            $matchBasis = 'NAME_EXACT';
            $hasExactCatalogMatch = true;
        } else {
            foreach ($bulletin->aliases as $alias) {
                $normalizedAlias = $this->cleanPhraseForComparison((string) $alias->alias_name);
                if ($normalizedAlias !== '' && $normalizedQuery === $normalizedAlias) {
                    $score += 100;
                    $matchBasis = 'ALIAS_EXACT';
                    $hasExactCatalogMatch = true;
                    break;
                }
            }
        }

        if (!$hasExactCatalogMatch && count($queryMeaningfulTokens) >= 2) {
            $bestAbbreviationScore = $this->abbreviationSimilarity($queryMeaningfulTokens, $candidateMeaningfulTokens);
            $bestAbbreviationBasis = 'NAME_ABBREVIATION';

            foreach ($bulletin->aliases as $alias) {
                $aliasTokens = $this->filterMeaningfulTokens($this->extractTokens((string) $alias->alias_name));
                $aliasScore = $this->abbreviationSimilarity($queryMeaningfulTokens, $aliasTokens);
                if ($aliasScore > $bestAbbreviationScore) {
                    $bestAbbreviationScore = $aliasScore;
                    $bestAbbreviationBasis = 'ALIAS_ABBREVIATION';
                }
            }

            if ($bestAbbreviationScore >= 0.75) {
                $score += (int) round($bestAbbreviationScore * 100);
                $matchBasis = $bestAbbreviationBasis;
                $hasAbbreviationMatch = true;
            }
        }

        // 1. Brand Signal
        $hasBrandMatch = false;
        $hasBrandConflict = false;

        if ($brand !== '') {
            $brandLower = strtolower($brand);
            if (str_contains($queryRawText, $brandLower) || in_array($brandLower, $queryTokens, true)) {
                $hasBrandMatch = true;
                $score += 30;
            } else {
                // Check if query specifies a different known brand
                $queryBrand = $this->detectBrand($queryRawText);
                if ($queryBrand !== '' && strtolower($queryBrand) !== $brandLower) {
                    $hasBrandConflict = true;
                    $score -= 30;
                }
            }
        }

        // 2. Exact Phrase Match Signal
        $hasExactPhrase = false;
        $cleanQueryPhrase = $this->cleanPhraseForComparison($queryRawText);
        $cleanCommodityPhrase = $this->cleanPhraseForComparison($commodityName);

        if ($cleanQueryPhrase !== '' && $cleanCommodityPhrase !== '') {
            if ($cleanQueryPhrase === $cleanCommodityPhrase || str_contains($cleanCommodityPhrase, $cleanQueryPhrase) || str_contains($cleanQueryPhrase, $cleanCommodityPhrase)) {
                $hasExactPhrase = true;
                $score += 40;
            }
        }

        // 3. Token Overlap Signal (+15 per matching token)
        $matchingTokens = array_intersect($queryMeaningfulTokens, $candidateMeaningfulTokens);
        $overlapCount = count(array_unique($matchingTokens));
        $score += ($overlapCount * 15);

        // 4. Exact Package Size Match (+25) vs Conflict (-50)
        $hasSizeMatch = false;
        $hasSizeConflict = false;

        if ($querySizeNum !== null && $candidateSizeNum !== null) {
            if (abs($querySizeNum - $candidateSizeNum) < 0.001) {
                if ($queryUnit !== null && $candidateUnit !== null && strtolower($queryUnit) === strtolower($candidateUnit)) {
                    $hasSizeMatch = true;
                    $score += 25;
                } else {
                    $hasSizeMatch = true;
                    $score += 25;
                }
            } else {
                $hasSizeConflict = true;
                $score -= 50;
            }
        }

        // 5. Unit Match (+15) vs Conflict (-50)
        $hasUnitMatch = false;
        $hasUnitConflict = false;

        if ($queryUnit !== null && $candidateUnit !== null) {
            if (strtolower($queryUnit) === strtolower($candidateUnit)) {
                $hasUnitMatch = true;
                $score += 15;
            } else {
                $hasUnitConflict = true;
                $score -= 50;
            }
        }

        // 6. Variant Match (+20) vs Conflict (-50)
        $hasVariantMatch = false;
        $hasVariantConflict = false;

        $variantEvaluation = $this->evaluateVariants($queryRawText, $commodityName);
        if ($variantEvaluation === 'MATCH') {
            $hasVariantMatch = true;
            $score += 20;
        } elseif ($variantEvaluation === 'CONFLICT') {
            $hasVariantConflict = true;
            $score -= 50;
        }

        // Minimum score check
        if ($score < 35) {
            return null;
        }

        // Determine match level
        $isGenericBrandOnly = $hasBrandMatch && !$hasSizeMatch && !$hasVariantMatch && !$hasExactPhrase && ($overlapCount <= 1);

        if ($hasSizeConflict && $score >= 40) {
            $matchLevel = 'SIZE_UNCERTAIN';
        } elseif (
            $hasExactCatalogMatch
            || ($hasAbbreviationMatch && $score >= 80 && !$hasSizeConflict && !$hasUnitConflict)
            || ($score >= 70 && $hasBrandMatch && $hasSizeMatch && !$isGenericBrandOnly)
        ) {
            $matchLevel = 'STRONG';
        } elseif ($score >= 50 || ($score >= 35 && ($hasBrandMatch || $hasSizeMatch || $hasVariantMatch || $overlapCount >= 1))) {
            $matchLevel = 'POSSIBLE';
        } else {
            return null;
        }

        // CRITICAL SECRECY REQUIREMENT:
        // Exclude baseline_price and any price information.
        return [
            'id' => (int) $bulletin->id,
            // Nullable: srp_bulletins.commodity_key is nullable, so an active bulletin may have none.
            // Consumers that resolve a regulatory reference by key must treat a keyless candidate as
            // unusable rather than assume this is always present.
            'commodity_key' => $bulletin->commodity_key === null ? null : (string) $bulletin->commodity_key,
            'commodity_name' => (string) $commodityName,
            'brand' => (string) $brand,
            'category' => (string) ($bulletin->category ?? 'General'),
            'package_size' => (string) ($candidatePackageSizeStr ?? $bulletin->unit ?? ''),
            'unit' => (string) ($bulletin->unit ?? ''),
            'match_score' => (int) $score,
            'match_level' => (string) $matchLevel,
            'match_basis' => (string) $matchBasis,
        ];
    }

    /**
     * Extract tokens from array or string.
     */
    protected function extractTokens(array|string $input): array
    {
        if (is_array($input)) {
            $raw = implode(' ', $input);
        } else {
            $raw = $input;
        }

        $cleaned = strtolower(ShelfTagTextNormalizer::normalizeText($raw));
        preg_match_all('/[a-z0-9]+/i', $cleaned, $matches);

        return $matches[0] ?? [];
    }

    /**
     * Filter out stop words and trivial tokens.
     */
    protected function filterMeaningfulTokens(array $tokens): array
    {
        $filtered = [];
        foreach ($tokens as $t) {
            $t = strtolower(trim($t));
            if (in_array($t, self::STOP_WORDS, true)) {
                continue;
            }
            if (strlen($t) < 2 && !ctype_digit($t)) {
                continue;
            }
            // Exclude common unit words
            if (in_array($t, ['g', 'kg', 'ml', 'l', 'pcs', 'pack', 'can', 'sachet'], true)) {
                continue;
            }
            $filtered[] = $t;
        }

        return array_values($filtered);
    }

    protected function abbreviationSimilarity(array $queryTokens, array $candidateTokens): float
    {
        if (empty($queryTokens) || empty($candidateTokens)) {
            return 0.0;
        }

        $scores = [];
        foreach ($queryTokens as $queryToken) {
            $best = 0.0;
            foreach ($candidateTokens as $candidateToken) {
                if ($queryToken === $candidateToken) {
                    $best = 1.0;
                    break;
                }

                $shorter = min(strlen($queryToken), strlen($candidateToken));
                if ($shorter >= 3 && (str_starts_with($queryToken, $candidateToken) || str_starts_with($candidateToken, $queryToken))) {
                    $best = max($best, 1.0);
                    continue;
                }

                $longer = max(strlen($queryToken), strlen($candidateToken));
                if ($longer >= 4) {
                    $similarity = 1 - (levenshtein($queryToken, $candidateToken) / $longer);
                    $best = max($best, $similarity);
                }
            }
            $scores[] = $best;
        }

        $minimum = min($scores);
        $average = array_sum($scores) / count($scores);

        return $minimum >= 0.6 ? $average : 0.0;
    }

    /**
     * Detect known brand name from text.
     */
    protected function detectBrand(string $text): string
    {
        $textLower = strtolower($text);

        foreach (self::KNOWN_BRANDS as $known) {
            if (str_contains($textLower, strtolower($known))) {
                return $known;
            }
        }

        // Fallback: extract first word if capitalized
        $tokens = $this->extractTokens($text);

        return isset($tokens[0]) ? ucfirst($tokens[0]) : '';
    }

    /**
     * Extract unit (g, kg, mL, L, pcs) from normalized size string.
     */
    protected function extractUnitFromSizeString(?string $sizeStr): ?string
    {
        if (!$sizeStr) {
            return null;
        }

        if (preg_match('/\b(g|kg|ml|l|pcs|pack|can|sachet)\b/i', $sizeStr, $m)) {
            $unitMap = [
                'g' => 'g',
                'kg' => 'kg',
                'ml' => 'mL',
                'l' => 'L',
                'pcs' => 'pcs',
                'pack' => 'pack',
                'can' => 'can',
                'sachet' => 'sachet',
            ];

            return $unitMap[strtolower($m[1])] ?? $m[1];
        }

        return null;
    }

    /**
     * Clean phrase for string similarity comparison.
     */
    protected function cleanPhraseForComparison(string $text): string
    {
        $text = ShelfTagTextNormalizer::normalizeText($text);
        // Strip size strings e.g. 155g, 155 g
        $text = preg_replace('/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|pcs|pack|can|sachet)\b/i', '', $text);

        return trim(strtolower(preg_replace('/[^a-z0-9]+/i', ' ', $text)));
    }

    /**
     * Compare variant traits (e.g., Tomato Sauce vs Chili).
     */
    protected function evaluateVariants(string $queryText, string $commodityName): string
    {
        $q = strtolower($queryText);
        $c = strtolower($commodityName);

        $isQueryChili = str_contains($q, 'chili') || str_contains($q, 'spicy') || str_contains($q, 'hot');
        $isCandChili = str_contains($c, 'chili') || str_contains($c, 'spicy') || str_contains($c, 'hot');

        $isQueryTomato = str_contains($q, 'tomato');
        $isCandTomato = str_contains($c, 'tomato');

        if ($isQueryChili && $isCandChili) {
            return 'MATCH';
        }

        if ($isQueryTomato && $isCandTomato && !$isQueryChili && !$isCandChili) {
            return 'MATCH';
        }

        if (($isQueryChili && $isCandTomato && !$isCandChili) || ($isQueryTomato && !$isQueryChili && $isCandChili)) {
            return 'CONFLICT';
        }

        return 'NEUTRAL';
    }
}
