<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\AuditEvent;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use App\Services\Admin\LegalPolicyService;
use Database\Seeders\EstablishmentVendorSeeder;
use Database\Seeders\OfficialEstablishmentSeeder;
use Database\Seeders\SrpMasterListSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EstablishmentVendorSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        config(['legal_policy.rules.LOI.signatory.name' => null, 'legal_policy.rules.SCO.signatory.name' => null]);
    }

    public function test_seeder_populates_all_ten_establishments_with_active_vendor_accounts(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->seed(EstablishmentVendorSeeder::class);

        $stores = Store::where('is_active', true)->where('is_verified', true)->get();
        $this->assertCount(10, $stores);

        foreach ($stores as $store) {
            $this->assertNotNull($store->vendor_user_id, "Store {$store->store_name} should have a linked vendor");
            $this->assertNotNull($store->owner_name, "Store {$store->store_name} should have an owner_name");
            $this->assertNotNull($store->current_representative_name, "Store {$store->store_name} should have a current_representative_name");
            $this->assertNotNull($store->current_representative_title, "Store {$store->store_name} should have a current_representative_title");

            $vendor = User::find($store->vendor_user_id);
            $this->assertNotNull($vendor);
            $this->assertSame('vendor', $vendor->role);
            $this->assertTrue($vendor->is_active);
            $this->assertTrue(Hash::check('password123', $vendor->password));

            // Accepted invitation exists
            $this->assertDatabaseHas('vendor_invitations', [
                'store_id' => $store->id,
                'email' => $vendor->email,
                'status' => 'accepted',
            ]);
        }

        // Verify HARO MART links to demo vendor@grocery.com
        $haro = Store::where('store_name', 'HARO MART')->firstOrFail();
        $this->assertSame('Haro Mart Enterprises', $haro->owner_name);
        $haroVendor = User::find($haro->vendor_user_id);
        $this->assertSame('vendor@grocery.com', $haroVendor->email);
        $this->assertSame('Maria Clara Santos', $haroVendor->name);
        $this->assertSame('Owner', $haro->current_representative_title);

        // Verify signatories were seeded and policy is available
        $policy = app(LegalPolicyService::class);
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('LOI')['status']);
        $this->assertSame('LEGAL_POLICY_AVAILABLE', $policy->availability('SCO')['status']);
    }

    public function test_seeder_reconciles_existing_unissued_drafts(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $haro = Store::where('store_name', 'HARO MART')->firstOrFail();

        // Create an unissued draft notice before vendor was linked
        $evaluator = User::create([
            'name' => 'Evaluator',
            'email' => 'eval@dti.test',
            'password' => 'password',
            'role' => 'dti_evaluator',
        ]);

        $staleDraft = LegalNotice::create([
            'store_id' => $haro->id,
            'notice_type' => 'LOI',
            'prepared_by' => $evaluator->id,
            'status' => 'draft',
            'intended_delivery_method' => 'portal',
            'delivery_state' => 'not_recorded',
            'draft_payload' => [
                'recipient_name' => null,
                'recipient_email' => null,
                'linked_vendor_user_id' => null,
                'registered_owner_name' => null,
            ],
            'source_snapshot' => ['items' => []],
        ]);

        // Run seeder
        $this->seed(EstablishmentVendorSeeder::class);

        $staleDraft->refresh();
        $this->assertSame($haro->fresh()->vendor_user_id, $staleDraft->draft_payload['linked_vendor_user_id']);
        $this->assertSame('Haro Mart Enterprises', $staleDraft->draft_payload['registered_owner_name']);
        $this->assertSame('Haro Mart Enterprises', $staleDraft->draft_payload['recipient_name']);
        $this->assertSame('vendor@grocery.com', $staleDraft->draft_payload['recipient_email']);
    }

    public function test_admin_can_issue_loi_without_portal_delivery_or_missing_field_errors(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->seed(EstablishmentVendorSeeder::class);

        $evaluator = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator',
        ]);

        $officer = User::create([
            'name' => 'DTI Officer',
            'email' => 'officer@dti.test',
            'password' => Hash::make('password123'),
            'role' => 'field_officer',
        ]);

        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Demo Coffee',
            'commodity_key' => 'coffee-demo',
            'category' => 'Beverages',
            'unit' => 'pack',
            'baseline_price' => 50.00,
            'effective_date' => '2026-08-01',
            'is_active' => true,
        ]);

        $haro = Store::where('store_name', 'HARO MART')->firstOrFail();

        $record = MonitoringRecord::create([
            'client_uuid' => 'demo-rec-001',
            'store_id' => $haro->id,
            'officer_user_id' => $officer->id,
            'status' => 'accepted',
            'started_at' => now()->subHours(2),
            'finalized_at' => now()->subDay(),
            'received_at' => now()->subDay(),
            'latitude' => 10.7635,
            'longitude' => 121.9315,
            'location_accuracy_meters' => 5.0,
            'location_captured_at' => now()->subDay(),
            'protocol_mode' => 'routine',
            'representative_name' => 'Store Rep',
            'representative_title' => 'Manager',
            'officer_signature_disk' => 'local',
            'officer_signature_path' => 'officer.sig',
            'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local',
            'representative_signature_path' => 'representative.sig',
            'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);

        $item = MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id,
            'srp_id' => $bulletin->id,
            'recorded_price' => 65.00,
            'baseline_price' => 50.00,
            'reference_value' => 50.00,
            'reference_type' => 'standard_srp',
            'reference_label' => 'Captured SRP',
            'reference_status' => 'available',
            'variance_percent' => 30.00,
            'is_anomaly' => true,
        ]);

        // Draft an LOI
        $draftResponse = $this->actingAs($evaluator, 'sanctum')->postJson('/api/admin/legal-notices', [
            'monitoring_record_id' => $record->id,
            'notice_type' => 'LOI',
            'item_ids' => [$item->id],
        ]);

        $draftResponse->assertCreated();
        $noticeId = $draftResponse->json('data.id');

        // Check draft payload has recipient_name and email automatically populated
        $this->assertSame('Haro Mart Enterprises', $draftResponse->json('data.draft_payload.recipient_name'));
        $this->assertSame('vendor@grocery.com', $draftResponse->json('data.draft_payload.recipient_email'));

        // Complete required draft fields
        $this->actingAs($evaluator, 'sanctum')->patchJson("/api/admin/legal-notices/{$noticeId}", [
            'reason' => 'Prices above SRP',
            'legal_bases' => ['RA 7581 (Price Act)'],
            'internal_justification' => 'Verified price anomaly.',
        ])->assertOk();

        // Issue notice as evaluator
        $issueResponse = $this->actingAs($evaluator, 'sanctum')->postJson("/api/admin/legal-notices/{$noticeId}/issue", [
            'confirmed' => true,
            'apply_signature' => false,
        ]);

        $issueResponse->assertOk();
        $this->assertSame('issued', $issueResponse->json('data.status'));
        $this->assertNotNull($issueResponse->json('data.control_number'));

        // Verify PDF was generated and stored on the document disk
        $notice = LegalNotice::findOrFail($noticeId);
        $this->assertSame('issued', $notice->status);
        $this->assertNotNull($notice->pdf_file_path);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists($notice->pdf_file_path);
    }

    public function test_store_communications_allows_messaging_linked_store(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->seed(EstablishmentVendorSeeder::class);

        $evaluator = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator',
        ]);

        $haro = Store::where('store_name', 'HARO MART')->firstOrFail();

        $response = $this->actingAs($evaluator, 'sanctum')->postJson("/api/admin/conversations/{$haro->id}/messages", [
            'body' => 'Notice regarding SRP monitoring findings.',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('store_messages', [
            'store_id' => $haro->id,
            'sender_side' => 'dti',
            'vendor_user_id' => $haro->vendor_user_id,
        ]);
    }

    public function test_vendor_can_login_and_view_store_in_vendor_portal(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->seed(EstablishmentVendorSeeder::class);

        // Vendor login
        $loginResponse = $this->postJson('/api/vendor/login', [
            'email' => 'vendor@grocery.com',
            'password' => 'password123',
        ]);

        $loginResponse->assertOk();
        $token = $loginResponse->json('token');
        $this->assertNotEmpty($token);

        // Vendor overview
        $overviewResponse = $this->withToken($token)->getJson('/api/vendor/overview');
        $overviewResponse->assertOk();
        $overviewResponse->assertJsonPath('data.user.email', 'vendor@grocery.com');

        $stores = $overviewResponse->json('data.stores');
        $this->assertNotEmpty($stores);
        $this->assertSame('HARO MART', $stores[0]['store_name']);
        $this->assertSame('Maria Clara Santos', $stores[0]['current_representative']['name']);
        $this->assertSame('Owner', $stores[0]['current_representative']['title']);
    }
}
