<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\ConsumerReport;
use App\Models\SrpBulletin;
use App\Models\Store;
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

    public function test_admin_overview_lists_first_four_stores_by_name(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        foreach (['Echo', 'Alpha', 'Delta', 'Charlie', 'Bravo'] as $name) {
            Store::create(['store_name' => $name, 'address' => "$name St", 'latitude' => 10.7, 'longitude' => 122.0, 'is_active' => true]);
        }

        $response = $this->getJson('/api/admin/overview')->assertOk()->assertJsonPath('data.stores', 5);

        $this->assertSame(['Alpha', 'Bravo', 'Charlie', 'Delta'], array_column($response->json('data.recent_stores'), 'store_name'));
        $this->assertSame(['id', 'store_name', 'dti_sec_number', 'address', 'is_active'], array_keys($response->json('data.recent_stores.0')));
    }

    public function test_admin_overview_counts_only_decidable_reports_and_current_bulletins(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        $store = Store::create(['store_name' => 'Alpha', 'address' => 'Alpha St', 'latitude' => 10.7, 'longitude' => 122.0, 'is_active' => true]);
        foreach (['Submitted', 'Processing receipt', 'Needs recapture', 'Resolved'] as $n => $status) {
            ConsumerReport::create([
                'report_reference' => "OVERVIEW-$n", 'tracking_token_hash' => hash('sha256', "token-$n"), 'submission_uuid' => "overview-$n",
                'store_id' => $store->id, 'status' => $status, 'raw_ocr_json' => [], 'submitted_at' => now(),
            ]);
        }
        SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice-1kg', 'unit' => 'kg', 'baseline_price' => 42, 'effective_date' => '2026-01-01', 'is_active' => true]);
        SrpBulletin::create(['commodity_name' => 'Sugar', 'commodity_key' => 'sugar-1kg', 'unit' => 'kg', 'baseline_price' => 80, 'effective_date' => '2099-01-01', 'is_active' => true]);

        $this->getJson('/api/admin/overview')
            ->assertOk()
            ->assertJsonPath('data.pending_reports', 1)
            ->assertJsonPath('data.active_srp_bulletins', 1);
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
