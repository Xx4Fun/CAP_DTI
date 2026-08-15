<?php

namespace App\Services\Receipt;

use RuntimeException;

class ReceiptPreviewStitcher
{
    /** @param array<int,string> $framePaths */
    public function stitch(array $framePaths, string $outputPath, int $maximumWidth = 1000): void
    {
        if ($framePaths === [] || ! function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('Receipt preview generation requires GD and at least one frame.');
        }
        $frames = [];
        $canvasWidth = 0;
        $canvasHeight = 0;
        foreach ($framePaths as $path) {
            $image = @imagecreatefromstring((string) file_get_contents($path));
            if (! $image) {
                continue;
            }
            $width = imagesx($image);
            $height = imagesy($image);
            $targetWidth = min($maximumWidth, $width);
            $targetHeight = (int) round($height * ($targetWidth / $width));
            $frames[] = compact('image', 'targetWidth', 'targetHeight');
            $canvasWidth = max($canvasWidth, $targetWidth);
            $canvasHeight += $targetHeight;
        }
        if ($frames === []) {
            throw new RuntimeException('No receipt frames could be decoded.');
        }

        $canvas = imagecreatetruecolor($canvasWidth, $canvasHeight);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        $top = 0;
        foreach ($frames as $frame) {
            imagecopyresampled($canvas, $frame['image'], 0, $top, 0, 0, $frame['targetWidth'], $frame['targetHeight'], imagesx($frame['image']), imagesy($frame['image']));
            $top += $frame['targetHeight'];
            imagedestroy($frame['image']);
        }
        if (! imagejpeg($canvas, $outputPath, 86)) {
            imagedestroy($canvas);
            throw new RuntimeException('Unable to write the receipt preview.');
        }
        imagedestroy($canvas);
    }
}
