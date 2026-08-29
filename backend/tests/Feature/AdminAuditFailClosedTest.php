<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAuditFailClosedTest extends TestCase
{
    use RefreshDatabase;

    private function authenticateManager(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'dti_evaluator']));
    }

    public function test_emergency_creation_rolls_back_when_audit_storage_is_unavailable(): void
    {
        $this->authenticateManager();
        Schema::drop('audit_events');

        $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-08-29',
            'ends_on' => null,
            'declaration_reference' => 'PDRRMC-TEST-001',
            'confirmed' => true,
        ])
            ->assertStatus(503)
            ->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');

        $this->assertDatabaseCount('regulatory_emergencies', 0);
    }

    public function test_store_creation_rolls_back_when_audit_storage_is_unavailable(): void
    {
        $this->authenticateManager();
        Schema::drop('audit_events');

        $this->postJson('/api/admin/stores', [
            'dti_sec_number' => 'SEC-AUDIT-001',
            'store_name' => 'Audit Safe Store',
            'owner_name' => 'Store Owner',
            'address' => 'San Jose, Antique',
            'latitude' => 10.74,
            'longitude' => 121.94,
        ])->assertStatus(503);

        $this->assertDatabaseCount('stores', 0);
    }

    public function test_field_officer_creation_rolls_back_when_audit_storage_is_unavailable(): void
    {
        $this->authenticateManager();
        Schema::drop('audit_events');

        $this->postJson('/api/admin/users/field-officers', [
            'name' => 'Audit Safe Officer',
            'email' => 'audit.safe.officer@dti.test',
            'password' => 'permanent-password',
            'password_confirmation' => 'permanent-password',
        ])->assertStatus(503);

        $this->assertDatabaseMissing('users', ['email' => 'audit.safe.officer@dti.test']);
    }
}
