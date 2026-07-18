<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\LegalNotice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class LegalNoticeTest extends TestCase
{
    use RefreshDatabase;

    private User $dtiUser;
    private User $vendorUser;
    private Store $store;
    private SrpBulletin $bulletin;

    protected function setUp(): void
    {
        parent::setUp();

        // Seed Users
        $this->dtiUser = User::create([
            'name' => 'DTI Officer',
            'email' => 'officer@dti.gov.ph',
            'password' => bcrypt('password123'),
            'role' => 'field_officer',
        ]);

        $this->vendorUser = User::create([
            'name' => 'Maria Clara',
            'email' => 'vendor@grocery.com',
            'password' => bcrypt('password123'),
            'role' => 'vendor',
        ]);

        // Seed Store (owned by vendor name)
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'Antique Grocery Mart',
            'owner_name' => 'Maria Clara',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
            'recidivism_index' => 0,
        ]);

        // Seed Srp Bulletin
        $this->bulletin = SrpBulletin::create([
            'commodity_name' => 'Regular Milled Rice',
            'baseline_price' => 38.00,
            'effective_date' => '2026-07-15',
            'is_active' => true,
        ]);

        Storage::fake('public');
        Storage::fake('private');
        Cache::forget('state_of_calamity');
    }

    public function test_dispatches_loi_under_normal_market()
    {
        $response = $this->actingAs($this->dtiUser, 'sanctum')
            ->postJson('/api/notices/dispatch', [
                'store_id' => $this->store->id,
                'srp_id' => $this->bulletin->id,
                'recorded_price' => 45.00,
                'recorded_date' => '2026-07-18',
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('legal_notices', [
            'store_id' => $this->store->id,
            'notice_type' => 'LOI',
            'status' => 'issued',
        ]);

        // Verify PDF was written
        $notice = LegalNotice::first();
        Storage::disk('public')->assertExists($notice->pdf_file_path);
    }

    public function test_dispatches_sco_under_state_of_calamity()
    {
        Cache::put('state_of_calamity', true);

        $response = $this->actingAs($this->dtiUser, 'sanctum')
            ->postJson('/api/notices/dispatch', [
                'store_id' => $this->store->id,
                'srp_id' => $this->bulletin->id,
                'recorded_price' => 45.00,
                'recorded_date' => '2026-07-18',
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('legal_notices', [
            'store_id' => $this->store->id,
            'notice_type' => 'SCO',
        ]);

        // Recidivism index increment check
        $this->store->refresh();
        $this->assertEquals(1, $this->store->recidivism_index);
    }

    public function test_dispatches_sco_for_repeat_offenders()
    {
        // Set recidivism to 1
        $this->store->update(['recidivism_index' => 1]);

        $response = $this->actingAs($this->dtiUser, 'sanctum')
            ->postJson('/api/notices/dispatch', [
                'store_id' => $this->store->id,
                'srp_id' => $this->bulletin->id,
                'recorded_price' => 45.00,
                'recorded_date' => '2026-07-18',
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('legal_notices', [
            'store_id' => $this->store->id,
            'notice_type' => 'SCO',
        ]);

        // Escalates index again
        $this->store->refresh();
        $this->assertEquals(2, $this->store->recidivism_index);
    }

    public function test_vendor_can_upload_rebuttal_before_expiry()
    {
        $notice = LegalNotice::create([
            'store_id' => $this->store->id,
            'notice_type' => 'LOI',
            'pdf_file_path' => 'notices/test.pdf',
            'status' => 'issued',
            'due_date_timestamp' => now()->addHours(24), // 24 hours left
        ]);

        $file = UploadedFile::fake()->create('evidence.pdf', 100, 'application/pdf');

        $response = $this->actingAs($this->vendorUser, 'sanctum')
            ->postJson("/api/notices/{$notice->id}/rebuttal", [
                'rebuttal' => $file,
            ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('legal_notices', [
            'id' => $notice->id,
            'status' => 'rebutted',
        ]);
    }

    public function test_vendor_upload_rebuttal_fails_after_expiry_lockout()
    {
        $notice = LegalNotice::create([
            'store_id' => $this->store->id,
            'notice_type' => 'LOI',
            'pdf_file_path' => 'notices/test.pdf',
            'status' => 'issued',
            'due_date_timestamp' => now()->subHours(1), // expired 1 hour ago
        ]);

        $file = UploadedFile::fake()->create('evidence.pdf', 100, 'application/pdf');

        $response = $this->actingAs($this->vendorUser, 'sanctum')
            ->postJson("/api/notices/{$notice->id}/rebuttal", [
                'rebuttal' => $file,
            ]);

        $response->assertStatus(403);
        $response->assertJsonFragment([
            'message' => 'Action Forbidden (403): Rebuttal period has expired.'
        ]);
    }
}
