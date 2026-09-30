<?php

namespace Tests\Feature;

use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\RegulatoryEmergency;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class AdminReportQueuePerformanceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create([
            'name' => 'Queue Evaluator', 'email' => 'queue-evaluator@dti.test',
            'password' => 'secret-password', 'role' => 'dti_evaluator',
        ]);
        $this->store = Store::create([
            'store_name' => 'Queue Mart', 'address' => 'San Jose, Antique',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'recidivism_index' => 0,
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_report_queue_query_count_scales_with_unique_references_not_items(): void
    {
        $this->seedQueue();

        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->getJson('/api/admin/reports?per_page=20')->assertOk()->assertJsonCount(20, 'data');
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        // 20 reports x 5 items over 5 commodities and 4 purchase dates. Before request-scoped
        // memoization this fixture ran 331 queries (3 per item + 1 per report + fixed overhead).
        // Budget: fixed overhead + up to 2 emergency lookups per distinct date + 1 SRP lookup per
        // distinct (commodity, date) pair = ~15 + 8 + 20.
        $this->assertLessThanOrEqual(50, $queries, "GET /admin/reports ran {$queries} queries");
    }

    public function test_report_queue_does_not_check_bundle_files_in_storage(): void
    {
        $this->seedQueue(reports: 2);
        $disk = Mockery::spy(FilesystemAdapter::class);
        Storage::shouldReceive('disk')->andReturn($disk);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonPath('data.0.evidence_available', true)
            ->assertJsonPath('data.0.evidence_verified', false);

        $disk->shouldNotHaveReceived('exists');
    }

    public function test_memoized_emergency_lookup_keeps_date_only_and_timestamp_inputs_apart(): void
    {
        // Confirmed 2026-09-30 08:00 Asia/Manila. A date-only input means Manila midnight (before),
        // a noon timestamp the same day is after.
        RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-30',
            'declaration_reference' => 'PDRRMC-2026-09', 'status' => 'active', 'active_scope_key' => 'systemwide',
            'confirmed_at' => '2026-09-30 00:00:00', 'responsible_admin_id' => $this->admin->id,
        ]);

        $resolver = new FieldReferenceResolver;
        $this->assertSame('standard', $resolver->protocolAt('2026-09-30')['mode']);
        $this->assertSame('emergency', $resolver->protocolAt('2026-09-30T12:00:00+08:00')['mode']);

        $resolver = new FieldReferenceResolver;
        $this->assertSame('emergency', $resolver->protocolAt('2026-09-30T12:00:00+08:00')['mode']);
        $this->assertSame('standard', $resolver->protocolAt('2026-09-30')['mode']);
    }

    private function seedQueue(int $reports = 20): void
    {
        $bulletins = collect(range(1, 5))->map(fn (int $n) => SrpBulletin::create([
            'commodity_name' => "Commodity {$n}", 'commodity_key' => "commodity-{$n}", 'category' => 'Basic',
            'unit' => 'pc', 'baseline_price' => 10 * $n, 'effective_date' => '2026-01-01', 'is_active' => true,
        ]));
        $dates = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22'];

        foreach (range(1, $reports) as $n) {
            $report = $this->createReport((string) $n, $dates[$n % 4]);
            foreach ($bulletins as $sequence => $bulletin) {
                $report->items()->create([
                    'sequence' => $sequence, 'item_name' => $bulletin->commodity_name, 'srp_id' => $bulletin->id,
                    'observed_price' => $bulletin->baseline_price + 1, 'consumer_confirmed' => true,
                ]);
            }
            ReceiptEvidenceAsset::create([
                'receipt_evidence_bundle_id' => $report->receipt_evidence_bundle_id, 'kind' => 'source_frame',
                'sequence' => 0, 'disk' => 'receipt_evidence', 'path' => "receipts/{$n}.jpg",
                'mime_type' => 'image/jpeg', 'size_bytes' => 5, 'sha256' => hash('sha256', (string) $n),
            ]);
        }
    }

    private function createReport(string $suffix, string $submittedOn): ConsumerReport
    {
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(), 'store_id' => $this->store->id, 'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'finalized', 'token_hash' => hash('sha256', 'capture-'.$suffix),
            'expires_at' => now()->addHour(), 'is_used' => true,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(), 'capture_session_id' => $session->id, 'store_id' => $this->store->id,
            'capture_mode' => 'continuous_video_v1', 'processing_status' => 'confirmed',
            'processing_result_json' => ['continuity' => ['status' => 'ready']],
        ]);

        return ConsumerReport::create([
            'report_reference' => 'REP-QUEUE-'.$suffix, 'tracking_token_hash' => hash('sha256', 'tracking-'.$suffix),
            'store_id' => $this->store->id, 'submission_uuid' => 'submission-'.$suffix, 'capture_session_id' => $session->id,
            'receipt_evidence_bundle_id' => $bundle->id, 'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'confirmed', 'status' => 'Submitted', 'submitted_at' => $submittedOn.' 10:00:00',
            'privacy_notice_version' => '1.0',
        ]);
    }
}
