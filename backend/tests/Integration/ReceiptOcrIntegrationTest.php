<?php

namespace Tests\Integration;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use App\Services\Receipt\ReceiptEvidencePipeline;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ReceiptOcrIntegrationTest extends TestCase
{
    public static function receipts(): array
    {
        $lines = ['RECEIPT TEST MART', '05 SEPTEMBER 2026', 'RICE 45.00', 'MILK 80.00',
            'SUGAR 70.00', 'BREAD 35.00', 'COFFEE 120.00', 'SOAP 25.00', 'TOTAL 375.00', 'THANK YOU'];
        $columns = array_map(fn ($line) => preg_replace('/ (?=\d+\.\d{2}$)/', '       ', $line), $lines);
        return ['single image' => [[$lines], true],
            'overlapping sections' => [[array_slice($lines, 0, 6), array_slice($lines, 4)], true],
            'separated columns' => [[$columns], false]];
    }

    #[DataProvider('receipts')]
    public function test_real_tesseract_processes_receipts_and_keeps_originals(array $sections, bool $expectTotal): void
    {
        $binary = config('services.tesseract.path');
        foreach ([$binary, 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe', '/usr/bin/tesseract', '/usr/local/bin/tesseract'] as $candidate) {
            if (is_string($candidate) && is_file($candidate)) {
                $binary = $candidate;
                break;
            }
        }
        if (! is_string($binary) || ! is_file($binary)) {
            $this->markTestSkipped('A real Tesseract binary is required for receipt integration checks.');
        }
        $font = collect(['C:/Windows/Fonts/consola.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            '/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf'])->first(fn ($path) => is_file($path));
        if (! $font || ! function_exists('imagettftext')) {
            $this->markTestSkipped('A system monospace TrueType font and GD FreeType are required for the synthetic receipt.');
        }
        config(['services.tesseract.path' => $binary]);
        Storage::fake('receipt_evidence');
        Storage::fake('local');
        $assets = new Collection;
        foreach ($sections as $sequence => $lines) {
            // Synthetic test receipt, generated only on the isolated test disk.
            $image = imagecreatetruecolor(1200, 160 + count($lines) * 60);
            imagefill($image, 0, 0, imagecolorallocate($image, 255, 255, 255));
            $black = imagecolorallocate($image, 0, 0, 0);
            foreach ($lines as $line => $text) {
                imagettftext($image, 24, 0, 80, 90 + $line * 60, $black, $font, $text);
            }
            ob_start();
            imagepng($image);
            $bytes = ob_get_clean();
            imagedestroy($image);
            $path = "section-{$sequence}.png";
            Storage::disk('receipt_evidence')->put($path, $bytes);
            $assets->push(new ReceiptEvidenceAsset([
                'kind' => 'source_frame', 'sequence' => $sequence, 'disk' => 'receipt_evidence',
                'path' => $path, 'sha256' => hash('sha256', $bytes),
            ]));
        }
        $report = (new ConsumerReport(['capture_mode' => 'guided_photos_v1']))
            ->setRelation('store', new Store(['store_name' => 'Receipt Test Mart']))
            ->setRelation('evidenceBundle', (new ReceiptEvidenceBundle)->setRelation('assets', $assets));
        $started = hrtime(true);
        $result = app(ReceiptEvidencePipeline::class)->process($report);
        fwrite(STDERR, json_encode(['receipt_sections' => count($sections), 'elapsed_ms' => round((hrtime(true) - $started) / 1e6),
            'ocr_diagnostics' => $result['ocr'] ?? $result['diagnostics'] ?? []]).PHP_EOL);
        $this->assertSame('ready', $result['status']);
        if ($expectTotal) {
            $this->assertSame(375.0, $result['detected_total'], json_encode($result['lines']));
            $milk = collect($result['items'])->firstWhere('item_name', 'MILK');
            $this->assertNotNull($milk);
            $this->assertSame(80.0, $milk['observed_price']);
        }
        // Real OCR may omit a line or split columns. Such results must remain
        // reviewable with warnings, never fabricated or treated as a timeout.
        $this->assertNotEmpty($result['lines']);
        foreach ($result['items'] as $item) {
            $this->assertContains($item['raw_text'], $result['lines']);
        }
        if ($result['detected_total'] === null || $result['items'] === [] || $result['item_sum'] !== $result['detected_total']) {
            $this->assertTrue($result['manual_review_required']);
            $this->assertNotEmpty($result['warnings']);
            $this->assertStringContainsString('TOTAL', implode(' ', $result['lines']));
        }
        $this->assertSame(count($sections), $result['frames_processed']);
        $this->assertSame(count($sections) === 1 ? 'not_required' : 'ready', $result['continuity']['status']);
        foreach ($assets as $asset) {
            $this->assertSame($asset->sha256, hash('sha256', Storage::disk('receipt_evidence')->get($asset->path)));
        }
        $this->assertCount(count($sections), Storage::disk('receipt_evidence')->allFiles());
        $this->assertEmpty(Storage::disk('local')->allFiles('scan_vault'));
    }
}
