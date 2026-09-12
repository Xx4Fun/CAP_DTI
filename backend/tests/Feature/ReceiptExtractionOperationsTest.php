<?php

namespace Tests\Feature;

use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReceiptExtractionOperationsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-OPS-1', 'store_name' => 'Ops Test Mart', 'owner_name' => 'Owner',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'address' => 'San Jose', 'recidivism_index' => 0,
        ]);
    }

    private function attempt(string $suffix, array $result, array $overrides = [], string $consent = '1.1'): ReceiptEvidenceBundle
    {
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(), 'store_id' => $this->store->id, 'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'finalized', 'token_hash' => hash('sha256', 'ops-'.$suffix), 'expires_at' => now(), 'is_used' => true,
        ]);
        $report = ConsumerReport::create([
            'report_reference' => 'REP-20260912-'.$suffix, 'tracking_token_hash' => hash('sha256', 'trk-'.$suffix),
            'store_id' => $this->store->id, 'submission_uuid' => 'sub-'.$suffix, 'capture_session_id' => $session->id,
            'capture_mode' => 'guided_photos_v1', 'processing_status' => 'ready', 'status' => $overrides['status'] ?? 'Ready for confirmation',
            'privacy_notice_version' => $consent,
        ]);
        $bundle = ReceiptEvidenceBundle::create(array_merge([
            'evidence_uuid' => (string) Str::uuid(), 'capture_session_id' => $session->id, 'store_id' => $this->store->id,
            'capture_mode' => 'guided_photos_v1', 'processing_status' => 'ready', 'consumer_report_id' => $report->id,
            'attempt_number' => 1, 'extraction_calls' => 1, 'processing_completed_at' => now()->subDay(),
            'processing_result_json' => $result,
        ], array_diff_key($overrides, ['status' => null])));
        $report->update(['receipt_evidence_bundle_id' => $bundle->id]);

        return $bundle;
    }

    private function geminiResult(array $overrides = []): array
    {
        return array_replace([
            'status' => 'ready',
            'reason_code' => null,
            'manual_review_required' => true,
            'warnings' => [['code' => 'FIELDS_UNCERTAIN', 'message' => 'Some values are uncertain.']],
            'reconciliation' => ['status' => 'matched'],
            'engine' => ['provider' => 'gemini', 'route' => 'primary', 'model' => 'gemini-3.8-flash', 'duration_ms' => 12000,
                'usage' => ['input_tokens' => 2000, 'output_tokens' => 500, 'thought_tokens' => 0]],
        ], $overrides);
    }

    private function summary(array $options = []): array
    {
        $this->assertSame(0, Artisan::call('receipts:extraction-status', $options + ['--json' => true]));

        return json_decode(Artisan::output(), true);
    }

    public function test_the_rollout_summary_counts_routes_outcomes_reconciliation_latency_and_spend(): void
    {
        config(['services.receipt_extraction.consent_versions' => ['1.1']]);
        $this->attempt('GEM1', $this->geminiResult());
        $this->attempt('GEM2', $this->geminiResult([
            'status' => 'needs_recapture', 'reason_code' => 'RECEIPT_INCOMPLETE',
            'reconciliation' => ['status' => 'mismatch'], 'manual_review_required' => false,
            'engine' => ['provider' => 'gemini', 'route' => 'primary', 'duration_ms' => 26000,
                'usage' => ['input_tokens' => 1000, 'output_tokens' => 200, 'thought_tokens' => 0]],
        ]), ['status' => 'Needs recapture']);
        $this->attempt('LEGACY', ['status' => 'ready', 'engine' => ['provider' => 'tesseract', 'route' => 'consent_gate']],
            ['extraction_calls' => 0], '1.0');

        $summary = $this->summary(['--days' => 7]);

        $this->assertSame(3, $summary['reports']);
        $this->assertSame(['gemini' => 2, 'tesseract' => 1], $summary['providers']);
        $this->assertSame(['primary' => 2, 'consent_gate' => 1], $summary['routes']);
        $this->assertSame(['RECEIPT_INCOMPLETE' => 1], $summary['recapture_reasons']);
        $this->assertSame(['matched' => 1, 'mismatch' => 1], $summary['reconciliation']);
        $this->assertSame(['FIELDS_UNCERTAIN' => 2], $summary['top_warnings']);
        $this->assertSame(2, $summary['extraction_calls']);
        $this->assertSame(12000, $summary['latency_p50_ms']);
        $this->assertSame(26000, $summary['latency_p95_ms']);
        $this->assertSame(['input' => 3000, 'output' => 700, 'thought' => 0], $summary['tokens']);
        $this->assertSame(round((3000 * 0.75 + 700 * 3.75) / 1_000_000, 4), $summary['estimated_cost_usd']);
        $this->assertSame(0, $summary['consent_gate_leaks']);
    }

    public function test_a_report_reaching_the_provider_on_an_unapproved_notice_version_fails_the_check(): void
    {
        config(['services.receipt_extraction.consent_versions' => ['1.1']]);
        $this->attempt('LEAK', $this->geminiResult(), [], '1.0');

        $this->artisan('receipts:extraction-status', ['--days' => 7])
            ->expectsOutputToContain('reached the provider on an unapproved notice version')
            ->assertFailed();
    }

    public function test_attempts_outside_the_window_are_not_counted(): void
    {
        $this->attempt('OLD', $this->geminiResult(), ['processing_completed_at' => now()->subDays(30)]);

        $this->assertSame(0, $this->summary(['--days' => 7])['reports']);
    }

    public function test_preflight_blocks_when_the_provider_is_on_but_prerequisites_are_missing(): void
    {
        config([
            'services.receipt_extraction.provider' => 'gemini',
            'services.receipt_extraction.consent_versions' => [],
            'services.gemini.key' => '',
        ]);

        $this->artisan('receipts:extraction-preflight')
            ->expectsOutputToContain('blocking issue(s)')
            ->assertFailed();
    }

    public function test_preflight_passes_once_the_gates_are_configured_and_never_prints_the_key(): void
    {
        config([
            'services.receipt_extraction.provider' => 'gemini',
            'services.receipt_extraction.consent_versions' => ['1.1'],
            'services.gemini.key' => 'preflight-secret-key',
            'services.receipt_extraction.production_approved' => true,
            'services.gemini.billing_attested' => 'paid',
        ]);

        $this->assertSame(0, Artisan::call('receipts:extraction-preflight', ['--json' => true]));
        $output = Artisan::output();

        $this->assertStringNotContainsString('preflight-secret-key', $output);
        $this->assertTrue(json_decode($output, true)['ready']);
    }

    public function test_preflight_accepts_a_free_tier_demo_attestation_but_says_so_loudly(): void
    {
        config([
            'services.receipt_extraction.provider' => 'gemini',
            'services.receipt_extraction.consent_versions' => ['1.1'],
            'services.gemini.key' => 'demo-key',
            'services.receipt_extraction.production_approved' => true,
            'services.gemini.billing_attested' => 'free_tier_demo',
        ]);

        $this->artisan('receipts:extraction-preflight')
            ->expectsOutputToContain('free_tier_demo')
            ->expectsOutputToContain('project team')
            ->assertSuccessful();

        $this->assertSame(0, Artisan::call('receipts:extraction-preflight', ['--json' => true]));
        $json = json_decode(Artisan::output(), true);
        $this->assertTrue($json['ready']);
        $this->assertTrue($json['free_tier_demo']);
    }

    public function test_preflight_is_advisory_while_the_provider_is_tesseract(): void
    {
        config(['services.receipt_extraction.provider' => 'tesseract', 'services.gemini.key' => '']);

        $this->artisan('receipts:extraction-preflight')->assertSuccessful();
    }
}
