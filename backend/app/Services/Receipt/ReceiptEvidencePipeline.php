<?php

namespace App\Services\Receipt;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use App\Services\Ocr\ShelfTagOcrService;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

class ReceiptEvidencePipeline
{
    /** Tesseract restarts line numbers per paragraph, so receipt lines must be keyed by paragraph (see ShelfTagOcrService). */
    private const GUIDED_PASS_OPTIONS = ['dpi' => 300, 'config' => ['preserve_interword_spaces' => 1], 'paragraph_lines' => true];

    /** Pass table: [derivative key, psm, minimum confidence, extra options]. */
    private const LEGACY_PASSES = ['primary' => ['full_path', 6, 45, []], 'fallback' => ['fallback_full_path', 11, 35, []]];

    private const GUIDED_PASSES = [
        'primary' => ['full_path', 6, 45, self::GUIDED_PASS_OPTIONS],
        'fallback' => ['fallback_full_path', 11, 35, self::GUIDED_PASS_OPTIONS],
    ];

    public function __construct(
        private readonly ReceiptVideoInspector $videoInspector,
        private readonly ShelfTagImagePreprocessor $preprocessor,
        private readonly ShelfTagOcrService $ocr,
        private readonly ReceiptContinuityAnalyzer $continuityAnalyzer,
        private readonly ReceiptTextAggregator $textAggregator,
        private readonly ReceiptItemExtractor $itemExtractor,
        private readonly ReceiptFrameQualityEvaluator $qualityEvaluator,
        private readonly ReceiptFrameSampler $frameSampler,
        private readonly ReceiptOcrResultSelector $ocrResultSelector,
        private readonly ReceiptMerchantMatcher $merchantMatcher,
        private readonly ReceiptTotalExtractor $totalExtractor,
        private readonly ReceiptDateExtractor $dateExtractor = new ReceiptDateExtractor,
        private readonly ReceiptLineFilter $lineFilter = new ReceiptLineFilter,
    ) {}

