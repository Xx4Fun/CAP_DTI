<?php

namespace Tests\Feature;

use App\Models\ConsumerReport;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryFinding;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\Receipt\ReceiptItemSrpMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Automatic SRP matching and the overprice comparison for consumer reports, plus the guarantee that
 * a regulatory finding always cites a reference that actually applied on the purchase date.
 */
class ConsumerReportPriceReferenceTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create([
            'name' => 'DTI Evaluator', 'email' => 'evaluator@dti.test',
            'password' => 'secret-password', 'role' => 'dti_evaluator',
        ]);
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-REF-001', 'store_name' => 'Antique Market', 'owner_name' => 'Vendor Owner',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'address' => 'San Jose, Antique',
        ]);
        Sanctum::actingAs($this->admin);
    }

    private function bulletin(array $overrides = []): SrpBulletin
    {
        return SrpBulletin::create(array_merge([
            'commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g',
            'baseline_price' => 21.50, 'effective_date' => '2026-05-11', 'is_active' => true,
        ], $overrides));
    }

    private function report(array $overrides = [], array $items = []): ConsumerReport
    {
        $report = ConsumerReport::create(array_merge([
            'report_reference' => 'REP-REF-'.fake()->unique()->numberBetween(1000, 9999),
            'tracking_token_hash' => hash('sha256', 'tracking'),
            'store_id' => $this->store->id,
            'submission_uuid' => (string) \Illuminate\Support\Str::uuid(),
            'image_hash' => hash('sha256', 'image'),
            'image_vault_path' => 'receipt_vault/report.jpg',
            'raw_ocr_json' => ['transaction_date' => '2026-07-20'],
            'status' => 'Under initial evaluation',
        ], $overrides));

        foreach ($items as $index => $item) {
            $report->items()->create(array_merge([
                'sequence' => $index, 'item_name' => 'Saba Sardines 155g',
                'quantity' => 1, 'unit_price' => 30.00, 'line_total' => 30.00,
            ], $item));
        }

        return $report->refresh();
    }

    private function itemPayload(ConsumerReport $report): array
    {
        return $this->getJson('/api/admin/reports')->assertOk()->json('data.0.items.0');
    }

    public function test_a_clearly_named_item_is_matched_to_its_bulletin_automatically(): void
    {
        $bulletin = $this->bulletin();
        $report = $this->report(items: [['item_name' => 'Saba Sardines', 'unit' => '155g']]);

        app(ReceiptItemSrpMatcher::class)->matchReport($report);

        $item = $report->items()->first()->refresh();
        $this->assertSame($bulletin->id, $item->srp_id);
        $this->assertTrue($item->srp_match_json['auto_matched']);
    }

    public function test_an_unrecognisable_item_records_no_match_and_is_left_for_the_evaluator(): void
    {
        $this->bulletin();
        $report = $this->report(items: [['item_name' => 'ZZQX UNKNOWN LINE', 'raw_text' => 'ZZQX UNKNOWN LINE']]);

        app(ReceiptItemSrpMatcher::class)->matchReport($report);

        $item = $report->items()->first()->refresh();
        $this->assertNull($item->srp_id, 'A weak match must never be accepted silently.');
    }

    public function test_an_item_above_its_reference_is_flagged_with_the_difference(): void
    {
        $bulletin = $this->bulletin();
        $report = $this->report(items: [['unit_price' => 30.00, 'srp_id' => $bulletin->id]]);

        $item = $this->itemPayload($report);

        $this->assertTrue($item['reference']['is_above_reference']);
        $this->assertSame(8.5, $item['reference']['peso_difference']);
        $this->assertSame(39.5, $item['reference']['percent_difference']);
        $this->assertSame('standard_srp', $item['reference']['type']);
    }

    public function test_an_item_at_or_below_its_reference_is_not_flagged(): void
    {
        $bulletin = $this->bulletin();
        $report = $this->report(items: [['unit_price' => 21.50, 'srp_id' => $bulletin->id]]);

        $item = $this->itemPayload($report);

        $this->assertFalse($item['reference']['is_above_reference']);
        // JSON renders a whole-peso difference without a decimal part, so compare numerically.
        $this->assertEquals(0, $item['reference']['peso_difference']);
    }

    public function test_an_item_with_no_reference_reads_as_unavailable_rather_than_within_reference(): void
    {
        $report = $this->report(items: [['unit_price' => 30.00]]);

        $item = $this->itemPayload($report);

        $this->assertNull($item['reference']['is_above_reference']);
        $this->assertSame('unavailable', $item['reference']['status']);
    }

    public function test_a_price_freeze_compares_against_the_emergency_ceiling_not_the_ordinary_srp(): void
    {
        $bulletin = $this->bulletin(['price_freeze_applicable' => true]);
        $emergency = RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-07-01',
            'declaration_reference' => 'PDRRMC-2026-07', 'status' => 'active', 'active_scope_key' => 'systemwide',
            'confirmed_at' => '2026-06-30 16:00:00', 'responsible_admin_id' => $this->admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'saba-sardines-155g',
            'price_type' => 'PRICE_FREEZE', 'authoritative_price' => 21.25, 'effective_from' => '2026-07-01',
            'location' => 'San Jose de Buenavista, Antique', 'declaration_reference' => 'PDRRMC-2026-07',
            'created_by' => $this->admin->id, 'source_reference' => 'DTI-PF-2026-07',
        ]);
        $report = $this->report(items: [['unit_price' => 22.00, 'srp_id' => $bulletin->id]]);

        $item = $this->itemPayload($report);

        $this->assertSame('emergency_ceiling', $item['reference']['type']);
        $this->assertSame(21.25, $item['reference']['value'], 'The frozen ceiling governs, not the 21.50 SRP.');
        $this->assertTrue($item['reference']['is_above_reference']);
    }

    public function test_the_receipt_date_selects_the_bulletin_not_the_submission_date(): void
    {
        $old = $this->bulletin(['baseline_price' => 21.50, 'effective_date' => '2026-05-11']);
        $this->bulletin(['baseline_price' => 25.00, 'effective_date' => '2026-08-01']);
        // Bought under the old bulletin, submitted after the revision landed.
        $report = $this->report([
            'raw_ocr_json' => ['transaction_date' => '2026-07-20'],
            'submitted_at' => '2026-08-15 09:00:00',
        ], items: [['unit_price' => 30.00, 'srp_id' => $old->id]]);

        $item = $this->itemPayload($report);

        $this->assertSame(21.5, $item['reference']['value']);
        $this->assertSame('2026-07-20', $this->getJson('/api/admin/reports')->json('data.0.observed_at'));
    }

    public function test_a_finding_cannot_be_recorded_without_an_authoritative_reference(): void
    {
        $report = $this->report();

        foreach (['confirmed_violation', 'no_violation'] as $finding) {
            $this->postJson("/api/admin/reports/{$report->id}/decision", [
                'action' => 'correct', 'reason' => 'Checked against the bulletin.',
                'corrected' => [
                    'commodity_key' => 'no-such-commodity', 'commodity_name' => 'Typo Commodity',
                    'receipt_price' => 30.00, 'observed_at' => '2026-07-20', 'regulatory_finding' => $finding,
                ],
            ])->assertUnprocessable();
        }

        $this->assertSame(0, RegulatoryFinding::count(), 'No finding may survive an unresolved reference.');
    }

    public function test_insufficient_evidence_records_no_finding_and_needs_no_reference(): void
    {
        $report = $this->report();

        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct', 'reason' => 'Receipt line unreadable.',
            'corrected' => [
                'commodity_key' => 'no-such-commodity', 'commodity_name' => 'Unreadable',
                'receipt_price' => 30.00, 'observed_at' => '2026-07-20',
                'regulatory_finding' => 'insufficient_evidence',
            ],
        ])->assertOk();

        $this->assertSame(0, RegulatoryFinding::count());
    }

    public function test_a_finding_captures_the_reference_it_was_decided_against(): void
    {
        $bulletin = $this->bulletin();
        $report = $this->report();

        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct', 'reason' => 'Above the applicable SRP.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g', 'commodity_name' => 'Saba Sardines',
                'receipt_price' => 30.00, 'observed_at' => '2026-07-20',
                'regulatory_finding' => 'confirmed_violation',
            ],
        ])->assertOk();

        $finding = RegulatoryFinding::sole();
        $this->assertSame('standard_srp', $finding->reference_type);
        $this->assertSame(21.5, $finding->reference_value);
        $this->assertSame($bulletin->id, $finding->srp_bulletin_id, 'Commodity identity must survive both reference types.');
        $this->assertNotNull($finding->reference_version);
    }

    public function test_a_withdrawn_determination_supersedes_the_earlier_finding(): void
    {
        $this->bulletin();
        $report = $this->report();
        $decide = fn (string $finding) => $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct', 'reason' => 'Re-examined.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g', 'commodity_name' => 'Saba Sardines',
                'receipt_price' => 30.00, 'observed_at' => '2026-07-20', 'regulatory_finding' => $finding,
            ],
        ]);

        $decide('confirmed_violation')->assertOk();
        $this->assertSame(1, RegulatoryFinding::where('decision', 'confirmed')->count());

        $decide('insufficient_evidence')->assertOk();
        $this->assertSame(0, RegulatoryFinding::count(), 'A withdrawn determination must stop counting toward recidivism.');
        $this->assertSame(0, $this->store->refresh()->recidivism_index);
    }

    public function test_the_decision_response_is_complete_and_hides_the_consumer_tracking_secrets(): void
    {
        $this->bulletin();
        $report = $this->report();

        $response = $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct', 'reason' => 'Above the applicable SRP.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g', 'commodity_name' => 'Saba Sardines',
                'receipt_price' => 30.00, 'observed_at' => '2026-07-20',
                'regulatory_finding' => 'confirmed_violation',
            ],
        ])->assertOk();

        $response->assertJsonPath('data.store_name', 'Antique Market');
        $this->assertArrayNotHasKey('tracking_token_hash', $response->json('data'));
        $this->assertArrayNotHasKey('resume_token_hash', $response->json('data'));
    }

    public function test_a_report_still_being_processed_cannot_be_decided(): void
    {
        $this->bulletin();
        $report = $this->report(['status' => 'Ready for confirmation']);

        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct', 'reason' => 'Too early.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g', 'commodity_name' => 'Saba Sardines',
                'receipt_price' => 30.00, 'observed_at' => '2026-07-20',
                'regulatory_finding' => 'confirmed_violation',
            ],
        ])->assertUnprocessable();

        $this->assertSame(0, RegulatoryFinding::count());
    }

    public function test_the_queue_row_counts_items_priced_above_their_reference(): void
    {
        $bulletin = $this->bulletin();
        $this->report(items: [
            ['unit_price' => 30.00, 'srp_id' => $bulletin->id],
            ['unit_price' => 20.00, 'srp_id' => $bulletin->id],
            ['unit_price' => 26.00, 'srp_id' => $bulletin->id],
        ]);

        $this->getJson('/api/admin/reports')->assertOk()->assertJsonPath('data.0.above_reference_count', 2);
    }

    public function test_the_backfill_command_is_idempotent_and_writes_no_findings(): void
    {
        $bulletin = $this->bulletin();
        $report = $this->report(items: [['item_name' => 'Saba Sardines', 'unit' => '155g']]);

        $this->artisan('receipts:match-srp')->assertSuccessful();
        $first = $report->items()->first()->refresh()->only(['srp_id']);

        $this->artisan('receipts:match-srp')->assertSuccessful();

        $this->assertSame($first, $report->items()->first()->refresh()->only(['srp_id']));
        $this->assertSame($bulletin->id, $first['srp_id']);
        $this->assertSame(0, RegulatoryFinding::count(), 'Matching must never record a determination.');
    }
}
