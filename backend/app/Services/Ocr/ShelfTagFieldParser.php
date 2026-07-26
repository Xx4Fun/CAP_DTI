<?php

namespace App\Services\Ocr;

class ShelfTagFieldParser
{
    /**
     * Parse structured TSV word objects into field extraction payload.
     *
     * Expected word object schema:
     * [
     *   'text' => string,
     *   'confidence' => int,
     *   'left' => int,
     *   'top' => int,
     *   'width' => int,
     *   'height' => int,
     *   'line_num' => int,
     *   'block_num' => int
     * ]
     */
    public function parseFromTsvWords(array $words): array
    {
        return $this->parse($words);
    }

    public function parse(array $words): array
    {
        // 1. Reject tokens with confidence < 60
        $filteredWords = array_values(array_filter($words, function ($w) {
            $text = isset($w['text']) ? trim($w['text']) : '';
            $conf = isset($w['confidence']) ? (int) $w['confidence'] : 0;
            return $text !== '' && $conf >= 60;
        }));

        if (empty($filteredWords)) {
            return $this->buildEmptyPayload();
        }

        // 2. Perform spatial line/block grouping
        $lines = $this->groupWordsIntoLines($filteredWords);

        // 3. Extract normalized package size & numeric value
        $fullText = implode(' ', array_column($filteredWords, 'text'));
        $packageSizeNormalized = ShelfTagTextNormalizer::normalizePackageSize($fullText);
        $packageSizeNumber = ShelfTagTextNormalizer::extractPackageSizeNumber($fullText);

        // 4. Evaluate price candidates
        $candidates = $this->evaluatePriceCandidates($lines, $packageSizeNumber);

        // 5. Select top candidate
        $topCandidate = !empty($candidates) ? $candidates[0] : null;

        $detectedPriceString = $topCandidate ? $topCandidate['detected_price_string'] : null;
        $detectedPriceCentavos = $topCandidate ? $topCandidate['detected_price_centavos'] : null;
        $priceConfidence = $topCandidate ? $topCandidate['confidence'] : 0;

        // 6. Extract product raw tokens
        $productRawTokens = $this->extractProductRawTokens($filteredWords, $detectedPriceString);

        return [
            'detected_price_string' => $detectedPriceString,
            'detected_price_centavos' => $detectedPriceCentavos,
            'price_confidence' => $priceConfidence,
            'price_candidates' => $candidates,
            'product_raw_tokens' => $productRawTokens,
            'package_size_normalized' => $packageSizeNormalized,
        ];
    }

    /**
     * Group TSV word objects by block_num and line_num in spatial sequence.
     */
    protected function groupWordsIntoLines(array $words): array
    {
        $lineGroups = [];

        foreach ($words as $w) {
            $blockNum = (int) ($w['block_num'] ?? 0);
            $lineNum = (int) ($w['line_num'] ?? 0);
            $key = "{$blockNum}_{$lineNum}";

            if (!isset($lineGroups[$key])) {
                $lineGroups[$key] = [
                    'key' => $key,
                    'block_num' => $blockNum,
                    'line_num' => $lineNum,
                    'words' => [],
                    'has_anchor' => false,
                ];
            }

            $lineGroups[$key]['words'][] = $w;

            if (ShelfTagTextNormalizer::isAnchorToken($w['text'])) {
                $lineGroups[$key]['has_anchor'] = true;
            }
        }

        // Sort words within each line by left position
        foreach ($lineGroups as &$line) {
            usort($line['words'], fn($a, $b) => ($a['left'] ?? 0) <=> ($b['left'] ?? 0));
            $line['text'] = implode(' ', array_column($line['words'], 'text'));
        }

        return array_values($lineGroups);
    }