    public function process(ConsumerReport $report): array
    {
        // Leave time for cleanup and persistence before the 360-second job timeout.
        $budget = max(1, min(300, (int) config('services.tesseract.receipt_processing_budget_seconds', 300)));
        $deadline = hrtime(true) / 1e9 + $budget;
        $passTimeout = max(1, min($budget, (int) config('services.tesseract.receipt_pass_timeout_seconds', 60)));
        $report->loadMissing(['store', 'evidenceBundle.assets']);
        $bundle = $report->evidenceBundle;
        if (! $bundle) {
            throw new RuntimeException('Receipt evidence bundle is missing.');
        }

        $temporaryDirectory = storage_path('app/tmp/receipt-processing/'.Str::uuid());
        File::ensureDirectoryExists($temporaryDirectory);
        // Receipt-specific OCR tuning applies to guided photos only; historical modes keep their original path.
        $guided = $report->capture_mode === 'guided_photos_v1';
        // Fallback decisions, pass selection, and final extraction all use the same store context.
        $merchantNames = array_values(array_filter([$report->store?->store_name, $report->store?->owner_name], 'is_string'));

        try {
            $frameCandidates = $report->capture_mode === 'continuous_video_v1'
                ? $this->prepareVideoFrames($report, $temporaryDirectory)
                : $this->prepareUploadedFrames($report, $temporaryDirectory, $guided);

            if (hrtime(true) / 1e9 >= $deadline) {
                return $this->failureResult('OCR_TIMEOUT', [], true);
            }

            $minimumFrames = $report->capture_mode === 'continuous_video_v1' ? 2 : 1;
            if (count($frameCandidates) < $minimumFrames) {
                return $this->recaptureResult('INSUFFICIENT_FRAMES');
            }

            $frames = [];
            $ocrDiagnostics = [];
            foreach ($frameCandidates as $frame) {
                if (hrtime(true) / 1e9 >= $deadline) {
                    return $this->failureResult('OCR_TIMEOUT', $ocrDiagnostics, true);
                }
                $index = count($ocrDiagnostics);
                $ocrDiagnostics[] = [
                    'sequence' => $frame['source_sequence'],
                    'timestamp_seconds' => $frame['timestamp_seconds'],
                    'status' => 'OCR_TIMEOUT',
                    'quality' => $frame['quality'] ?? null,
                    'passes' => [],
                ];
                try {
                    $preprocessed = $this->preprocessor->preprocess($frame['path']);
                } catch (InvalidArgumentException|RuntimeException $exception) {
                    // Guided evidence that cannot be decoded is a bad capture, not a retryable processing failure.
                    if ($guided) {
                        throw new UnreadableReceiptImageException((int) $frame['source_sequence'], $exception);
                    }
                    throw $exception;
                }
                try {
                    $results = [];
                    foreach ($guided ? self::GUIDED_PASSES : self::LEGACY_PASSES as $pass => [$pathKey, $psm, $confidence, $passOptions]) {
                        if ($pass === 'fallback' && $guided && ! $this->primaryIsWeak($results['primary'], $merchantNames)) {
                            $ocrDiagnostics[$index]['passes'][] = [
                                'pass' => $pass, 'status' => 'skipped', 'duration_ms' => 0, 'timeout_seconds' => 0, 'result' => null,
                            ];
                            continue;
                        }
                        $remaining = (int) floor($deadline - hrtime(true) / 1e9);
                        if ($remaining < 1) {
                            return $this->failureResult('OCR_TIMEOUT', $ocrDiagnostics, true);
                        }
                        $timeout = min($passTimeout, $remaining);
                        $started = hrtime(true);
                        $results[$pass] = $this->ocr->scan($preprocessed[$pathKey], [
                            'psm' => $psm,
                            'minimum_confidence' => $confidence,
                            'timeout_seconds' => $timeout,
                        ] + $passOptions);
                        $ocrDiagnostics[$index]['passes'][] = [
                            'pass' => $pass,
                            'status' => $results[$pass]['status'] ?? 'OCR_FAILED',
                            'duration_ms' => round((hrtime(true) - $started) / 1e6, 1),
                            'timeout_seconds' => $timeout,
                            'result' => $results[$pass],
                        ];
                        if (hrtime(true) / 1e9 >= $deadline) {
                            return $this->failureResult('OCR_TIMEOUT', $ocrDiagnostics, true);
                        }
                    }
                    $selectedPass = isset($results['fallback'])
                        ? $this->ocrResultSelector->selectedPass($results['primary'], $results['fallback'], $guided, $merchantNames)
                        : 'primary';
                    $ocr = $results[$selectedPass];
                    $ocrDiagnostics[$index]['selected_pass'] = $selectedPass;
                } finally {
                    $this->preprocessor->cleanup($preprocessed['path']);
                    $this->preprocessor->cleanup($preprocessed['fallback_path']);
                }

                $ocrDiagnostics[$index]['status'] = $ocr['status'] ?? 'OCR_FAILED';
                $lines = array_values(array_filter($ocr['lines'] ?? [], 'is_string'));
                if ($guided) {
                    $otherPass = $results[$selectedPass === 'primary' ? 'fallback' : 'primary'] ?? null;
                    $borrowedTotal = $otherPass === null || $this->totalExtractor->extract($lines) !== null
                        ? null
                        : $this->totalLine($otherPass);
                    if ($borrowedTotal !== null) {
                        $lines[] = $borrowedTotal;
                        $ocrDiagnostics[$index]['total_from_other_pass'] = true;
                    }
                    $filtered = $this->lineFilter->filter($lines);
                    $ocrDiagnostics[$index]['line_filter'] = ['kept' => count($filtered), 'dropped' => count($lines) - count($filtered)];
                    $lines = $filtered;
                }
                if ($lines === []) {
                    continue;
                }

                $frames[] = [
                    'sequence' => $frame['source_sequence'],
                    'lines' => $lines,
                    'ocr_status' => $ocr['status'] ?? 'OCR_FAILED',
                ];
            }

            $technicalStatuses = ['OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_FAILED'];
            $technicalFailure = collect($ocrDiagnostics)->first(
                fn (array $diagnostic) => in_array($diagnostic['status'], $technicalStatuses, true),
            );
            if ($technicalFailure) {
                return $this->failureResult((string) $technicalFailure['status'], $ocrDiagnostics);
            }

            $readableSequences = array_column($frames, 'sequence');
            $unreadable = array_filter($frameCandidates, fn (array $frame) =>
                ! in_array($frame['source_sequence'], $readableSequences, true)
                && ! (bool) data_get($frame, 'quality.acceptable', false)
            );
            if ($unreadable !== []) {
                return $this->recaptureResult('TEXT_UNREADABLE', ['ocr' => $ocrDiagnostics]);
            }

            $warnings = [];
            if (count($frames) < count($frameCandidates)) {
                $warnings[] = $this->warning('OCR_INCOMPLETE');
            }

            if (count($frameCandidates) === 1) {
                $continuity = ['status' => 'not_required', 'continuity_score' => 1.0, 'reasons' => []];
            } elseif (count($frames) < count($frameCandidates)) {
                $continuity = ['status' => 'unverified', 'continuity_score' => null, 'reasons' => ['ocr_incomplete']];
            } else {
                $continuity = $this->continuityAnalyzer->analyze($frames);
                if ($continuity['status'] !== 'ready') {
                    if ($report->capture_mode === 'continuous_video_v1') {
                        return $this->recaptureResult('INCOMPLETE_SCAN', ['continuity' => $continuity, 'ocr' => $ocrDiagnostics]);
                    }
                    $continuity['status'] = 'unverified';
                    $warnings[] = $this->warning('INCOMPLETE_SCAN');
                }
            }

            $headerFrames = array_map(fn (array $frame) => $frame['lines'], array_slice($frames, 0, 2));
            $headerLines = $headerFrames === [] ? [] : array_merge(...$headerFrames);
            $merchant = $headerLines === []
                ? ['status' => 'unverified']
                : $this->merchantMatcher->match($report->store?->store_name, $report->store?->owner_name, $headerLines);
            if ($merchant['status'] !== 'matched') {
                $warnings[] = $this->warning('STORE_NOT_CONFIRMED');
            }
            if ($guided && is_string($merchant['display_name'] ?? null)) {
                $merchant['display_name'] = $this->cleanDisplayName($merchant['display_name']);
            }

            $lines = $this->textAggregator->merge(array_column($frames, 'lines'));
            $itemAnalysis = $this->itemExtractor->analyze($lines, $guided, $merchantNames);
            $items = $itemAnalysis['items'];
            $rejectedItemLines = $itemAnalysis['rejected_lines'];
            $total = $this->totalExtractor->extract($lines);
            if ($rejectedItemLines !== []) {
                $warnings[] = $this->warning('OCR_INCOMPLETE');
            }
            if ($items === []) {
                $warnings[] = $this->warning('ITEMS_NOT_FOUND');
            }
            if ($total === null) {
                $warnings[] = $this->warning('TOTAL_NOT_FOUND');
            }

            $itemSum = $items === [] ? null : round(array_sum(array_column($items, 'observed_price')), 2);
            if ($itemSum !== null && $total !== null && abs($itemSum - $total) > 0.05) {
                $warnings[] = $this->warning('TOTAL_MISMATCH');
            }

            if (hrtime(true) / 1e9 >= $deadline) {
                return $this->failureResult('OCR_TIMEOUT', $ocrDiagnostics, true);
            }

            return [
                'status' => 'ready',
                'reason_code' => null,
                'lines' => $lines,
                'items' => $items,
                'rejected_item_lines' => $rejectedItemLines,
                'detected_total' => $total,
                'transaction_date' => $this->dateExtractor->extract($lines),
                'continuity' => $continuity,
                'merchant' => $merchant,
                'warnings' => $warnings,
                'manual_review_required' => $warnings !== [],
                'item_sum' => $itemSum,
                'frames_processed' => count($frames),
                'ocr' => $ocrDiagnostics,
            ];
        } catch (UnsafeReceiptImageException $exception) {
            // Oversized guided frames are never decoded; they count as no usable receipt image.
            return $this->recaptureResult('INSUFFICIENT_FRAMES', [
                'unsafe_dimensions' => ['width' => $exception->width, 'height' => $exception->height],
            ]);
        } catch (UnreadableReceiptImageException $exception) {
            return $this->recaptureResult('INSUFFICIENT_FRAMES', ['unreadable_frame' => $exception->sequence]);
        } catch (ReceiptEvidenceIntegrityException $exception) {
            // Evidence that no longer matches its recorded hash is never OCR'd; this is not the customer's bad capture.
            $result = $this->failureResult('EVIDENCE_INTEGRITY_FAILED', []);
            $result['diagnostics']['integrity_failure'] = ['kind' => $exception->kind, 'sequence' => $exception->sequence];

            return $result;
        } finally {
            File::deleteDirectory($temporaryDirectory);
        }
    }

