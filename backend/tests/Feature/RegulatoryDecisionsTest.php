<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Services\Admin\TemporalAnalyticsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Phase 2 of the regulatory-actions plan: DTI decisions are recorded (no-action triage, closure outcomes per item),
 * notices stay tied to the exact captured evidence, and the owner's rules (D1 SCO entry, D4 addressee, D6 reminders,
 * D9 portal-only) hold on the server.
 */
class RegulatoryDecisionsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $vendor;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-28 09:00', 'Asia/Manila')); // Monday
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        config(['legal_policy.rules.LOI.signatory.name' => 'LOI Director', 'legal_policy.rules.SCO.signatory.name' => 'SCO Director']);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $this->vendor = User::create(['name' => 'Vendor', 'email' => 'vendor@shop.test', 'password' => 'password', 'role' => 'vendor']);
        $this->store = Store::create(['store_name' => 'Captured Store', 'owner_name' => 'Registered Owner', 'address' => 'San Jose, Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $this->vendor->id]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_close_records_one_finding_per_cited_item_and_needs_an_agreeing_outcome(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close")->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", ['outcome' => 'violation_confirmed', 'outcome_reason' => 'Prices were not corrected.',
            'item_decisions' => [['item_id' => $items[0]->id, 'decision' => 'confirmed']]])->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", ['outcome' => 'violation_confirmed', 'outcome_reason' => 'Prices were not corrected.',
            'item_decisions' => [['item_id' => $items[0]->id, 'decision' => 'confirmed'], ['item_id' => $items[1]->id, 'decision' => 'not_confirmed']]])->assertUnprocessable();
        $this->assertSame(0, RegulatoryFinding::count());

        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", ['outcome' => 'partially_confirmed', 'outcome_reason' => 'Rice was corrected; milk was not.',
            'item_decisions' => [['item_id' => $items[0]->id, 'decision' => 'not_confirmed'], ['item_id' => $items[1]->id, 'decision' => 'confirmed']]])
            ->assertOk()->assertJsonPath('data.outcome', 'partially_confirmed');

        $milk = RegulatoryFinding::where('source_id', $items[1]->id)->firstOrFail();
        $this->assertSame([MonitoringRecordItem::FINDING_SOURCE, 'confirmed', 'Rice was corrected; milk was not.'], [$milk->source_type, $milk->decision, $milk->reason]);
        // The finding cites the captured reference, including its version, not anything resolved later.
        $this->assertSame([51.0, 'standard_srp', 'v-2', 7], [$milk->reference_value, $milk->reference_type, $milk->reference_version, (int) $milk->reference_source_id]);
        $this->assertSame($items[1]->srp_id, $milk->srp_bulletin_id);
        $this->assertSame('not_confirmed', RegulatoryFinding::where('source_id', $items[0]->id)->value('decision'));
        $this->assertSame(1, $this->store->fresh()->recidivism_index);
    }

    public function test_an_accepted_explanation_is_not_a_confirmed_finding_and_a_visit_counts_once(): void
    {
        [$first, $firstItems] = $this->visit(1);
        $accepted = $this->issuedLoi($first, $firstItems);
        $this->close($accepted, 'explanation_accepted');
        $this->assertSame(0, $this->store->fresh()->recidivism_index);

        [$second, $secondItems] = $this->visit(2);
        $confirmed = $this->issuedLoi($second, $secondItems);
        $this->close($confirmed, 'violation_confirmed');
        // Two confirmed products on one visit are one confirmed case.
        $this->assertSame(2, RegulatoryFinding::where('decision', 'confirmed')->count());
        $this->assertSame(1, $this->store->fresh()->recidivism_index);
        $analytics = app(TemporalAnalyticsService::class)->forStore($this->store, null, now());
        $this->assertSame(1, $analytics['recidivism_count']);
    }

    public function test_a_confirmed_field_item_is_plotted_once_as_its_inspection(): void
    {
        [$record, $items] = $this->visit();
        foreach ($items as $item) {
            TemporalInspection::create(['store_id' => $this->store->id, 'srp_id' => $item->srp_id, 'recorded_price' => $item->recorded_price, 'is_flagged' => true,
                'inspection_timestamp' => $record->finalized_at, 'sync_timestamp' => now(), 'officer_signature' => 'officer.sig', 'vendor_signature' => 'rep.sig',
                'validation_status' => 'verified', 'validated_at' => now(), 'monitoring_record_id' => $record->id, 'monitoring_record_item_id' => $item->id, 'officer_user_id' => $this->admin->id]);
        }
        $this->close($this->issuedLoi($record, $items), 'violation_confirmed');

        $rows = collect(app(TemporalAnalyticsService::class)->forStore($this->store, null, now()->addMinute())['table_rows']);
        $this->assertCount(2, $rows);
        $this->assertSame(0, $rows->where('source', 'Validated receipt')->count());
        $this->assertTrue($rows->every(fn ($row) => $row['confirmed'] === true));
    }

    public function test_closing_a_notice_drafted_before_full_snapshots_falls_back_to_the_matching_item(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $notice = LegalNotice::find($id);
        $legacyItems = collect($notice->source_snapshot['items'])->map(fn ($item) => collect($item)->except(['srp_id', 'reference_source_id', 'reference_version', 'previous_price'])->all())->all();
        $notice->update(['source_snapshot' => ['items' => $legacyItems] + $notice->source_snapshot]);

        $this->close($id, 'violation_confirmed');
        $finding = RegulatoryFinding::where('source_id', $items[0]->id)->firstOrFail();
        $this->assertSame(['v-1', 7, $items[0]->srp_id], [$finding->reference_version, (int) $finding->reference_source_id, $finding->srp_bulletin_id]);
    }

    public function test_a_snapshot_that_disagrees_with_its_visit_is_not_closed(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $notice = LegalNotice::find($id);
        $tampered = $notice->source_snapshot;
        $tampered['items'][0]['observed_price'] = 99;
        $notice->update(['source_snapshot' => $tampered]);

        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", $this->closing($id, 'violation_confirmed'))
            ->assertConflict()->assertJsonPath('status', 'SNAPSHOT_REVIEW_REQUIRED');
        $this->assertSame(0, RegulatoryFinding::count());
        $this->assertSame('issued', $notice->fresh()->status);
    }

    public function test_escalation_copies_the_loi_snapshot_even_after_the_store_record_changes(): void
    {
        [$record, $items] = $this->visit();
        $loi = $this->issuedLoi($record, $items, respond: true);
        $this->store->update(['store_name' => 'Renamed Store', 'address' => 'Somewhere else']);

        $sco = $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertCreated()->json('data');
        $this->assertSame(LegalNotice::find($loi)->source_snapshot, $sco['source_snapshot']);
        $this->assertSame('Captured Store', $sco['source_snapshot']['store']['store_name']);
        $this->assertSame('escalated_to_sco', LegalNotice::find($loi)->outcome);
        // Escalation decides nothing about the products; the SCO's closure will.
        $this->assertSame(0, RegulatoryFinding::count());
    }

    public function test_a_direct_sco_needs_a_price_freeze_visit_citing_ceilings(): void
    {
        [$record, $items] = $this->visit();
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'SCO', 'item_ids' => [$items[0]->id]])
            ->assertUnprocessable()->assertJsonPath('status', 'SCO_REQUIRES_ESCALATION');

        // A direct SCO drafted before the rule cannot be issued around it.
        $old = LegalNotice::create(['store_id' => $this->store->id, 'monitoring_record_id' => $record->id, 'notice_type' => 'SCO', 'prepared_by' => $this->admin->id, 'status' => 'draft',
            'source_snapshot' => ['items' => [['id' => $items[0]->id, 'reference_type' => 'standard_srp']], 'store' => ['store_name' => 'Captured Store']],
            'draft_payload' => ['recipient_name' => 'Registered Owner', 'address' => 'San Jose', 'reason' => 'Prices above SRP', 'legal_bases' => ['RA 7581 (Price Act)'], 'linked_vendor_user_id' => $this->vendor->id],
            'intended_delivery_method' => 'portal', 'delivery_state' => 'not_recorded']);
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$old->id}/issue", ['confirmed' => true])->assertUnprocessable()->assertJsonPath('status', 'SCO_REQUIRES_ESCALATION');
        $old->update(['status' => 'cancelled']);

        [$freeze, $ceilingItems] = $this->visit(2, emergency: true);
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $freeze->id, 'notice_type' => 'SCO', 'item_ids' => [$ceilingItems[0]->id]])->assertCreated();
    }

    public function test_the_addressee_is_the_registered_owner_and_an_owner_change_needs_review(): void
    {
        [$record, $items] = $this->visit();
        $unchanged = $this->draft($record, $items);
        $this->store->update(['owner_name' => 'Interim Owner']);
        // An addressee still printing the former owner follows the store once the recipient is confirmed.
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$unchanged", ['confirm_recipient' => true])->assertOk()
            ->assertJsonPath('data.draft_payload.recipient_name', 'Interim Owner');
        $this->asAdmin()->postJson("/api/admin/legal-notices/$unchanged/cancel")->assertOk();
        $this->store->update(['owner_name' => 'Registered Owner']);

        $draft = $this->draft($record, $items);
        $this->assertSame('Registered Owner', LegalNotice::find($draft)->draft_payload['recipient_name']);
        // The evaluator's deliberate form representation survives a later confirmation, for them to review.
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['recipient_name' => 'Registered Owner (Proprietor)'])->assertOk();
        $this->store->update(['owner_name' => 'New Owner']);

        $this->asAdmin()->getJson("/api/admin/legal-notices/$draft")->assertJsonPath('data.recipient_review_required', true);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertConflict()->assertJsonPath('status', 'RECIPIENT_REVIEW_REQUIRED');
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['confirm_recipient' => true])->assertOk()
            ->assertJsonPath('data.recipient_review_required', false)->assertJsonPath('data.draft_payload.recipient_name', 'Registered Owner (Proprietor)');
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertOk();

        // No registered owner on record: the name is left blank for the evaluator, never invented.
        $nameless = Store::create(['store_name' => 'Nameless', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $this->vendor->id]);
        [$other, $otherItems] = $this->visit(3, store: $nameless);
        $id = $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $other->id, 'notice_type' => 'LOI', 'item_ids' => [$otherItems[0]->id]])->assertCreated()->json('data.id');
        $this->assertNull(LegalNotice::find($id)->draft_payload['recipient_name']);
    }

    public function test_a_vendor_email_too_long_for_the_form_blocks_issue_without_truncating(): void
    {
        $this->vendor->update(['email' => str_repeat('v', 52).'@shop.test']);
        [$record, $items] = $this->visit();
        $draft = $this->draft($record, $items);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])
            ->assertUnprocessable()->assertJsonPath('status', 'RECIPIENT_EMAIL_TOO_LONG');
        $this->assertSame('draft', LegalNotice::find($draft)->status);
        $this->assertCount(0, Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
    }

    public function test_needs_review_tracks_each_item_and_no_action_covers_the_rest(): void
    {
        [$record, $items] = $this->visit();
        $pending = fn () => collect($this->asAdmin()->getJson('/api/admin/monitoring-records?review=pending')->assertOk()->json('data.data'));
        $this->assertSame([$items[0]->id, $items[1]->id], $pending()->firstWhere('id', $record->id)['undecided_item_ids']);

        // A notice citing only the first product: the visit waits on it, and no-action is refused meanwhile.
        $loi = $this->issuedLoi($record, [$items[0]]);
        $this->assertSame($loi, $pending()->firstWhere('id', $record->id)['open_notice']['id']);
        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'Shelf tag error corrected.'])->assertConflict();

        $this->close($loi, 'violation_confirmed');
        $row = $pending()->firstWhere('id', $record->id);
        $this->assertSame([$items[1]->id], $row['undecided_item_ids']);
        $this->assertNull($row['open_notice']);

        // A decided product cannot be cited again.
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'item_ids' => [$items[0]->id]])
            ->assertConflict()->assertJsonPath('status', 'ITEM_ALREADY_DECIDED');

        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'Short'])->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'Milk tag was a printing error.'])->assertOk()
            ->assertJsonPath('data.item_ids', [$items[1]->id]);
        $this->assertNull($pending()->firstWhere('id', $record->id));
        $this->assertSame('no_action', RegulatoryFinding::where('source_id', $items[1]->id)->value('decision'));
        $this->assertDatabaseHas('audit_events', ['action' => 'monitoring.no_action_recorded', 'subject_id' => $record->id]);
        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'Milk tag was a printing error.'])->assertConflict();
    }

    public function test_a_no_action_item_can_still_be_cited_and_its_triage_is_frozen_in_the_notice(): void
    {
        [$record, $items] = $this->visit();
        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'First visit for this store; advised only.'])->assertOk();
        $id = $this->issuedLoi($record, $items);
        $triage = LegalNotice::find($id)->source_snapshot['prior_triage'];
        $this->assertCount(2, $triage);
        $this->assertSame(['First visit for this store; advised only.', 'Evaluator'], [$triage[0]['reason'], $triage[0]['decided_by_name']]);

        $this->close($id, 'violation_confirmed');
        $this->assertSame('confirmed', RegulatoryFinding::where('source_id', $items[0]->id)->value('decision'));
        $this->assertSame('First visit for this store; advised only.', LegalNotice::find($id)->source_snapshot['prior_triage'][0]['reason']);
    }

    public function test_reminder_reaches_only_the_notices_own_vendor_and_changes_no_deadline(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $this->asAdmin()->getJson("/api/admin/legal-notices/$id")->assertJsonPath('data.can_remind', true);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/reminder")->assertCreated()->assertJsonPath('data.sender_side', 'dti');
        $this->assertSame(1, StoreMessage::where('store_id', $this->store->id)->where('vendor_user_id', $this->vendor->id)->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.reminder_sent', 'subject_id' => $id]);

        // Opened and not yet due: nothing to remind about.
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        $due = LegalNotice::find($id)->due_date_timestamp;
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/reminder")->assertConflict();
        Carbon::setTestNow(Carbon::parse('2026-10-02 09:00', 'Asia/Manila'));
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/reminder")->assertCreated();
        $this->assertEquals($due, LegalNotice::find($id)->due_date_timestamp);
        $this->assertSame('issued', LegalNotice::find($id)->status);

        // The store's link points elsewhere: the reminder would reach someone the notice was not issued to.
        $other = User::create(['name' => 'Other Vendor', 'email' => 'other@shop.test', 'password' => 'password', 'role' => 'vendor']);
        $this->store->forceFill(['vendor_user_id' => $other->id])->save();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/reminder")->assertConflict();
        $this->assertSame(0, StoreMessage::where('vendor_user_id', $other->id)->count());
    }

    public function test_create_conflict_names_the_existing_notice_and_issued_lists_can_leave_out_drafts(): void
    {
        [$record, $items] = $this->visit();
        $draft = $this->draft($record, $items);
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'item_ids' => [$items[0]->id]])
            ->assertConflict()->assertJsonPath('existing_notice_id', $draft);

        [$second, $secondItems] = $this->visit(2);
        $issued = $this->issuedLoi($second, $secondItems);
        $ids = collect($this->asAdmin()->getJson('/api/admin/legal-notices?exclude_drafts=1')->assertOk()->json('data.data'))->pluck('id')->all();
        $this->assertSame([$issued], $ids);
    }

    public function test_vendor_sees_the_outcome_and_per_product_decisions_once_closed(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items, respond: true);
        $this->asVendor()->getJson("/api/vendor/notices/$id")->assertOk()->assertJsonPath('outcome', null)->assertJsonPath('flagged_items.0.decision', null);

        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", ['outcome' => 'partially_confirmed', 'outcome_reason' => 'Rice corrected; milk not corrected.',
            'item_decisions' => [['item_id' => $items[0]->id, 'decision' => 'not_confirmed'], ['item_id' => $items[1]->id, 'decision' => 'confirmed']]])->assertOk();
        $this->asVendor()->getJson("/api/vendor/notices/$id")->assertOk()
            ->assertJsonPath('outcome', 'partially_confirmed')->assertJsonPath('outcome_reason', 'Rice corrected; milk not corrected.')
            ->assertJsonPath('flagged_items.0.decision', 'not_confirmed')->assertJsonPath('flagged_items.1.decision', 'confirmed');
        $this->asVendor()->getJson("/api/vendor/conversations/{$this->store->id}")->assertOk()
            ->assertJsonPath('data.notices.0.outcome', 'partially_confirmed')->assertJsonPath('data.notices.0.outcome_reason', 'Rice corrected; milk not corrected.');
    }

    public function test_field_monitoring_shows_the_notice_and_decision_without_acting_on_them(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $this->close($id, 'violation_confirmed');
        $this->asAdmin()->getJson("/api/admin/monitoring-records/{$record->id}")->assertOk()
            ->assertJsonPath('data.notices.0.id', $id)->assertJsonPath('data.notices.0.outcome', 'violation_confirmed')
            ->assertJsonPath('data.items.0.finding.decision', 'confirmed')->assertJsonPath('data.undecided_item_ids', []);
        $this->asAdmin()->getJson("/api/admin/monitoring-establishments/{$this->store->id}/findings?period=all_time")->assertOk()
            ->assertJsonPath('data.data.0.notice.id', $id)->assertJsonPath('data.data.0.decision', 'confirmed');
        // The period's unavailable-reference count lets the review card speak for the whole period.
        MonitoringRecordItem::create(['monitoring_record_id' => $record->id, 'srp_id' => SrpBulletin::create(['commodity_name' => 'Sugar', 'baseline_price' => 60, 'effective_date' => '2026-01-01', 'is_active' => true])->id,
            'recorded_price' => 70, 'baseline_price' => 60, 'is_anomaly' => false, 'reference_status' => 'unavailable']);
        $this->asAdmin()->getJson("/api/admin/monitoring-establishments/{$this->store->id}?period=all_time")->assertOk()
            ->assertJsonPath('data.period_unavailable_reference_count', 1);
    }

    public function test_a_notice_without_captured_products_cannot_be_closed_as_a_confirmed_violation(): void
    {
        $legacy = LegalNotice::create(['store_id' => $this->store->id, 'notice_type' => 'LOI', 'status' => 'issued', 'issued_at' => now(), 'intended_delivery_method' => 'hand_copy', 'delivery_state' => 'received']);
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$legacy->id}/close", ['outcome' => 'violation_confirmed', 'outcome_reason' => 'Prices were not corrected.'])->assertUnprocessable();
        $this->assertSame('issued', $legacy->fresh()->status);
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$legacy->id}/close", ['outcome' => 'no_violation', 'outcome_reason' => 'Handled offline before this system.'])->assertOk();
        $this->assertSame(0, RegulatoryFinding::count());
    }

    public function test_a_snapshot_citing_another_commodity_is_not_closed_and_findings_use_the_items_commodity(): void
    {
        [$record, $items] = $this->visit();
        $id = $this->issuedLoi($record, $items);
        $notice = LegalNotice::find($id);
        $tampered = $notice->source_snapshot;
        $tampered['items'][0]['srp_id'] = $items[1]->srp_id;
        $notice->update(['source_snapshot' => $tampered]);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", $this->closing($id, 'violation_confirmed'))
            ->assertConflict()->assertJsonPath('status', 'SNAPSHOT_REVIEW_REQUIRED');
        $this->assertSame(0, RegulatoryFinding::count());
    }

    public function test_a_product_cited_by_an_open_notice_is_not_undecided_and_chips_follow_the_citing_notice(): void
    {
        [$record, $items] = $this->visit();
        $pending = fn () => collect($this->asAdmin()->getJson('/api/admin/monitoring-records?review=pending')->assertOk()->json('data.data'));
        // A notice citing every flagged product: the visit awaits it and leaves Needs review.
        $all = $this->issuedLoi($record, $items);
        $this->assertNull($pending()->firstWhere('id', $record->id));
        $this->asAdmin()->postJson("/api/admin/legal-notices/$all/cancel", ['outcome_reason' => 'Drafted against the wrong products.'])->assertOk();

        // A notice citing only the first product: only the second stays undecided, and only the first shows the chip.
        $first = $this->issuedLoi($record, [$items[0]]);
        $this->assertSame([$items[1]->id], $pending()->firstWhere('id', $record->id)['undecided_item_ids']);
        $rows = collect($this->asAdmin()->getJson("/api/admin/monitoring-establishments/{$this->store->id}/findings?period=all_time")->assertOk()->json('data.data'))->keyBy('id');
        $this->assertSame($first, $rows[$items[0]->id]['notice']['id']);
        // The second product's newest citing notice is the withdrawn one (it left DTI), never the first product's notice.
        $this->assertSame($all, $rows[$items[1]->id]['notice']['id']);
    }

    public function test_findings_show_who_decided_no_action_and_when(): void
    {
        [$record] = $this->visit();
        $this->asAdmin()->postJson("/api/admin/monitoring-records/{$record->id}/no-action", ['reason' => 'Tag misprint corrected on site.'])->assertOk();
        $this->asAdmin()->getJson("/api/admin/monitoring-establishments/{$this->store->id}/findings?period=all_time")->assertOk()
            ->assertJsonPath('data.data.0.decision', 'no_action')->assertJsonPath('data.data.0.decided_by_name', 'Evaluator')
            ->assertJsonPath('data.data.0.decided_at', fn ($value) => $value !== null);
    }

    private function close(int $id, string $outcome): void
    {
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/close", $this->closing($id, $outcome))->assertOk();
    }

    private function closing(int $id, string $outcome): array
    {
        $decision = $outcome === 'violation_confirmed' ? 'confirmed' : 'not_confirmed';
        return ['outcome' => $outcome, 'outcome_reason' => 'Reviewed the response and the evidence.',
            'item_decisions' => collect(LegalNotice::find($id)->source_snapshot['items'])->map(fn ($item) => ['item_id' => $item['id'], 'decision' => $decision])->all()];
    }

    private function issuedLoi(MonitoringRecord $record, array $items, bool $respond = false): int
    {
        $id = $this->draft($record, $items);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/issue", ['confirmed' => true])->assertOk();
        if ($respond) {
            $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
            $this->asVendor()->postJson("/api/vendor/notices/$id/response", ['reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'Our distributor raised prices this week.', 'certified_under_oath' => true])->assertOk();
        }
        return $id;
    }

    private function draft(MonitoringRecord $record, array $items): int
    {
        $id = $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'item_ids' => collect($items)->pluck('id')->all()])
            ->assertCreated()->json('data.id');
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$id", ['intended_delivery_method' => 'portal', 'internal_justification' => 'Reviewed.'])->assertOk();
        return $id;
    }

    private function visit(int $seed = 1, bool $emergency = false, ?Store $store = null): array
    {
        $store ??= $this->store;
        $record = MonitoringRecord::create([
            'client_uuid' => sprintf('30000000-0000-4000-8000-%012d', $seed), 'officer_user_id' => $this->admin->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHour(), 'finalized_at' => now(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Store Representative', 'representative_title' => 'Cashier', 'protocol_mode' => $emergency ? 'emergency' : 'standard',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'representative.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);
        $items = collect(['Rice', 'Milk'])->map(function (string $name, int $index) use ($record, $seed, $emergency) {
            $bulletin = SrpBulletin::create(['commodity_name' => "$name $seed", 'baseline_price' => 50 + $index, 'effective_date' => '2026-01-01', 'is_active' => true]);
            return MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 62 + $index, 'previous_price' => 49,
                'baseline_price' => 50 + $index, 'variance_percent' => 24, 'is_anomaly' => true, 'reference_status' => 'available',
                'reference_type' => $emergency ? 'emergency_ceiling' : 'standard_srp', 'reference_label' => $emergency ? 'Price ceiling' : 'Captured SRP',
                'reference_value' => 50 + $index, 'reference_source' => 'DTI-2026', 'reference_effective_date' => '2026-01-01',
                'reference_source_id' => 7, 'reference_version' => 'v-'.($index + 1),
            ]);
        })->all();
        return [$record, $items];
    }

    private function asAdmin(): static
    {
        $this->app['auth']->forgetGuards();
        return $this->actingAs($this->admin, 'sanctum');
    }

    private function asVendor(): static
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($this->vendor->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken);
    }
}
