<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryFinding;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Data behind the GIS Monitoring store detail panel. */
class GisStoreDetailTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::create(['name' => 'DTI Evaluator', 'email' => 'evaluator@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        Sanctum::actingAs($this->admin);
    }

    private function store(string $name): Store
    {
        return Store::create(['store_name' => $name, 'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'San Jose, Antique']);
    }

    public function test_legal_notices_index_filters_by_store(): void
    {
        $gaisano = $this->store('Gaisano Grand Mall');
        $robinsons = $this->store('Robinsons Supermarket');
        LegalNotice::create(['store_id' => $gaisano->id, 'notice_type' => 'LOI', 'status' => 'draft', 'delivery_state' => 'not_recorded']);
        LegalNotice::create(['store_id' => $gaisano->id, 'notice_type' => 'LOI', 'status' => 'cancelled', 'delivery_state' => 'not_recorded', 'cancelled_at' => now()]);
        LegalNotice::create(['store_id' => $robinsons->id, 'notice_type' => 'LOI', 'status' => 'draft', 'delivery_state' => 'not_recorded']);

        $response = $this->getJson("/api/admin/legal-notices?store_id={$gaisano->id}")->assertOk()
            ->assertJsonPath('data.total', 2);
        $this->assertSame([$gaisano->id], collect($response->json('data.data'))->pluck('store_id')->unique()->values()->all());
        $this->assertNotNull(collect($response->json('data.data'))->firstWhere('status', 'cancelled')['cancelled_at']);

        $this->getJson('/api/admin/legal-notices')->assertOk()->assertJsonPath('data.total', 3);
        // A store id that cannot exist is rejected rather than silently widened to every store.
        $this->getJson('/api/admin/legal-notices?store_id=0')->assertUnprocessable();
    }

    public function test_store_analytics_rows_carry_commodity_and_reference_type(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $srp = SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g', 'baseline_price' => 21.50, 'effective_date' => '2026-05-11', 'is_active' => true]);
        RegulatoryFinding::create([
            'store_id' => $store->id, 'srp_bulletin_id' => $srp->id, 'source_type' => 'consumer_report', 'source_id' => 700,
            'observed_price' => 24.00, 'observed_at' => now()->subWeek(), 'decision' => 'confirmed',
            'decided_by' => $this->admin->id, 'decided_at' => now(), 'reference_type' => 'emergency_ceiling', 'reference_value' => 22.00,
        ]);
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $srp->id, 'recorded_price' => 25.00, 'is_flagged' => true,
            'inspection_timestamp' => now()->subDays(2), 'officer_signature' => 'signed', 'validation_status' => 'verified',
            'validated_by' => $this->admin->id, 'validated_at' => now(),
        ]);

        // No commodity filter: the GIS panel asks for every commodity and offers a choice.
        $rows = collect($this->getJson("/api/admin/analytics/stores/{$store->id}")->assertOk()->json('data.table_rows'));

        $this->assertCount(2, $rows);
        foreach ($rows as $row) {
            $this->assertSame('saba-sardines-155g', $row['commodity_key']);
            $this->assertSame('Saba Sardines', $row['commodity_name']);
            $this->assertArrayHasKey('reference_type', $row);
        }
        $this->assertSame('emergency_ceiling', $rows->firstWhere('source', 'Validated receipt')['reference_type']);
    }

    public function test_an_inspection_without_a_captured_reference_uses_the_emergency_ceiling_then_in_force(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $srp = SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g', 'baseline_price' => 100, 'effective_date' => now()->subYear()->toDateString(), 'is_active' => true, 'price_freeze_applicable' => true]);
        $emergency = RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => now()->subWeeks(2)->toDateString(),
            'declaration_reference' => 'PDRRMC-TEST', 'status' => 'active', 'active_scope_key' => 'systemwide',
            'confirmed_at' => now()->subWeeks(3), 'responsible_admin_id' => $this->admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'saba-sardines-155g', 'price_type' => 'PRICE_FREEZE',
            'authoritative_price' => 90, 'effective_from' => now()->subWeeks(2)->toDateString(), 'location' => 'San Jose de Buenavista, Antique',
            'declaration_reference' => 'PDRRMC-TEST', 'created_by' => $this->admin->id, 'source_reference' => 'DTI-PF-TEST',
        ]);
        // Legacy verified inspection: no linked monitoring item, so nothing captured its reference.
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $srp->id, 'recorded_price' => 95, 'is_flagged' => true,
            'inspection_timestamp' => now()->subDays(2), 'officer_signature' => 'signed', 'validation_status' => 'verified',
            'validated_by' => $this->admin->id, 'validated_at' => now(),
        ]);

        $row = $this->getJson("/api/admin/analytics/stores/{$store->id}")->assertOk()->json('data.table_rows.0');

        $this->assertSame('emergency_ceiling', $row['reference_type']);
        $this->assertEquals(90, $row['srp']);
    }

    public function test_an_inspection_without_a_captured_reference_uses_the_srp_revision_then_in_effect(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $original = SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g', 'baseline_price' => 100, 'effective_date' => now()->subYear()->toDateString(), 'is_active' => false]);
        SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g', 'baseline_price' => 120, 'effective_date' => now()->subMonth()->toDateString(), 'is_active' => true]);
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $original->id, 'recorded_price' => 125, 'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(2), 'officer_signature' => 'signed', 'validation_status' => 'verified',
            'validated_by' => $this->admin->id, 'validated_at' => now(),
        ]);

        $row = $this->getJson("/api/admin/analytics/stores/{$store->id}")->assertOk()->json('data.table_rows.0');

        $this->assertSame('standard_srp', $row['reference_type']);
        $this->assertEquals(120, $row['srp']);
    }
}
