<?php

namespace App\Services\Receipt;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Receipt\Extraction\ExtractionFailedException;
use App\Services\Receipt\Extraction\ReceiptExtraction;
use App\Services\Receipt\Extraction\ReceiptExtractionBudget;
use App\Services\Receipt\Extraction\ReceiptFailureCodes;
use App\Services\Receipt\Extraction\ReceiptExtractionRouter;
use App\Services\Receipt\Extraction\ReceiptExtractionValidator;
use App\Services\Receipt\Extraction\ReceiptExtractor;
use App\Services\Receipt\Extraction\RetryableExtractionException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
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
        private readonly ReceiptExtractionRouter $extractionRouter = new ReceiptExtractionRouter,
        private readonly ReceiptExtractionBudget $extractionBudget = new ReceiptExtractionBudget,
        private readonly ReceiptExtractionValidator $extractionValidator = new ReceiptExtractionValidator,
    ) {}

    /**
     * Processes a report's receipt evidence. Every result carries an `engine` block naming the extraction path taken.
     *
     * @throws RetryableExtractionException for transient provider failures the queue may retry
     */
    public function process(ConsumerReport $report): array
    {
        $engine = ['provider' => ReceiptExtractionRouter::TESSERACT, 'route' => null];
        $result = $this->run($report, $engine);
        $result['engine'] ??= $engine;

        return $result;
    }

    private function run(ConsumerReport $report, array &$engine): array
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

            $route = $this->extractionRouter->route($report);
            $engine['route'] = $route['route'];
            // Recorded with the result so an audit can tell which claim, and which approved consent list, allowed this
            // receipt to be sent. Both are snapshots: later config changes must not rewrite history.
            $engine['billing_attestation'] = ReceiptExtractionRouter::billingAttestation();
            $engine['consent_versions'] = array_values((array) config('services.receipt_extraction.consent_versions', []));
            if ($route['provider'] === ReceiptExtractionRouter::GEMINI) {
                return $this->extractWithProvider($report, $bundle, $frameCandidates, $route['route']);
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
                $warnings[] = ReceiptWarning::make('OCR_INCOMPLETE');
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
                    $warnings[] = ReceiptWarning::make('INCOMPLETE_SCAN');
                }
            }

            $headerFrames = array_map(fn (array $frame) => $frame['lines'], array_slice($frames, 0, 2));
            $headerLines = $headerFrames === [] ? [] : array_merge(...$headerFrames);
            $merchant = $headerLines === []
                ? ['status' => 'unverified']
                : $this->merchantMatcher->match($report->store?->store_name, $report->store?->owner_name, $headerLines);
            if ($merchant['status'] !== 'matched') {
                $warnings[] = ReceiptWarning::make('STORE_NOT_CONFIRMED');
            }
            if ($guided && is_string($merchant['display_name'] ?? null)) {
                $merchant['display_name'] = ReceiptWarning::cleanDisplayName($merchant['display_name']);
            }

            $lines = $this->textAggregator->merge(array_column($frames, 'lines'));
            $itemAnalysis = $this->itemExtractor->analyze($lines, $guided, $merchantNames);
            $items = $itemAnalysis['items'];
            $rejectedItemLines = $itemAnalysis['rejected_lines'];
            $total = $this->totalExtractor->extract($lines);
            if ($rejectedItemLines !== []) {
                $warnings[] = ReceiptWarning::make('OCR_INCOMPLETE');
            }
            if ($items === []) {
                $warnings[] = ReceiptWarning::make('ITEMS_NOT_FOUND');
            }
            if ($total === null) {
                $warnings[] = ReceiptWarning::make('TOTAL_NOT_FOUND');
            }

            $itemSum = $items === [] ? null : round(array_sum(array_column($items, 'observed_price')), 2);
            if ($itemSum !== null && $total !== null && abs($itemSum - $total) > 0.05) {
                $warnings[] = ReceiptWarning::make('TOTAL_MISMATCH');
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
        } catch (ExtractionFailedException $exception) {
            // A technical or configuration failure of the extraction service: never a bad capture, never fallback values.
            $result = $this->failureResult($exception->failureCode, []);
            // The routing context comes first so a failed send keeps its route, attestation, and consent snapshot.
            $result['engine'] = [...$engine, ...$exception->engine, 'provider' => ReceiptExtractionRouter::GEMINI,
                'failure_code' => $exception->failureCode];
            Log::warning('receipt_extraction.failed', ['report_id' => $report->id, 'code' => $exception->failureCode,
                'model' => $exception->engine['model'] ?? null, 'duration_ms' => $exception->engine['duration_ms'] ?? null]);

            return $result;
        } finally {
            File::deleteDirectory($temporaryDirectory);
        }
    }

    /**
     * Sends the integrity-verified frames to the configured extraction provider and validates its output.
     *
     * @throws RetryableExtractionException
     * @throws ExtractionFailedException
     */
    private function extractWithProvider(ConsumerReport $report, ReceiptEvidenceBundle $bundle, array $frameCandidates, string $route): array
    {
        $frames = array_map(fn (array $frame) => [
            'path' => $frame['path'],
            'mime_type' => $frame['mime_type'],
            'sequence' => $frame['source_sequence'],
        ], $frameCandidates);
        // A paid extraction already stored for this attempt (e.g. the job was re-run after a crash) is reused, never re-bought.
        $stored = $bundle->processing_result_json['pending_extraction'] ?? null;
        if (is_array($stored) && is_array($stored['payload'] ?? null) && $bundle->extraction_attempted_at !== null) {
            $extraction = new ReceiptExtraction($stored['payload'], [...(array) ($stored['engine'] ?? []), 'reused' => true]);
        } else {
            $extraction = $this->buyExtraction($report, $bundle, $frames);
        }

        $result = $this->extractionValidator->validate($extraction->payload, [
            'store_name' => $report->store?->store_name,
            'owner_name' => $report->store?->owner_name,
            'frame_count' => count($frames),
            'prior_recapture_reasons' => ReceiptEvidenceBundle::query()
                ->where('consumer_report_id', $report->id)
                ->whereKeyNot($bundle->id)
                ->orderByDesc('attempt_number')
                ->limit(2)
                ->pluck('failure_code')
                ->all(),
        ]);
        $result['engine'] = [...$extraction->engine, 'route' => $route, 'status' => $result['status'],
            'billing_attestation' => ReceiptExtractionRouter::billingAttestation(),
            'consent_versions' => array_values((array) config('services.receipt_extraction.consent_versions', []))];
        $result['extraction_raw'] = $extraction->payload;
        Log::info('receipt_extraction.completed', [
            'report_id' => $report->id,
            'provider' => $extraction->engine['provider'] ?? null,
            'model' => $extraction->engine['model'] ?? null,
            'status' => $result['status'],
            'reason_code' => $result['reason_code'],
            'duration_ms' => $extraction->engine['duration_ms'] ?? null,
            'input_tokens' => $extraction->engine['usage']['input_tokens'] ?? null,
            'output_tokens' => $extraction->engine['usage']['output_tokens'] ?? null,
            'frames' => count($frames),
            'reconciliation' => $result['reconciliation']['status'] ?? null,
        ]);

        return $result;
    }

    /**
     * Makes one paid provider call within budget and stores the raw extraction on the bundle straight away, so a job
     * re-run cannot pay for the same attempt twice. Calls never sent or never billed are refunded.
     */
    private function buyExtraction(ConsumerReport $report, ReceiptEvidenceBundle $bundle, array $frames): ReceiptExtraction
    {
        $reservation = $this->extractionBudget->reserve($report, $bundle, count($frames));
        try {
            $extraction = app(ReceiptExtractor::class)->extract($frames);
        } catch (RetryableExtractionException|ExtractionFailedException $exception) {
            $notBilled = in_array($exception->failureCode, [ReceiptFailureCodes::EXTRACTION_TOO_LARGE, ReceiptFailureCodes::GEMINI_RATE_LIMITED], true);
            $notBilled
                ? $this->extractionBudget->refund($reservation)
                : $this->extractionBudget->reconcile($reservation, $exception->engine['usage']['total_tokens'] ?? null);
            if ($exception instanceof RetryableExtractionException) {
                Log::warning('receipt_extraction.transient_failure', ['report_id' => $report->id, 'code' => $exception->failureCode,
                    'model' => $exception->engine['model'] ?? null, 'duration_ms' => $exception->engine['duration_ms'] ?? null]);
            }
            throw $exception;
        }
        $this->extractionBudget->reconcile($reservation, $extraction->engine['usage']['total_tokens'] ?? null);
        $bundle->forceFill(['processing_result_json' => [
            ...(array) $bundle->processing_result_json,
            'pending_extraction' => ['payload' => $extraction->payload, 'engine' => $extraction->engine],
        ]])->save();

        return $extraction;
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
            $dimensions = $guided ? ReceiptImageLimits::safeDimensions($path) : null;
            if ($guided && $dimensions === null) {
                // Size is checked from the header before the quality evaluator decodes pixels.
                throw new UnreadableReceiptImageException((int) $asset->sequence);
            }
            $paths[] = [
                'path' => $path,
                'mime_type' => $dimensions['mime'] ?? (string) $asset->mime_type,
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

}
