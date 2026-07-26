<?php

namespace App\Services\Ocr;

use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;
use Throwable;

class ShelfTagOcrService
{
    /**
     * Alias for scan() to process an image file for OCR.
     */
    public function process(string $imagePath): array
    {
        return $this->scan($imagePath);
    }

    /**
     * Alias for scan() to extract text from an image file for OCR.
     */
    public function extractText(string $imagePath): array
    {
        return $this->scan($imagePath);
    }

    /**
     * Perform Tesseract TSV OCR on the target image.
     */
    public function scan(string $imagePath): array
    {
        $tesseractPath = config('services.tesseract.path');

        if (!$tesseractPath || !is_string($tesseractPath) || trim($tesseractPath) === '') {
            return $this->buildResponse('OCR_UNAVAILABLE');
        }

        // Check if explicit file path given but does not exist
        if ((str_contains($tesseractPath, '/') || str_contains($tesseractPath, '\\')) && !file_exists($tesseractPath)) {
            return $this->buildResponse('OCR_UNAVAILABLE');
        }

        $timeout = (int) config('services.tesseract.timeout_seconds', 15);
        $psm = (string) config('services.tesseract.page_segmentation_mode', 11);
        $language = (string) config('services.tesseract.language', 'eng');

        $command = [$tesseractPath, $imagePath, 'stdout', '--psm', $psm, '-l', $language, 'tsv'];

        try {
            $output = $this->runProcess($command, $timeout);
            return $this->parseTsvOutput($output);
        } catch (ProcessTimedOutException $e) {
            return $this->buildResponse('OCR_TIMEOUT');
        } catch (\Symfony\Component\Process\Exception\InvalidArgumentException | \Symfony\Component\Process\Exception\LogicException | \Symfony\Component\Process\Exception\RuntimeException $e) {
            // Distinguish missing binary / exec error vs runtime execution failure if message indicates binary missing
            if (str_contains(strtolower($e->getMessage()), 'not found') || str_contains(strtolower($e->getMessage()), 'cannot find')) {
                return $this->buildResponse('OCR_UNAVAILABLE');
            }
            return $this->buildResponse('OCR_FAILED');
        } catch (Throwable $e) {
            return $this->buildResponse('OCR_FAILED');
        }
    }

    /**
     * Run Symfony Process and return raw TSV stdout string.
     */
    protected function runProcess(array $command, int $timeout): string
    {
        $process = new Process($command);
        $process->setTimeout($timeout);
        $process->run();

        if (!$process->isSuccessful()) {
            throw new \RuntimeException('Tesseract OCR process execution failed: ' . $process->getErrorOutput());
        }

        return $process->getOutput();
    }

    /**
     * Parse TSV format string into structured OCR output.
     */
    public function parseTsvOutput(string $tsvOutput): array
    {
        $rawLines = explode("\n", str_replace("\r\n", "\n", $tsvOutput));
        $words = [];
        $lineMap = [];

        foreach ($rawLines as $line) {
            $line = trim($line, "\r");
            if ($line === '') {
                continue;
            }

            $cols = explode("\t", $line);
            if (count($cols) < 11) {
                continue;
            }

            $firstCol = strtolower(trim($cols[0]));
            $confCol = strtolower(trim($cols[10]));
            if ($firstCol === 'level' || $confCol === 'conf') {
                continue;
            }

            $conf = (float) $cols[10];
            $text = isset($cols[11]) ? trim($cols[11]) : '';

            // Filter out tokens with confidence < 60
            if ($conf < 60 || $text === '') {
                continue;
            }

            $blockNum = (int) ($cols[2] ?? 0);
            $lineNum = (int) ($cols[4] ?? 0);
            $left = (int) ($cols[6] ?? 0);
            $top = (int) ($cols[7] ?? 0);
            $width = (int) ($cols[8] ?? 0);
            $height = (int) ($cols[9] ?? 0);
            $confidence = (int) round($conf);

            $words[] = [
                'text' => $text,
                'confidence' => $confidence,
                'left' => $left,
                'top' => $top,
                'width' => $width,
                'height' => $height,
                'line_num' => $lineNum,
                'block_num' => $blockNum,
            ];

            $lineKey = "{$blockNum}_{$lineNum}";
            $lineMap[$lineKey][] = $text;
        }

        if (empty($words)) {
            return $this->buildResponse('OCR_NO_TEXT');
        }

        $formattedLines = [];
        foreach ($lineMap as $lineWords) {
            $formattedLines[] = implode(' ', $lineWords);
        }

        $rawText = implode("\n", $formattedLines);

        return $this->buildResponse('OCR_SUCCESS', $rawText, $formattedLines, $words);
    }

    /**
     * Build standard response payload structure.
     */
    private function buildResponse(string $status, string $rawText = '', array $lines = [], array $words = []): array
    {
        return [
            'status' => $status,
            'raw_text' => $rawText,
            'lines' => $lines,
            'words' => $words,
        ];
    }
}
