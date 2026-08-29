<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminAuthorizationAndAuditTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::create([
            'name' => ucfirst(str_replace('_', ' ', $role)),
            'email' => $role.'@example.test',
            'password' => 'secret-password',
            'role' => $role,
        ]);
    }

    public function test_admin_audit_endpoint_enforces_existing_roles(): void
    {
        AuditEvent::create([
            'action' => 'invitation.created',
            'subject_type' => 'vendor_invitation',
            'subject_id' => 1,
            'metadata' => ['email' => 'masked@example.test', 'token' => 'must-not-leak'],
        ]);

        Sanctum::actingAs($this->user('dti_evaluator'));
        $this->getJson('/api/admin/audit-events')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'invitation.created')
            ->assertJsonMissing(['token' => 'must-not-leak']);

        Sanctum::actingAs($this->user('field_officer'));
        $this->getJson('/api/admin/audit-events')->assertForbidden();

        Sanctum::actingAs($this->user('vendor'));
        $this->getJson('/api/admin/audit-events')->assertForbidden();
    }

    public function test_audit_endpoint_has_no_mutation_routes(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));

        $this->postJson('/api/admin/audit-events', [])->assertMethodNotAllowed();
        $this->deleteJson('/api/admin/audit-events/1')->assertNotFound();
    }

    public function test_field_officer_cannot_read_the_admin_overview(): void
    {
        Sanctum::actingAs($this->user('field_officer'));

        $this->getJson('/api/admin/overview')->assertForbidden();
    }

    public function test_admin_overview_keeps_available_counts_when_emergency_schema_is_missing(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        Schema::drop('regulatory_emergencies');

        $this->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('data.stores', 0)
            ->assertJsonPath('data.pending_reports', 0)
            ->assertJsonPath('data.active_emergencies', null)
            ->assertJsonPath('data.availability.regulatory_emergencies', false);
    }
}
