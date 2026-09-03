<?php

namespace Tests\Feature;

use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldEmergencyRulesTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::create([
            'name' => 'Emergency Admin', 'email' => 'emergency-rules@dti.test',
            'password' => 'password', 'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($admin);
        return $admin;
    }

    public function test_only_one_emergency_can_be_active_and_resolution_is_deployment_wide(): void
    {
        $admin = $this->admin();
        $emergencyId = $this->postJson('/api/admin/emergencies', [
            'location' => 'Antique display metadata', 'starts_on' => '2026-08-01',
            'declaration_reference' => 'DECL-1', 'confirmed' => true,
        ])->assertCreated()->json('data.id');

        $this->postJson('/api/admin/emergencies', [
            'location' => 'Different display metadata', 'starts_on' => '2026-08-02',
            'declaration_reference' => 'DECL-2', 'confirmed' => true,
        ])->assertUnprocessable();

        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 50, 'effective_from' => '2026-08-01',
            'location' => 'Antique display metadata', 'declaration_reference' => 'DECL-1',
            'source_reference' => 'APC-SOURCE', 'created_by' => $admin->id,
        ]);
        $this->getJson('/api/admin/emergency-prices/resolve?commodity_key=rice&location=Outside%20Antique&observed_at=2026-08-10')
            ->assertOk()->assertJsonPath('status', 'REGULATORY_PRICE_FOUND')->assertJsonPath('value', 50);

        $this->expectException(QueryException::class);
        DB::table('regulatory_emergencies')->insert([
            'location' => 'Bypass controller', 'starts_on' => '2026-08-03',
            'declaration_reference' => 'DECL-BYPASS', 'status' => 'active',
            'confirmed_at' => now(), 'responsible_admin_id' => $admin->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_field_reference_uses_historical_srp_normally_and_requires_an_emergency_record_during_an_emergency(): void
    {
        $admin = $this->admin();
        $historical = SrpBulletin::create([
            'commodity_name' => 'Rice', 'commodity_key' => 'rice', 'baseline_price' => 40,
            'effective_date' => '2026-01-01', 'source_reference' => 'SRP-JAN', 'is_active' => true,
        ]);
        $current = SrpBulletin::create([
            'commodity_name' => 'Rice', 'commodity_key' => 'rice', 'baseline_price' => 45,
            'effective_date' => '2026-08-01', 'source_reference' => 'SRP-AUG', 'is_active' => true,
        ]);
        $resolver = app(FieldReferenceResolver::class);

        $this->assertSame(40.0, $resolver->resolve($current, '2026-07-01')['value']);
        $this->assertSame('standard_srp', $resolver->resolve($current, '2026-07-01')['type']);

        $emergency = RegulatoryEmergency::create([
            'location' => 'Metadata only', 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-20',
            'declaration_reference' => 'DECL-3', 'status' => 'active', 'confirmed_at' => now(),
            'responsible_admin_id' => $admin->id,
        ]);
        $missing = $resolver->resolve($current, '2026-08-12');
        $this->assertSame('unavailable', $missing['status']);
        $this->assertNull($missing['value']);

        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice',
            'price_type' => 'PRICE_FREEZE', 'authoritative_price' => 42,
            'effective_from' => '2026-08-10', 'location' => 'Metadata only',
            'declaration_reference' => 'DECL-3', 'source_reference' => 'FREEZE-SOURCE',
            'created_by' => $admin->id,
        ]);
        $reference = $resolver->resolve($historical, '2026-08-12');
        $this->assertSame('emergency_ceiling', $reference['type']);
        $this->assertSame(42.0, $reference['value']);
        $this->assertSame('FREEZE-SOURCE', $reference['source']);
    }

    public function test_a_terminal_emergency_declaration_cannot_be_changed_again(): void
    {
        $this->admin();
        $emergencyId = $this->postJson('/api/admin/emergencies', [
            'location' => 'Antique', 'starts_on' => '2026-08-01',
            'declaration_reference' => 'DECL-TERMINAL', 'confirmed' => true,
        ])->assertCreated()->json('data.id');

        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'ended', 'ends_on' => '2026-08-02', 'confirmed' => true,
        ])->assertOk();
        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'cancelled', 'confirmed' => true,
        ])->assertUnprocessable();
        $this->assertDatabaseHas('regulatory_emergencies', ['id' => $emergencyId, 'status' => 'ended']);
    }
}
