<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        return User::create([
            'name' => 'DTI Evaluator',
            'email' => 'manager@dti.test',
            'password' => 'manager-password',
            'role' => 'dti_evaluator',
        ]);
    }

    public function test_manager_lists_only_managed_roles_with_server_pagination_and_counts(): void
    {
        $vendor = User::create(['name' => 'Vendor Owner', 'email' => 'vendor@example.test', 'password' => 'vendor-password', 'role' => 'vendor']);
        User::create(['name' => 'Field Officer', 'email' => 'officer@dti.test', 'password' => 'officer-password', 'role' => 'field_officer']);
        User::create(['name' => 'Consumer', 'email' => 'consumer@example.test', 'password' => 'consumer-password', 'role' => 'consumer']);
        Store::create([
            'dti_sec_number' => 'SEC-USERS-1',
            'store_name' => 'Linked Vendor Store',
            'owner_name' => 'Vendor Owner',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'Antique',
            'vendor_user_id' => $vendor->id,
        ]);

        Sanctum::actingAs($this->manager());

        $this->getJson('/api/admin/users?role=vendor&search=linked&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.data.0.email', 'vendor@example.test')
            ->assertJsonPath('data.data.0.stores.0.store_name', 'Linked Vendor Store')
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('counts.total', 2)
            ->assertJsonPath('counts.vendor', 1)
            ->assertJsonPath('counts.field_officer', 1)
            ->assertJsonPath('counts.inactive', 0)
            ->assertJsonMissing(['email' => 'consumer@example.test']);
    }

    public function test_manager_creates_an_active_field_officer_with_a_hashed_password(): void
    {
        Sanctum::actingAs($this->manager());

        $this->postJson('/api/admin/users/field-officers', [
            'name' => 'Ana Officer',
            'email' => 'ana.officer@dti.gov.ph',
            'password' => 'permanent-password',
            'password_confirmation' => 'permanent-password',
            'is_active' => true,
        ])->assertCreated()
            ->assertJsonPath('data.role', 'field_officer')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonMissing(['password' => 'permanent-password']);

        $officer = User::where('email', 'ana.officer@dti.gov.ph')->firstOrFail();
        $this->assertTrue(Hash::check('permanent-password', $officer->password));
        $this->assertDatabaseHas('audit_events', ['action' => 'user.created', 'subject_id' => $officer->id]);
    }

    public function test_manager_can_update_reset_and_deactivate_a_managed_account(): void
    {
        $officer = User::create(['name' => 'Old Name', 'email' => 'old@dti.test', 'password' => 'old-password-value', 'role' => 'field_officer']);
        $officer->createToken('field-monitoring-mobile');
        Sanctum::actingAs($this->manager());

        $this->patchJson("/api/admin/users/{$officer->id}", [
            'name' => 'Updated Name',
            'email' => 'updated@dti.test',
            'is_active' => false,
        ])->assertOk()->assertJsonPath('data.is_active', false);

        $this->putJson("/api/admin/users/{$officer->id}/password", [
            'password' => 'new-permanent-password',
            'password_confirmation' => 'new-permanent-password',
        ])->assertOk()->assertJsonMissing(['password' => 'new-permanent-password']);

        $officer->refresh();
        $this->assertSame('Updated Name', $officer->name);
        $this->assertTrue(Hash::check('new-permanent-password', $officer->password));
        $this->assertCount(0, $officer->tokens()->get());
        $this->assertDatabaseHas('audit_events', ['action' => 'user.updated', 'subject_id' => $officer->id]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_reset', 'subject_id' => $officer->id]);
    }

    public function test_inactive_user_cannot_log_in(): void
    {
        User::create([
            'name' => 'Inactive Officer',
            'email' => 'inactive@dti.test',
            'password' => 'correct-password',
            'role' => 'field_officer',
            'is_active' => false,
        ]);

        $this->postJson('/api/login', [
            'email' => 'inactive@dti.test',
            'password' => 'correct-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_field_officers_cannot_manage_users_and_managers_cannot_target_privileged_roles(): void
    {
        $evaluator = $this->manager();
        Sanctum::actingAs(User::create(['name' => 'Officer', 'email' => 'limited@dti.test', 'password' => 'officer-password', 'role' => 'field_officer']));
        $this->getJson('/api/admin/users')->assertForbidden();

        Sanctum::actingAs($evaluator);
        $this->patchJson("/api/admin/users/{$evaluator->id}", ['is_active' => false])->assertUnprocessable();
    }
}
