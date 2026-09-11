<?php

namespace App\Services\Receipt;

/**
 * Pixel limits that keep receipt image decoding within worker memory. Preprocessing holds two true-colour copies
 * (~8 bytes per pixel), so 4 MP stays near 32 MiB. PWA frames are at most 2000 px on the long side.
 */
final class ReceiptImageLimits
{
    public const MAX_DIMENSION = 4000;
    public const MAX_PIXELS = 4_000_000;

    /**
     * Reads dimensions from the image header without decoding pixels.
     * Returns null for an unreadable header; throws when the image is too large to decode safely.
     *
     * @return array{width: int, height: int}|null
     */
    public static function safeDimensions(string $path): ?array
    {
        $info = @getimagesize($path);
        if (! $info) {
            return null;
        }
        [$width, $height] = [(int) $info[0], (int) $info[1]];
        if ($width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION || $width * $height > self::MAX_PIXELS) {
            throw new UnsafeReceiptImageException($width, $height);
        }

        return ['width' => $width, 'height' => $height];
    }
}
