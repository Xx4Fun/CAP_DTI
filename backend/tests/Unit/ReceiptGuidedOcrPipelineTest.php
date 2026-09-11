<?php

namespace Tests\Unit;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Receipt\ReceiptEvidencePipeline;
use App\Services\Receipt\ReceiptFrameQualityEvaluator;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class ReceiptGuidedOcrPipelineTest extends TestCase
{
    /** @param array<int, array{0: string, 1: bool|null}> $frames bytes and stored quality.acceptable (null = not evaluated yet) */
    private function report(array $frames, string $storeName = 'Receipt Test Mart'): ConsumerReport
    {
        Storage::fake('receipt_evidence');
        Storage::fake('local');
        $assets = new Collection;
        foreach ($frames as $sequence => [$bytes, $acceptable]) {
            Storage::disk('receipt_evidence')->put("frame-{$sequence}.png", $bytes);
            $assets->push(new ReceiptEvidenceAsset([
                'kind' => 'source_frame', 'sequence' => $sequence, 'disk' => 'receipt_evidence', 'path' => "frame-{$sequence}.png",
                'sha256' => hash('sha256', $bytes),
                'metadata_json' => $acceptable === null ? null : ['quality' => ['acceptable' => $acceptable]],
            ]));
        }

        return (new ConsumerReport(['capture_mode' => 'guided_photos_v1']))
            ->setRelation('store', new Store(['store_name' => $storeName]))
            ->setRelation('evidenceBundle', (new ReceiptEvidenceBundle)->setRelation('assets', $assets));
    }

    private function fixture(): string
    {
        return (string) file_get_contents(base_path('tests/Fixtures/shelf_tag_saba.png'));
    }

    private function ocr(array ...$passes): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->times(count($passes))->andReturnValues(array_map(fn (array $lines) => [
            'status' => 'OCR_SUCCESS', 'raw_text' => implode("\n", $lines), 'lines' => $lines, 'words' => [['confidence' => 90]],
        ], $passes));
        $this->app->instance(ShelfTagOcrService::class, $ocr);
    }

    /** A PNG with only a signature and IHDR, so its dimensions are declared without allocating pixels. */
    public static function headerOnlyPng(int $width, int $height): string
    {
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

        return "\x89PNG\r\n\x1a\n".$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0)).$chunk('IEND', '');
    }

    public function test_guided_passes_request_300_dpi_and_paragraph_aware_lines(): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->once()->withArgs(fn ($path, $options) => $options['psm'] === 6
            && $options['dpi'] === 300 && $options['paragraph_lines'] === true
            && $options['config'] === ['preserve_interword_spaces' => 1])
            ->andReturn(['status' => 'OCR_SUCCESS', 'raw_text' => '', 'lines' => ['RICE 45.00', 'TOTAL 45.00'], 'words' => []]);
        $this->app->instance(ShelfTagOcrService::class, $ocr);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]]));

        $this->assertSame('ready', $result['status']);
        $this->assertSame('skipped', $result['ocr'][0]['passes'][1]['status']);
    }

    public function test_primary_with_items_but_no_total_runs_fallback_and_borrows_its_total_line(): void
    {
        $this->ocr(['RICE 45.00'], ['TOTAL 45.00', 'Wy']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]]));

        $this->assertSame('primary', $result['ocr'][0]['selected_pass']);
        $this->assertTrue($result['ocr'][0]['total_from_other_pass']);
        $this->assertSame(['RICE'], array_column($result['items'], 'item_name'));
        $this->assertSame(45.0, $result['detected_total']);
    }

    public function test_primary_with_total_but_no_items_runs_fallback(): void
    {
        $this->ocr(['TOTAL 45.00'], ['RICE 45.00', 'TOTAL 45.00']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]]));

        $this->assertSame('fallback', $result['ocr'][0]['selected_pass']);
        $this->assertSame(['RICE'], array_column($result['items'], 'item_name'));
        $this->assertSame(45.0, $result['detected_total']);
    }

    public function test_pos_rows_noise_filter_and_transaction_date_apply_to_guided_receipts(): void
    {
        $this->ocr(['Wy', '09/04/2026 10:32', '004793487 1 111.75 111.75T', 'CALLA PWD F/C ROSE GARDEN', 'Total P111.75', 'yy']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]]));

        $this->assertSame(['CALLA PWD F/C ROSE GARDEN'], array_column($result['items'], 'item_name'));
        $this->assertSame(111.75, $result['detected_total']);
        $this->assertSame('2026-09-04', $result['transaction_date']);
        $this->assertNotContains('Wy', $result['lines']);
        $this->assertSame(['kept' => 4, 'dropped' => 2], $result['ocr'][0]['line_filter']);
        $this->assertSame('Wy', $result['ocr'][0]['passes'][0]['result']['lines'][0]);
    }

    public function test_merchant_display_is_trimmed_ocr_text_never_the_store_record(): void
    {
        $this->ocr(['GATSANO GRAND MALL OF ANTIQUE =. |', 'BAGUMBAYAN, SAN JOSE, ANTIQUE 5700', 'RICE 45.00', 'TOTAL 45.00']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]], 'Gaisano Grand Mall of Antique'));

        $this->assertSame('matched', $result['merchant']['status']);
        $this->assertSame('GATSANO GRAND MALL OF ANTIQUE', $result['merchant']['display_name']);
    }

    public function test_merchant_display_with_fewer_than_three_letters_becomes_null(): void
    {
        $this->ocr(['| X12 |', 'RICE 45.00', 'TOTAL 45.00']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]], 'X12 Store'));

        $this->assertSame('matched', $result['merchant']['status']);
        $this->assertNull($result['merchant']['display_name']);
    }

    public function test_noise_only_frame_needs_recapture_when_its_quality_is_poor(): void
    {
        $this->ocr(['Wy', '| ae ='], ['yy', '— & g']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), false]]));

        $this->assertSame('needs_recapture', $result['status']);
        $this->assertSame('TEXT_UNREADABLE', $result['reason_code']);
    }

    public function test_noise_only_frame_with_acceptable_quality_stays_reviewable(): void
    {
        $this->ocr(['Wy', '| ae ='], ['yy', '— & g']);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]]));

        $this->assertSame('ready', $result['status']);
        $this->assertSame([], $result['lines']);
        $this->assertTrue($result['manual_review_required']);
    }

    public function test_merchant_header_does_not_count_as_an_item_when_deciding_to_run_the_fallback(): void
    {
        $this->ocr(
            ['004793487 1 111.75 111.75T', 'GAISANO GRAND ANTIQUE', 'TOTAL 111.75'],
            ['004793487 1 111.75 111.75T', 'CALLA PWD F/C ROSE GARDEN', 'TOTAL 111.75'],
        );

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$this->fixture(), true]], 'Gaisano Grand Mall of Antique'));

        $this->assertSame('OCR_SUCCESS', $result['ocr'][0]['passes'][1]['status']);
        $this->assertSame('fallback', $result['ocr'][0]['selected_pass']);
        $this->assertSame(['CALLA PWD F/C ROSE GARDEN'], array_column($result['items'], 'item_name'));
    }

    public function test_evidence_replaced_after_submission_is_never_ocrd_and_fails_integrity(): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldNotReceive('scan');
        $this->app->instance(ShelfTagOcrService::class, $ocr);
        $evaluator = Mockery::mock(ReceiptFrameQualityEvaluator::class);
        $evaluator->shouldNotReceive('evaluate');
        $this->app->instance(ReceiptFrameQualityEvaluator::class, $evaluator);
        $report = $this->report([[$this->fixture(), null]]);
        // A different but perfectly valid image now sits where the canonical evidence was.
        $replacement = imagecreatetruecolor(400, 400);
        ob_start();
        imagepng($replacement);
        Storage::disk('receipt_evidence')->put('frame-0.png', (string) ob_get_clean());

        $result = app(ReceiptEvidencePipeline::class)->process($report);

        $this->assertSame('failed', $result['status']);
        $this->assertSame('EVIDENCE_INTEGRITY_FAILED', $result['reason_code']);
        $this->assertSame(['kind' => 'source_frame', 'sequence' => 0], $result['diagnostics']['integrity_failure']);
    }

    public static function oversizedFrames(): array
    {
        return ['over 4000 px' => [5000, 5000], 'over 4 megapixels' => [2001, 2000]];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('oversizedFrames')]
    public function test_stored_oversized_guided_frame_needs_recapture_without_being_decoded(int $width, int $height): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldNotReceive('scan');
        $this->app->instance(ShelfTagOcrService::class, $ocr);
        $evaluator = Mockery::mock(ReceiptFrameQualityEvaluator::class);
        $evaluator->shouldNotReceive('evaluate');
        $this->app->instance(ReceiptFrameQualityEvaluator::class, $evaluator);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[self::headerOnlyPng($width, $height), null]]));

        $this->assertSame('needs_recapture', $result['status']);
        $this->assertSame('INSUFFICIENT_FRAMES', $result['reason_code']);
        $this->assertSame(['width' => $width, 'height' => $height], $result['diagnostics']['unsafe_dimensions']);
        $this->assertNull($result['transaction_date']);
    }

    public static function undecodableFrames(): array
    {
        return [
            'unreadable header' => ['not an image at all', null],
            'empty image, quality not stored' => [self::headerOnlyPng(400, 400), null],
            'empty image, quality stored' => [self::headerOnlyPng(400, 400), true],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('undecodableFrames')]
    public function test_undecodable_guided_frame_is_a_controlled_recapture_not_a_retried_failure(string $bytes, ?bool $acceptable): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldNotReceive('scan');
        $this->app->instance(ShelfTagOcrService::class, $ocr);

        $result = app(ReceiptEvidencePipeline::class)->process($this->report([[$bytes, $acceptable]]));

        $this->assertSame('needs_recapture', $result['status']);
        $this->assertSame('INSUFFICIENT_FRAMES', $result['reason_code']);
        $this->assertSame(0, $result['diagnostics']['unreadable_frame']);
    }
}