    /**
     * Evaluate and rank price candidates from grouped lines.
     */
    protected function evaluatePriceCandidates(array $lines, ?float $packageSizeNumber): array
    {
        $candidates = [];
        $totalLines = count($lines);

        for ($i = 0; $i < $totalLines; $i++) {
            $currentLine = $lines[$i];
            $wordsOnLine = $currentLine['words'];
            $wordCount = count($wordsOnLine);

            $sameLineHasAnchor = $currentLine['has_anchor'];
            $adjacentLineHasAnchor = false;

            if ($i > 0 && $lines[$i - 1]['has_anchor']) {
                $adjacentLineHasAnchor = true;
            }
            if ($i < $totalLines - 1 && $lines[$i + 1]['has_anchor']) {
                $adjacentLineHasAnchor = true;
            }

            // Single word candidates
            foreach ($wordsOnLine as $word) {
                $text = trim($word['text']);
                $normalizedPrice = ShelfTagTextNormalizer::normalizePrice($text);

                if ($normalizedPrice !== null) {
                    $centavos = ShelfTagTextNormalizer::toCentavos($normalizedPrice);
                    $score = $this->calculateCandidateScore(
                        $text,
                        $word['confidence'],
                        $sameLineHasAnchor,
                        $adjacentLineHasAnchor,
                        $packageSizeNumber
                    );

                    $candidates[] = [
                        'raw_text' => $text,
                        'detected_price_string' => $normalizedPrice,
                        'detected_price_centavos' => $centavos,
                        'confidence' => max(0, min(100, $score)),
                        'score' => $score,
                        'line_num' => $currentLine['line_num'],
                        'block_num' => $currentLine['block_num'],
                    ];
                }
            }

            // Two-word adjacent candidates (e.g., "PHP" + "23.50", "SRP" + "23,50", "P" + "23.5")
            for ($w = 0; $w < $wordCount - 1; $w++) {
                $combinedText = $wordsOnLine[$w]['text'] . ' ' . $wordsOnLine[$w + 1]['text'];
                $normalizedPrice = ShelfTagTextNormalizer::normalizePrice($combinedText);

                if ($normalizedPrice !== null) {
                    $avgConf = (int) round(($wordsOnLine[$w]['confidence'] + $wordsOnLine[$w + 1]['confidence']) / 2);
                    $score = $this->calculateCandidateScore(
                        $combinedText,
                        $avgConf,
                        true, // Contains anchor by definition of adjacent combination
                        $adjacentLineHasAnchor,
                        $packageSizeNumber
                    );

                    $candidates[] = [
                        'raw_text' => $combinedText,
                        'detected_price_string' => $normalizedPrice,
                        'detected_price_centavos' => $centavos ?? ShelfTagTextNormalizer::toCentavos($normalizedPrice),
                        'confidence' => max(0, min(100, $score)),
                        'score' => $score,
                        'line_num' => $currentLine['line_num'],
                        'block_num' => $currentLine['block_num'],
                    ];
                }
            }
        }

        // Deduplicate candidates by detected_price_string, keeping highest score candidate
        $uniqueCandidates = [];
        foreach ($candidates as $cand) {
            $key = $cand['detected_price_string'];
            if (!isset($uniqueCandidates[$key]) || $cand['score'] > $uniqueCandidates[$key]['score']) {
                $uniqueCandidates[$key] = $cand;
            }
        }

        $rankedCandidates = array_values($uniqueCandidates);

        // Sort by score descending, then confidence descending
        usort($rankedCandidates, function ($a, $b) {
            if ($a['score'] !== $b['score']) {
                return $b['score'] <=> $a['score'];
            }
            return $b['confidence'] <=> $a['confidence'];
        });

        // Filter out candidates with negative overall score
        return array_values(array_filter($rankedCandidates, fn($c) => $c['score'] > 0));
    }

    /**
     * Calculate score for a price candidate.
     */
    protected function calculateCandidateScore(
        string $rawText,
        int $baseConfidence,
        bool $sameLineHasAnchor,
        bool $adjacentLineHasAnchor,
        ?float $packageSizeNumber
    ): int {
        $score = $baseConfidence;

        // Positive score bonuses
        if ($sameLineHasAnchor) {
            $score += 40;
        } elseif ($adjacentLineHasAnchor) {
            $score += 30;
        }

        // Explicit decimal separator bonus (.xx or ,xx)
        if (preg_match('/[\.,]\d{1,2}$/', trim($rawText))) {
            $score += 20;
        }

        // Penalties (-60 each)
        $cleanRaw = preg_replace('/[^a-zA-Z0-9]/', '', $rawText);

        // 1. Barcode/SKU penalty (-60)
        if (preg_match('/^\d{8,}$/', $cleanRaw) || preg_match('/^(?:SKU|ITEM|BARCODE|CODE|LOT|EXP)/i', $rawText)) {
            $score -= 60;
        }

        // 2. Date penalty (-60)
        if (preg_match('/\b(?:20\d{2}|\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})\b/', $rawText)) {
            $score -= 60;
        }

        // 3. Package size number penalty (-60)
        if ($packageSizeNumber !== null) {
            if (preg_match('/^(\d+(?:\.\d+)?)/', preg_replace('/^[₱P\$PHP\s]+/i', '', $rawText), $m)) {
                $val = (float) $m[1];
                if (abs($val - $packageSizeNumber) < 0.001) {
                    $score -= 60;
                }
            }
        }

        // 4. Percentage penalty (-60)
        if (str_contains($rawText, '%')) {
            $score -= 60;
        }

        return $score;
    }

    /**
     * Extract product raw tokens excluding price tokens, anchors, and barcodes.
     */
    protected function extractProductRawTokens(array $words, ?string $detectedPriceString): array
    {
        $tokens = [];

        foreach ($words as $w) {
            $text = trim($w['text']);

            // Skip anchor tokens
            if (ShelfTagTextNormalizer::isAnchorToken($text)) {
                continue;
            }

            // Skip barcodes (pure digits >= 8)
            if (preg_match('/^\d{8,}$/', $text)) {
                continue;
            }

            // Skip detected price match
            $norm = ShelfTagTextNormalizer::normalizePrice($text);
            if ($norm !== null && $norm === $detectedPriceString) {
                continue;
            }

            $tokens[] = $text;
        }

        return array_values($tokens);
    }

    /**
     * Build empty payload when no text or candidates are available.
     */
    protected function buildEmptyPayload(): array
    {
        return [
            'detected_price_string' => null,
            'detected_price_centavos' => null,
            'price_confidence' => 0,
            'price_candidates' => [],
            'product_raw_tokens' => [],
            'package_size_normalized' => null,
        ];
    }
}