    /** The exact local copy that will be decoded must match the canonical evidence hash recorded at upload. */
    private function assertOriginal(ReceiptEvidenceAsset $asset, string $localPath): void
    {
        if (! hash_equals((string) $asset->sha256, (string) hash_file('sha256', $localPath))) {
            throw new ReceiptEvidenceIntegrityException((string) $asset->kind, (int) $asset->sequence);
        }
    }

    private function evaluateQuality(string $path, int $sequence, bool $guided): array
    {
        try {
            return $this->qualityEvaluator->evaluate($path);
        } catch (RuntimeException $exception) {
            if ($guided) {
                throw new UnreadableReceiptImageException($sequence, $exception);
            }
            throw $exception;
        }
    }

    /** @param array<int, string> $merchantNames */
    private function primaryIsWeak(array $primary, array $merchantNames): bool
    {
        if (($primary['status'] ?? null) !== 'OCR_SUCCESS') {
            return true;
        }
        $lines = array_values(array_filter($primary['lines'] ?? [], 'is_string'));

        return $this->itemExtractor->analyze($lines, true, $merchantNames)['items'] === []
            || $this->totalExtractor->extract($lines) === null
            || $this->lineFilter->readableRatio($lines) < 0.5;
    }

    private function totalLine(array $result): ?string
    {
        if (($result['status'] ?? null) !== 'OCR_SUCCESS') {
            return null;
        }
        foreach (array_reverse(array_filter($result['lines'] ?? [], 'is_string')) as $line) {
            if ($this->totalExtractor->extract([$line]) !== null) {
                return $line;
            }
        }

        return null;
    }

