<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\LegalPolicyService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Issue → portal receipt → response/escalation, against the shipped legal policy config. */
class LegalNoticeLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $vendor;
    private Store $store;
    private MonitoringRecord $record;
    private array $items;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-28 09:00', 'Asia/Manila')); // Monday
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        config(['legal_policy.rules.LOI.signatory.name' => 'LOI Director', 'legal_policy.rules.SCO.signatory.name' => 'SCO Director']);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $this->vendor = User::create(['name' => 'Vendor', 'email' => 'vendor@shop.test', 'password' => 'password', 'role' => 'vendor']);
        $this->vendor->forceFill(['email_verified_at' => now()])->save();
        $this->store = Store::create(['store_name' => 'Captured Store', 'owner_name' => 'Registered Owner', 'address' => 'San Jose, Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $this->vendor->id]);
        [$this->record, $this->items] = $this->visit($this->store);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_shipped_policy_is_available_once_signatories_are_set_and_ends_at_the_calendar_boundary(): void
    {
        $policy = app(LegalPolicyService::class);
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('LOI')['status']);
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('SCO')['status']);

        Carbon::setTestNow(Carbon::parse('2027-12-22 09:00', 'Asia/Manila'));
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('LOI')['status']);
        Carbon::setTestNow(Carbon::parse('2027-12-23 09:00', 'Asia/Manila'));
        $this->assertSame('LEGAL_POLICY_UNAVAILABLE', $policy->availability('LOI')['status']);
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('SCO')['status']);

        config(['legal_policy.rules.LOI.signatory.name' => null]);
        Carbon::setTestNow(Carbon::parse('2026-09-28 09:00', 'Asia/Manila'));
        $this->assertSame('LEGAL_POLICY_UNAVAILABLE', $policy->availability('LOI')['status']);
    }

    public function test_portal_notice_freezes_audience_and_rules_and_first_open_starts_the_deadline_once(): void
    {
        $id = $this->issue('LOI', 'portal');
        $notice = LegalNotice::findOrFail($id);
        $this->assertSame($this->vendor->id, $notice->vendor_user_id);
        $this->assertSame(['unit' => 'working_days', 'value' => 3], $notice->deadline_rules['response_period']);
        $this->assertSame('not_recorded', $notice->delivery_state);

        // Rules are frozen: withdrawing the policy later does not stop receipt from being recorded.
        config(['legal_policy.approved' => false]);
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        $notice->refresh();
        $this->assertSame('received', $notice->delivery_state);
        // Mon 28 Sep + 3 working days = Thu 1 Oct.
        $this->assertSame('2026-10-01 09:00', $notice->due_date_timestamp->timezone('Asia/Manila')->format('Y-m-d H:i'));
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.delivery_recorded', 'subject_id' => $id]);

        Carbon::setTestNow(now()->addDay());
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        $this->assertSame('2026-10-01 09:00', $notice->fresh()->due_date_timestamp->timezone('Asia/Manila')->format('Y-m-d H:i'));

        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'failed', 'recorded_at' => now()->toIso8601String()])
            ->assertConflict()->assertJsonPath('status', 'PORTAL_RECEIPT_ONLY');
    }

    public function test_staff_cannot_start_a_portal_deadline_by_recording_delivery(): void
    {
        $id = $this->issue('LOI', 'portal');
        foreach (['received', 'refused', 'failed'] as $state) {
            $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => $state, 'recorded_at' => now()->toIso8601String()])
                ->assertConflict()->assertJsonPath('status', 'PORTAL_RECEIPT_ONLY');
        }
        $this->assertNull(LegalNotice::find($id)->due_date_timestamp);
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        $this->assertSame('received', LegalNotice::find($id)->delivery_state);
    }

    public function test_issue_accepts_only_portal_delivery(): void
    {
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $this->record->id, 'notice_type' => 'LOI', 'item_ids' => [$this->items[0]->id]]);
        $draft = LegalNotice::where('status', 'draft')->latest('id')->firstOrFail();
        foreach (['hand_copy', 'email_and_hand_copy'] as $method) {
            $this->asAdmin()->patchJson("/api/admin/legal-notices/{$draft->id}", ['intended_delivery_method' => $method])->assertUnprocessable();
        }
        // A draft saved with an older method before the rule cannot be issued with it.
        $draft->update(['intended_delivery_method' => 'hand_copy', 'draft_payload' => ['reason' => 'Prices above SRP', 'address' => 'San Jose, Antique'] + $draft->draft_payload]);
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$draft->id}/issue", ['confirmed' => true])->assertUnprocessable();
        $this->assertSame('draft', $draft->fresh()->status);
    }

    public function test_legacy_hand_copy_notice_is_not_received_by_opening_it(): void
    {
        $id = $this->legacyHandCopy();
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        $this->assertSame('not_recorded', LegalNotice::find($id)->delivery_state);
    }

    public function test_portal_issue_requires_a_linked_active_vendor(): void
    {
        $unlinked = Store::create(['store_name' => 'No Vendor', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121]);
        [$record, $items] = $this->visit($unlinked, 2);
        $draft = $this->draft($record, $items, 'LOI', ['intended_delivery_method' => 'portal']);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertUnprocessable();
        $this->assertSame('draft', LegalNotice::find($draft)->status);
    }

    public function test_changed_vendor_link_requires_recipient_review_before_issue(): void
    {
        $draft = $this->draft($this->record, $this->items, 'LOI', ['intended_delivery_method' => 'portal', 'recipient_email' => 'representative@elsewhere.test']);
        $replacement = User::create(['name' => 'New Vendor', 'email' => 'new@shop.test', 'password' => 'password', 'role' => 'vendor']);
        $this->store->forceFill(['vendor_user_id' => $replacement->id])->save();

        $this->asAdmin()->getJson("/api/admin/legal-notices/$draft")->assertJsonPath('data.recipient_review_required', true);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])
            ->assertConflict()->assertJsonPath('status', 'RECIPIENT_REVIEW_REQUIRED');

        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['confirm_linked_vendor' => true])->assertOk()
            ->assertJsonPath('data.draft_payload.recipient_email', 'new@shop.test');
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertOk();
        $this->assertSame($replacement->id, LegalNotice::find($draft)->vendor_user_id);
        // The printed email is always the audience's own.
        $this->assertSame('new@shop.test', LegalNotice::find($draft)->draft_payload['recipient_email']);
    }

    public function test_reason_and_legal_bases_accept_only_distinct_permitted_values(): void
    {
        $draft = $this->escalatedSco();
        foreach ([['legal_bases' => ['RA 7581 (Price Act)', 'RA 7581 (Price Act)']], ['legal_bases' => ['Invented basis']],
            ['legal_bases' => array_fill(0, 5, 'RA 7581 (Price Act)')], ['reason' => 'Anything']] as $payload) {
            $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", $payload)->assertUnprocessable();
        }
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['legal_bases' => ['DAO No. 6, s. 2007', 'DO No. 18-122']])->assertOk();
    }

    public function test_sco_document_names_the_inspection_and_selected_bases(): void
    {
        $draft = $this->escalatedSco(['legal_bases' => ['RA 7581 (Price Act)', 'DAO No. 6, s. 2007']]);
        $html = $this->asAdmin()->post("/api/admin/legal-notices/$draft/preview")->assertOk()->getContent();
        $this->assertStringContainsString('DTI Price Monitoring — inspection of September 28, 2026', $html);
        $this->assertStringContainsString('RA 7581 (Price Act); DAO No. 6, s. 2007.', $html);
        $this->assertStringContainsString('Annex A — Monitoring Schedule', $html);
        $this->assertStringNotContainsString('RA XXXX', $html);
    }

    public function test_escalation_after_a_response_closes_the_loi_and_drafts_a_linked_sco(): void
    {
        $loi = $this->issue('LOI', 'portal');
        $this->asVendor()->get("/api/vendor/notices/$loi/document")->assertOk();
        $this->asVendor()->postJson("/api/vendor/notices/$loi/response", ['reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'Our distributor raised prices this week.', 'certified_under_oath' => true])->assertOk();

        $sco = $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertCreated()
            ->assertJsonPath('data.notice_type', 'SCO')->assertJsonPath('data.preceding_notice_id', $loi)->json('data');
        $this->assertSame('closed', LegalNotice::find($loi)->status);
        $this->assertCount(2, $sco['source_snapshot']['items']);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertConflict();
    }

    public function test_unanswered_loi_escalates_only_after_the_deadline_and_while_the_vendor_could_respond(): void
    {
        $loi = $this->issue('LOI', 'portal');
        $this->asVendor()->get("/api/vendor/notices/$loi/document")->assertOk();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertConflict();

        Carbon::setTestNow(Carbon::parse('2026-10-02 09:00', 'Asia/Manila'));
        $this->vendor->forceFill(['is_active' => false])->save();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertConflict();

        $this->vendor->forceFill(['is_active' => true])->save();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertCreated();
    }

    public function test_drafts_cannot_claim_a_preceding_notice_directly(): void
    {
        $this->asAdmin()->postJson('/api/admin/legal-notices', [
            'monitoring_record_id' => $this->record->id, 'notice_type' => 'SCO', 'item_ids' => [$this->items[0]->id], 'preceding_notice_id' => 1,
        ])->assertUnprocessable();
    }

    public function test_open_notice_blocks_unlink_and_deactivation_until_closed(): void
    {
        $loi = $this->issue('LOI', 'portal');
        $this->asAdmin()->patchJson("/api/admin/stores/{$this->store->id}", ['vendor_user_id' => null])
            ->assertConflict()->assertJsonPath('status', 'OPEN_NOTICES_BLOCK_UNLINK');
        $this->asAdmin()->patchJson("/api/admin/users/{$this->vendor->id}", ['is_active' => false])
            ->assertConflict()->assertJsonPath('status', 'OPEN_NOTICES_BLOCK_DEACTIVATION');
        $this->assertTrue((bool) $this->vendor->fresh()->is_active);

        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/close", $this->closing($loi, 'no_violation'))->assertOk();
        $this->asAdmin()->patchJson("/api/admin/stores/{$this->store->id}", ['vendor_user_id' => null])->assertOk();
        $this->asAdmin()->patchJson("/api/admin/users/{$this->vendor->id}", ['is_active' => false])->assertOk();
    }

    public function test_legacy_notice_without_frozen_rules_is_offline_only(): void
    {
        $legacy = LegalNotice::create(['store_id' => $this->store->id, 'notice_type' => 'LOI', 'status' => 'issued', 'issued_at' => now(), 'intended_delivery_method' => 'hand_copy', 'delivery_state' => 'not_recorded']);
        $this->asVendor()->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$legacy->id}/delivery", ['state' => 'received', 'recorded_at' => now()->toIso8601String()])
            ->assertConflict()->assertJsonPath('status', 'LEGACY_POLICY_REVIEW_REQUIRED');
        $this->asAdmin()->getJson("/api/admin/legal-notices/{$legacy->id}")->assertJsonPath('data.legacy', true);
        // A legacy notice cites no captured items, so it closes with an outcome and no per-item decisions.
        $this->asAdmin()->postJson("/api/admin/legal-notices/{$legacy->id}/close", ['outcome' => 'no_violation', 'outcome_reason' => 'Handled offline before this system.'])->assertOk();
    }

    public function test_issued_document_prints_its_issue_date(): void
    {
        $id = $this->escalatedSco(['intended_delivery_method' => 'portal', 'legal_bases' => ['RA 7581 (Price Act)']]);
        $rendered = null;
        \Barryvdh\DomPDF\Facade\Pdf::shouldReceive('loadView')->once()->andReturnUsing(function (string $view, array $data) use (&$rendered) {
            $rendered = view($view, $data)->render();
            return \Barryvdh\DomPDF\Facade\Pdf::getFacadeRoot();
        });
        \Barryvdh\DomPDF\Facade\Pdf::shouldReceive('setPaper')->andReturnSelf();
        \Barryvdh\DomPDF\Facade\Pdf::shouldReceive('output')->andReturn('%PDF-fake');
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/issue", ['confirmed' => true])->assertOk();
        $this->assertStringContainsString('28th day of September 2026', $rendered);
    }

    public function test_issue_sends_no_email_because_delivery_is_portal_only(): void
    {
        Mail::fake();
        $this->issue('LOI', 'portal');
        Mail::assertNothingQueued();
    }

    public function test_manual_delivery_uses_the_actual_receipt_time_within_bounds(): void
    {
        $id = $this->legacyHandCopy();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'received', 'recorded_at' => now()->subDay()->toIso8601String()])->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'received', 'recorded_at' => now()->addHour()->toIso8601String()])->assertUnprocessable();

        Carbon::setTestNow(Carbon::parse('2026-09-30 15:00', 'Asia/Manila'));
        // Delivered Monday, entered Wednesday: the deadline counts from Monday.
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'received', 'recorded_at' => Carbon::parse('2026-09-28 10:00', 'Asia/Manila')->toIso8601String()])->assertOk();
        $this->assertSame('2026-10-01 10:00', LegalNotice::find($id)->due_date_timestamp->timezone('Asia/Manila')->format('Y-m-d H:i'));
    }

    public function test_emailed_response_needs_delivery_and_evidence_and_keeps_its_channel(): void
    {
        $id = $this->legacyHandCopy();
        $payload = fn () => ['channel' => 'email', 'received_at' => now()->toIso8601String(), 'response_text' => 'Emailed: supplier invoice attached to our reply.', 'evidence' => \Illuminate\Http\UploadedFile::fake()->create('reply.pdf', 20, 'application/pdf')];
        $this->asAdmin()->post("/api/admin/legal-notices/$id/offline-response", $payload(), ['Accept' => 'application/json'])->assertConflict();

        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'received', 'recorded_at' => now()->toIso8601String()])->assertOk();
        $this->asAdmin()->post("/api/admin/legal-notices/$id/offline-response", array_diff_key($payload(), ['evidence' => 1]), ['Accept' => 'application/json'])->assertUnprocessable();
        $this->asAdmin()->post("/api/admin/legal-notices/$id/offline-response", $payload(), ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.status', 'response_received')->assertJsonPath('data.response_channel', 'email')->assertJsonPath('data.can_escalate', true);
        $this->assertDatabaseHas('legal_notice_attachments', ['legal_notice_id' => $id, 'kind' => 'offline_response', 'category' => 'EMAIL']);
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.offline_response_recorded', 'subject_id' => $id]);
        $this->asVendor()->getJson("/api/vendor/notices/$id")->assertOk()->assertJsonPath('response_channel', 'email');
    }

    public function test_stated_reason_must_match_the_kind_of_evidence(): void
    {
        $draft = $this->draft($this->record, $this->items, 'LOI', ['intended_delivery_method' => 'portal']);
        // A save cannot store another reason, and clearing it is still allowed.
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['reason' => 'Prices above price ceiling'])->assertUnprocessable();
        $this->assertSame('Prices above SRP', LegalNotice::find($draft)->draft_payload['reason']);
        // A draft saved before that rule can still hold one; issue refuses it.
        $notice = LegalNotice::find($draft);
        $notice->update(['draft_payload' => ['reason' => 'Prices above price ceiling'] + $notice->draft_payload]);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertUnprocessable();
        $this->assertSame('draft', LegalNotice::find($draft)->status);

        LegalNotice::find($draft)->update(['status' => 'cancelled']);
        $this->items[1]->update(['reference_type' => 'emergency_ceiling']);
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $this->record->id, 'notice_type' => 'LOI', 'item_ids' => collect($this->items)->pluck('id')->all()])->assertUnprocessable();
        // A single-kind draft starts with the matching reason.
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $this->record->id, 'notice_type' => 'LOI', 'item_ids' => [$this->items[1]->id]])
            ->assertCreated()->assertJsonPath('data.draft_payload.reason', 'Prices above price ceiling');
    }

    public function test_draft_starts_with_the_reason_and_legal_basis_its_evidence_supports(): void
    {
        $create = fn (array $items) => $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $this->record->id, 'notice_type' => 'LOI', 'item_ids' => collect($items)->pluck('id')->all()])->assertCreated();
        $srp = $create($this->items)
            ->assertJsonPath('data.draft_payload.reason', 'Prices above SRP')->assertJsonPath('data.draft_payload.legal_bases', ['RA 7581 (Price Act)'])
            ->assertJsonPath('data.policy.derived', ['reason' => 'Prices above SRP', 'legal_bases' => ['RA 7581 (Price Act)']])
            ->assertJsonPath('data.policy.basis_groups', ['RA 7581 (Price Act)' => 'applicable_law', 'DAO No. 6, s. 2007' => 'penalty_procedure', 'DO No. 18-122' => 'penalty_procedure', 'RA 7394 (Consumer Act)' => 'other_law'])
            ->json('data.id');
        // The evaluator may keep, add to or clear the suggested bases.
        foreach ([['RA 7581 (Price Act)', 'DAO No. 6, s. 2007', 'DO No. 18-122', 'RA 7394 (Consumer Act)'], ['RA 7394 (Consumer Act)'], []] as $bases) {
            $this->asAdmin()->patchJson("/api/admin/legal-notices/$srp", ['legal_bases' => $bases])->assertOk()->assertJsonPath('data.draft_payload.legal_bases', $bases);
        }

        LegalNotice::find($srp)->update(['status' => 'cancelled']);
        foreach ($this->items as $item) $item->update(['reference_type' => 'emergency_ceiling']);
        $create($this->items)->assertJsonPath('data.draft_payload.reason', 'Prices above price ceiling')->assertJsonPath('data.draft_payload.legal_bases', ['RA 7581 (Price Act)'])
            ->assertJsonPath('data.policy.derived.reason', 'Prices above price ceiling');
    }

    public function test_escalated_sco_starts_with_the_legal_basis_its_evidence_supports(): void
    {
        $sco = $this->escalatedSco();
        $this->asAdmin()->getJson("/api/admin/legal-notices/$sco")->assertOk()
            ->assertJsonPath('data.draft_payload.reason', 'Prices above SRP')->assertJsonPath('data.draft_payload.legal_bases', ['RA 7581 (Price Act)'])
            ->assertJsonPath('data.readiness.notice_type_and_basis', true);
    }

    public function test_nothing_is_derived_when_policy_does_not_permit_the_reason(): void
    {
        config(['legal_policy.rules.LOI.reasons' => ['Request explanation'], 'legal_policy.rules.LOI.legal_bases' => ['RA 7581']]);
        $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $this->record->id, 'notice_type' => 'LOI', 'item_ids' => collect($this->items)->pluck('id')->all()])
            ->assertCreated()->assertJsonPath('data.draft_payload.reason', null)->assertJsonPath('data.draft_payload.legal_bases', [])->assertJsonPath('data.policy.derived', null);
    }

    public function test_legacy_notice_stays_hidden_even_with_an_audience(): void
    {
        $legacy = LegalNotice::create(['store_id' => $this->store->id, 'vendor_user_id' => $this->vendor->id, 'notice_type' => 'LOI', 'status' => 'issued', 'issued_at' => now(), 'delivery_state' => 'received']);
        $this->asVendor()->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
        $this->asVendor()->getJson("/api/vendor/notices/{$legacy->id}")->assertForbidden();
        $this->asVendor()->getJson('/api/vendor/overview')->assertJsonPath('data.stores.0.open_notice_count', 0);
    }

    public function test_values_too_long_for_the_printed_form_are_refused(): void
    {
        $draft = $this->draft($this->record, $this->items, 'LOI', ['intended_delivery_method' => 'portal']);
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['recipient_name' => str_repeat('N', 71)])->assertUnprocessable();
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$draft", ['address' => str_repeat('A', 141)])->assertUnprocessable();
        // A long address prefilled from the store record is caught at issue.
        $notice = LegalNotice::find($draft);
        $notice->update(['draft_payload' => ['address' => str_repeat('A', 200)] + $notice->draft_payload]);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$draft/issue", ['confirmed' => true])->assertUnprocessable();
    }

    public function test_receipt_past_the_holiday_calendar_is_not_dated_until_the_calendar_covers_it(): void
    {
        $id = $this->issue('LOI', 'portal');
        LegalNotice::find($id)->update(['deadline_rules' => ['calendar_valid_until' => '2026-09-29'] + LegalNotice::find($id)->deadline_rules]);
        config(['legal_policy.calendar_valid_until' => '2026-09-29']);

        // Not served unreceived: nobody could answer it, and staff cannot record a portal receipt.
        $this->asVendor()->getJson("/api/vendor/notices/$id/document")->assertConflict()->assertJsonPath('status', 'CALENDAR_REVIEW_REQUIRED');
        $this->assertSame('not_recorded', LegalNotice::find($id)->delivery_state);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/delivery", ['state' => 'received', 'recorded_at' => now()->toIso8601String()])
            ->assertConflict()->assertJsonPath('status', 'PORTAL_RECEIPT_ONLY');

        // Once the calendar is extended (and a holiday proclaimed since issue), the deadline counts it.
        config(['legal_policy.calendar_valid_until' => '2027-12-31', 'legal_policy.non_working_dates' => ['2026-09-30']]);
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        // Mon 28 Sep + 3 working days, skipping the newly proclaimed Wed 30 Sep = Fri 2 Oct.
        $this->assertSame('2026-10-02', LegalNotice::find($id)->due_date_timestamp->timezone('Asia/Manila')->toDateString());
    }

    public function test_withdrawn_notice_stays_visible_to_its_vendor_and_cannot_be_answered(): void
    {
        $id = $this->issue('LOI', 'portal');
        $this->asVendor()->get("/api/vendor/notices/$id/document")->assertOk();
        // A notice that left DTI needs a stated reason to be withdrawn; the vendor sees it.
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/cancel")->assertUnprocessable();
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/cancel", ['outcome_reason' => 'Issued to the wrong branch.'])->assertOk();

        $this->asVendor()->getJson('/api/vendor/notices')->assertOk()->assertJsonPath('0.status', 'cancelled')
            ->assertJsonPath('0.outcome', 'withdrawn')->assertJsonPath('0.outcome_reason', 'Issued to the wrong branch.');
        $this->asVendor()->getJson("/api/vendor/conversations/{$this->store->id}")->assertJsonPath('data.notices.0.cancelled_at', fn ($value) => $value !== null);
        $this->asVendor()->postJson("/api/vendor/notices/$id/response", ['reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'Our distributor raised prices this week.', 'certified_under_oath' => true])->assertConflict();
    }

    public function test_legacy_notice_cannot_be_answered_through_the_portal(): void
    {
        $legacy = LegalNotice::create(['store_id' => $this->store->id, 'vendor_user_id' => $this->vendor->id, 'notice_type' => 'LOI', 'status' => 'issued', 'issued_at' => now(), 'delivery_state' => 'received', 'delivered_at' => now(), 'due_date_timestamp' => now()->addDay()]);
        $this->asVendor()->postJson("/api/vendor/notices/{$legacy->id}/response", ['reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'Our distributor raised prices this week.', 'certified_under_oath' => true])->assertForbidden();
        $this->assertSame('issued', $legacy->fresh()->status);
    }

    public function test_loi_is_ready_without_a_legal_basis_but_sco_needs_one(): void
    {
        $loi = $this->draft($this->record, $this->items, 'LOI', ['intended_delivery_method' => 'portal', 'legal_bases' => []]);
        $this->asAdmin()->getJson("/api/admin/legal-notices/$loi")->assertJsonPath('data.readiness.notice_type_and_basis', true);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/cancel")->assertOk();
        $sco = $this->escalatedSco(['intended_delivery_method' => 'portal', 'legal_bases' => []]);
        $this->asAdmin()->getJson("/api/admin/legal-notices/$sco")->assertJsonPath('data.readiness.notice_type_and_basis', false);
    }

    /** An LOI issued before portal-only delivery: the method is rewritten the way such rows exist in production. */
    private function legacyHandCopy(): int
    {
        $id = $this->issue('LOI', 'portal');
        LegalNotice::find($id)->update(['intended_delivery_method' => 'hand_copy']);
        return $id;
    }

    /** An SCO draft reached the only standard way: an answered LOI escalated (owner decision D1). */
    private function escalatedSco(array $changes = []): int
    {
        $loi = $this->issue('LOI', 'portal');
        $this->asVendor()->get("/api/vendor/notices/$loi/document")->assertOk();
        $this->asVendor()->postJson("/api/vendor/notices/$loi/response", ['reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'Our distributor raised prices this week.', 'certified_under_oath' => true])->assertOk();
        $sco = $this->asAdmin()->postJson("/api/admin/legal-notices/$loi/escalate")->assertCreated()->json('data.id');
        if ($changes) $this->asAdmin()->patchJson("/api/admin/legal-notices/$sco", $changes)->assertOk();
        return $sco;
    }

    /** A close payload deciding every cited item the way the outcome requires. */
    private function closing(int $id, string $outcome): array
    {
        $decision = $outcome === 'violation_confirmed' ? 'confirmed' : 'not_confirmed';
        return ['outcome' => $outcome, 'outcome_reason' => 'Reviewed the response and evidence.',
            'item_decisions' => collect(LegalNotice::find($id)->source_snapshot['items'])->map(fn ($item) => ['item_id' => $item['id'], 'decision' => $decision])->all()];
    }

    private function issue(string $type, string $method): int
    {
        $id = $this->draft($this->record, $this->items, $type, ['intended_delivery_method' => $method]);
        $this->asAdmin()->postJson("/api/admin/legal-notices/$id/issue", ['confirmed' => true])->assertOk()->assertJsonPath('data.status', 'issued');
        return $id;
    }

    private function draft(MonitoringRecord $record, array $items, string $type, array $changes): int
    {
        $id = $this->asAdmin()->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => $type, 'item_ids' => collect($items)->pluck('id')->all()])
            ->assertCreated()->json('data.id');
        $this->asAdmin()->patchJson("/api/admin/legal-notices/$id", $changes + [
            'reason' => 'Prices above SRP', 'legal_bases' => ['RA 7581 (Price Act)'], 'address' => 'San Jose, Antique', 'internal_justification' => 'Reviewed.',
        ])->assertOk();
        return $id;
    }

    private function visit(Store $store, int $seed = 1): array
    {
        $record = MonitoringRecord::create([
            'client_uuid' => sprintf('10000000-0000-4000-8000-%012d', $seed), 'officer_user_id' => $this->admin->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHour(), 'finalized_at' => now(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Store Representative', 'representative_title' => 'Manager',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'representative.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);
        $items = collect(['Rice', 'Milk'])->map(function (string $name, int $index) use ($record, $seed) {
            $bulletin = SrpBulletin::create(['commodity_name' => "$name $seed", 'baseline_price' => 50 + $index, 'effective_date' => '2026-01-01', 'is_active' => true]);
            return MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 62 + $index,
                'baseline_price' => 50 + $index, 'variance_percent' => 24, 'is_anomaly' => true,
                'reference_status' => 'available', 'reference_type' => 'standard_srp', 'reference_label' => 'Captured SRP',
                'reference_value' => 50 + $index, 'reference_source' => 'DTI-2026', 'reference_effective_date' => '2026-01-01',
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
