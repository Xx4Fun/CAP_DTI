<?php

namespace App\Services\Ocr;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

class ShelfTagImagePreprocessor
{
    public const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
    public const MIN_DIMENSION = 200;
    public const MAX_DIMENSION = 4000;
    public const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/bmp'];
    public const VAULT_DIRECTORY = 'scan_vault';

    /**
     * Preprocesses an uploaded or local image file:
     * - Validates MIME magic bytes, size limits, and 200x200 - 4000x4000 dimensions
     * - Corrects EXIF orientation
     * - Applies grayscale conversion and contrast enhancement
     * - Saves temporary preprocessed PNG in scan_vault disk location
     *
     * @param UploadedFile|string $input
     * @return array{path: string, full_path: string, mime_type: string, width: int, height: int, size_bytes: int}
     */
    public function preprocess(UploadedFile|string $input): array
    {
        $filePath = $input instanceof UploadedFile ? $input->getRealPath() : (string) $input;

        if (!$filePath || !file_exists($filePath) || !is_file($filePath)) {
            throw new InvalidArgumentException('File does not exist or is unreadable.');
        }

        $fileSize = filesize($filePath);
        if ($fileSize > self::MAX_FILE_SIZE_BYTES) {
            throw new InvalidArgumentException('File size exceeds maximum allowed limit of 10MB.');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $filePath);
        finfo_close($finfo);

        if (!in_array($mime, self::ALLOWED_MIMES, true)) {
            throw new InvalidArgumentException('Invalid image MIME type or corrupted image magic bytes.');
        }

        $imageInfo = @getimagesize($filePath);
        if (!$imageInfo) {
            throw new InvalidArgumentException('Invalid image MIME type or corrupted image magic bytes.');
        }

        [$width, $height] = $imageInfo;

        if ($width < self::MIN_DIMENSION || $height < self::MIN_DIMENSION) {
            throw new InvalidArgumentException('Image dimensions must be at least 200x200 pixels.');
        }

        if ($width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION) {
            throw new InvalidArgumentException('Image dimensions must not exceed 4000x4000 pixels.');
        }

        $gdImage = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($filePath),
            'image/png' => @imagecreatefrompng($filePath),
            'image/webp' => @imagecreatefromwebp($filePath),
            'image/bmp' => @imagecreatefrombmp($filePath),
            default => false,
        };

        if (!$gdImage) {
            throw new RuntimeException('Failed to load image resource for preprocessing.');
        }

        // EXIF orientation correction for JPEGs
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($filePath);
            $orientation = $exif['Orientation'] ?? null;
            if ($orientation === 3) {
                $gdImage = imagerotate($gdImage, 180, 0);
            } elseif ($orientation === 6) {
                $gdImage = imagerotate($gdImage, 270, 0);
            } elseif ($orientation === 8) {
                $gdImage = imagerotate($gdImage, 90, 0);
            }
        }

        $finalWidth = imagesx($gdImage);
        $finalHeight = imagesy($gdImage);

        // Primary OCR variant: grayscale, stronger contrast, and light sharpening.
        imagefilter($gdImage, IMG_FILTER_GRAYSCALE);
        imagefilter($gdImage, IMG_FILTER_CONTRAST, -20);
        if (function_exists('imageconvolution')) {
            imageconvolution($gdImage, [[0, -1, 0], [-1, 5, -1], [0, -1, 0]], 1, 0);
        }

        $fallbackImage = imagecreatetruecolor($finalWidth, $finalHeight);
        imagecopy($fallbackImage, $gdImage, 0, 0, 0, 0, $finalWidth, $finalHeight);
        imagefilter($fallbackImage, IMG_FILTER_CONTRAST, -60);
        imagetruecolortopalette($fallbackImage, false, 2);

        ob_start();
        imagepng($gdImage);
        $binary = ob_get_clean();
        imagedestroy($gdImage);

        ob_start();
        imagepng($fallbackImage);
        $fallbackBinary = ob_get_clean();
        imagedestroy($fallbackImage);

        $scanUuid = Str::uuid();
        $filename = 'scan_' . $scanUuid . '_primary.png';
        $fallbackFilename = 'scan_' . $scanUuid . '_threshold.png';
        $relativePath = self::VAULT_DIRECTORY . '/' . $filename;
        $fallbackRelativePath = self::VAULT_DIRECTORY . '/' . $fallbackFilename;

        Storage::disk('local')->put($relativePath, $binary);
        Storage::disk('local')->put($fallbackRelativePath, $fallbackBinary);

        $fullPath = Storage::disk('local')->path($relativePath);
        $fallbackFullPath = Storage::disk('local')->path($fallbackRelativePath);
        $sizeBytes = strlen($binary);

        return [
            'path' => $relativePath,
            'full_path' => $fullPath,
            'mime_type' => 'image/png',
            'width' => $finalWidth,
            'height' => $finalHeight,
            'size_bytes' => $sizeBytes,
            'fallback_path' => $fallbackRelativePath,
            'fallback_full_path' => $fallbackFullPath,
        ];
    }

    /**
     * Safely deletes a preprocessed image file from storage.
     */
    public function cleanup(string $relativePath): bool
    {
        if (!$relativePath) {
            return false;
        }

        return Storage::disk('local')->delete($relativePath);
    }
}