    private function cleanDisplayName(string $name): ?string
    {
        $name = (string) preg_replace('/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/u', '', (string) preg_replace('/\s+/u', ' ', $name));

        return preg_match_all('/\p{L}/u', $name) >= 3 ? $name : null;
    }

    private function prepareVideoFrames(ConsumerReport $report, string $temporaryDirectory): array
    {
        $video = $report->evidenceBundle->assets->firstWhere('kind', 'original_video');
        if (! $video) {
            throw new InvalidArgumentException('Original receipt video is missing.');
        }

        $videoPath = $temporaryDirectory.DIRECTORY_SEPARATOR.'receipt-video';
        File::put($videoPath, Storage::disk($video->disk)->get($video->path));
        $this->assertOriginal($video, $videoPath);
        try {
            $probe = $this->videoInspector->inspect($videoPath);
        } catch (InvalidArgumentException $exception) {
            return [];
        }

        $framePattern = $temporaryDirectory.DIRECTORY_SEPARATOR.'frame-%03d.jpg';
        $paths = $this->frameSampler->extract($videoPath, $framePattern, (float) $probe['duration_seconds']);
        $selected = $this->qualityEvaluator->select($paths, 12);
        foreach ($selected as $sequence => $frame) {
            $timestamp = round($frame['source_sequence'] / 2, 3);
            $this->vaultExtractedFrame($report, $frame['path'], $sequence, $probe, $frame['quality'], $frame['source_sequence'], $timestamp);
            $selected[$sequence]['timestamp_seconds'] = $timestamp;
        }

        return array_values($selected);
    }

