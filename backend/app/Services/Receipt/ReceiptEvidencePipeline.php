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
    ) {}

    public function process(ConsumerReport $report): array
    {
        $report->loadMissing(['store', 'evidenceBundle.assets']);
        $bundle = $report->evidenceBundle;
        if (! $bundle) {
            throw new RuntimeException('Receipt evidence bundle is missing.');
        }

        $temporaryDirectory = storage_path('app/tmp/receipt-processing/'.Str::uuid());
        File::ensureDirectoryExists($temporaryDirectory);

        try {
            $frameCandidates = $report->capture_mode === 'continuous_video_v1'
                ? $this->prepareVideoFrames($report, $temporaryDirectory)
                : $this->prepareUploadedFrames($report, $temporaryDirectory);

            $minimumFrames = $report->capture_mode === 'continuous_video_v1' ? 2 : 1;
            if (count($frameCandidates) < $minimumFrames) {
                return $this->recaptureResult('INSUFFICIENT_FRAMES');
            }

            $frames = [];
            $ocrDiagnostics = [];
            foreach ($frameCandidates as $frame) {
                $preprocessed = $this->preprocessor->preprocess($frame['path']);
                try {
                    $primary = $this->ocr->scan($preprocessed['full_path'], [
                        'psm' => 6,
                        'minimum_confidence' => 45,
                        'timeout_seconds' => 20,
                    ]);
                    $fallback = $this->ocr->scan($preprocessed['fallback_full_path'], [
                        'psm' => 11,
                        'minimum_confidence' => 35,
                        'timeout_seconds' => 20,
                    ]);
                    $ocr = $this->ocrResultSelector->select($primary, $fallback);
                } finally {
                    $this->preprocessor->cleanup($preprocessed['path']);
                    $this->preprocessor->cleanup($preprocessed['fallback_path']);
                }

                $ocrDiagnostics[] = [
                    'sequence' => $frame['source_sequence'],
                    'timestamp_seconds' => $frame['timestamp_seconds'],
                    'status' => $ocr['status'] ?? 'OCR_FAILED',
                    'quality' => $frame['quality'] ?? null,
                ];
                $lines = array_values(array_filter($ocr['lines'] ?? [], 'is_string'));
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
                    return $this->recaptureResult('INCOMPLETE_SCAN', ['continuity' => $continuity, 'ocr' => $ocrDiagnostics]);
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

            $lines = $this->textAggregator->merge(array_column($frames, 'lines'));
            $items = $this->itemExtractor->extract($lines);
            $total = $this->totalExtractor->extract($lines);
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

            return [
                'status' => 'ready',
                'reason_code' => null,
                'lines' => $lines,
                'items' => $items,
                'detected_total' => $total,
                'continuity' => $continuity,
                'merchant' => $merchant,
                'warnings' => $warnings,
                'manual_review_required' => $warnings !== [],
                'item_sum' => $itemSum,
                'frames_processed' => count($frames),
                'ocr' => $ocrDiagnostics,
            ];
        } finally {
            File::deleteDirectory($temporaryDirectory);
        }
    }

    private function prepareVideoFrames(ConsumerReport $report, string $temporaryDirectory): array
    {
        $video = $report->evidenceBundle->assets->firstWhere('kind', 'original_video');
        if (! $video) {
            throw new InvalidArgumentException('Original receipt video is missing.');
        }

        $videoPath = $temporaryDirectory.DIRECTORY_SEPARATOR.'receipt-video';
        File::put($videoPath, Storage::disk($video->disk)->get($video->path));
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

    private function prepareUploadedFrames(ConsumerReport $report, string $temporaryDirectory): array
    {
        $paths = [];
        $assets = $report->evidenceBundle->assets->where('kind', 'source_frame')->sortBy('sequence');
        foreach ($assets as $asset) {
            $path = $temporaryDirectory.DIRECTORY_SEPARATOR.sprintf('frame-%03d', $asset->sequence);
            File::put($path, Storage::disk($asset->disk)->get($asset->path));
            $paths[] = [
                'path' => $path,
                'source_sequence' => (int) $asset->sequence,
                'timestamp_seconds' => null,
                'quality' => $asset->metadata_json['quality'] ?? $this->qualityEvaluator->evaluate($path),
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
            'continuity' => $diagnostics['continuity'] ?? [
                'status' => 'needs_recapture', 'continuity_score' => 0.0, 'reasons' => [strtolower($reasonCode)],
            ],
            'merchant' => $diagnostics['merchant'] ?? ['status' => 'unverified'],
            'warnings' => [],
            'manual_review_required' => false,
            'diagnostics' => $diagnostics,
        ];
    }

    private function failureResult(string $failureCode, array $ocrDiagnostics): array
    {
        return [
            'status' => 'failed',
            'reason_code' => $failureCode,
            'lines' => [],
            'items' => [],
            'continuity' => null,
            'merchant' => ['status' => 'unverified'],
            'warnings' => [],
            'manual_review_required' => false,
            'diagnostics' => ['ocr' => $ocrDiagnostics],
        ];
    }

    private function warning(string $code): array
    {
        return ['code' => $code, 'message' => match ($code) {
            'OCR_INCOMPLETE' => 'One or more clear receipt sections could not be fully extracted by OCR.',
            'STORE_NOT_CONFIRMED' => 'The store name could not be confidently matched by OCR.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines were extracted.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not extracted.',
            'TOTAL_MISMATCH' => 'The extracted item amounts do not match the extracted total.',
            default => 'The system extraction requires DTI review.',
        }];
    }
}
