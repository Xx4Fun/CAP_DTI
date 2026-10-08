<?php

namespace Tests\Unit;

use App\Services\Receipt\Extraction\ExtractionFailedException;
use App\Services\Receipt\Extraction\GeminiReceiptExtractor;
use App\Services\Receipt\Extraction\ReceiptExtractionValidator;
use App\Services\Receipt\Extraction\RetryableExtractionException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GeminiReceiptExtractorTest extends TestCase
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

    private const KEY = 'unit-test-gemini-key';

    private array $paths = [];

    protected function tearDown(): void
    {
        foreach ($this->paths as $path) {
            @unlink($path);
        }
        parent::tearDown();
    }

    private function extractor(int $maxRequestBytes = 18 * 1024 * 1024): GeminiReceiptExtractor
    {
        return new GeminiReceiptExtractor(self::KEY, 'gemini-3.8-flash', self::ENDPOINT, 'low', 'high', 90, $maxRequestBytes);
    }

    /** A real JPEG receipt section written to a temporary file. */
    private function frame(int $sequence, int $width = 600, int $height = 900): array
    {
        $image = imagecreatetruecolor($width, $height);
        imagefill($image, 0, 0, imagecolorallocate($image, 250, 250, 245));
        for ($i = 0; $i < 2000; $i++) {
            imagesetpixel($image, random_int(0, $width - 1), random_int(0, $height - 1), imagecolorallocate($image, random_int(0, 255), random_int(0, 255), random_int(0, 255)));
        }
        $path = (string) tempnam(sys_get_temp_dir(), 'gemini-test-');
        imagejpeg($image, $path, 95);
        $this->paths[] = $path;

        return ['path' => $path, 'mime_type' => 'image/jpeg', 'sequence' => $sequence];
    }

    /** The live-probed success envelope (Phase 1a fixture) carrying a given model output. */
    public static function completed(array $payload, string $status = 'completed'): array
    {
        $fixture = json_decode((string) file_get_contents(base_path('tests/Fixtures/gemini/interaction-completed.json')), true)['response'];
        $fixture['status'] = $status;
        foreach ($fixture['steps'] as $index => $step) {
            if ($step['type'] === 'model_output') {
                $fixture['steps'][$index]['content'] = [['type' => 'text', 'text' => json_encode($payload)]];
            }
        }

        return $fixture;
    }

    public function test_request_contract_and_successful_parse(): void
    {
        $payload = ReceiptExtractionValidatorTest::payload();
        Http::fake([self::ENDPOINT => Http::response(self::completed($payload))]);
        $frames = [$this->frame(0), $this->frame(1)];

        $extraction = $this->extractor()->extract($frames);

        $this->assertSame($payload, $extraction->payload);
        $this->assertSame('gemini', $extraction->engine['provider']);
        $this->assertSame('gemini-3.8-flash', $extraction->engine['model']);
        $this->assertSame(1136, $extraction->engine['usage']['input_tokens']);
        $this->assertSame(265, $extraction->engine['usage']['output_tokens']);
        $this->assertSame(2, $extraction->engine['frame_count']);
        $this->assertFalse($extraction->engine['derived_images']);

        Http::assertSent(function (Request $request) use ($frames) {
            $body = $request->data();
            $images = array_values(array_filter($body['input'], fn ($part) => $part['type'] === 'image'));
            $texts = array_column(array_filter($body['input'], fn ($part) => $part['type'] === 'text'), 'text');

            return $request->url() === self::ENDPOINT
                && $request->header('x-goog-api-key') === [self::KEY]
                && ! str_contains($request->url(), self::KEY)
                && $body['store'] === false
                && $body['model'] === 'gemini-3.8-flash'
                && $body['generation_config'] === ['thinking_level' => 'low']
                && $body['response_format']['mime_type'] === 'application/json'
                && isset($body['response_format']['schema']['properties']['items'])
                && str_contains($body['system_instruction'], 'Do not guess')
                && array_slice(array_values($texts), 0, 2) === ['Section 1 of 2:', 'Section 2 of 2:']
                && $images[0]['data'] === base64_encode((string) file_get_contents($frames[0]['path']))
                && $images[1]['data'] === base64_encode((string) file_get_contents($frames[1]['path']))
                && $images[0]['resolution'] === 'high'
                && ! str_contains(json_encode($body), 'REP-')
                // The privacy notice promises only the photos are sent, so the key set and every input part are pinned.
                && $this->sameSet(array_keys($body), ['model', 'store', 'system_instruction', 'generation_config', 'response_format', 'input'])
                && $this->sameSet(array_keys($body['generation_config']), ['thinking_level'])
                && array_filter($body['input'], fn (array $part) => ! $this->sameSet(
                    array_keys($part),
                    ($part['type'] ?? null) === 'text' ? ['type', 'text'] : ['type', 'data', 'mime_type', 'resolution'],
                )) === [];
        });
    }

    /** Key sets are compared without order, so rearranging the request literal is not a test failure. */
    private function sameSet(array $actual, array $expected): bool
    {
        sort($actual);
        sort($expected);

        return $actual === $expected;
    }

    public static function retryableResponses(): array
    {
        return [
            'rate limited' => [429, null, 'GEMINI_RATE_LIMITED'],
            'server error' => [503, null, 'GEMINI_UNAVAILABLE'],
            'request timeout' => [408, null, 'GEMINI_TIMEOUT'],
            'incomplete interaction' => [200, 'incomplete', 'GEMINI_UNAVAILABLE'],
            'failed interaction' => [200, 'failed', 'GEMINI_UNAVAILABLE'],
        ];
    }

    #[DataProvider('retryableResponses')]
    public function test_transient_failures_are_retryable_with_code_only_messages(int $status, ?string $interactionStatus, string $code): void
    {
        Http::fake([self::ENDPOINT => $interactionStatus
            ? Http::response(self::completed(ReceiptExtractionValidatorTest::payload(), $interactionStatus))
            : Http::response(['error' => ['message' => 'upstream detail '.self::KEY, 'code' => 'x']], $status)]);

        try {
            $this->extractor()->extract([$this->frame(0)]);
            $this->fail('Expected a retryable failure.');
        } catch (RetryableExtractionException $exception) {
            $this->assertSame($code, $exception->failureCode);
            $this->assertSame($code, $exception->getMessage());
            $this->assertStringNotContainsString(self::KEY, json_encode($exception->engine));
        }
    }

    public function test_connection_failures_are_retryable(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Operation timed out'));

        try {
            $this->extractor()->extract([$this->frame(0)]);
            $this->fail('Expected a retryable failure.');
        } catch (RetryableExtractionException $exception) {
            $this->assertSame('GEMINI_TIMEOUT', $exception->failureCode);
            $this->assertIsInt($exception->engine['duration_ms'] ?? null);
        }
    }

    public function test_override_model_is_sent_and_recorded_when_the_response_omits_model(): void
    {
        $response = self::completed(ReceiptExtractionValidatorTest::payload());
        unset($response['model']);
        Http::fake([self::ENDPOINT => Http::response($response)]);
        $result = $this->extractor()->extract([$this->frame(0)], 'gemini-3.5-flash-lite');
        $this->assertSame('gemini-3.5-flash-lite', $result->engine['model']);
        Http::assertSent(fn ($request) => $request['model'] === 'gemini-3.5-flash-lite');
    }

    public function test_provider_failure_keeps_only_known_error_codes(): void
    {
        Http::fake([self::ENDPOINT => Http::sequence()
            ->push(['error' => ['code' => 'service_unavailable', 'message' => self::KEY]], 503)
            ->push(['error' => ['code' => self::KEY, 'message' => self::KEY]], 503)]);
        foreach (['service_unavailable', null] as $expected) {
            try {
                $this->extractor()->extract([$this->frame(0)]);
                $this->fail('Expected a provider failure.');
            } catch (RetryableExtractionException $exception) {
                $this->assertSame($expected, $exception->engine['provider_error'] ?? null);
                $this->assertStringNotContainsString(self::KEY, json_encode($exception->engine));
            }
        }
    }

    public function test_live_response_to_the_production_request_parses_and_reconciles(): void
    {
        $fixture = json_decode((string) file_get_contents(base_path('tests/Fixtures/gemini/interaction-production-request.json')), true);
        Http::fake([self::ENDPOINT => Http::response($fixture['response'], $fixture['http_status'])]);

        $extraction = $this->extractor()->extract([$this->frame(0), $this->frame(1)]);
        $result = (new ReceiptExtractionValidator)
            ->validate($extraction->payload, ['store_name' => 'Probe Test Mart', 'frame_count' => 2]);

        $this->assertSame('completed', $extraction->engine['provider_status']);
        $this->assertSame(3359, $extraction->engine['usage']['total_tokens']);
        $this->assertSame('ready', $result['status']);
        $this->assertSame(['RICE 1KG', 'SARDINES 155G', 'CANDY'], array_column($result['items'], 'item_name'));
        $this->assertSame([1, 1, 2], array_column($result['items'], 'section'));
        $this->assertSame(['line_arithmetic' => 'matched', 'items_vs_subtotal' => 'matched', 'expected_vs_total' => 'matched'],
            $result['reconciliation']['checks']);
        $this->assertSame([], $result['warnings']);
    }

    public function test_unexpected_client_errors_keep_only_a_code_and_never_the_cause(): void
    {
        // Client errors about the request (e.g. an invalid header) can echo header values into their message.
        Http::fake(fn () => throw new \InvalidArgumentException('Header value "'.self::KEY.'" is invalid'));

        try {
            $this->extractor()->extract([$this->frame(0)]);
            $this->fail('Expected a retryable failure.');
        } catch (RetryableExtractionException $exception) {
            $this->assertSame('GEMINI_UNAVAILABLE', $exception->failureCode);
            $this->assertNull($exception->getPrevious());
            $this->assertStringNotContainsString(self::KEY, $exception->getMessage().json_encode($exception->engine));
        }
    }

    public static function nonTransientResponses(): array
    {
        return [
            'auth' => [fn () => Http::response(['error' => ['message' => 'bad key', 'code' => 'unauthenticated']], 401), 'GEMINI_AUTH'],
            'forbidden' => [fn () => Http::response(['error' => ['message' => 'denied', 'code' => 'permission_denied']], 403), 'GEMINI_AUTH'],
            'cancelled interaction' => [fn () => Http::response(self::completed(ReceiptExtractionValidatorTest::payload(), 'cancelled')), 'GEMINI_REJECTED'],
            'unknown interaction status' => [fn () => Http::response(self::completed(ReceiptExtractionValidatorTest::payload(), 'requires_action')), 'GEMINI_REJECTED'],
            'model not found (live fixture)' => [fn () => Http::response(
                json_decode((string) file_get_contents(base_path('tests/Fixtures/gemini/error-not-found.json')), true)['response'], 404), 'GEMINI_REJECTED'],
            'invalid request (live fixture)' => [fn () => Http::response(
                json_decode((string) file_get_contents(base_path('tests/Fixtures/gemini/error-invalid-request.json')), true)['response'], 400), 'GEMINI_REJECTED'],
            'schema-invalid output' => [fn () => Http::response(self::completed(['items' => 'not a list'])), 'EXTRACTION_INVALID'],
            'non-JSON output' => [fn () => Http::response(array_replace(self::completed([]), ['steps' => [['type' => 'model_output', 'content' => [['type' => 'text', 'text' => 'not json']]]]])), 'EXTRACTION_INVALID'],
        ];
    }

    #[DataProvider('nonTransientResponses')]
    public function test_non_transient_failures_are_not_retried(callable $response, string $code): void
    {
        Http::fake([self::ENDPOINT => $response()]);

        try {
            $this->extractor()->extract([$this->frame(0)]);
            $this->fail('Expected a non-retryable failure.');
        } catch (ExtractionFailedException $exception) {
            $this->assertSame($code, $exception->failureCode);
            $this->assertSame($code, $exception->getMessage());
        }
    }

    public function test_oversized_requests_use_transient_derivatives_or_fail_as_too_large(): void
    {
        Http::fake([self::ENDPOINT => Http::response(self::completed(ReceiptExtractionValidatorTest::payload()))]);
        $frames = [$this->frame(0, 2000, 2000), $this->frame(1, 2000, 2000)];
        $originalBytes = array_sum(array_map(fn ($frame) => strlen(base64_encode((string) file_get_contents($frame['path']))), $frames));

        $extraction = $this->extractor(maxRequestBytes: $originalBytes)->extract($frames);

        $this->assertTrue($extraction->engine['derived_images']);
        Http::assertSent(fn (Request $request) => strlen(json_encode($request->data())) < $originalBytes);
        foreach ($frames as $frame) {
            $this->assertFileExists($frame['path']);
        }

        $this->expectExceptionObject(new ExtractionFailedException('EXTRACTION_TOO_LARGE'));
        $this->extractor(maxRequestBytes: 1024)->extract($frames);
    }
}
