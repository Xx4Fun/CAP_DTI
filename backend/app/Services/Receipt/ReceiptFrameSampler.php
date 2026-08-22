<?php

namespace App\Services\Receipt;

use Illuminate\Support\Facades\File;
use RuntimeException;
use Symfony\Component\Process\Process;

class ReceiptFrameSampler
{
    /** @return array{frames_per_second:float,expected_frames:int,window_count:int,last_frame_seconds:float} */
    public function plan(float $durationSeconds, int $maximumWindows = 12): array
    {
        $framesPerSecond = 2.0;
        $expectedFrames = max(0, (int) floor(max(0.0, $durationSeconds) * $framesPerSecond));
        $windowCount = min($maximumWindows, $expectedFrames);

        return [
            'frames_per_second' => $framesPerSecond,
            'expected_frames' => $expectedFrames,
            'window_count' => $windowCount,
            'last_frame_seconds' => $expectedFrames > 0
                ? round(($expectedFrames - 1) / $framesPerSecond, 3)
                : 0.0,
        ];
    }

    /** @return array<int,string> */
    public function extract(string $videoPath, string $framePattern, float $durationSeconds): array
    {
        $plan = $this->plan($durationSeconds);
        $process = new Process([
            (string) config('services.ffmpeg.path', 'ffmpeg'),
            '-hide_banner', '-loglevel', 'error', '-i', $videoPath,
            '-vf', 'fps='.$plan['frames_per_second'], '-q:v', '2', $framePattern,
        ]);
        $process->setTimeout(max(60, (int) ceil($durationSeconds * 3)));
        $process->run();
        if (! $process->isSuccessful()) {
            throw new RuntimeException('Unable to extract receipt video frames.');
        }

        $paths = File::glob(dirname($framePattern).DIRECTORY_SEPARATOR.'frame-*.jpg');
        sort($paths, SORT_NATURAL);

        return $paths;
    }
}

