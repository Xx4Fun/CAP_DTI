<?php

namespace Tests\Integration;

use App\Services\Ocr\ShelfTagOcrService;
use Tests\TestCase;

class TesseractIntegrationTest extends TestCase
{
    public function test_tesseract_ocr_extracts_expected_text_from_shelf_tag_fixture(): void
    {
        $fixturePath = base_path('tests/Fixtures/shelf_tag_saba.png');

        if (!file_exists($fixturePath)) {
            $this->fail("Fixture file {$fixturePath} does not exist.");
        }

        $tesseractPath = config('services.tesseract.path');

        if (!$tesseractPath || !file_exists($tesseractPath)) {
            $possiblePaths = [
                'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
                '/usr/bin/tesseract',
                '/usr/local/bin/tesseract',
            ];

            foreach ($possiblePaths as $path) {
                if (file_exists($path)) {
                    $tesseractPath = $path;
                    config(['services.tesseract.path' => $path]);
                    break;
                }
            }
        }

        if (!$tesseractPath || !is_string($tesseractPath) || !file_exists($tesseractPath)) {
            $this->markTestSkipped('Tesseract OCR binary executable is not installed or configured on this host machine.');
        }

        $service = new ShelfTagOcrService();
        $result = $service->extractText($fixturePath);

        if (in_array($result['status'], ['OCR_NO_TEXT', 'OCR_UNAVAILABLE', 'OCR_TIMEOUT', 'OCR_FAILED'], true)) {
            $this->fail("Tesseract OCR failed with status: {$result['status']}");
        }

        $this->assertSame('OCR_SUCCESS', $result['status']);
        $this->assertStringContainsString('SABA', strtoupper($result['raw_text']));
        $this->assertStringContainsString('155', $result['raw_text']);
        $this->assertMatchesRegularExpression('/23[\.,]50/', $result['raw_text']);
    }
}
