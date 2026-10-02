<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Public catalog images (commodity and store photos). The database keeps the object key; this class is the
 * only place that turns a stored value into the URL clients render, so clients never build image URLs.
 */
final class CommodityImageStorage
{
    public const KEY_PATTERN = '#^(commodity_images|store_images)/[A-Za-z0-9._-]+$#';

    public function store(UploadedFile $image, string $directory = 'commodity_images'): string
    {
        $path = $image->store($directory, $this->diskName());

        if (! is_string($path) || $path === '') {
            throw new RuntimeException('Commodity image storage did not return an object key.');
        }

        return $path;
    }

    public function url(string $path): string
    {
        return Storage::disk($this->diskName())->url($path);
    }

    /** Absolute URL for a stored key or legacy absolute URL; null for anything a browser cannot load. */
    public function publicUrl(?string $stored): ?string
    {
        if (! $stored) {
            return null;
        }

        if (str_starts_with($stored, 'http://') || str_starts_with($stored, 'https://')) {
            $url = $stored;
        } else {
            $key = preg_replace('#^/?(storage/)?#', '', $stored);
            if (! preg_match(self::KEY_PATTERN, $key)) {
                return null;
            }
            $url = $this->url($key);
        }

        $secure = request()->isSecure() || request()->header('X-Forwarded-Proto') === 'https' || app()->environment('production');

        return $secure && str_starts_with($url, 'http://') ? 'https://'.substr($url, 7) : $url;
    }

    /** New image references must be an uploaded object that exists; an unchanged stored value is always kept. */
    public function assertWritable(?string $new, ?string $current, string $field = 'image_path'): void
    {
        if ($new === null || $new === $current) {
            return;
        }

        if (! preg_match(self::KEY_PATTERN, $new) || ! Storage::disk($this->diskName())->exists($new)) {
            throw ValidationException::withMessages([
                $field => ['Upload the image first; only an uploaded image can be attached.'],
            ]);
        }
    }

    public function delete(string $path): void
    {
        Storage::disk($this->diskName())->delete($path);
    }

    private function diskName(): string
    {
        return (string) config('filesystems.commodity_images_disk', 'public');
    }
}
