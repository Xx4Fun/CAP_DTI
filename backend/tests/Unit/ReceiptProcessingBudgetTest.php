<?php

namespace Tests\Unit;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Receipt\ReceiptEvidencePipeline;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class ReceiptProcessingBudgetTest extends TestCase
{
    private function report(): ConsumerReport
    {
        Storage::fake('receipt_evidence');
        Storage::fake('local');
        $bytes = file_get_contents(base_path('tests/Fixtures/shelf_tag_saba.png'));
        Storage::disk('receipt_evidence')->put('original.png', $bytes);
        $asset = new ReceiptEvidenceAsset([
            'kind' => 'source_frame', 'sequence' => 0, 'disk' => 'receipt_evidence', 'path' => 'original.png',
            'sha256' => hash('sha256', $bytes), 'metadata_json' => ['quality' => ['acceptable' => true]],
        ]);
        $bundle = (new ReceiptEvidenceBundle)->setRelation('assets', new Collection([$asset]));
        return (new ConsumerReport(['capture_mode' => 'guided_photos_v1']))
            ->setRelation('evidenceBundle', $bundle)->setRelation('store', new Store(['store_name' => 'Shop']));
    }

    public function test_configured_pass_limits_and_per_pass_diagnostics_preserve_successful_fallback(): void
    {
        $report = $this->report();
        config(['services.tesseract.receipt_pass_timeout_seconds' => 37]);
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->once()->withArgs(function ($path, $options) {
            $this->assertSame(37, $options['timeout_seconds']);
            return $options['psm'] === 6;
        })
            ->andReturn(['status' => 'OCR_TIMEOUT', 'lines' => [], 'words' => []]);
        $ocr->shouldReceive('scan')->once()->withArgs(fn ($path, $options) => $options['psm'] === 11 && $options['timeout_seconds'] === 37)
            ->andReturn(['status' => 'OCR_SUCCESS', 'lines' => ['RICE 45.00', 'TOTAL 45.00'], 'words' => []]);
        $this->app->instance(ShelfTagOcrService::class, $ocr);
        $result = app(ReceiptEvidencePipeline::class)->process($report);
        $this->assertSame('ready', $result['status']);
        $this->assertSame(['RICE 45.00', 'TOTAL 45.00'], $result['lines']);
        $passes = $result['ocr'][0]['passes'];
        $this->assertSame(['OCR_TIMEOUT', 'OCR_SUCCESS'], array_column($passes, 'status'));
        foreach ($passes as $pass) {
            $this->assertGreaterThanOrEqual(0, $pass['duration_ms']);
            $this->assertArrayNotHasKey('lines', $pass);
        }
    }

    public function test_exhausted_budget_stops_before_fallback_and_preserves_original(): void
    {
        $report = $this->report();
        $hash = hash('sha256', Storage::disk('receipt_evidence')->get('original.png'));
        config(['services.tesseract.receipt_processing_budget_seconds' => 2]);
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->once()->withArgs(function ($path, $options) {
            $this->assertSame(1, $options['timeout_seconds']);
            return true;
        })
            ->andReturnUsing(function () {
                usleep(2100000);
                return ['status' => 'OCR_TIMEOUT', 'lines' => [], 'words' => []];
            });
        $this->app->instance(ShelfTagOcrService::class, $ocr);
        $result = app(ReceiptEvidencePipeline::class)->process($report);
        $this->assertSame('failed', $result['status']);
        $this->assertSame('OCR_TIMEOUT', $result['reason_code']);
        $this->assertTrue($result['diagnostics']['budget_exhausted']);
        $this->assertCount(1, $result['diagnostics']['ocr'][0]['passes']);
        $this->assertSame($hash, hash('sha256', Storage::disk('receipt_evidence')->get('original.png')));
        $this->assertEmpty(Storage::disk('local')->allFiles('scan_vault'));
    }
}