    private function prepareUploadedFrames(ConsumerReport $report, string $temporaryDirectory, bool $guided = false): array
    {
        $paths = [];
        $assets = $report->evidenceBundle->assets->where('kind', 'source_frame')->sortBy('sequence');
        foreach ($assets as $asset) {
            $path = $temporaryDirectory.DIRECTORY_SEPARATOR.sprintf('frame-%03d', $asset->sequence);
            File::put($path, Storage::disk($asset->disk)->get($asset->path));
            $this->assertOriginal($asset, $path);
            if ($guided && ReceiptImageLimits::safeDimensions($path) === null) {
                // Size is checked from the header before the quality evaluator decodes pixels.
                throw new UnreadableReceiptImageException((int) $asset->sequence);
            }
            $paths[] = [
                'path' => $path,
                'source_sequence' => (int) $asset->sequence,
                'timestamp_seconds' => null,
                'quality' => $asset->metadata_json['quality'] ?? $this->evaluateQuality($path, (int) $asset->sequence, $guided),
            ];
        }

        return $paths;
    }

    private function vaultExtractedFrame(
        ConsumerReport $report,
        string $localPath,
        int $sequence,
        array $probe,
        array $quality,
        int $sourceSequence,
        float $timestampSeconds,
    ): void
    {
        $bundle = $report->evidenceBundle;
        $sha256 = hash_file('sha256', $localPath);
        $path = "receipt-evidence/{$bundle->evidence_uuid}/extracted-frame-{$sequence}-{$sha256}.jpg";
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        Storage::disk($disk)->put($path, File::get($localPath), ['visibility' => 'private']);

        ReceiptEvidenceAsset::updateOrCreate(
            [
                'receipt_evidence_bundle_id' => $bundle->id,
                'kind' => 'extracted_frame',
                'sequence' => $sequence,
            ],
            [
                'disk' => $disk,
                'path' => $path,
                'original_filename' => null,
                'mime_type' => 'image/jpeg',
                'size_bytes' => File::size($localPath),
                'sha256' => $sha256,
                'metadata_json' => [
                    'video' => $probe,
                    'quality' => $quality,
                    'source_sequence' => $sourceSequence,
                    'timestamp_seconds' => $timestampSeconds,
                ],
            ],
        );
    }

    private function recaptureResult(string $reasonCode, array $diagnostics = []): array
    {
        return [
            'status' => 'needs_recapture',
            'reason_code' => $reasonCode,
            'lines' => [],
            'items' => [],
            'transaction_date' => null,
            'continuity' => $diagnostics['continuity'] ?? [
                'status' => 'needs_recapture', 'continuity_score' => 0.0, 'reasons' => [strtolower($reasonCode)],
            ],
            'merchant' => $diagnostics['merchant'] ?? ['status' => 'unverified'],
            'warnings' => [],
            'manual_review_required' => false,
            'diagnostics' => $diagnostics,
        ];
    }

    private function failureResult(string $failureCode, array $ocrDiagnostics, bool $budgetExhausted = false): array
    {
        return [
            'status' => 'failed',
            'reason_code' => $failureCode,
            'lines' => [],
            'items' => [],
            'transaction_date' => null,
            'continuity' => null,
            'merchant' => ['status' => 'unverified'],
            'warnings' => [],
            'manual_review_required' => false,
            'diagnostics' => ['ocr' => $ocrDiagnostics, 'budget_exhausted' => $budgetExhausted],
        ];
    }

    private function warning(string $code): array
    {
        return ['code' => $code, 'message' => match ($code) {
            'OCR_INCOMPLETE' => 'One or more clear receipt sections could not be fully extracted by OCR.',
            'INCOMPLETE_SCAN' => 'Adjacent receipt section continuity could not be verified automatically.',
            'STORE_NOT_CONFIRMED' => 'The store name could not be confidently matched by OCR.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines were extracted.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not extracted.',
            'TOTAL_MISMATCH' => 'The extracted item amounts do not match the extracted total.',
            default => 'The system extraction requires DTI review.',
        }];
    }
}
