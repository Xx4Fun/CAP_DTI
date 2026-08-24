<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class FieldOfficerPwaAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_active_field_officers_receive_a_field_pwa_session_and_must_replace_a_temporary_password(): void
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
            ->assertJsonPath('must_change_password', true)
            ->assertJsonStructure(['token', 'offline_lease' => ['id', 'expires_at']]);

        $token = $login->json('token');
        $this->withToken($token)->getJson('/api/field/bootstrap')->assertForbidden();

        $this->withToken($token)->postJson('/api/field/password', [
            'password' => 'new-permanent-password',
            'password_confirmation' => 'new-permanent-password',
        ])->assertOk()->assertJsonPath('must_change_password', false);

        $this->assertTrue(Hash::check('new-permanent-password', $officer->fresh()->password));
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => $officer->id,
            'name' => 'field-monitoring-pwa',
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
}
