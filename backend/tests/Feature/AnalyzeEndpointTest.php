<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Services\Ocr\ScanSessionRepository;
use App\Services\Ocr\ShelfTagOcrService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class AnalyzeEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected Store $store;
    protected SrpBulletin $product;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $this->store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'San Jose Grocery',
            'owner_name' => 'Juan Dela Cruz',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7449,
            'longitude' => 121.9839,
            'is_active' => true,
            'is_verified' => true,
        ]);

        $this->product = SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
            'category' => 'Canned Fish',
            'unit' => '155 g',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);
    }

    private function createFake800x600Image(): UploadedFile
    {
        $img = imagecreatetruecolor(800, 600);
        $white = imagecolorallocate($img, 255, 255, 255);
        $black = imagecolorallocate($img, 0, 0, 0);
        imagefilledrectangle($img, 0, 0, 800, 600, $white);
        imagestring($img, 5, 20, 20, 'SHELF TAG SABA SARDINES 155g P23.50', $black);

        $tempPath = tempnam(sys_get_temp_dir(), 'test_scan_');
        imagepng($img, $tempPath);
        imagedestroy($img);

        return new UploadedFile($tempPath, 'shelf_tag.png', 'image/png', null, true);
    }

    public function test_analyze_endpoint_success_returns_200_and_stores_session(): void
    {
        $scanUuid = (string) Str::uuid();

        // Mock ShelfTagOcrService returning TSV words for "SABA SARDINES 155g P23.50"
        $mockOcrWords = [
            ['text' => 'Saba', 'confidence' => 95, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'Sardines', 'confidence' => 92, 'left' => 65, 'top' => 10, 'width' => 70, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '155', 'confidence' => 90, 'left' => 140, 'top' => 10, 'width' => 30, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'g', 'confidence' => 88, 'left' => 175, 'top' => 10, 'width' => 15, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'P23.50', 'confidence' => 96, 'left' => 10, 'top' => 40, 'width' => 80, 'height' => 25, 'line_num' => 2, 'block_num' => 1],
        ];

        $this->mock(ShelfTagOcrService::class, function ($mock) use ($mockOcrWords) {
            $mock->shouldReceive('extractText')
                ->once()
                ->andReturn([
                    'status' => 'OCR_SUCCESS',
                    'raw_text' => "Saba Sardines 155 g\nP23.50",
                    'lines' => ['Saba Sardines 155 g', 'P23.50'],
                    'words' => $mockOcrWords,
                ]);
        });

        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $imageFile,
            'scan_uuid' => $scanUuid,
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'scan_uuid' => $scanUuid,
                'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED',
                'detected_price_string' => '23.50',
                'detected_price_source' => 'OCR',
                'product_source' => 'OCR_AUTO',
                'auto_resolved' => true,
                'recovery_reason' => null,
                'comparison' => [
                    'commodity_name' => 'Saba Philippines Sardines in Tomato Sauce 155 g',
                    'displayed_price' => '23.50',
                    'reference_price' => '21.50',
                    'product_source' => 'OCR_AUTO',
                    'price_source' => 'OCR_DETECTED',
                ],
            ]
        ]);

        $responseData = $response->json('data');
        $this->assertNotNull($responseData['scan_id']);
        $this->assertGreaterThanOrEqual(80, $responseData['price_confidence']);
        $this->assertNotEmpty($responseData['candidates']);
        $this->assertEquals($this->product->id, $responseData['candidates'][0]['id']);
        $this->assertEquals($this->product->id, $responseData['comparison']['product']['id']);

        // Assert ScanSessionRepository stores the session with allowed_candidate_product_ids containing matched product ID
        $repository = app(ScanSessionRepository::class);
        $session = $repository->get($responseData['scan_id']);

        $this->assertNotNull($session);
        $this->assertEquals($scanUuid, $session['scan_uuid']);
        $this->assertEquals($this->store->id, $session['store_id']);
        $this->assertEquals('OCR_PRODUCT_AND_PRICE_DETECTED', $session['ocr_status']);
        $this->assertContains($this->product->id, $session['allowed_candidate_product_ids']);
        $this->assertEquals('23.50', $session['detected_price_string']);
        $this->assertEquals(2350, $session['detected_price_centavos']);

        // Assert temp image file is deleted from scan_vault disk
        $files = Storage::disk('local')->files('scan_vault');
        $this->assertEmpty($files, 'Preprocessed temp image file was not deleted from scan_vault disk.');
    }

    public function test_analyze_endpoint_rejects_unverified_or_missing_store(): void
    {
        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => 99999,
            'image' => $imageFile,
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertStatus(422);
    }

    public function test_analyze_endpoint_handles_ocr_unavailable_status(): void
    {
        $this->mock(ShelfTagOcrService::class, function ($mock) {
            $mock->shouldReceive('extractText')
                ->once()
                ->andReturn([
                    'status' => 'OCR_UNAVAILABLE',
                    'raw_text' => '',
                    'lines' => [],
                    'words' => [],
                ]);
        });

        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $imageFile,
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertStatus(503);
        $response->assertJson([
            'success' => false,
            'ocr_status' => 'OCR_UNAVAILABLE',
        ]);
    }

    public function test_analyze_endpoint_handles_ocr_timeout_status(): void
    {
        $this->mock(ShelfTagOcrService::class, function ($mock) {
            $mock->shouldReceive('extractText')
                ->once()
                ->andReturn([
                    'status' => 'OCR_TIMEOUT',
                    'raw_text' => '',
                    'lines' => [],
                    'words' => [],
                ]);
        });

        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $imageFile,
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertStatus(504);
        $response->assertJson([
            'success' => false,
            'ocr_status' => 'OCR_TIMEOUT',
        ]);
    }

    public function test_analyze_endpoint_handles_ocr_failed_status(): void
    {
        $this->mock(ShelfTagOcrService::class, function ($mock) {
            $mock->shouldReceive('extractText')
                ->once()
                ->andReturn([
                    'status' => 'OCR_FAILED',
                    'raw_text' => '',
                    'lines' => [],
                    'words' => [],
                ]);
        });

        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $imageFile,
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertStatus(500);
        $response->assertJson([
            'success' => false,
            'ocr_status' => 'OCR_FAILED',
        ]);
    }

    public function test_analyze_endpoint_handles_ocr_no_text_status(): void
    {
        $this->mock(ShelfTagOcrService::class, function ($mock) {
            $mock->shouldReceive('extractText')
                ->twice()
                ->andReturn([
                    'status' => 'OCR_NO_TEXT',
                    'raw_text' => '',
                    'lines' => [],
                    'words' => [],
                ]);
        });

        $imageFile = $this->createFake800x600Image();

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $imageFile,
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'ocr_status' => 'OCR_NO_TEXT',
                'candidates' => [],
                'detected_price_string' => null,
                'ocr_pass_count' => 2,
            ]
        ]);
    }

    public function test_fallback_ocr_pass_can_recover_a_primary_no_text_result(): void
    {
        $words = [
            ['text' => 'Saba', 'confidence' => 95, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'Sardines', 'confidence' => 92, 'left' => 65, 'top' => 10, 'width' => 70, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '155g', 'confidence' => 90, 'left' => 140, 'top' => 10, 'width' => 45, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'P23.50', 'confidence' => 96, 'left' => 10, 'top' => 40, 'width' => 80, 'height' => 25, 'line_num' => 2, 'block_num' => 1],
        ];

        $this->mock(ShelfTagOcrService::class, function ($mock) use ($words) {
            $mock->shouldReceive('extractText')
                ->twice()
                ->andReturn(
                    ['status' => 'OCR_NO_TEXT', 'raw_text' => '', 'lines' => [], 'words' => []],
                    ['status' => 'OCR_SUCCESS', 'raw_text' => "Saba Sardines 155g\nP23.50", 'lines' => ['Saba Sardines 155g', 'P23.50'], 'words' => $words],
                );
        });

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $this->createFake800x600Image(),
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.ocr_pass_count', 2);
        $response->assertJsonPath('data.auto_resolved', true);
        $response->assertJsonPath('data.comparison.price_source', 'OCR_DETECTED');
    }

    public function test_fallback_ocr_pass_runs_when_primary_result_has_price_but_no_product(): void
    {
        $priceOnly = [
            ['text' => 'P23.50', 'confidence' => 96, 'left' => 10, 'top' => 40, 'width' => 80, 'height' => 25, 'line_num' => 2, 'block_num' => 1],
        ];
        $complete = [
            ['text' => 'Saba', 'confidence' => 95, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'Sardines', 'confidence' => 92, 'left' => 65, 'top' => 10, 'width' => 70, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '155g', 'confidence' => 90, 'left' => 140, 'top' => 10, 'width' => 45, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'P23.50', 'confidence' => 96, 'left' => 10, 'top' => 40, 'width' => 80, 'height' => 25, 'line_num' => 2, 'block_num' => 1],
        ];

        $this->mock(ShelfTagOcrService::class, function ($mock) use ($priceOnly, $complete) {
            $mock->shouldReceive('extractText')
                ->twice()
                ->andReturn(
                    ['status' => 'OCR_SUCCESS', 'raw_text' => 'P23.50', 'lines' => ['P23.50'], 'words' => $priceOnly],
                    ['status' => 'OCR_SUCCESS', 'raw_text' => "Saba Sardines 155g\nP23.50", 'lines' => ['Saba Sardines 155g', 'P23.50'], 'words' => $complete],
                );
        });

        $response = $this->postJson('/api/public/scan-tag/analyze', [
            'store_id' => $this->store->id,
            'image' => $this->createFake800x600Image(),
            'scan_uuid' => (string) Str::uuid(),
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.ocr_pass_count', 2);
        $response->assertJsonPath('data.auto_resolved', true);
        $response->assertJsonPath('data.recovery_reason', null);
    }
}
