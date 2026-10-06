<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class VendorPortalTest extends TestCase
{
    use RefreshDatabase;

    private User $vendor;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->vendor = User::create(['name' => 'Shop Owner', 'email' => 'owner@shop.test', 'password' => 'correct-password', 'role' => 'vendor']);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_overview_derives_compliance_per_linked_store_only(): void
    {
        $sco = $this->store('A Show Cause Store', $this->vendor);
        $loi = $this->store('B Inquiry Store', $this->vendor);
        $clean = $this->store('C Clean Store', $this->vendor);
        $foreign = $this->store('Foreign Store', null, 'Shop Owner');
        $this->notice($sco, 'LOI', 'closed');
        $this->notice($sco, 'SCO', 'issued');
        $this->notice($loi, 'LOI', 'response_received');
        $this->notice($clean, 'LOI', 'closed');
        $this->notice($foreign, 'SCO', 'issued');
        $this->monitoringRecord($sco, '2026-09-01 03:00:00');

        $response = $this->asVendor()->getJson('/api/vendor/overview')->assertOk()
            ->assertJsonCount(3, 'data.stores')
            ->assertJsonPath('data.stores.0.compliance_status', 'SHOW_CAUSE_ISSUED')
            ->assertJsonPath('data.stores.1.compliance_status', 'UNDER_INQUIRY')
            ->assertJsonPath('data.stores.2.compliance_status', 'IN_GOOD_STANDING')
            ->assertJsonPath('data.stores.0.last_inspected_at', '2026-09-01T03:00:00+00:00')
            ->assertJsonPath('data.emergency', null);
        $this->assertNotContains('Foreign Store', collect($response->json('data.stores'))->pluck('store_name'));
    }

    public function test_last_inspection_is_the_latest_accepted_visit_even_after_a_later_superseded_visit(): void
    {
        $store = $this->store('Visit Store', $this->vendor);
        $this->monitoringRecord($store, '2026-09-01 03:00:00');
        $this->monitoringRecord($store, '2026-09-05 03:00:00')->update(['status' => 'superseded']);

        $this->asVendor()->getJson('/api/vendor/overview')->assertOk()
            ->assertJsonPath('data.stores.0.last_inspected_at', '2026-09-01T03:00:00+00:00');
        $this->assertSame('2026-09-01 03:00:00', $store->fresh()->latestMonitoringRecord->finalized_at->format('Y-m-d H:i:s'));
    }

    public function test_overview_reports_the_effective_emergency(): void
    {
        Carbon::setTestNow('2026-08-05 04:00:00');
        $this->emergency('active', '2026-08-01', null, 'DECL-ACTIVE');

        $this->asVendor()->getJson('/api/vendor/overview')->assertOk()
            ->assertJsonPath('data.emergency.declaration_reference', 'DECL-ACTIVE')
            ->assertJsonPath('data.emergency.starts_on', '2026-08-01');
    }

    public function test_srp_uses_standard_reference_outside_emergencies(): void
    {
        Carbon::setTestNow('2026-08-05 04:00:00');
        SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-07-01', 'is_active' => true, 'price_freeze_applicable' => true]);

        $this->asVendor()->getJson('/api/vendor/srp')->assertOk()
            ->assertJsonPath('data.protocol.mode', 'standard')
            ->assertJsonPath('data.items.0.reference.type', 'standard_srp')
            ->assertJsonPath('data.items.0.reference.status', 'available')
            ->assertJsonPath('data.items.0.reference.value', 50);
    }

    public function test_srp_resolves_covered_and_non_covered_products_during_emergency(): void
    {
        Carbon::setTestNow('2026-08-05 04:00:00');
        $emergency = $this->emergency('active', '2026-08-01', null, 'DECL-1');
        SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-07-01', 'is_active' => true, 'price_freeze_applicable' => true]);
        SrpBulletin::create(['commodity_name' => 'Soy Sauce', 'commodity_key' => 'soy-sauce', 'unit' => 'bottle', 'baseline_price' => 30, 'effective_date' => '2026-07-01', 'is_active' => true, 'price_freeze_applicable' => false]);
        SrpBulletin::create(['commodity_name' => 'Sugar', 'commodity_key' => 'sugar', 'unit' => 'kg', 'baseline_price' => 70, 'effective_date' => '2026-07-01', 'is_active' => true, 'price_freeze_applicable' => true]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC', 'authoritative_price' => 45,
            'effective_from' => '2026-08-01', 'location' => 'Antique', 'declaration_reference' => 'DECL-1', 'source_reference' => 'APC-1', 'created_by' => $this->admin->id,
        ]);

        $items = collect($this->asVendor()->getJson('/api/vendor/srp')->assertOk()->assertJsonPath('data.protocol.mode', 'emergency')->json('data.items'))->keyBy('commodity_name');

        $this->assertSame(['status' => 'available', 'type' => 'emergency_ceiling', 'value' => 45], array_intersect_key($items['Rice']['reference'], array_flip(['status', 'type', 'value'])));
        $this->assertSame(['status' => 'available', 'type' => 'standard_srp', 'value' => 30], array_intersect_key($items['Soy Sauce']['reference'], array_flip(['status', 'type', 'value'])));
        $this->assertSame(['status' => 'unavailable', 'type' => 'emergency_ceiling', 'value' => null], array_intersect_key($items['Sugar']['reference'], array_flip(['status', 'type', 'value'])));
    }

    public function test_srp_uses_the_manila_date_just_after_midnight(): void
    {
        // 16:30 UTC on 14 Sep is 00:30 on 15 Sep in Manila.
        Carbon::setTestNow('2026-09-14 16:30:00');
        SrpBulletin::create(['commodity_name' => 'Milk', 'commodity_key' => 'milk', 'unit' => 'can', 'baseline_price' => 40, 'effective_date' => '2026-09-14', 'is_active' => true]);
        $revision = SrpBulletin::create(['commodity_name' => 'Milk', 'commodity_key' => 'milk', 'unit' => 'can', 'baseline_price' => 42, 'effective_date' => '2026-09-15', 'is_active' => true]);

        $this->asVendor()->getJson('/api/vendor/srp')->assertOk()
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.id', $revision->id)
            ->assertJsonPath('data.items.0.reference.value', 42)
            ->assertJsonPath('data.items.0.reference.effective_date', '2026-09-15');
    }

    public function test_advisories_include_recent_emergencies_and_srp_updates_only(): void
    {
        Carbon::setTestNow('2026-09-14 04:00:00');
        $this->emergency('ended', '2026-08-01', '2026-08-20', 'DECL-RECENT');
        $this->emergency('ended', '2026-04-01', '2026-04-20', 'DECL-OLD');
        SrpBulletin::create(['commodity_name' => 'Rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-09-10', 'is_active' => true, 'source_reference' => 'SRP-BULLETIN-9']);
        SrpBulletin::create(['commodity_name' => 'Sugar', 'unit' => 'kg', 'baseline_price' => 70, 'effective_date' => '2026-09-10', 'is_active' => true, 'source_reference' => 'SRP-BULLETIN-9']);
        SrpBulletin::create(['commodity_name' => 'Old', 'unit' => 'kg', 'baseline_price' => 70, 'effective_date' => '2026-06-01', 'is_active' => true, 'source_reference' => 'SRP-OLD']);

        $data = collect($this->asVendor()->getJson('/api/vendor/advisories')->assertOk()->json('data'));

        $this->assertSame(['DECL-RECENT', 'SRP-BULLETIN-9'], $data->pluck('reference')->sort()->values()->all());
        $srp = $data->firstWhere('category', 'SRP_UPDATE');
        $this->assertCount(2, $srp['items']);
        $this->assertFalse($data->firstWhere('category', 'PRICE_FREEZE')['is_active']);
    }

    public function test_preferences_default_validate_and_persist_without_clobbering_other_preferences(): void
    {
        $this->vendor->forceFill(['preferences' => ['theme' => 'dark']])->save();
        $vendor = $this->asVendor();
        $vendor->getJson('/api/vendor/preferences')->assertOk()->assertJsonPath('data.email_address', 'owner@shop.test')->assertJsonPath('data.sms_enabled', false);

        $valid = [
            'sms_enabled' => true, 'sms_mobile_number' => '09171234567', 'email_enabled' => false, 'email_address' => '',
            'alert_on_loi' => true, 'alert_on_sco' => true, 'alert_deadline_24h' => false, 'alert_price_freeze' => true, 'alert_srp_bulletin' => true,
        ];
        $vendor->putJson('/api/vendor/preferences', ['sms_mobile_number' => '12345'] + $valid)->assertUnprocessable()->assertJsonValidationErrors('sms_mobile_number');
        $vendor->putJson('/api/vendor/preferences', ['sms_mobile_number' => ''] + $valid)->assertUnprocessable()->assertJsonValidationErrors('sms_mobile_number');
        $vendor->putJson('/api/vendor/preferences', $valid)->assertOk();

        $preferences = $this->vendor->fresh()->preferences;
        $this->assertSame('dark', $preferences['theme']);
        $this->assertSame('09171234567', $preferences['vendor_notifications']['sms_mobile_number']);
        $vendor->getJson('/api/vendor/preferences')->assertJsonPath('data.alert_deadline_24h', false);
    }

    public function test_advisory_emergency_state_uses_inclusive_manila_dates_and_srp_exposes_commodity_key(): void
    {
        // 04:00 UTC is 12:00 on 14 Sep in Manila.
        Carbon::setTestNow('2026-09-14 04:00:00');
        $this->emergency('ended', '2026-09-01', '2026-09-14', 'DECL-ENDS-TODAY');
        $this->emergency('ended', '2026-08-01', '2026-08-20', 'DECL-PAST');
        $this->emergency('active', '2026-09-20', null, 'DECL-FUTURE');
        SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-06-01', 'is_active' => true]);

        $data = collect($this->asVendor()->getJson('/api/vendor/advisories')->assertOk()->json('data'))->keyBy('reference');

        $this->assertSame(['in_effect', true], [$data['DECL-ENDS-TODAY']['state'], $data['DECL-ENDS-TODAY']['is_active']]);
        $this->assertSame(['ended', false], [$data['DECL-PAST']['state'], $data['DECL-PAST']['is_active']]);
        $this->assertSame(['scheduled', false], [$data['DECL-FUTURE']['state'], $data['DECL-FUTURE']['is_active']]);
        $this->asVendor()->getJson('/api/vendor/srp')->assertOk()->assertJsonPath('data.items.0.commodity_key', 'rice');
    }

    public function test_message_retry_is_idempotent_and_changed_content_or_target_conflicts(): void
    {
        $store = $this->store('Retry Store', $this->vendor);
        $other = $this->store('Other Store', $this->vendor);
        $payload = ['body' => 'Please review my explanation.', 'client_uuid' => 'a0000000-0000-4000-8000-000000000001'];
        $first = $this->asVendor()->postJson("/api/vendor/conversations/{$store->id}/messages", $payload)->assertCreated();
        $this->postJson("/api/vendor/conversations/{$store->id}/messages", $payload)->assertCreated()->assertJsonPath('data.id', $first->json('data.id'));
        $this->postJson("/api/vendor/conversations/{$store->id}/messages", array_replace($payload, ['body' => 'Different content']))->assertConflict()->assertJsonPath('status', 'IDEMPOTENCY_CONFLICT');
        $this->postJson("/api/vendor/conversations/{$other->id}/messages", $payload)->assertConflict()->assertJsonPath('status', 'IDEMPOTENCY_CONFLICT');
        $this->assertDatabaseCount('store_messages', 1);
        $this->assertDatabaseCount('vendor_submission_receipts', 1);
        $this->assertSame(1, \App\Models\AuditEvent::where('action', 'vendor.message_sent')->count());
    }

    public function test_response_retry_recovers_acceptance_after_deadline_without_duplicate_evidence(): void
    {
        \Illuminate\Support\Facades\Storage::fake(LegalNotice::DOCUMENT_DISK);
        $store = $this->store('Response Store', $this->vendor);
        $notice = $this->notice($store, 'LOI', 'issued');
        $notice->update(['due_date_timestamp' => now()->addHour()]);
        $payload = ['client_uuid' => 'a0000000-0000-4000-8000-000000000002', 'reason_category' => 'WHOLESALE_HIKE', 'response_text' => 'The distributor increased the wholesale price.', 'certified_under_oath' => true,
            'attachments' => [\Illuminate\Http\UploadedFile::fake()->create('receipt.pdf', 2, 'application/pdf')], 'attachment_categories' => ['DELIVERY_RECEIPT']];
        $this->asVendor()->postJson("/api/vendor/notices/{$notice->id}/response", $payload)->assertOk();
        Carbon::setTestNow(now()->addDays(2));
        $payload['attachments'] = [\Illuminate\Http\UploadedFile::fake()->create('receipt.pdf', 2, 'application/pdf')];
        $this->postJson("/api/vendor/notices/{$notice->id}/response", $payload)->assertOk()->assertJsonPath('notice.status', 'response_received');
        $this->assertSame(1, $notice->attachments()->count());
        $this->assertSame(1, \App\Models\AuditEvent::where('action', 'vendor.response_submitted')->count());
        $this->assertDatabaseCount('vendor_submission_receipts', 1);
    }

    public function test_retry_does_not_bypass_unlinking_or_account_deactivation(): void
    {
        $store = $this->store('Access Store', $this->vendor);
        $payload = ['body' => 'A pending message.', 'client_uuid' => 'a0000000-0000-4000-8000-000000000003'];
        $this->asVendor()->postJson("/api/vendor/conversations/{$store->id}/messages", $payload)->assertCreated();
        $store->update(['vendor_user_id' => null]);
        $this->postJson("/api/vendor/conversations/{$store->id}/messages", $payload)->assertForbidden();
        $store->update(['vendor_user_id' => $this->vendor->id]);
        $this->vendor->update(['is_active' => false]);
        $this->app['auth']->forgetGuards();
        $this->postJson("/api/vendor/conversations/{$store->id}/messages", $payload)->assertForbidden();
        $this->assertDatabaseCount('store_messages', 1);
    }

    public function test_background_conversation_preparation_does_not_mark_messages_read(): void
    {
        $store = $this->store('Unread Store', $this->vendor);
        $message = \App\Models\StoreMessage::create(['store_id' => $store->id, 'vendor_user_id' => $this->vendor->id, 'sender_id' => $this->admin->id, 'sender_side' => 'dti', 'body' => 'Please reply.']);
        $this->asVendor()->getJson("/api/vendor/conversations/{$store->id}?mark_read=0")->assertOk()->assertJsonPath('data.messages.0.read_at', null);
        $this->assertNull($message->fresh()->read_at);
        $this->getJson("/api/vendor/conversations/{$store->id}")->assertOk();
        $this->assertNotNull($message->fresh()->read_at);
    }

    public function test_attachment_retries_fingerprint_names_and_bytes_without_duplicate_uploads(): void
    {
        \Illuminate\Support\Facades\Storage::fake(LegalNotice::DOCUMENT_DISK);
        $store = $this->store('Attachment Store', $this->vendor);
        $payload = ['body' => 'See this invoice.', 'client_uuid' => 'a0000000-0000-4000-8000-000000000004'];
        $file = fn ($name, $bytes) => \Illuminate\Http\UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n$bytes\n%%EOF");
        $url = "/api/vendor/conversations/{$store->id}/messages";
        $first = $this->asVendor()->postJson($url, $payload + ['attachment' => $file('invoice.pdf', 'original')])->assertCreated();
        $this->postJson($url, $payload + ['attachment' => $file('invoice.pdf', 'original')])->assertCreated()->assertJsonPath('data.id', $first->json('data.id'));
        $this->postJson($url, $payload + ['attachment' => $file('invoice.pdf', 'changed')])->assertConflict()->assertJsonPath('status', 'IDEMPOTENCY_CONFLICT');
        $this->postJson($url, $payload + ['attachment' => $file('other-name.pdf', 'original')])->assertConflict();
        $this->assertDatabaseCount('store_messages', 1);
        $this->assertCount(1, \Illuminate\Support\Facades\Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
    }

    public function test_audit_failure_rolls_back_message_receipt_and_upload(): void
    {
        \Illuminate\Support\Facades\Storage::fake(LegalNotice::DOCUMENT_DISK);
        $store = $this->store('Audit Store', $this->vendor);
        $this->mock(\App\Services\Admin\AuditTrailService::class, fn ($mock) => $mock->shouldReceive('recordOrFail')->once()->andThrow(new \Illuminate\Http\Exceptions\HttpResponseException(response()->json(['status' => 'AUDIT_TRAIL_UNAVAILABLE'], 503))));
        $this->asVendor()->postJson("/api/vendor/conversations/{$store->id}/messages", [
            'body' => 'Must not commit.', 'client_uuid' => 'a0000000-0000-4000-8000-000000000005',
            'attachment' => \Illuminate\Http\UploadedFile::fake()->create('receipt.pdf', 2, 'application/pdf'),
        ])->assertStatus(503);
        $this->assertDatabaseCount('store_messages', 0);
        $this->assertDatabaseCount('vendor_submission_receipts', 0);
        $this->assertCount(0, \Illuminate\Support\Facades\Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
    }

    public function test_older_clients_can_still_submit_without_a_client_uuid(): void
    {
        $store = $this->store('Legacy Client Store', $this->vendor);
        $url = "/api/vendor/conversations/{$store->id}/messages";
        $this->asVendor()->postJson($url, ['body' => 'A legacy message.'])->assertCreated();
        $this->postJson($url, ['body' => 'A legacy message.'])->assertCreated();
        $this->assertDatabaseCount('store_messages', 2);
        $this->assertDatabaseCount('vendor_submission_receipts', 0);
    }

    private function asVendor(): static
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($this->vendor->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken);
    }

    private function store(string $name, ?User $vendor, string $owner = 'Owner'): Store
    {
        return Store::create(['store_name' => $name, 'owner_name' => $owner, 'latitude' => 10, 'longitude' => 121, 'address' => 'Antique', 'vendor_user_id' => $vendor?->id]);
    }

    private function notice(Store $store, string $type, string $status): LegalNotice
    {
        return LegalNotice::create(['store_id' => $store->id, 'vendor_user_id' => $store->vendor_user_id, 'deadline_rules' => LegalNoticeTest::DEADLINE_RULES, 'notice_type' => $type, 'status' => $status, 'issued_at' => now(), 'delivery_state' => 'received']);
    }

    private function monitoringRecord(Store $store, string $finalizedAt): MonitoringRecord
    {
        static $sequence = 0;
        $sequence++;
        return MonitoringRecord::create([
            'client_uuid' => sprintf('20000000-0000-4000-8000-%012d', $sequence), 'officer_user_id' => $this->admin->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => $finalizedAt, 'finalized_at' => $finalizedAt, 'received_at' => $finalizedAt,
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => $finalizedAt,
            'representative_name' => 'Owner', 'officer_signature_disk' => 'local', 'officer_signature_path' => 'a', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
        ]);
    }

    private function emergency(string $status, string $startsOn, ?string $endsOn, string $reference): RegulatoryEmergency
    {
        return RegulatoryEmergency::create([
            'location' => 'Antique', 'starts_on' => $startsOn, 'ends_on' => $endsOn, 'declaration_reference' => $reference, 'status' => $status,
            'active_scope_key' => $status === 'active' ? 'systemwide' : null, 'confirmed_at' => $startsOn.' 00:00:00', 'responsible_admin_id' => $this->admin->id,
        ]);
    }
}
