<?php

namespace Tests\Feature;

use App\Jobs\ProcessReceiptEvidence;
use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\Store;
use App\Models\User;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Receipt\Extraction\ReceiptExtractionRouter;
use App\Services\Receipt\Extraction\ReceiptExtractionValidator;
use App\Services\Receipt\ReceiptEvidencePipeline;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Queue\MaxAttemptsExceededException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use Tests\Unit\GeminiReceiptExtractorTest;
use Tests\Unit\ReceiptExtractionValidatorTest;

class ReceiptGeminiExtractionTest extends TestCase
{
    use RefreshDatabase;

    private const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('receipt_evidence');
        Storage::fake('local');
        Queue::fake();
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-GEMINI-1', 'store_name' => 'Gaisano Grand Mall of Antique', 'owner_name' => 'Test Owner',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'address' => 'San Jose de Buenavista', 'recidivism_index' => 0,
        ]);
        config([
            'services.receipt_extraction.provider' => 'gemini',
            'services.receipt_extraction.consent_versions' => ['1.1'],
            'services.gemini.key' => 'feature-test-gemini-key',
            'services.gemini.model' => 'gemini-3.8-flash',
            'services.gemini.fallback_model' => 'gemini-3.5-flash-lite',
        ]);
    }

    /** @return array{0: ConsumerReport, 1: string} */
    private function report(string $suffix, string $consent = '1.1', int $frames = 1, string $captureMode = 'guided_photos_v1'): array
    {
        $resumeToken = 'rsm_'.Str::random(32);
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(), 'store_id' => $this->store->id, 'capture_mode' => $captureMode,
            'processing_status' => 'finalized', 'token_hash' => hash('sha256', 'cap-'.$suffix), 'expires_at' => now()->addMinutes(15), 'is_used' => true,
        ]);
        $report = ConsumerReport::create([
            'report_reference' => 'REP-20260912-'.$suffix, 'tracking_token_hash' => hash('sha256', 'trk-'.$suffix),
            'resume_token_hash' => hash('sha256', $resumeToken), 'store_id' => $this->store->id, 'submission_uuid' => 'sub-'.$suffix,
            'capture_session_id' => $session->id, 'capture_mode' => $captureMode,
            'processing_status' => 'queued', 'status' => 'Processing receipt', 'privacy_notice_version' => $consent,
        ]);
        $this->attachBundle($report, $frames, 1, $captureMode);

        return [$report->fresh(), $resumeToken];
    }

    /** Attaches a new queued evidence attempt (as a restart would) with real stored source frames. */
    private function attachBundle(ConsumerReport $report, int $frames = 1, int $attempt = 2, string $captureMode = 'guided_photos_v1'): ReceiptEvidenceBundle
    {
        $session = $attempt === 1 ? $report->capture_session_id : CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(), 'store_id' => $this->store->id, 'capture_mode' => $captureMode, 'processing_status' => 'finalized',
            'token_hash' => hash('sha256', Str::random(40)), 'expires_at' => now()->addMinutes(15), 'is_used' => true,
        ])->id;
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(), 'capture_session_id' => $session, 'store_id' => $this->store->id,
            'capture_mode' => $captureMode, 'processing_status' => 'queued', 'consumer_report_id' => $report->id, 'attempt_number' => $attempt,
        ]);
        $report->update(['receipt_evidence_bundle_id' => $bundle->id, 'status' => 'Processing receipt', 'processing_status' => 'queued']);
        for ($sequence = 0; $sequence < $frames; $sequence++) {
            $image = imagecreatetruecolor(600, 900);
            imagefill($image, 0, 0, imagecolorallocate($image, 250, 250, 245));
            imagestring($image, 5, 40, 40 + $sequence * 30, 'RECEIPT '.$report->report_reference.' '.$attempt, imagecolorallocate($image, 0, 0, 0));
            ob_start();
            imagejpeg($image, null, 90);
            $bytes = (string) ob_get_clean();
            $path = "receipt-evidence/{$bundle->evidence_uuid}/source-{$sequence}.jpg";
            Storage::disk('receipt_evidence')->put($path, $bytes);
            ReceiptEvidenceAsset::create([
                'receipt_evidence_bundle_id' => $bundle->id, 'kind' => 'source_frame', 'sequence' => $sequence, 'disk' => 'receipt_evidence',
                'path' => $path, 'mime_type' => 'image/jpeg', 'size_bytes' => strlen($bytes), 'sha256' => hash('sha256', $bytes),
                'metadata_json' => ['quality' => ['acceptable' => true]],
            ]);
        }

        return $bundle;
    }

    private function runJob(ConsumerReport $report, int $attempt = 1): ProcessReceiptEvidence
    {
        $job = (new ProcessReceiptEvidence($report->report_reference))->withFakeQueueInteractions();
        $job->job->attempts = $attempt;
        $job->handle(app(ReceiptEvidencePipeline::class));

        return $job;
    }

    private function fakeGemini(array $payload): void
    {
        Http::fake([self::ENDPOINT => Http::response(GeminiReceiptExtractorTest::completed($payload))]);
    }

    private function tesseractReturns(array $lines): void
    {
        $ocr = Mockery::mock(ShelfTagOcrService::class);
        $ocr->shouldReceive('scan')->andReturn(['status' => 'OCR_SUCCESS', 'raw_text' => implode("\n", $lines), 'lines' => $lines, 'words' => []]);
        $this->app->instance(ShelfTagOcrService::class, $ocr);
    }

    public function test_gemini_extraction_persists_validated_results_for_customer_review_and_confirmation(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        [$report, $token] = $this->report('OK');

        $this->runJob($report);

        $report->refresh();
        $bundle = $report->evidenceBundle;
        $this->assertSame('Ready for confirmation', $report->status);
        $this->assertSame(1, $bundle->extraction_calls);
        $this->assertNotNull($bundle->extraction_attempted_at);
        $this->assertSame(['provider' => 'gemini', 'model' => 'gemini-3.8-flash'], $report->raw_ocr_json['engine']);
        $this->assertSame('matched', $report->raw_ocr_json['reconciliation']['status']);
        $this->assertSame('OR 000123', $report->raw_ocr_json['receipt_number']);
        $this->assertFalse($report->raw_ocr_json['transaction_date_uncertain']);
        $this->assertSame('primary', $bundle->processing_result_json['engine']['route']);
        $this->assertSame(1136, $bundle->processing_result_json['engine']['usage']['input_tokens']);
        $this->assertArrayHasKey('extraction_raw', $bundle->processing_result_json);
        $item = $report->items()->orderBy('sequence')->first();
        $this->assertSame('CALLA PWD F/C ROSE GARDEN', $item->item_name);
        $this->assertSame('111.75', $item->line_total);
        $this->assertSame('111.75', $item->unit_price);
        $this->assertSame(1, $item->section);
        $this->assertNull($item->ocr_confidence);

        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()
            ->assertJsonPath('data.items.1.unit_price', 27)
            ->assertJsonPath('data.items.1.line_total', 54)
            ->assertJsonPath('data.items.1.quantity', 2)
            ->assertJsonPath('data.receipt_number', 'OR 000123')
            ->assertJsonPath('data.detected_total', 165.75)
            ->assertJsonPath('data.transaction_date', '2026-09-10')
            ->assertJsonPath('data.reconciliation.status', 'matched')
            ->assertJsonPath('data.merchant.display_name', 'GAISANO GRAND MALL OF ANTIQUE')
            ->assertJsonPath('data.extraction_provider', 'gemini')
            ->assertJsonMissingPath('data.evidence_path');

        // Extracted values are read-only: any attempt to send them back is rejected before submission.
        $this->withHeader('X-Report-Resume-Token', $token)
            ->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", ['consumer_confirmed' => true, 'items' => [['line_total' => 1]]])
            ->assertStatus(422);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/confirm-ocr", ['consumer_confirmed' => true])
            ->assertOk()->assertJsonPath('data.status', 'Submitted');
        $snapshot = CitizenTip::firstOrFail()->extracted_text_json['system_extracted_items'];
        $this->assertSame(111.75, $snapshot[0]['line_total']);
        $this->assertEquals(27, $snapshot[1]['unit_price']);
        $this->assertSame([], $snapshot[0]['uncertain_fields']);
    }

    public function test_reports_outside_the_gates_use_tesseract_and_never_call_gemini(): void
    {
        $this->tesseractReturns(['RICE 45.00', 'TOTAL 45.00']);
        [$consent10] = $this->report('C10', '1.0');
        $this->runJob($consent10);
        $this->assertSame('consent_gate', $consent10->refresh()->evidenceBundle->processing_result_json['engine']['route']);

        config(['services.receipt_extraction.provider' => 'tesseract']);
        [$flagOff] = $this->report('FLAG');
        $this->runJob($flagOff);
        $this->assertSame('provider_flag', $flagOff->refresh()->evidenceBundle->processing_result_json['engine']['route']);

        config(['services.receipt_extraction.provider' => 'gemini']);
        $this->app['env'] = 'production';
        [$unapproved] = $this->report('PROD');
        $this->runJob($unapproved);
        $this->assertSame('approval_gate', $unapproved->refresh()->evidenceBundle->processing_result_json['engine']['route']);
        $this->assertSame('tesseract', $unapproved->raw_ocr_json['engine']['provider']);

        Http::assertNothingSent();
    }

    public function test_production_requires_both_approval_and_billing_attestation(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        $this->tesseractReturns(['RICE 45.00']);
        $this->app['env'] = 'production';
        config(['services.receipt_extraction.production_approved' => true]);
        [$approvedOnly] = $this->report('APR');
        $this->runJob($approvedOnly);
        $this->assertSame('approval_gate', $approvedOnly->refresh()->evidenceBundle->processing_result_json['engine']['route']);

        config(['services.gemini.billing_attested' => 'paid']);
        [$approvedPaid] = $this->report('PAID');
        $this->runJob($approvedPaid);
        $this->assertSame('gemini', $approvedPaid->refresh()->raw_ocr_json['engine']['provider']);
        Http::assertSentCount(1);
    }

    public function test_a_free_tier_demo_attestation_is_accepted_and_recorded_with_the_result(): void
    {
        // A demonstration must not have to claim a paid plan it does not have; the claim is stored with the extraction.
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        $this->app['env'] = 'production';
        config(['services.receipt_extraction.production_approved' => true, 'services.gemini.billing_attested' => 'free_tier_demo']);
        [$report] = $this->report('DEMO');

        $this->runJob($report);

        $report->refresh();
        $this->assertSame('gemini', $report->raw_ocr_json['engine']['provider']);
        $this->assertSame('free_tier_demo', $report->evidenceBundle->processing_result_json['engine']['billing_attestation']);
    }

    public function test_an_unrecognised_attestation_keeps_production_on_tesseract(): void
    {
        $this->tesseractReturns(['RICE 45.00']);
        $this->app['env'] = 'production';
        config(['services.receipt_extraction.production_approved' => true, 'services.gemini.billing_attested' => 'trust me']);
        [$report] = $this->report('BADATTEST');

        $this->runJob($report);

        $this->assertSame('approval_gate', $report->refresh()->evidenceBundle->processing_result_json['engine']['route']);
        Http::assertNothingSent();
    }

    public function test_missing_key_with_gemini_provider_is_a_non_retryable_configuration_failure(): void
    {
        config(['services.gemini.key' => '']);
        [$report, $token] = $this->report('NOKEY');

        $this->runJob($report);

        $this->assertSame('Processing failed', $report->refresh()->status);
        $this->assertSame('GEMINI_NOT_CONFIGURED', $report->evidenceBundle->failure_code);
        Http::assertNothingSent();
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.failure_reason.code', 'GEMINI_NOT_CONFIGURED');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")
            ->assertStatus(409);
    }

    public function test_transient_failures_are_released_with_backoff_then_recorded_with_the_specific_code(): void
    {
        Http::fake([self::ENDPOINT => Http::response(['error' => ['message' => 'overloaded', 'code' => 'unavailable']], 503)]);
        [$report, $token] = $this->report('RETRY');

        $this->runJob($report, 1)->assertReleased(30);
        $this->assertSame('processing', $report->refresh()->processing_status);
        $this->runJob($report, 2)->assertReleased(120);
        $this->runJob($report, 3)->assertNotReleased();

        $report->refresh();
        $this->assertSame('Processing failed', $report->status);
        $this->assertSame('GEMINI_UNAVAILABLE', $report->evidenceBundle->failure_code);
        $this->assertSame(3, $report->evidenceBundle->extraction_calls);
        Http::assertSentCount(3);
        $this->assertSame(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-lite'],
            Http::recorded()->map(fn ($pair) => $pair[0]['model'])->all());
        $this->assertSame('gemini-3.5-flash-lite', $report->evidenceBundle->processing_result_json['engine']['model']);
        Http::assertSent(fn ($request) => $request->url() === self::ENDPOINT);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', true)
            ->assertJsonPath('data.failure_reason.code', 'GEMINI_UNAVAILABLE');
    }

    public function test_fallback_uses_the_same_evidence_and_keeps_warnings_for_customer_and_admin_review(): void
    {
        $payload = ReceiptExtractionValidatorTest::payload();
        $payload['items'][0]['uncertain_fields'] = ['unit_price'];
        $response = GeminiReceiptExtractorTest::completed($payload);
        $response['model'] = 'gemini-3.5-flash-lite';
        Http::fake([self::ENDPOINT => Http::sequence()->push(['error' => ['code' => 'service_unavailable']], 503)->push($response)]);
        [$report, $token] = $this->report('FALLBACK');
        $original = $report->evidenceBundle->assets->first();

        $this->runJob($report, 1)->assertReleased(30);
        Http::assertSentCount(1);
        $this->runJob($report, 2)->assertNotReleased();

        $result = $report->refresh()->evidenceBundle->processing_result_json;
        $this->assertSame('Ready for confirmation', $report->status);
        $this->assertSame(2, $report->evidenceBundle->extraction_calls);
        $this->assertSame(2, $report->evidenceBundle->processing_attempts);
        $this->assertSame('gemini-3.5-flash-lite', $result['engine']['model']);
        $this->assertTrue($result['engine']['fallback']);
        $this->assertSame('GEMINI_UNAVAILABLE', $result['engine']['fallback_reason_code']);
        $this->assertTrue($result['manual_review_required']);
        $this->assertContains('FIELDS_UNCERTAIN', array_column($result['warnings'], 'code'));
        $this->assertContains('GEMINI_FALLBACK_USED', array_column($result['warnings'], 'code'));
        $requests = Http::recorded()->map(fn ($pair) => $pair[0]->data())->all();
        $this->assertSame('gemini-3.8-flash', $requests[0]['model']);
        $this->assertSame('gemini-3.5-flash-lite', $requests[1]['model']);
        unset($requests[0]['model'], $requests[1]['model']);
        $this->assertSame($requests[0], $requests[1]);
        $this->assertSame($original->sha256, hash('sha256', Storage::disk($original->disk)->get($original->path)));
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/review")
            ->assertOk()->assertJsonPath('data.manual_review_required', true);

        $admin = User::factory()->create(['role' => 'dti_evaluator']);
        Sanctum::actingAs($admin);
        $this->getJson("/api/admin/reports/{$report->id}/evidence-manifest")
            ->assertOk()->assertJsonPath('data.processing_result.engine.model', 'gemini-3.5-flash-lite')
            ->assertJsonPath('data.processing_result.manual_review_required', true);
    }

    public function test_manual_retry_of_an_old_primary_timeout_starts_with_fallback_and_a_new_capture_resets_it(): void
    {
        [$report, $token] = $this->report('OLDFAIL');
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle->update(['failure_code' => 'GEMINI_TIMEOUT', 'extraction_calls' => 3,
            'processing_result_json' => ['engine' => ['provider' => 'gemini', 'model' => 'gemini-3.8-flash']]]);
        Http::fake(function ($request) {
            $response = GeminiReceiptExtractorTest::completed(ReceiptExtractionValidatorTest::payload());
            $response['model'] = $request['model'];

            return Http::response($response);
        });

        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertOk();
        $this->runJob($report->refresh());
        $this->assertSame('gemini-3.5-flash-lite', $report->refresh()->raw_ocr_json['engine']['model']);
        $this->assertSame(4, $report->evidenceBundle->extraction_calls);

        $this->attachBundle($report);
        $this->runJob($report->refresh());
        $this->assertSame('gemini-3.8-flash', $report->refresh()->raw_ocr_json['engine']['model']);
        $this->assertSame(['gemini-3.5-flash-lite', 'gemini-3.8-flash'], Http::recorded()->map(fn ($pair) => $pair[0]['model'])->all());
    }

    public function test_fallback_choice_survives_exhausted_queue_attempts_and_manual_retry(): void
    {
        Http::fake([self::ENDPOINT => Http::response([], 503)]);
        [$report, $token] = $this->report('KEEPFALLBACK');
        foreach ([1, 2, 3] as $attempt) {
            $this->runJob($report->refresh(), $attempt);
        }
        // Existing attempts retain the selected model even if the configured default changes.
        config(['services.gemini.fallback_model' => 'different-default']);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertOk();
        $this->runJob($report->refresh());
        $this->assertSame('gemini-3.5-flash-lite', Http::recorded()->last()[0]['model']);
        $this->assertSame(4, $report->refresh()->evidenceBundle->extraction_calls);
    }

    public function test_fallback_paid_result_survives_a_worker_failure_and_is_reused_at_the_call_cap(): void
    {
        $response = GeminiReceiptExtractorTest::completed(ReceiptExtractionValidatorTest::payload());
        $response['model'] = 'gemini-3.5-flash-lite';
        Http::fake([self::ENDPOINT => Http::sequence()->push([], 503)->push($response)]);
        [$report, $token] = $this->report('FALLBACKREUSE');
        $this->runJob($report);
        $this->app->instance(ReceiptExtractionValidator::class, Mockery::mock(
            ReceiptExtractionValidator::class, fn ($mock) => $mock->shouldReceive('validate')->andThrow(new \RuntimeException('worker lost'))));
        try {
            $this->runJob($report->refresh(), 2);
        } catch (\RuntimeException) {
        }
        $this->app->forgetInstance(ReceiptExtractionValidator::class);
        (new ProcessReceiptEvidence($report->report_reference))->failed(new MaxAttemptsExceededException('x'));
        config(['services.receipt_extraction.max_calls_per_attempt' => 2, 'services.receipt_extraction.max_calls_per_report' => 2]);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertOk();
        $this->runJob($report->refresh());
        $result = $report->refresh()->evidenceBundle->processing_result_json;
        $this->assertTrue($result['engine']['reused']);
        $this->assertTrue($result['manual_review_required']);
        $this->assertSame('gemini-3.5-flash-lite', $result['engine']['model']);
        $this->assertSame(2, $report->evidenceBundle->extraction_calls);
        Http::assertSentCount(2);
    }

    public function test_modified_originals_are_not_sent_on_a_fallback_attempt(): void
    {
        Http::fake([self::ENDPOINT => Http::response([], 503)]);
        [$report] = $this->report('FALLBACKINTEGRITY');
        $this->runJob($report);
        $asset = $report->evidenceBundle->assets->first();
        Storage::disk($asset->disk)->put($asset->path, 'changed original');
        $this->runJob($report->refresh(), 2)->assertNotReleased();
        $this->assertSame('EVIDENCE_INTEGRITY_FAILED', $report->refresh()->evidenceBundle->failure_code);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        Http::assertSentCount(1);
    }

    public function test_an_empty_fallback_setting_keeps_retrying_primary(): void
    {
        config(['services.gemini.fallback_model' => '']);
        Http::fake([self::ENDPOINT => Http::response([], 503)]);
        [$report] = $this->report('DISABLED');
        foreach ([1, 2, 3] as $attempt) {
            $this->runJob($report->refresh(), $attempt);
        }
        $this->assertSame(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash'], Http::recorded()->map(fn ($pair) => $pair[0]['model'])->all());
        $this->assertArrayNotHasKey('gemini_retry', $report->refresh()->evidenceBundle->processing_result_json);
    }

    public function test_a_last_report_allowance_failure_offers_neither_retry_nor_restart(): void
    {
        config(['services.receipt_extraction.max_calls_per_report' => 1]);
        Http::fake([self::ENDPOINT => Http::response([], 503)]);
        [$report, $token] = $this->report('LASTREPORTCALL');
        $this->runJob($report, 3);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_REPORT_CAP');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")
            ->assertStatus(409)->assertJsonPath('success', false);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['restart' => true])->assertStatus(409);
        Http::assertSentCount(1);
    }

    public function test_report_cap_overrides_an_old_attempt_cap_restart_offer(): void
    {
        config(['services.receipt_extraction.max_calls_per_report' => 6]);
        [$report, $token] = $this->report('CAPPRIORITY');
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle->update(['failure_code' => 'EXTRACTION_ATTEMPT_CAP', 'extraction_calls' => 6]);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_REPORT_CAP');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['restart' => true])->assertStatus(409);
    }

    public function test_timeout_selects_fallback_for_the_next_attempt(): void
    {
        Http::fakeSequence()->pushFailedConnection('cURL error 28: Operation timed out')->push(
            array_replace(GeminiReceiptExtractorTest::completed(ReceiptExtractionValidatorTest::payload()), ['model' => 'gemini-3.5-flash-lite']));
        [$report] = $this->report('TIMEOUTFALLBACK');
        $this->runJob($report)->assertReleased(30);
        $this->runJob($report->refresh(), 2);
        $this->assertSame('Ready for confirmation', $report->refresh()->status);
        $this->assertSame('GEMINI_TIMEOUT', $report->evidenceBundle->processing_result_json['engine']['fallback_reason_code']);
        $this->assertSame(2, $report->evidenceBundle->extraction_calls);
    }

    public static function nonFallbackResponses(): array
    {
        return ['auth' => [403, 'GEMINI_AUTH'], 'bad request' => [400, 'GEMINI_REJECTED'], 'invalid output' => [200, 'EXTRACTION_INVALID']];
    }

    #[DataProvider('nonFallbackResponses')]
    public function test_non_transient_failures_never_select_fallback(int $status, string $code): void
    {
        Http::fake([self::ENDPOINT => Http::response($status === 200 ? GeminiReceiptExtractorTest::completed(['items' => 'invalid']) : [], $status)]);
        [$report] = $this->report('NOFALLBACK');
        $this->runJob($report)->assertNotReleased();
        $bundle = $report->refresh()->evidenceBundle;
        $this->assertSame($code, $bundle->failure_code);
        $this->assertArrayNotHasKey('gemini_retry', $bundle->processing_result_json);
        Http::assertSentCount(1);
    }

    public function test_a_last_allowed_call_failure_disables_retry_and_enforces_restart_at_the_endpoint(): void
    {
        config(['services.receipt_extraction.max_calls_per_attempt' => 1]);
        Http::fake([self::ENDPOINT => Http::response([], 503)]);
        [$report, $token] = $this->report('LASTCALL');
        $this->runJob($report, 3);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)->assertJsonPath('data.can_recapture', true)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_ATTEMPT_CAP');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertStatus(409);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['restart' => true])->assertCreated();
        Http::assertSentCount(1);
        Queue::assertNotPushed(ProcessReceiptEvidence::class);
    }

    public function test_a_stale_retry_request_rechecks_locked_status_and_does_not_enqueue_twice(): void
    {
        [$report, $token] = $this->report('STALE');
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle->update(['failure_code' => 'GEMINI_TIMEOUT']);
        // Simulate a second request queuing the report after this request's authorization read.
        $changed = false;
        DB::listen(function ($query) use ($report, &$changed) {
            if (! $changed && str_starts_with($query->sql, 'select') && str_contains($query->sql, 'consumer_reports') && str_contains($query->sql, 'report_reference')) {
                $changed = true;
                ConsumerReport::whereKey($report->id)->update(['status' => 'Processing receipt', 'processing_status' => 'queued']);
            }
        });
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertStatus(409);
        Queue::assertNotPushed(ProcessReceiptEvidence::class);
        $this->assertSame(0, $report->statusHistories()->count());
    }

    public function test_failed_hook_keeps_a_specific_code_and_classifies_timeouts(): void
    {
        [$report] = $this->report('FAILHOOK');
        $report->evidenceBundle->update(['failure_code' => 'GEMINI_TIMEOUT']);
        (new ProcessReceiptEvidence($report->report_reference))->failed(new MaxAttemptsExceededException('x'));
        $this->assertSame('GEMINI_TIMEOUT', $report->refresh()->evidenceBundle->failure_code);

        [$other] = $this->report('FAILHOOK2');
        (new ProcessReceiptEvidence($other->report_reference))->failed(new MaxAttemptsExceededException('x'));
        $this->assertSame('JOB_TIMEOUT', $other->refresh()->evidenceBundle->failure_code);
        $this->assertSame('Processing failed', $other->status);
    }

    public function test_attempt_cap_requires_a_restart_and_the_fresh_attempt_is_processed(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        config(['services.receipt_extraction.max_calls_per_attempt' => 2, 'services.receipt_extraction.max_calls_per_report' => 5]);
        [$report, $token] = $this->report('CAP');
        $report->evidenceBundle->update(['extraction_calls' => 2]);

        $this->runJob($report);

        $this->assertSame('EXTRACTION_ATTEMPT_CAP', $report->refresh()->evidenceBundle->failure_code);
        $this->assertSame(2, $report->evidenceBundle->extraction_calls);
        Http::assertNothingSent();
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.can_recapture', true)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_ATTEMPT_CAP');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['replace_sequence' => 0])
            ->assertStatus(422);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['restart' => true])
            ->assertCreated();

        // The restarted capture is a new attempt with its own allowance, still inside the per-report cap.
        $this->attachBundle($report->refresh());
        $this->runJob($report);

        $this->assertSame('Ready for confirmation', $report->refresh()->status);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        Http::assertSentCount(1);
    }

    public function test_per_report_cap_is_terminal_and_offers_no_retry_or_restart(): void
    {
        config(['services.receipt_extraction.max_calls_per_report' => 3]);
        [$report, $token] = $this->report('RCAP');
        $report->evidenceBundle->update(['extraction_calls' => 1]);
        $this->attachBundle($report->refresh())->update(['extraction_calls' => 2]);
        $this->attachBundle($report->refresh(), 1, 3);

        $this->runJob($report->refresh());

        $this->assertSame('EXTRACTION_REPORT_CAP', $report->refresh()->evidenceBundle->failure_code);
        Http::assertNothingSent();
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_REPORT_CAP');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/recapture-session", ['restart' => true])
            ->assertStatus(409);
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")
            ->assertStatus(409);
    }

    public function test_a_stored_extraction_is_reused_by_a_retry_and_never_bought_twice(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        [$report, $token] = $this->report('REUSE');

        // First run: the call succeeds and the extraction is stored before the job finishes.
        $this->app->instance(ReceiptExtractionValidator::class, Mockery::mock(
            ReceiptExtractionValidator::class, fn ($mock) => $mock->shouldReceive('validate')->andThrow(new \RuntimeException('worker lost'))));
        try {
            $this->runJob($report);
        } catch (\RuntimeException) {
        }
        $this->app->forgetInstance(ReceiptExtractionValidator::class);
        (new ProcessReceiptEvidence($report->report_reference))->failed(new MaxAttemptsExceededException('x'));
        $this->assertSame('JOB_TIMEOUT', $report->refresh()->evidenceBundle->failure_code);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        $this->assertArrayHasKey('pending_extraction', $report->evidenceBundle->processing_result_json);
        config(['services.receipt_extraction.max_calls_per_attempt' => 1, 'services.receipt_extraction.max_calls_per_report' => 1]);

        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")
            ->assertOk();
        $this->runJob($report->refresh());

        $report->refresh();
        $this->assertSame('Ready for confirmation', $report->status);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        $this->assertTrue($report->evidenceBundle->processing_result_json['engine']['reused']);
        Http::assertSentCount(1);
    }

    public function test_rate_limited_calls_are_refunded_and_do_not_consume_the_allowance(): void
    {
        $response = GeminiReceiptExtractorTest::completed(ReceiptExtractionValidatorTest::payload());
        $response['model'] = 'gemini-3.5-flash-lite';
        Http::fake([self::ENDPOINT => Http::sequence()->push(['error' => ['message' => 'quota', 'code' => 'resource_exhausted']], 429)->push($response)]);
        [$report] = $this->report('RATE');

        $this->runJob($report, 1)->assertReleased(30);

        $this->assertSame(0, $report->refresh()->evidenceBundle->extraction_calls);
        $this->assertSame(0, (int) Cache::get('receipt-extraction:calls:'.now('UTC')->format('Y-m-d')));
        $this->assertSame(0, (int) Cache::get('receipt-extraction:tokens:'.now('UTC')->format('Y-m-d')));
        Http::assertSentCount(1);
        $this->runJob($report->refresh(), 2);
        $this->assertSame('Ready for confirmation', $report->refresh()->status);
        $this->assertSame(1, $report->evidenceBundle->extraction_calls);
        $this->assertSame('gemini-3.5-flash-lite', $report->raw_ocr_json['engine']['model']);
        Http::assertSentCount(2);
    }

    public function test_capture_modes_other_than_guided_photos_take_the_legacy_route(): void
    {
        $route = app(ReceiptExtractionRouter::class)
            ->route(new ConsumerReport(['capture_mode' => 'continuous_video_v1', 'privacy_notice_version' => '1.1']));

        $this->assertSame(['provider' => 'tesseract', 'route' => 'legacy_mode'], $route);
    }

    public function test_a_key_with_surrounding_whitespace_is_trimmed_and_an_invalid_key_is_never_sent(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        config(['services.gemini.key' => "feature-test-gemini-key\n"]);
        [$trimmed] = $this->report('TRIM');
        $this->runJob($trimmed);
        $this->assertSame('Ready for confirmation', $trimmed->refresh()->status);
        Http::assertSent(fn ($request) => $request->header('x-goog-api-key') === ['feature-test-gemini-key']);

        $logged = [];
        Log::listen(function ($event) use (&$logged) {
            $logged[] = $event->message.' '.json_encode($event->context);
        });
        config(['services.gemini.key' => "feature-test\ngemini-key"]);
        [$broken] = $this->report('BADKEY');
        $this->runJob($broken);

        $this->assertSame('GEMINI_NOT_CONFIGURED', $broken->refresh()->evidenceBundle->failure_code);
        Http::assertSentCount(1);
        foreach ([...$logged, json_encode($broken->evidenceBundle->processing_result_json)] as $line) {
            $this->assertStringNotContainsString('feature-test', $line);
        }
    }

    public function test_daily_cap_refusal_is_retryable_later_and_not_counted(): void
    {
        config(['services.receipt_extraction.daily_call_limit' => 0]);
        [$report, $token] = $this->report('DAILY');

        $this->runJob($report);

        $this->assertSame('EXTRACTION_BUDGET_EXHAUSTED', $report->refresh()->evidenceBundle->failure_code);
        $this->assertSame(0, $report->evidenceBundle->extraction_calls);
        Http::assertNothingSent();
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.failure_reason.code', 'EXTRACTION_BUDGET_EXHAUSTED');
        $this->withHeader('X-Report-Resume-Token', $token)->postJson("/api/public/reports/{$report->report_reference}/retry-processing")->assertStatus(409);
        config(['services.receipt_extraction.daily_call_limit' => 200]);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', true);
    }

    public function test_provider_auth_failure_is_not_retryable_and_never_a_bad_capture(): void
    {
        Http::fake([self::ENDPOINT => Http::response(['error' => ['message' => 'denied', 'code' => 'permission_denied']], 403)]);
        [$report, $token] = $this->report('AUTH');

        $this->runJob($report)->assertNotReleased();

        $this->assertSame('Processing failed', $report->refresh()->status);
        $this->assertSame('GEMINI_AUTH', $report->evidenceBundle->failure_code);
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.can_retry_processing', false)
            ->assertJsonPath('data.can_recapture', false)
            ->assertJsonPath('data.recapture_reason', null);
    }

    public function test_evidence_problems_become_needs_recapture_with_specific_guidance(): void
    {
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload([
            'evidence' => ['legibility' => 'clear', 'is_receipt' => true, 'problems' => ['cropped_bottom'], 'total_region_visible' => false],
            'total' => ['amount' => null, 'source_line' => null, 'uncertain' => true],
        ]));
        [$report, $token] = $this->report('CROP');

        $this->runJob($report);

        $this->assertSame('Needs recapture', $report->refresh()->status);
        $this->assertSame('The bottom of the receipt, including the total, is missing. Add a section that shows it.',
            $report->statusHistories()->latest('id')->value('public_message'));
        $this->withHeader('X-Report-Resume-Token', $token)->getJson("/api/public/reports/{$report->report_reference}/processing")
            ->assertJsonPath('data.recapture_reason.code', 'RECEIPT_INCOMPLETE')
            ->assertJsonPath('data.recapture_reason.message', 'The bottom of the receipt, including the total, is missing. Add a section that shows it.');
    }

    public function test_secrets_and_receipt_text_never_reach_logs_and_the_key_never_reaches_storage(): void
    {
        $logged = [];
        Log::listen(function ($event) use (&$logged) {
            $logged[] = $event->message.' '.json_encode($event->context);
        });
        $this->fakeGemini(ReceiptExtractionValidatorTest::payload());
        [$report] = $this->report('SECRET');

        $this->runJob($report);

        $this->assertNotEmpty($logged);
        foreach ($logged as $line) {
            $this->assertStringNotContainsString('feature-test-gemini-key', $line);
            $this->assertStringNotContainsString('CALLA PWD', $line);
            $this->assertStringNotContainsString('receipt-evidence/', $line);
        }
        $report->refresh();
        $this->assertStringNotContainsString('feature-test-gemini-key', json_encode($report->evidenceBundle->processing_result_json));
        $this->assertStringNotContainsString('feature-test-gemini-key', json_encode($report->raw_ocr_json));
    }
}
