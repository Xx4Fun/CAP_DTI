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
use Symfony\Component\Process\Process;

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
        private readonly ReceiptPreviewStitcher $previewStitcher,
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
            $framePaths = $report->capture_mode === 'continuous_video_v1'
                ? $this->prepareVideoFrames($report, $temporaryDirectory)
                : $this->prepareUploadedFrames($report, $temporaryDirectory);

            if (count($framePaths) < 2) {
                return $this->recaptureResult('insufficient_clear_frames');
            }

            $frames = [];
            foreach ($framePaths as $sequence => $framePath) {
                $preprocessed = $this->preprocessor->preprocess($framePath);
                try {
                    $ocr = $this->ocr->scan($preprocessed['full_path'], [
                        'psm' => 6,
                        'minimum_confidence' => 45,
                        'timeout_seconds' => 20,
                    ]);
                } finally {
                    $this->preprocessor->cleanup($preprocessed['path']);
                    $this->preprocessor->cleanup($preprocessed['fallback_path']);
                }

                $lines = array_values(array_filter($ocr['lines'] ?? [], 'is_string'));
                if ($lines === []) {
                    continue;
                }

                $frames[] = [
                    'sequence' => $sequence,
                    'merchant' => $this->detectMerchantCandidate($lines),
                    'lines' => $lines,
                    'ocr_status' => $ocr['status'] ?? 'OCR_FAILED',
                ];
            }

            if (count($frames) < 2) {
                return $this->recaptureResult('insufficient_ocr_frames');
            }

            $continuity = $this->continuityAnalyzer->analyze($frames);
            if ($continuity['status'] !== 'ready') {
                return [
                    'status' => 'needs_recapture',
                    'lines' => [],
                    'items' => [],
                    'continuity' => $continuity,
                    'merchant' => ['status' => 'unverified'],
                ];
            }

            $merchant = $this->assessMerchant($report->store?->store_name, $frames);
            if ($merchant['status'] === 'mismatch') {
                return [
                    'status' => 'needs_recapture',
                    'lines' => [],
                    'items' => [],
                    'continuity' => $continuity,
                    'merchant' => $merchant,
                ];
            }

            $this->vaultStitchedPreview($report, $framePaths, $temporaryDirectory);

            $lines = $this->textAggregator->merge(array_column($frames, 'lines'));
            $items = $this->itemExtractor->extract($lines);

            return [
                'status' => $items === [] || $merchant['status'] !== 'matched' ? 'ready_manual_review' : 'ready',
                'lines' => $lines,
                'items' => $items,
                'continuity' => $continuity,
                'merchant' => $merchant,
                'frames_processed' => count($frames),
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
        $process = new Process([
            (string) config('services.ffmpeg.path', 'ffmpeg'),
            '-hide_banner', '-loglevel', 'error', '-i', $videoPath,
            '-vf', 'fps=4', '-frames:v', '24', '-q:v', '2', $framePattern,
        ]);
        $process->setTimeout(60);
        $process->run();
        if (! $process->isSuccessful()) {
            throw new RuntimeException('Unable to extract receipt video frames.');
        }

        $paths = File::glob($temporaryDirectory.DIRECTORY_SEPARATOR.'frame-*.jpg');
        sort($paths, SORT_NATURAL);
        $selected = $this->qualityEvaluator->select($paths, 12);
        foreach ($selected as $sequence => $frame) {
            $this->vaultExtractedFrame($report, $frame['path'], $sequence, $probe, $frame['quality']);
        }

        return array_values(array_column($selected, 'path'));
    }

    private function prepareUploadedFrames(ConsumerReport $report, string $temporaryDirectory): array
    {
        $paths = [];
        $assets = $report->evidenceBundle->assets->where('kind', 'source_frame')->sortBy('sequence');
        foreach ($assets as $asset) {
            $path = $temporaryDirectory.DIRECTORY_SEPARATOR.sprintf('frame-%03d', $asset->sequence);
            File::put($path, Storage::disk($asset->disk)->get($asset->path));
            $paths[] = $path;
        }

        return $paths;
    }

    private function vaultExtractedFrame(ConsumerReport $report, string $localPath, int $sequence, array $probe, array $quality): void
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
                'metadata_json' => ['video' => $probe, 'quality' => $quality],
            ],
        );
    }

    private function vaultStitchedPreview(ConsumerReport $report, array $framePaths, string $temporaryDirectory): void
    {
        $localPath = $temporaryDirectory.DIRECTORY_SEPARATOR.'stitched-preview.jpg';
        $this->previewStitcher->stitch($framePaths, $localPath);
        $bundle = $report->evidenceBundle;
        $sha256 = hash_file('sha256', $localPath);
        $path = "receipt-evidence/{$bundle->evidence_uuid}/stitched-preview-{$sha256}.jpg";
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        Storage::disk($disk)->put($path, File::get($localPath), ['visibility' => 'private']);
        ReceiptEvidenceAsset::updateOrCreate(
            ['receipt_evidence_bundle_id' => $bundle->id, 'kind' => 'stitched_preview', 'sequence' => 0],
            [
                'disk' => $disk, 'path' => $path, 'original_filename' => null,
                'mime_type' => 'image/jpeg', 'size_bytes' => File::size($localPath),
                'sha256' => $sha256, 'metadata_json' => ['frame_count' => count($framePaths)],
            ],
        );
    }

    private function detectMerchantCandidate(array $lines): ?string
    {
        foreach (array_slice($lines, 0, 3) as $line) {
            if (! preg_match('/\d+[.,]\d{2}/', $line) && preg_match_all('/[a-z]{2,}/i', $line) >= 2) {
                return trim($line);
            }
        }

        return null;
    }

    private function assessMerchant(?string $expectedStore, array $frames): array
    {
        $candidates = array_values(array_unique(array_filter(array_column($frames, 'merchant'))));
        if (! $expectedStore || $candidates === []) {
            return ['status' => 'unverified', 'expected_store' => $expectedStore, 'observed' => $candidates];
        }

        $expectedTokens = $this->merchantTokens($expectedStore);
        foreach ($candidates as $candidate) {
            $candidateTokens = $this->merchantTokens($candidate);
            if ($expectedTokens !== [] && count(array_intersect($expectedTokens, $candidateTokens)) / count($expectedTokens) >= 0.5) {
                return ['status' => 'matched', 'expected_store' => $expectedStore, 'observed' => $candidates];
            }
        }

        return ['status' => 'mismatch', 'expected_store' => $expectedStore, 'observed' => $candidates];
    }

    private function merchantTokens(string $value): array
    {
        $tokens = preg_split('/[^a-z0-9]+/i', strtolower($value), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return array_values(array_filter(array_unique($tokens), fn (string $token) => strlen($token) >= 3));
    }

    private function recaptureResult(string $reason): array
    {
        return [
            'status' => 'needs_recapture',
            'lines' => [],
            'items' => [],
            'continuity' => ['status' => 'needs_recapture', 'continuity_score' => 0.0, 'reasons' => [$reason]],
            'merchant' => ['status' => 'unverified'],
        ];
    }
}
