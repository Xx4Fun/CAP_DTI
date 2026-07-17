<?php

namespace Tests\Feature;

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

        Store::create([
            'dti_sec_number' => 'SEC-12345',
            'store_name' => 'Buenavista Groceries',
            'owner_name' => 'Juan Dela Cruz',
            'latitude' => 10.7410,
            'longitude' => 121.9386,
            'address' => 'San Jose de Buenavista, Antique'
        ]);

        SrpBulletin::create([
            'commodity_name' => 'Sardines',
            'baseline_price' => 25.00,
            'effective_date' => '2026-07-01',
            'is_active' => true
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/sync/down');

        $response->assertStatus(200)
            ->assertJsonStructure(['stores', 'srp_bulletins']);
    }

    public function test_unauthenticated_user_cannot_downsync_or_upsync(): void {
        $responseDown = $this->getJson('/api/sync/down');
        $responseDown->assertStatus(401);

        $responseUp = $this->postJson('/api/sync/up', [
            'inspections' => []
        ]);
        $responseUp->assertStatus(401);
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
}
