<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminRouteHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::create([
            'name' => ucfirst(str_replace('_', ' ', $role)),
            'email' => $role.'@example.test',
            'password' => 'correct-password',
            'role' => $role,
        ]);
    }

    public function test_vendor_cannot_read_or_decide_legacy_tip_evidence(): void
    {
        Sanctum::actingAs($this->user('vendor'));

        $this->getJson('/api/tips')->assertForbidden();
        $this->postJson('/api/tips/1/status', ['status' => 'validated'])->assertForbidden();
    }

    public function test_legacy_calamity_toggle_is_blocked_without_formal_declaration_record(): void
    {
        Cache::put('state_of_calamity', false);
        Sanctum::actingAs($this->user('dti_evaluator'));

        $this->postJson('/api/calamity/toggle', ['state' => true])
            ->assertUnprocessable()
            ->assertJsonPath('status', 'REGULATORY_EMERGENCY_RECORD_REQUIRED');

        $this->assertFalse(Cache::get('state_of_calamity'));
    }

    public function test_field_officer_cannot_read_admin_analytics_options(): void
    {
        Store::create([
            'dti_sec_number' => 'PRIVATE-SEC-001',
            'store_name' => 'Public Store Label',
            'owner_name' => 'Private Owner',
            'address' => 'San Jose de Buenavista',
            'latitude' => 10.74,
            'longitude' => 121.94,
        ]);
        Sanctum::actingAs($this->user('field_officer'));

        $this->getJson('/api/admin/analytics/options')->assertForbidden();
    }

    public function test_sensitive_emergency_creation_requires_recent_reauthentication(): void
    {
        $admin = $this->user('dti_evaluator');
        $token = $admin->createToken('dti-admin-web', ['dti-admin'], now()->addHours(8))->plainTextToken;
        $payload = [
            'location' => 'Antique',
            'starts_on' => '2026-07-30',
            'declaration_reference' => 'DECL-2026-01',
            'confirmed' => true,
        ];

        $this->withToken($token)
            ->postJson('/api/admin/emergencies', $payload)
            ->assertForbidden()
            ->assertJsonPath('status', 'REAUTHENTICATION_REQUIRED');

        $this->withToken($token)
            ->postJson('/api/admin/reauthenticate', ['password' => 'correct-password'])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/admin/emergencies', $payload)
            ->assertCreated();
    }

    public function test_store_cannot_be_public_until_active_and_verified(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-002',
            'store_name' => 'Unverified Store',
            'owner_name' => 'Owner',
            'address' => 'Antique',
            'latitude' => 10.74,
            'longitude' => 121.94,
            'is_active' => true,
            'is_verified' => false,
            'is_public' => false,
        ]);
        $admin = $this->user('dti_evaluator');
        $token = $admin->createToken('dti-admin-web', ['dti-admin'], now()->addHours(8))->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/admin/reauthenticate', ['password' => 'correct-password'])
            ->assertOk();

        $this->withToken($token)
            ->patchJson('/api/admin/stores/'.$store->id, ['is_public' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['is_public']);
    }
}
