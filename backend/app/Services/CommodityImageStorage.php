<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

final class CommodityImageStorage
{
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

    public function delete(string $path): void
    {
        Storage::disk($this->diskName())->delete($path);
    }

    private function diskName(): string
    {
        return (string) config('filesystems.commodity_images_disk', 'public');
    }
}
