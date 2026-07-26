<?php

namespace Tests\Unit;

use App\Services\Ocr\ShelfTagFieldParser;
use App\Services\Ocr\ShelfTagTextNormalizer;
use Tests\TestCase;

class ShelfTagFieldParserTest extends TestCase
{
    protected ShelfTagFieldParser $parser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->parser = new ShelfTagFieldParser();
    }

    public function test_spatial_line_word_grouping_and_price_anchor_proximity(): void
    {
        $words = [
            ['text' => 'BRAND', 'confidence' => 90, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'SRP', 'confidence' => 95, 'left' => 10, 'top' => 40, 'width' => 30, 'height' => 20, 'line_num' => 2, 'block_num' => 1],
            ['text' => '23.50', 'confidence' => 92, 'left' => 50, 'top' => 40, 'width' => 40, 'height' => 20, 'line_num' => 2, 'block_num' => 1],
            ['text' => 'CODE', 'confidence' => 88, 'left' => 10, 'top' => 70, 'width' => 40, 'height' => 20, 'line_num' => 3, 'block_num' => 1],
            ['text' => '100', 'confidence' => 85, 'left' => 60, 'top' => 70, 'width' => 30, 'height' => 20, 'line_num' => 3, 'block_num' => 1],
        ];

        $payload = $this->parser->parse($words);

        $this->assertEquals('23.50', $payload['detected_price_string']);
        $this->assertEquals(2350, $payload['detected_price_centavos']);
        $this->assertGreaterThan(0, $payload['price_confidence']);
        $this->assertNotEmpty($payload['price_candidates']);
        
        // Candidate 23.50 on line with SRP anchor should be top ranked
        $this->assertEquals('23.50', $payload['price_candidates'][0]['detected_price_string']);
    }

    public function test_ranking_price_above_barcode_or_package_size(): void
    {
        $words = [
            ['text' => 'SABA', 'confidence' => 95, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'SARDINES', 'confidence' => 95, 'left' => 70, 'top' => 10, 'width' => 80, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '155g', 'confidence' => 90, 'left' => 160, 'top' => 10, 'width' => 40, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '9841238472', 'confidence' => 98, 'left' => 10, 'top' => 40, 'width' => 120, 'height' => 20, 'line_num' => 2, 'block_num' => 1],
            ['text' => '₱23.50', 'confidence' => 90, 'left' => 10, 'top' => 70, 'width' => 70, 'height' => 20, 'line_num' => 3, 'block_num' => 1],
        ];

        $payload = $this->parser->parse($words);

        $this->assertEquals('23.50', $payload['detected_price_string']);
        $this->assertEquals(2350, $payload['detected_price_centavos']);
        $this->assertEquals('155 g', $payload['package_size_normalized']);
        $this->assertContains('SABA', $payload['product_raw_tokens']);
        $this->assertContains('SARDINES', $payload['product_raw_tokens']);
    }

    public function test_integer_centavo_conversion_and_string_decimal(): void
    {
        $words = [
            ['text' => 'PHP', 'confidence' => 95, 'left' => 10, 'top' => 10, 'width' => 40, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '23.50', 'confidence' => 95, 'left' => 60, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
        ];

        $payload = $this->parser->parse($words);

        $this->assertEquals('23.50', $payload['detected_price_string']);
        $this->assertEquals(2350, $payload['detected_price_centavos']);
        $this->assertIsInt($payload['detected_price_centavos']);
        $this->assertIsString($payload['detected_price_string']);
    }

    public function test_handling_comma_decimal_separators_and_trailing_zero_normalization(): void
    {
        // Test comma separator (23,50)
        $wordsComma = [
            ['text' => '₱', 'confidence' => 90, 'left' => 10, 'top' => 10, 'width' => 20, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '23,50', 'confidence' => 90, 'left' => 40, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
        ];

        $payloadComma = $this->parser->parse($wordsComma);
        $this->assertEquals('23.50', $payloadComma['detected_price_string']);
        $this->assertEquals(2350, $payloadComma['detected_price_centavos']);

        // Test single trailing decimal digit (23.5)
        $wordsSingleDecimal = [
            ['text' => 'SRP', 'confidence' => 90, 'left' => 10, 'top' => 10, 'width' => 30, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '23.5', 'confidence' => 90, 'left' => 50, 'top' => 10, 'width' => 40, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
        ];

        $payloadSingleDecimal = $this->parser->parse($wordsSingleDecimal);
        $this->assertEquals('23.50', $payloadSingleDecimal['detected_price_string']);
        $this->assertEquals(2350, $payloadSingleDecimal['detected_price_centavos']);
    }

    public function test_handling_missing_price_candidate_returns_null(): void
    {
        $wordsNoPrice = [
            ['text' => 'SABA', 'confidence' => 90, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => 'SARDINES', 'confidence' => 90, 'left' => 70, 'top' => 10, 'width' => 80, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
            ['text' => '9841238472', 'confidence' => 95, 'left' => 10, 'top' => 40, 'width' => 120, 'height' => 20, 'line_num' => 2, 'block_num' => 1],
        ];

        $payload = $this->parser->parse($wordsNoPrice);

        $this->assertNull($payload['detected_price_string']);
        $this->assertNull($payload['detected_price_centavos']);
        $this->assertEquals(0, $payload['price_confidence']);
        $this->assertEmpty($payload['price_candidates']);
    }

    public function test_normalizer_unit_and_multipack_normalization(): void
    {
        $this->assertEquals('155 g x 2', ShelfTagTextNormalizer::normalizePackageSize('155g x 2'));
        $this->assertEquals('155 g x 2', ShelfTagTextNormalizer::normalizePackageSize('155 g × 2'));
        $this->assertEquals('1.5 L', ShelfTagTextNormalizer::normalizePackageSize('1.5L'));
        $this->assertEquals('500 mL', ShelfTagTextNormalizer::normalizePackageSize('500ml'));
        $this->assertEquals('1 kg', ShelfTagTextNormalizer::normalizePackageSize('1KG'));
        $this->assertEquals('6 pcs', ShelfTagTextNormalizer::normalizePackageSize('6pcs'));
    }

    public function test_low_confidence_tokens_under_60_are_rejected(): void
    {
        $words = [
            ['text' => '₱23.50', 'confidence' => 55, 'left' => 10, 'top' => 10, 'width' => 50, 'height' => 20, 'line_num' => 1, 'block_num' => 1],
        ];

        $payload = $this->parser->parse($words);

        $this->assertNull($payload['detected_price_string']);
        $this->assertNull($payload['detected_price_centavos']);
    }
}
