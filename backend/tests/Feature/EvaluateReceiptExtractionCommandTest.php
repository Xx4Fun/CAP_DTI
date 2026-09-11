<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use Tests\TestCase;

class EvaluateReceiptExtractionCommandTest extends TestCase
{
    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

    private string $root;

    protected function setUp(): void
    {
        parent::setUp();
        Sleep::fake();
        $this->root = sys_get_temp_dir().DIRECTORY_SEPARATOR.'receipt-eval-test-'.Str::random(8);
        config(['services.gemini.key' => 'eval-test-gemini-key']);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->root);
        parent::tearDown();
    }

    /** A labelled case matching the live production-request fixture (a synthetic two-section receipt). */
    private function writeCase(string $id, array $overrides = []): void
    {
        $dir = "{$this->root}/corpus/{$id}";
        File::ensureDirectoryExists($dir);
        foreach ([1, 2] as $section) {
            $image = imagecreatetruecolor(700, 500);
            imagefill($image, 0, 0, imagecolorallocate($image, 250, 250, 245));
            imagejpeg($image, "{$dir}/section-{$section}.jpg", 90);
        }
        file_put_contents("{$dir}/case.json", json_encode(array_replace([
            'store' => 'Probe Test Mart',
            'categories' => ['clean', 'multi_section', 'discounts'],
            'masked' => true,
            'ground_truth' => ['verified' => true],
            'sections' => ['section-1.jpg', 'section-2.jpg'],
            'expected' => [
                'status' => 'ready',
                'merchant' => 'PROBE TEST MART',
                'transaction_date' => '2026-09-10',
                'receipt_number' => '000123',
                'items' => [
                    ['name' => 'RICE 1KG', 'quantity' => '1', 'unit_price' => '45.00', 'line_total' => '45.00'],
                    ['name' => 'SARDINES 155G', 'quantity' => '2', 'unit_price' => '35.00', 'line_total' => '70.00'],
                    ['name' => 'CANDY', 'quantity' => '1', 'unit_price' => '12.50', 'line_total' => '12.50'],
                ],
                'subtotal' => '127.50',
                'discounts' => ['7.50'],
                'total' => '120.00',
                'other_amounts' => ['200.00', '80.00'],
            ],
        ], $overrides)));
    }

    private function liveResponse(): array
    {
        return json_decode((string) file_get_contents(base_path('tests/Fixtures/gemini/interaction-production-request.json')), true)['response'];
    }

    public function test_it_scores_a_labelled_case_and_writes_private_results(): void
    {
        Http::fake([self::ENDPOINT => Http::response($this->liveResponse())]);
        $this->writeCase('probe-two-section');

        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus", '--out' => "{$this->root}/out"])
            ->expectsOutputToContain('probe-two-section #1  status ok  items 3/3  wrong 0  missed 0  invented 0  total ok')
            ->assertSuccessful();

        $summary = json_decode((string) file_get_contents("{$this->root}/out/summary.json"), true);
        $metrics = $summary['metrics'];
        $this->assertSame(1.0, $metrics['item_recall']);
        $this->assertSame(1.0, $metrics['exact_numeric_accuracy']);
        $this->assertSame(0, $metrics['invented_values']);
        $this->assertSame(1.0, $metrics['total_accuracy']);
        $this->assertSame(1.0, $metrics['merchant_accuracy']);
        $this->assertSame(['input' => 2600, 'output' => 759, 'thought' => 0], $metrics['tokens']);
        $this->assertSame('gemini-3.8-flash', $summary['engine']['model']);
        $this->assertFileExists("{$this->root}/out/summary.md");
        Http::assertSentCount(1);
        foreach (File::allFiles("{$this->root}/out") as $file) {
            $this->assertStringNotContainsString('eval-test-gemini-key', $file->getContents());
        }
    }

    public function test_rate_limits_are_retried_within_the_call_cap(): void
    {
        Http::fake([self::ENDPOINT => Http::sequence()
            ->push(['error' => ['message' => 'quota', 'code' => 'resource_exhausted']], 429)
            ->push($this->liveResponse())]);
        $this->writeCase('probe-two-section');

        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus", '--out' => "{$this->root}/out"])->assertSuccessful();

        Http::assertSentCount(2);
        $summary = json_decode((string) file_get_contents("{$this->root}/out/summary.json"), true);
        $this->assertSame(1, $summary['metrics']['scored_runs']);
        $this->assertSame(2, $summary['provider_calls']);
    }

    public function test_unmasked_cases_are_refused_unless_the_paid_project_is_attested(): void
    {
        $this->writeCase('unmasked', ['masked' => false]);

        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus", '--dry-run' => true])
            ->expectsOutputToContain('unmasked: not marked "masked": true')
            ->assertFailed();

        config(['services.gemini.billing_attested' => 'paid']);
        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus", '--dry-run' => true])->assertSuccessful();
        Http::assertNothingSent();
    }

    public function test_invalid_ground_truth_is_reported_before_any_call(): void
    {
        $this->writeCase('bad-amount', ['expected' => ['items' => [['name' => 'RICE', 'quantity' => '1', 'unit_price' => '45', 'line_total' => '45.00']]]]);

        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus"])
            ->expectsOutputToContain('bad-amount: expected amount "45" must be a printed amount string')
            ->assertFailed();
        Http::assertNothingSent();
    }

    public function test_it_never_runs_outside_local_development(): void
    {
        $this->writeCase('probe-two-section');
        $this->app['env'] = 'production';

        $this->artisan('receipts:evaluate', ['--corpus' => "{$this->root}/corpus"])
            ->expectsOutputToContain('only runs in local development')
            ->assertFailed();
        Http::assertNothingSent();
    }
}
