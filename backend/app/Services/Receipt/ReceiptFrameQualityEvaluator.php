<?php

namespace App\Services\Receipt;

use RuntimeException;

class ReceiptFrameQualityEvaluator
{
    /** @return array{score:float,acceptable:bool,brightness:float,edge_detail:float} */
    public function evaluate(string $path): array
    {
        $source = @imagecreatefromstring((string) file_get_contents($path));
        if (! $source) {
            throw new RuntimeException('Unable to decode an extracted receipt frame.');
        }
        $width = imagesx($source);
        $height = imagesy($source);
        $sampleWidth = min(64, $width);
        $sampleHeight = min(96, $height);
        $sample = imagecreatetruecolor($sampleWidth, $sampleHeight);
        imagecopyresampled($sample, $source, 0, 0, 0, 0, $sampleWidth, $sampleHeight, $width, $height);
        imagedestroy($source);

        $matrix = [];
        for ($y = 0; $y < $sampleHeight; $y++) {
            $row = [];
            for ($x = 0; $x < $sampleWidth; $x++) {
                $rgb = imagecolorat($sample, $x, $y);
                $row[] = (($rgb >> 16) & 0xFF) * 0.299 + (($rgb >> 8) & 0xFF) * 0.587 + ($rgb & 0xFF) * 0.114;
            }
            $matrix[] = $row;
        }
        imagedestroy($sample);

        return $this->scoreMatrix($matrix);
    }

    /** @param array<int,array<int,int|float>> $matrix */
    public function scoreMatrix(array $matrix): array
    {
        $values = [];
        $edgeTotal = 0.0;
        $edgeCount = 0;
        foreach ($matrix as $y => $row) {
            foreach ($row as $x => $value) {
                $value = (float) $value;
                $values[] = $value;
                if ($x > 0) {
                    $edgeTotal += abs($value - (float) $row[$x - 1]);
                    $edgeCount++;
                }
                if ($y > 0 && isset($matrix[$y - 1][$x])) {
                    $edgeTotal += abs($value - (float) $matrix[$y - 1][$x]);
                    $edgeCount++;
                }
            }
        }
        $brightness = $values === [] ? 0.0 : array_sum($values) / count($values);
        $edgeDetail = $edgeCount === 0 ? 0.0 : $edgeTotal / $edgeCount;
        $exposurePenalty = abs(128 - $brightness) * 0.25;
        $score = round(max(0, $edgeDetail - $exposurePenalty), 3);

        return [
            'score' => $score,
            'acceptable' => $brightness >= 25 && $brightness <= 240 && $edgeDetail >= 6,
            'brightness' => round($brightness, 3),
            'edge_detail' => round($edgeDetail, 3),
        ];
    }

    /** @param array<int,string> $paths @return array<int,array{path:string,quality:array}> */
    public function select(array $paths, int $maximum): array
    {
        $evaluated = [];
        foreach ($paths as $sequence => $path) {
            $quality = $this->evaluate($path);
            if ($quality['acceptable']) {
                $evaluated[] = ['path' => $path, 'source_sequence' => $sequence, 'quality' => $quality];
            }
        }
        usort($evaluated, fn ($left, $right) => $right['quality']['score'] <=> $left['quality']['score']);
        $selected = array_slice($evaluated, 0, $maximum);
        usort($selected, fn ($left, $right) => $left['source_sequence'] <=> $right['source_sequence']);

        return array_values($selected);
    }
}
