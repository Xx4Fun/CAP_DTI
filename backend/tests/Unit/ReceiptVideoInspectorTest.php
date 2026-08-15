<?php

namespace Tests\Unit;

use App\Services\Receipt\ReceiptVideoInspector;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

class ReceiptVideoInspectorTest extends TestCase
{
    public function test_accepts_supported_silent_portrait_video_metadata(): void
    {
        $result = (new ReceiptVideoInspector)->validateProbeData([
            'format' => ['duration' => '18.25'],
            'streams' => [
                ['codec_type' => 'video', 'codec_name' => 'vp9', 'width' => 1080, 'height' => 1920],
            ],
        ]);

        $this->assertSame('vp9', $result['codec']);
        $this->assertSame(18.25, $result['duration_seconds']);
        $this->assertFalse($result['has_audio']);
    }

    public function test_rejects_video_that_contains_audio(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('must not contain audio');

        (new ReceiptVideoInspector)->validateProbeData([
            'format' => ['duration' => '12'],
            'streams' => [
                ['codec_type' => 'video', 'codec_name' => 'h264', 'width' => 720, 'height' => 1280],
                ['codec_type' => 'audio', 'codec_name' => 'aac'],
            ],
        ]);
    }

    public function test_rejects_video_longer_than_thirty_seconds(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('30 seconds');

        (new ReceiptVideoInspector)->validateProbeData([
            'format' => ['duration' => '31.1'],
            'streams' => [
                ['codec_type' => 'video', 'codec_name' => 'vp8', 'width' => 720, 'height' => 1280],
            ],
        ]);
    }
}
