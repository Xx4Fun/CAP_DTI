<?php

namespace App\Services\Receipt;

/**
 * Capture modes and the kill switch for the legacy continuous-video path.
 *
 * Video capture is retired for new reports: it stays reachable only while RECEIPT_CONTINUOUS_CAPTURE_ENABLED is true
 * (default false). Every entry point that could create video evidence checks `videoEnabled()`, while processing,
 * review, and Admin paths stay open so historical video reports can still be drained.
 */
final class ReceiptCaptureModes
{
    public const VIDEO = 'continuous_video_v1';

    public const GUIDED = 'guided_photos_v1';

    public static function videoEnabled(): bool
    {
        return (bool) config('services.receipt_capture.enabled');
    }

    public static function isVideo(?string $captureMode): bool
    {
        return $captureMode === self::VIDEO;
    }

    /** True when this capture mode may still take new video evidence. */
    public static function acceptsNewVideo(?string $captureMode): bool
    {
        return self::isVideo($captureMode) && self::videoEnabled();
    }
}
