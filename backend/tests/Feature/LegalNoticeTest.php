<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\LegalNotice;
use App\Models\LegalNoticeAttachment;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LegalNoticeTest extends TestCase
{
    use RefreshDatabase;

    public const DEADLINE_RULES = [
        'policy_version' => 'test', 'response_period' => ['unit' => 'hours', 'value' => 48], 'deadline_anchor' => 'received',
        'timezone' => 'Asia/Manila', 'working_weekdays' => [1, 2, 3, 4, 5], 'non_working_dates' => [],
    ];

    private User $dtiUser;
    private User $vendorUser;
    private Store $store;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dtiUser = User::create(['name' => 'DTI Officer', 'email' => 'officer@dti.gov.ph', 'password' => bcrypt('password123'), 'role' => 'dti_evaluator']);
        $this->vendorUser = User::create(['name' => 'Maria Clara', 'email' => 'vendor@grocery.com', 'password' => bcrypt('password123'), 'role' => 'vendor']);
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-12345', 'store_name' => 'Antique Grocery Mart', 'owner_name' => 'Maria Clara',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'address' => 'San Jose, Antique', 'recidivism_index' => 0,
            'vendor_user_id' => $this->vendorUser->id,
        ]);
        $this->bulletin = SrpBulletin::create(['commodity_name' => 'Regular Milled Rice', 'baseline_price' => 38.00, 'effective_date' => '2026-07-15', 'is_active' => true]);

        Storage::fake(LegalNotice::DOCUMENT_DISK);
        Cache::forget('state_of_calamity');
    }

    public function test_legacy_dispatch_routes_are_removed_and_create_nothing()
    {
        Cache::put('state_of_calamity', true);
        $this->store->update(['recidivism_index' => 1]);

        $this->actingAs($this->dtiUser, 'sanctum')->postJson('/api/notices/dispatch', [
            'store_id' => $this->store->id, 'srp_id' => $this->bulletin->id, 'recorded_price' => 45.00, 'recorded_date' => '2026-07-18',
        ])->assertNotFound();

        $this->assertSame(0, LegalNotice::count());
        $this->assertEquals(1, $this->store->fresh()->recidivism_index);
    }

    public function test_old_vendor_notice_routes_are_removed()
    {
        $notice = $this->notice();
        $this->asVendor($this->vendorUser)->getJson('/api/notices')->assertNotFound();
        $this->asVendor($this->vendorUser)->postJson("/api/notices/{$notice->id}/rebuttal", $this->payload())->assertNotFound();
    }

    public function test_vendor_lists_notice_with_flagged_items_but_no_internal_fields()
    {
        $this->notice(['internal_justification' => 'Internal only']);

        $this->asVendor($this->vendorUser)->getJson('/api/vendor/notices')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.flagged_items.0.commodity_name', 'Regular Milled Rice')
            ->assertJsonPath('0.flagged_items.0.reference_value', 38)
            ->assertJsonPath('0.monitoring_date', '2026-09-10T02:00:00+00:00')
            ->assertJsonMissingPath('0.internal_justification')
            ->assertJsonMissingPath('0.source_snapshot')
            ->assertJsonMissingPath('0.flagged_items.0.reference_source');
    }

    public function test_vendor_submits_response_with_reason_oath_and_categorized_attachment()
    {
        $notice = $this->notice();

        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertOk()
            ->assertJsonPath('notice.status', 'response_received')
            ->assertJsonPath('notice.response_reason_category', 'WHOLESALE_HIKE')
            ->assertJsonPath('notice.attachments.0.category', 'WHOLESALER_INVOICE');

        $notice->refresh();
        $this->assertSame('response_received', $notice->status);
        $this->assertNotNull($notice->response_certified_at);
        $attachment = LegalNoticeAttachment::where('legal_notice_id', $notice->id)->sole();
        $this->assertSame(LegalNotice::DOCUMENT_DISK, $attachment->disk);
        $this->assertSame('WHOLESALER_INVOICE', $attachment->category);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists($attachment->path);
        $this->assertDatabaseHas('audit_events', ['action' => 'vendor.response_submitted', 'subject_id' => $notice->id]);
    }

    public function test_response_requires_reason_oath_text_and_matching_categories()
    {
        $notice = $this->notice();
        $vendor = $this->asVendor($this->vendorUser);
        $url = "/api/vendor/notices/{$notice->id}/response";

        $vendor->postJson($url, $this->payload(['reason_category' => null]))->assertUnprocessable()->assertJsonValidationErrors('reason_category');
        $vendor->postJson($url, $this->payload(['reason_category' => 'Wholesale increase']))->assertUnprocessable()->assertJsonValidationErrors('reason_category');
        $vendor->postJson($url, $this->payload(['certified_under_oath' => false]))->assertUnprocessable()->assertJsonValidationErrors('certified_under_oath');
        $vendor->postJson($url, $this->payload(['response_text' => 'Too short']))->assertUnprocessable()->assertJsonValidationErrors('response_text');
        $vendor->postJson($url, $this->payload(['attachment_categories' => []]))->assertUnprocessable()->assertJsonValidationErrors('attachment_categories');
        $vendor->postJson($url, $this->payload(['attachment_categories' => ['RECEIPT']]))->assertUnprocessable()->assertJsonValidationErrors('attachment_categories.0');

        $this->assertSame('issued', $notice->fresh()->status);
        $this->assertSame(0, LegalNoticeAttachment::count());
    }

    public function test_attachment_categories_must_pair_with_contiguous_attachment_lists()
    {
        $notice = $this->notice();

        $this->asVendor($this->vendorUser)->post("/api/vendor/notices/{$notice->id}/response", [
            'reason_category' => 'WHOLESALE_HIKE',
            'response_text' => 'Our distributor raised wholesale prices this week.',
            'certified_under_oath' => '1',
            'attachments' => [3 => UploadedFile::fake()->create('invoice.pdf', 100, 'application/pdf')],
            'attachment_categories' => [3 => 'WHOLESALER_INVOICE'],
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['attachments', 'attachment_categories']);

        $this->assertSame(0, LegalNoticeAttachment::count());
        $this->assertCount(0, Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
        $this->assertSame('issued', $notice->fresh()->status);
    }

    public function test_draft_notice_cannot_be_closed_and_unissued_notices_stay_hidden_from_vendors()
    {
        $draft = $this->notice(['status' => 'draft', 'issued_at' => null, 'delivery_state' => 'not_recorded', 'delivered_at' => null, 'due_date_timestamp' => null, 'control_number' => null]);

        Sanctum::actingAs($this->dtiUser);
        $this->postJson("/api/admin/legal-notices/{$draft->id}/close", ['outcome' => 'explanation_accepted', 'outcome_reason' => 'Explanation reviewed and accepted.'])->assertStatus(409);
        $this->assertSame('draft', $draft->fresh()->status);

        // A closed record that was never issued (e.g. legacy data) is not shown to the vendor either.
        $draft->forceFill(['status' => 'closed'])->save();
        $this->asVendor($this->vendorUser)->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
        $this->asVendor($this->vendorUser)->getJson("/api/vendor/notices/{$draft->id}")->assertNotFound();
    }

    public function test_response_returns_503_when_legal_document_storage_is_unavailable()
    {
        $notice = $this->notice();
        // A disk whose writes fail, built with the real legal_documents disk options (throw/report).
        $adapter = new class(storage_path('framework/testing/offline-legal-documents')) extends \League\Flysystem\Local\LocalFilesystemAdapter {
            public function write(string $path, string $contents, \League\Flysystem\Config $config): void
            {
                throw \League\Flysystem\UnableToWriteFile::atLocation($path, 'storage offline');
            }

            public function writeStream(string $path, $contents, \League\Flysystem\Config $config): void
            {
                throw \League\Flysystem\UnableToWriteFile::atLocation($path, 'storage offline');
            }
        };
        Storage::set(LegalNotice::DOCUMENT_DISK, new \Illuminate\Filesystem\FilesystemAdapter(
            new \League\Flysystem\Filesystem($adapter), $adapter, config('filesystems.disks.'.LegalNotice::DOCUMENT_DISK)
        ));

        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertStatus(503)
            ->assertJsonFragment(['message' => 'Private response storage is unavailable.']);

        $this->assertSame(0, LegalNoticeAttachment::count());
        $this->assertSame('issued', $notice->fresh()->status);
        $this->assertNull($notice->fresh()->response_text);
    }

    public function test_second_response_is_rejected_without_adding_attachments()
    {
        $notice = $this->notice();
        $url = "/api/vendor/notices/{$notice->id}/response";

        $this->asVendor($this->vendorUser)->postJson($url, $this->payload())->assertOk();
        $this->asVendor($this->vendorUser)->postJson($url, $this->payload(['response_text' => 'A second, conflicting explanation text.']))
            ->assertStatus(409)->assertJsonPath('status', 'NOTICE_NOT_RESPONDABLE');

        $this->assertSame(1, LegalNoticeAttachment::count());
        $this->assertCount(1, Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
        $this->assertSame('Our distributor raised wholesale prices this week.', $notice->fresh()->response_text);
    }

    public function test_response_after_admin_close_is_rejected()
    {
        $notice = $this->notice();
        Sanctum::actingAs($this->dtiUser);
        $this->postJson("/api/admin/legal-notices/{$notice->id}/close", ['outcome' => 'explanation_accepted', 'outcome_reason' => 'Explanation reviewed and accepted.'])->assertOk();

        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertStatus(409)->assertJsonPath('status', 'NOTICE_NOT_RESPONDABLE');
        $this->assertSame('closed', $notice->fresh()->status);
        $this->assertNull($notice->fresh()->response_text);
    }

    public function test_admin_close_after_response_keeps_the_response()
    {
        $notice = $this->notice();
        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())->assertOk();

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->dtiUser);
        $this->postJson("/api/admin/legal-notices/{$notice->id}/close", ['outcome' => 'explanation_accepted', 'outcome_reason' => 'Explanation reviewed and accepted.'])->assertOk();
        $this->postJson("/api/admin/legal-notices/{$notice->id}/close", ['outcome' => 'explanation_accepted', 'outcome_reason' => 'Explanation reviewed and accepted.'])->assertStatus(409);

        $notice->refresh();
        $this->assertSame('closed', $notice->status);
        $this->assertSame('WHOLESALE_HIKE', $notice->response_reason_category);
    }

    public function test_response_after_store_is_unlinked_is_denied_without_files()
    {
        $notice = $this->notice();
        $vendor = $this->asVendor($this->vendorUser);
        $this->store->forceFill(['vendor_user_id' => null])->save();

        $vendor->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertForbidden()->assertJsonPath('status', 'NOTICE_ACCESS_DENIED');
        $this->assertSame(0, LegalNoticeAttachment::count());
        $this->assertCount(0, Storage::disk(LegalNotice::DOCUMENT_DISK)->allFiles());
        $this->assertSame('issued', $notice->fresh()->status);
    }

    public function test_vendor_cannot_access_or_respond_to_another_vendors_notice()
    {
        $otherVendor = User::create(['name' => 'Other Vendor', 'email' => 'other@grocery.com', 'password' => bcrypt('password123'), 'role' => 'vendor']);
        $notice = $this->notice();

        $this->asVendor($otherVendor)->getJson("/api/vendor/notices/{$notice->id}")->assertForbidden()->assertJsonPath('status', 'NOTICE_ACCESS_DENIED');
        $this->asVendor($otherVendor)->getJson("/api/vendor/notices/{$notice->id}/document")->assertForbidden();
        $this->asVendor($otherVendor)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())->assertForbidden();
        $this->assertSame('issued', $notice->fresh()->status);
    }

    public function test_namesake_owner_without_a_link_cannot_see_store_notices()
    {
        $namesakeStore = Store::create(['store_name' => 'Other Mart', 'owner_name' => 'Maria Clara', 'latitude' => 10, 'longitude' => 121, 'address' => 'Antique']);
        $notice = $this->notice(['store_id' => $namesakeStore->id, 'control_number' => 'PM-2026-LOI-000002']);

        $this->asVendor($this->vendorUser)->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
        $this->asVendor($this->vendorUser)->getJson("/api/vendor/notices/{$notice->id}")->assertForbidden();
    }

    public function test_response_after_deadline_fails_with_expiry_code()
    {
        $notice = $this->notice(['delivered_at' => now()->subDay(), 'due_date_timestamp' => now()->subHour()]);

        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertForbidden()
            ->assertJsonPath('status', 'RESPONSE_PERIOD_EXPIRED')
            ->assertJsonFragment(['message' => 'The response period has expired.']);
    }

    public function test_response_before_delivery_is_recorded_is_rejected()
    {
        $notice = $this->notice(['delivery_state' => 'not_recorded', 'delivered_at' => null, 'due_date_timestamp' => null]);

        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())
            ->assertStatus(409)->assertJsonPath('status', 'NOTICE_NOT_RESPONDABLE');
    }

    public function test_legacy_wildcard_token_cannot_use_vendor_routes()
    {
        $this->notice();
        $token = $this->vendorUser->createToken('auth_token', ['*'])->plainTextToken;

        $this->withToken($token)->getJson('/api/vendor/notices')->assertForbidden()->assertJsonPath('status', 'VENDOR_ACCESS_REVOKED');
    }

    public function test_vendor_opens_official_document_and_admin_downloads_response_attachment()
    {
        $notice = $this->notice(['pdf_disk' => LegalNotice::DOCUMENT_DISK, 'pdf_file_path' => 'legal-notices/1/notice.pdf']);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->put('legal-notices/1/notice.pdf', '%PDF-1.4 test');
        $this->asVendor($this->vendorUser)->get("/api/vendor/notices/{$notice->id}/document")->assertOk();
        $this->asVendor($this->vendorUser)->postJson("/api/vendor/notices/{$notice->id}/response", $this->payload())->assertOk();
        $attachment = LegalNoticeAttachment::sole();
        $otherNotice = $this->notice(['control_number' => 'PM-2026-LOI-000003']);

        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->dtiUser);
        $this->get("/api/admin/legal-notices/{$notice->id}/attachments/{$attachment->id}")->assertOk();
        $this->get("/api/admin/legal-notices/{$otherNotice->id}/attachments/{$attachment->id}")->assertNotFound();
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.attachment_accessed', 'subject_id' => $notice->id]);
    }

    private function asVendor(User $user): static
    {
        $this->app['auth']->forgetGuards();
        return $this->withToken($user->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken);
    }

    private function notice(array $overrides = []): LegalNotice
    {
        return LegalNotice::create(array_merge([
            'store_id' => $this->store->id, 'vendor_user_id' => $this->vendorUser->id, 'deadline_rules' => self::DEADLINE_RULES,
            'notice_type' => 'LOI', 'control_number' => 'PM-2026-LOI-000001', 'status' => 'issued',
            'issued_at' => now()->subDay(), 'delivery_state' => 'received', 'delivered_at' => now()->subHour(), 'due_date_timestamp' => now()->addDay(),
            'source_snapshot' => [
                'monitoring_date' => '2026-09-10T02:00:00+00:00',
                'items' => [[
                    'id' => 1, 'commodity_name' => 'Regular Milled Rice', 'unit' => 'kg', 'observed_price' => 45, 'reference_value' => 38,
                    'reference_label' => 'SRP baseline (provisional)', 'reference_source' => 'internal-source', 'variance_percent' => 18.42,
                ]],
            ],
        ], $overrides));
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'reason_category' => 'WHOLESALE_HIKE',
            'response_text' => 'Our distributor raised wholesale prices this week.',
            'certified_under_oath' => true,
            'attachments' => [UploadedFile::fake()->create('invoice.pdf', 100, 'application/pdf')],
            'attachment_categories' => ['WHOLESALER_INVOICE'],
        ], $overrides);
    }
}
