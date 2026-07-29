<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class AdminSrpAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_bulk_import_fails_closed_when_audit_storage_is_unavailable(): void
    {
        $admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'availability@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($admin);
        Schema::drop('audit_events');

        $this->postJson('/api/admin/srp/import', [
            'metadata' => [
                'effective_date' => '2026-08-01',
                'source_reference' => 'DTI-SRP-2026-08',
            ],
            'items' => [[
                'item_name' => 'Premium Rice',
                'unit' => '1kg',
                'srp' => 50.25,
            ]],
        ])
            ->assertStatus(503)
            ->assertJsonPath('status', 'SRP_VERSIONING_UNAVAILABLE');

        $this->assertDatabaseCount('srp_bulletins', 0);
    }
}
