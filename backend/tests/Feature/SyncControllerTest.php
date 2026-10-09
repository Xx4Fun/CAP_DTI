<?php

namespace Tests\Feature;

use App\Models\MonitoringRecord;
use App\Models\User;
use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\TemporalInspection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SyncControllerTest extends TestCase {
    use RefreshDatabase;

    public function test_authenticated_user_can_downsync_stores_and_bulletins(): void {
        $user = User::create([
            'name' => 'Field Officer',
            'email' => 'officer@example.com',
            'password' => bcrypt('password'),
            'role' => 'field_officer'
        ]);

        $store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'Buenavista Groceries',
            'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose de Buenavista, Antique'
        ]);

        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Sardines',
            'baseline_price' => 25.00,
            'effective_date' => '2026-07-01',
            'is_active' => true
        ]);

        // Recent inspection (5 days ago) - should be included
        $recentInspection = TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $bulletin->id,
            'recorded_price' => 26.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(5)
        ]);

        // Old inspection (25 days ago) - should be excluded
        $oldInspection = TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $bulletin->id,
            'recorded_price' => 24.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(25)
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/sync/down');

        $response->assertStatus(200)
            ->assertJsonStructure(['stores', 'srp_bulletins', 'temporal_inspections'])
            ->assertJsonCount(1, 'temporal_inspections')
            ->assertJsonFragment(['recorded_price' => 26.00])
            ->assertJsonMissing(['recorded_price' => 24.00]);
    }

    public function test_unauthenticated_user_cannot_downsync_or_upsync(): void {
        $responseDown = $this->getJson('/api/sync/down');
        $responseDown->assertStatus(401);

        $responseUp = $this->postJson('/api/sync/up', [
            'inspections' => []
        ]);
        $responseUp->assertStatus(401);
    }

    public function test_client_with_invalid_role_receives_forbidden_status(): void {
        $vendor = User::create([
            'name' => 'Vendor User',
            'email' => 'vendor@example.com',
            'password' => bcrypt('password'),
            'role' => 'vendor'
        ]);

        Sanctum::actingAs($vendor);

        $responseDown = $this->getJson('/api/sync/down');
        $responseDown->assertStatus(403);

        $responseUp = $this->postJson('/api/sync/up', [
            'inspections' => []
        ]);
        $responseUp->assertStatus(403);
    }

    public function test_authenticated_user_can_upsync_inspections(): void {
        $user = User::create([
            'name' => 'Field Officer',
            'email' => 'officer@example.com',
            'password' => bcrypt('password'),
            'role' => 'field_officer'
        ]);

        $store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'Buenavista Groceries',
            'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose de Buenavista, Antique'
        ]);

        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Sardines',
            'baseline_price' => 25.00,
            'effective_date' => '2026-07-01',
            'is_active' => true
        ]);

        Sanctum::actingAs($user);

        $payload = [
            'inspections' => [
                [
                    'store_id' => $store->id,
                    'srp_id' => $bulletin->id,
                    'recorded_price' => 27.50,
                    'is_flagged' => false,
                    'inspection_timestamp' => '2026-07-17 12:00:00',
                    'officer_signature' => 'sig_officer_data',
                    'vendor_signature' => 'sig_vendor_data'
                ]
            ]
        ];

        $response = $this->postJson('/api/sync/up', $payload);

        $response->assertStatus(200)
            ->assertJson(['message' => 'Sync completed successfully']);

        $this->assertDatabaseHas('temporal_inspections', [
            'store_id' => $store->id,
            'srp_id' => $bulletin->id,
            'recorded_price' => 27.50,
            'is_flagged' => false,
            'officer_signature' => 'sig_officer_data',
            'vendor_signature' => 'sig_vendor_data'
        ]);
    }

    public function test_upsync_validation_requires_correct_data(): void {
        $user = User::create([
            'name' => 'Field Officer',
            'email' => 'officer@example.com',
            'password' => bcrypt('password'),
            'role' => 'field_officer'
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/sync/up', [
            'inspections' => [
                [
                    'store_id' => 999, // non-existent
                    'srp_id' => 999, // non-existent
                    'recorded_price' => 'not-numeric',
                    'is_flagged' => 'not-boolean',
                    'inspection_timestamp' => 'invalid-date'
                ]
            ]
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors([
                'inspections.0.store_id',
                'inspections.0.srp_id',
                'inspections.0.recorded_price',
                'inspections.0.is_flagged',
                'inspections.0.inspection_timestamp'
            ]);
    }

    public function test_inactive_bulletin_referenced_by_recent_inspection_is_included_in_downsync(): void {
        $user = User::create([
            'name' => 'Field Officer',
            'email' => 'officer@example.com',
            'password' => bcrypt('password'),
            'role' => 'field_officer'
        ]);

        $store = Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'Buenavista Groceries',
            'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose de Buenavista, Antique'
        ]);

        // 1. Inactive bulletin referenced by recent inspection (Should be included)
        $inactiveReferenced = SrpBulletin::create([
            'commodity_name' => 'Referenced Inactive Sardines',
            'baseline_price' => 20.00,
            'effective_date' => '2026-07-01',
            'is_active' => false
        ]);

        // Recent inspection using the referenced inactive bulletin
        TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $inactiveReferenced->id,
            'recorded_price' => 22.00,
            'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(5)
        ]);

        // 2. Inactive bulletin NOT referenced by any recent inspection (Should be excluded)
        $inactiveUnreferenced = SrpBulletin::create([
            'commodity_name' => 'Unreferenced Inactive Sardines',
            'baseline_price' => 18.00,
            'effective_date' => '2026-07-01',
            'is_active' => false
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/sync/down');

        $response->assertStatus(200);

        // Assert that the active bulletins and referenced inactive bulletins are returned, but unreferenced inactive are not.
        $bulletinIds = collect($response->json('srp_bulletins'))->pluck('id');
        $this->assertTrue($bulletinIds->contains($inactiveReferenced->id), 'Referenced inactive bulletin should be included.');
        $this->assertFalse($bulletinIds->contains($inactiveUnreferenced->id), 'Unreferenced inactive bulletin should not be included.');
    }

    private function officer(): User {
        return User::create([
            'name' => 'Field Officer', 'email' => 'officer@example.com',
            'password' => bcrypt('password'), 'role' => 'field_officer'
        ]);
    }

    private function groceries(): Store {
        return Store::create([
            'store_name' => 'Buenavista Groceries', 'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7410, 'longitude' => 121.9386, 'address' => 'San Jose de Buenavista, Antique'
        ]);
    }

    private function sardines(string $name = 'Sardines'): SrpBulletin {
        return SrpBulletin::create([
            'commodity_name' => $name, 'baseline_price' => 25.00,
            'effective_date' => '2026-07-01', 'is_active' => true
        ]);
    }

    /** Accepted field monitoring is signed evidence a notice may cite; this legacy route must not rewrite it. */
    public function test_upsync_cannot_overwrite_an_accepted_observation(): void {
        $store = $this->groceries();
        $bulletin = $this->sardines();
        $accepted = TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 100.00,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
            'officer_signature' => 'signed', 'validation_status' => 'verified',
        ]);

        Sanctum::actingAs($this->officer());

        $this->postJson('/api/sync/up', ['inspections' => [[
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 50.00,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
        ]]])->assertStatus(422)->assertJsonPath('status', 'OBSERVATION_ALREADY_ACCEPTED');

        $this->assertSame(100.0, (float) $accepted->fresh()->recorded_price);
        $this->assertSame('signed', $accepted->fresh()->officer_signature);
    }

    public function test_upsync_cannot_overwrite_a_monitoring_linked_observation(): void {
        $officer = $this->officer();
        $store = $this->groceries();
        $bulletin = $this->sardines();
        $record = MonitoringRecord::create([
            'client_uuid' => '20000000-0000-4000-8000-000000000001', 'officer_user_id' => $officer->id,
            'store_id' => $store->id, 'status' => 'accepted', 'started_at' => now()->subHour(),
            'finalized_at' => now(), 'received_at' => now(), 'latitude' => 10, 'longitude' => 121,
            'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Rep', 'sync_source' => 'online',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.sig',
            'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'representative.sig',
            'representative_signature_sha256' => str_repeat('b', 64),
        ]);
        // Still pending validation, but owned by an accepted visit: linkage alone protects it.
        $linked = TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 100.00,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
            'validation_status' => 'pending', 'monitoring_record_id' => $record->id,
        ]);

        Sanctum::actingAs($officer);

        $this->postJson('/api/sync/up', ['inspections' => [[
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 50.00,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
        ]]])->assertStatus(422)->assertJsonPath('status', 'OBSERVATION_ALREADY_ACCEPTED');

        $this->assertSame(100.0, (float) $linked->fresh()->recorded_price);
    }

    public function test_upsync_still_amends_its_own_unverified_unlinked_observation(): void {
        $store = $this->groceries();
        $bulletin = $this->sardines();
        $draft = TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 27.50,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
        ]);

        Sanctum::actingAs($this->officer());

        $this->postJson('/api/sync/up', ['inspections' => [[
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => 28.00,
            'is_flagged' => true, 'inspection_timestamp' => '2026-07-17 12:00:00',
        ]]])->assertStatus(200);

        $this->assertSame(28.0, (float) $draft->fresh()->recorded_price);
        $this->assertTrue((bool) $draft->fresh()->is_flagged);
        $this->assertSame(1, TemporalInspection::count());
    }

    /** One protected tuple rejects the batch: a partial write to evidence is worse than a failed sync. */
    public function test_upsync_rejects_the_whole_batch_when_one_tuple_is_protected(): void {
        $store = $this->groceries();
        $guarded = $this->sardines();
        $free = $this->sardines('Rice');
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $guarded->id, 'recorded_price' => 100.00,
            'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
            'validation_status' => 'verified',
        ]);

        Sanctum::actingAs($this->officer());

        $this->postJson('/api/sync/up', ['inspections' => [
            [
                'store_id' => $store->id, 'srp_id' => $free->id, 'recorded_price' => 55.00,
                'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
            ],
            [
                'store_id' => $store->id, 'srp_id' => $guarded->id, 'recorded_price' => 50.00,
                'is_flagged' => false, 'inspection_timestamp' => '2026-07-17 12:00:00',
            ],
        ]])->assertStatus(422);

        // The unprotected row in the same batch was rolled back with it.
        $this->assertDatabaseMissing('temporal_inspections', ['srp_id' => $free->id]);
    }
}
