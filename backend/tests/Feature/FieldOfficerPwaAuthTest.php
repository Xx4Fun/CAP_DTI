<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\FieldOfflineLease;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class FieldOfficerPwaAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_password_flag_is_normalized_and_bootstrap_is_immediately_available(): void
    {
        $officer = User::create([
            'name' => 'Ana Officer',
            'email' => 'ana@dti.test',
            'password' => 'temporary-password',
            'role' => 'field_officer',
            'must_change_password' => true,
        ]);

        $login = $this->postJson('/api/field/login', [
            'email' => 'ana@dti.test',
            'password' => 'temporary-password',
        ])->assertOk()
            ->assertJsonPath('user.role', 'field_officer')
            ->assertJsonPath('must_change_password', false)
            ->assertJsonStructure(['token', 'offline_lease' => ['id', 'expires_at']]);

        $token = $login->json('token');
        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk();
        $this->assertFalse($officer->fresh()->must_change_password);
        $this->assertTrue(Hash::check('temporary-password', $officer->fresh()->password));
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $officer->id,
            'name' => 'field-monitoring-pwa',
            'expires_at' => null,
        ]);

        $vendor = User::create([
            'name' => 'Vendor',
            'email' => 'vendor@shop.test',
            'password' => 'vendor-password',
            'role' => 'vendor',
        ]);

        $this->postJson('/api/field/login', [
            'email' => $vendor->email,
            'password' => 'vendor-password',
        ])->assertForbidden();
    }

    public function test_active_field_officer_can_renew_the_offline_lease_without_replacing_the_existing_lease(): void
    {
        $officer = User::create([
            'name' => 'Ana Officer',
            'email' => 'ana@dti.test',
            'password' => 'permanent-password',
            'role' => 'field_officer',
        ]);
        $original = FieldOfflineLease::create([
            'user_id' => $officer->id,
            'expires_at' => now()->addHour(),
        ]);
        $token = $officer->createToken('field-monitoring-pwa', ['field-monitoring'])->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/field/lease/renew')
            ->assertOk()
            ->assertJsonStructure(['offline_lease' => ['id', 'expires_at']]);

        $this->assertNotSame($original->id, $response->json('offline_lease.id'));
        $this->assertNull($original->fresh()->revoked_at);
        $this->assertTrue(now()->addHours(23)->lt(FieldOfflineLease::findOrFail($response->json('offline_lease.id'))->expires_at));
    }

    public function test_lease_renewal_rejects_inactive_and_non_field_accounts(): void
    {
        $inactive = User::create(['name' => 'Inactive', 'email' => 'inactive@dti.test', 'password' => 'password-value', 'role' => 'field_officer', 'is_active' => false]);
        $inactiveToken = $inactive->createToken('field-monitoring-pwa', ['field-monitoring'])->plainTextToken;
        $this->withToken($inactiveToken)->postJson('/api/field/lease/renew')->assertForbidden();

        $vendor = User::create(['name' => 'Vendor', 'email' => 'vendor@dti.test', 'password' => 'password-value', 'role' => 'vendor']);
        $vendorToken = $vendor->createToken('field-monitoring-pwa', ['field-monitoring'])->plainTextToken;
        $this->withToken($vendorToken)->postJson('/api/field/lease/renew')->assertForbidden();
    }

    public function test_logout_revokes_the_current_token_and_all_offline_leases(): void
    {
        $officer = User::create(['name' => 'Officer', 'email' => 'officer@dti.test', 'password' => 'permanent-password', 'role' => 'field_officer']);
        $login = $this->postJson('/api/field/login', ['email' => $officer->email, 'password' => 'permanent-password'])->assertOk();
        $token = $login->json('token');
        $leaseId = $login->json('offline_lease.id');

        $this->withToken($token)->postJson('/api/field/logout')->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $officer->id]);
        $this->assertNotNull(FieldOfflineLease::findOrFail($leaseId)->revoked_at);
    }
}
