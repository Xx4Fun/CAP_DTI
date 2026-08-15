<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptPreviewStitcher;
use PHPUnit\Framework\TestCase;

class ReceiptPreviewStitcherTest extends TestCase
{
    public function test_stitches_frames_vertically_for_human_review(): void
    {
        if (! function_exists('imagecreatetruecolor')) {
            $this->markTestSkipped('GD is not installed.');
        }
        $directory = sys_get_temp_dir().DIRECTORY_SEPARATOR.'receipt-stitch-'.uniqid();
        mkdir($directory);
        $first = $directory.DIRECTORY_SEPARATOR.'one.jpg';
        $second = $directory.DIRECTORY_SEPARATOR.'two.jpg';
        foreach ([[$first, 255, 0, 0], [$second, 0, 0, 255]] as [$path, $red, $green, $blue]) {
            $image = imagecreatetruecolor(100, 120);
            imagefill($image, 0, 0, imagecolorallocate($image, $red, $green, $blue));
            imagejpeg($image, $path);
            imagedestroy($image);
        }

        $output = $directory.DIRECTORY_SEPARATOR.'preview.jpg';
        (new ReceiptPreviewStitcher)->stitch([$first, $second], $output, 100);
        [$width, $height] = getimagesize($output);

        $this->assertSame(100, $width);
        $this->assertSame(240, $height);
        unlink($first);
        unlink($second);
        unlink($output);
        rmdir($directory);
    }
}
