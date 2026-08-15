<?php

namespace App\Services\Receipt;

use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\Process\Process;

class ReceiptVideoInspector
{
    public function inspect(string $videoPath): array
    {
        $process = new Process([
            (string) config('services.ffprobe.path', 'ffprobe'),
            '-v', 'error',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            $videoPath,
        ]);
        $process->setTimeout(20);
        $process->run();

        if (! $process->isSuccessful()) {
            throw new RuntimeException('Unable to inspect the receipt video.');
        }

        $data = json_decode($process->getOutput(), true);
        if (! is_array($data)) {
            throw new RuntimeException('Receipt video metadata was invalid.');
        }

        return $this->validateProbeData($data);
    }

    public function validateProbeData(array $data): array
    {
        $duration = (float) ($data['format']['duration'] ?? 0);
        if ($duration <= 0 || $duration > 30.0) {
            throw new InvalidArgumentException('Receipt videos must be no longer than 30 seconds.');
        }

        $video = null;
        $hasAudio = false;
        foreach (($data['streams'] ?? []) as $stream) {
            if (($stream['codec_type'] ?? null) === 'video' && $video === null) {
                $video = $stream;
            }
            if (($stream['codec_type'] ?? null) === 'audio') {
                $hasAudio = true;
            }
        }

        if ($hasAudio) {
            throw new InvalidArgumentException('Receipt videos must not contain audio.');
        }
        if (! $video) {
            throw new InvalidArgumentException('Receipt evidence must contain a video stream.');
        }

        $codec = strtolower((string) ($video['codec_name'] ?? ''));
        if (! in_array($codec, ['vp8', 'vp9', 'h264'], true)) {
            throw new InvalidArgumentException('Receipt video codec is not supported.');
        }

        $width = (int) ($video['width'] ?? 0);
        $height = (int) ($video['height'] ?? 0);
        if ($width < 480 || $height < 480) {
            throw new InvalidArgumentException('Receipt video resolution is too low.');
        }

        return [
            'duration_seconds' => round($duration, 3),
            'codec' => $codec,
            'width' => $width,
            'height' => $height,
            'has_audio' => false,
        ];
    }
}
