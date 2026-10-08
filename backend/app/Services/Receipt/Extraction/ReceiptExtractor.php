<?php

namespace App\Services\Receipt\Extraction;

interface ReceiptExtractor
{
    /**
     * Extract structured receipt data from ordered, integrity-verified receipt sections.
     *
     * @param  array<int, array{path: string, mime_type: string, sequence: int}>  $frames
     *
     * @throws RetryableExtractionException for transient provider failures
     * @throws ExtractionFailedException for non-transient failures
     */
    public function extract(array $frames, ?string $model = null): ReceiptExtraction;
}
