<?php

namespace App\Http\Controllers;

use App\Models\CaptureSession;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Services\Receipt\ReceiptCaptureModes;
use App\Services\Receipt\ReceiptImageLimits;
use App\Services\Receipt\UnsafeReceiptImageException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReceiptEvidenceController extends Controller
{
    public function destroy(Request $request, CaptureSession $session)
    {
        $this->authorizeCaptureSession($request, $session);
        $session->load('evidenceBundle.assets');
        foreach ($session->evidenceBundle?->assets ?? [] as $asset) {
            Storage::disk($asset->disk)->delete($asset->path);
        }
        $session->delete();

        return response()->json([
            'success' => true,
            'message' => 'Unsubmitted receipt capture deleted.',
        ]);
    }

    public function storeAsset(Request $request, CaptureSession $session)
    {
        $this->authorizeCaptureSession($request, $session);

        $validated = $request->validate([
            'kind' => 'required|in:original_video,source_frame',
            'sequence' => 'required|integer|min:0|max:12',
            'asset' => 'required|file|max:25600|mimetypes:video/webm,video/mp4,image/jpeg,image/png,image/webp',
        ]);

        $file = $request->file('asset');
        $mimeType = (string) $file->getMimeType();
        $isVideo = $validated['kind'] === 'original_video';

        if ($isVideo && (int) $validated['sequence'] !== 0) {
            abort(422, 'The original video sequence must be zero.');
        }
        if (! $isVideo && (int) $validated['sequence'] > 11) {
            abort(422, 'Receipt frame sequences must be between zero and eleven.');
        }

        if ($isVideo && ! in_array($mimeType, ['video/webm', 'video/mp4'], true)) {
            abort(422, 'The original video must be WebM or MP4.');
        }
        if (! $isVideo && ! in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            abort(422, 'Receipt frames must be JPEG, PNG, or WebP.');
        }
        // Video capture is retired: a session opened before the flag went off cannot still add video evidence.
        if ($isVideo && ! ReceiptCaptureModes::acceptsNewVideo($session->capture_mode)) {
            abort(ReceiptCaptureModes::isVideo($session->capture_mode) ? 404 : 422, 'This capture session does not accept video evidence.');
        }
        if (! $isVideo && $file->getSize() > 2 * 1024 * 1024) {
            abort(422, 'Receipt frames may not exceed 2 MiB.');
        }
        if (! $isVideo) {
            try {
                $dimensions = ReceiptImageLimits::safeDimensions((string) $file->getRealPath());
            } catch (UnsafeReceiptImageException) {
                abort(422, 'Receipt frames may not exceed 4 megapixels.');
            }
            // Size is known safe here, so a full decode confirms the frame is a usable image.
            $image = $dimensions === null ? false : @imagecreatefromstring($file->getContent());
            if ($image === false) {
                abort(422, 'Receipt frames must be readable JPEG, PNG, or WebP images.');
            }
            imagedestroy($image);
        }

        $bundle = ReceiptEvidenceBundle::firstOrCreate(
            ['capture_session_id' => $session->id],
            [
                'evidence_uuid' => (string) Str::uuid(),
                'store_id' => $session->store_id,
                'capture_mode' => $session->capture_mode,
                'processing_status' => 'collecting',
            ],
        );

        $sha256 = hash_file('sha256', $file->getRealPath());
        $extension = $file->guessExtension() ?: ($isVideo ? 'bin' : 'jpg');
        $path = "receipt-evidence/{$bundle->evidence_uuid}/{$validated['kind']}-{$validated['sequence']}-{$sha256}.{$extension}";
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        abort_unless(
            Storage::disk($disk)->put($path, $file->getContent(), ['visibility' => 'private']),
            503,
            'Receipt evidence storage is unavailable. Try again without leaving this page.',
        );

        $asset = ReceiptEvidenceAsset::firstOrNew([
            'receipt_evidence_bundle_id' => $bundle->id,
            'kind' => $validated['kind'],
            'sequence' => $validated['sequence'],
        ]);
        $wasCreated = ! $asset->exists;
        $previousDisk = $asset->disk;
        $previousPath = $asset->path;
        $asset->fill([
            'disk' => $disk,
            'path' => $path,
            'original_filename' => $file->getClientOriginalName(),
            'mime_type' => $mimeType,
            'size_bytes' => $file->getSize(),
            'sha256' => $sha256,
            'metadata_json' => null,
        ])->save();
        if (! $wasCreated && $previousPath && $previousPath !== $path) {
            Storage::disk($previousDisk ?: 'receipt_evidence')->delete($previousPath);
        }

        $session->update(['processing_status' => 'uploading']);

        return response()->json([
            'success' => true,
            'message' => 'Receipt evidence asset uploaded.',
            'data' => [
                'asset_id' => $asset->id,
                'kind' => $asset->kind,
                'sequence' => $asset->sequence,
                'sha256' => $asset->sha256,
            ],
        ], $wasCreated ? 201 : 200);
    }

    private function authorizeCaptureSession(Request $request, CaptureSession $session): void
    {
        $rawToken = (string) $request->header('X-Capture-Token');
        if ($rawToken === '' || ! hash_equals($session->token_hash, hash('sha256', $rawToken))) {
            abort(403, 'Invalid capture token.');
        }
        if ($session->is_used || $session->expires_at->isPast()) {
            abort(410, 'Capture session is no longer active.');
        }
    }
}
