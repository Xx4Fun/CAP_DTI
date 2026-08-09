<?php

namespace Tests\Unit;

use App\Jobs\CleanAbandonedScansJob;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;
use Tests\TestCase;

class ShelfTagImagePreprocessorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function createGdTestImage(int $width, int $height, string $format = 'png'): string
    {
        $img = imagecreatetruecolor($width, $height);
        $white = imagecolorallocate($img, 255, 255, 255);
        $black = imagecolorallocate($img, 0, 0, 0);
        imagefilledrectangle($img, 0, 0, $width, $height, $white);
        imagestring($img, 5, 10, 10, "TEST SCAN $width x $height", $black);

        $tempPath = tempnam(sys_get_temp_dir(), 'test_img_');
        if ($format === 'jpeg' || $format === 'jpg') {
            imagejpeg($img, $tempPath);
        } else {
            imagepng($img, $tempPath);
        }
        imagedestroy($img);

        return $tempPath;
    }

    public function test_preprocesses_valid_image_and_saves_to_scan_vault(): void
    {
        $tempPath = $this->createGdTestImage(400, 300, 'png');
        $preprocessor = new ShelfTagImagePreprocessor();

        $result = $preprocessor->preprocess($tempPath);

        $this->assertArrayHasKey('path', $result);
        $this->assertArrayHasKey('full_path', $result);
        $this->assertArrayHasKey('width', $result);
        $this->assertArrayHasKey('height', $result);
        $this->assertArrayHasKey('mime_type', $result);
        $this->assertArrayHasKey('size_bytes', $result);
        $this->assertArrayHasKey('fallback_path', $result);
        $this->assertArrayHasKey('fallback_full_path', $result);

        $this->assertStringStartsWith('scan_vault/', $result['path']);
        Storage::disk('local')->assertExists($result['path']);
        Storage::disk('local')->assertExists($result['fallback_path']);
        $this->assertNotSame($result['path'], $result['fallback_path']);
        $this->assertEquals(400, $result['width']);
        $this->assertEquals(300, $result['height']);
        $this->assertEquals('image/png', $result['mime_type']);

        @unlink($tempPath);
    }

    public function test_accepts_uploaded_file_instance(): void
    {
        $tempPath = $this->createGdTestImage(300, 300, 'png');
        $uploadedFile = new UploadedFile($tempPath, 'tag.png', 'image/png', null, true);

        $preprocessor = new ShelfTagImagePreprocessor();
        $result = $preprocessor->preprocess($uploadedFile);

        Storage::disk('local')->assertExists($result['path']);
        $this->assertEquals(300, $result['width']);
        $this->assertEquals(300, $result['height']);

        @unlink($tempPath);
    }

    public function test_rejects_invalid_magic_bytes_or_mime(): void
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'fake_img_');
        file_put_contents($tempPath, "NOT AN IMAGE FILE CONTENT");

        $preprocessor = new ShelfTagImagePreprocessor();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Invalid image MIME type or corrupted image magic bytes.');

        try {
            $preprocessor->preprocess($tempPath);
        } finally {
            @unlink($tempPath);
        }
    }

    public function test_rejects_image_smaller_than_min_dimensions(): void
    {
        $tempPath = $this->createGdTestImage(150, 150, 'png');
        $preprocessor = new ShelfTagImagePreprocessor();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Image dimensions must be at least 200x200 pixels.');

        try {
            $preprocessor->preprocess($tempPath);
        } finally {
            @unlink($tempPath);
        }
    }

    public function test_rejects_image_larger_than_max_dimensions(): void
    {
        $tempPath = $this->createGdTestImage(4001, 3000, 'png');
        $preprocessor = new ShelfTagImagePreprocessor();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Image dimensions must not exceed 4000x4000 pixels.');

        try {
            $preprocessor->preprocess($tempPath);
        } finally {
            @unlink($tempPath);
        }
    }

    public function test_rejects_file_exceeding_max_file_size(): void
    {
        $tempPath = tempnam(sys_get_temp_dir(), 'huge_img_');
        $handle = fopen($tempPath, 'wb');
        fwrite($handle, "\x89PNG\x0d\x0a\x1a\x0a");
        fseek($handle, 10500000);
        fwrite($handle, "END");
        fclose($handle);

        $preprocessor = new ShelfTagImagePreprocessor();

        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('File size exceeds maximum allowed limit of 10MB.');

        try {
            $preprocessor->preprocess($tempPath);
        } finally {
            @unlink($tempPath);
        }
    }

    public function test_cleanup_removes_preprocessed_file(): void
    {
        $tempPath = $this->createGdTestImage(300, 300, 'png');
        $preprocessor = new ShelfTagImagePreprocessor();

        $result = $preprocessor->preprocess($tempPath);
        Storage::disk('local')->assertExists($result['path']);

        $cleaned = $preprocessor->cleanup($result['path']);

        $this->assertTrue($cleaned);
        Storage::disk('local')->assertMissing($result['path']);

        @unlink($tempPath);
    }

    public function test_clean_abandoned_scans_job_deletes_expired_vault_files(): void
    {
        Storage::fake('local');

        // Create an old file (simulating 40 minutes ago)
        Storage::disk('local')->put('scan_vault/old_scan.png', 'fake_old_data');
        $oldFilePath = Storage::disk('local')->path('scan_vault/old_scan.png');
        touch($oldFilePath, time() - (40 * 60));

        // Create a recent file (simulating 10 minutes ago)
        Storage::disk('local')->put('scan_vault/recent_scan.png', 'fake_recent_data');
        $recentFilePath = Storage::disk('local')->path('scan_vault/recent_scan.png');
        touch($recentFilePath, time() - (10 * 60));

        $job = new CleanAbandonedScansJob(30);
        $job->handle();

        Storage::disk('local')->assertMissing('scan_vault/old_scan.png');
        Storage::disk('local')->assertExists('scan_vault/recent_scan.png');
    }
}
