<?php

namespace Tests\Feature;

use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmergencyApcWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_declaration_is_prepared_from_the_latest_completed_routine_week_without_becoming_active(): void
    {
        $admin = User::create([
            'name' => 'DTI Admin', 'email' => 'apc-admin@dti.test',
            'password' => 'password', 'role' => 'dti_evaluator',
        ]);
        $officer = User::create([
            'name' => 'Field Officer', 'email' => 'apc-field@dti.test',
            'password' => 'password', 'role' => 'field_officer',
        ]);
        Sanctum::actingAs($admin);

        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Rice', 'unit' => 'kg', 'commodity_key' => 'rice',
            'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026',
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Milk', 'unit' => 'can', 'commodity_key' => 'milk',
            'baseline_price' => 40, 'effective_date' => '2026-01-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026',
        ]);
        foreach ([['Market A', '2026-09-01 09:00:00', 10.00], ['Market B', '2026-09-05 09:00:00', 10.01]] as $index => [$name, $finalizedAt, $price]) {
            $store = Store::create([
                'store_name' => $name, 'address' => 'San Jose de Buenavista, Antique',
                'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true,
            ]);
            $record = MonitoringRecord::create([
                'client_uuid' => sprintf('00000000-0000-4000-8000-%012d', $index + 1),
                'officer_user_id' => $officer->id, 'store_id' => $store->id, 'status' => 'accepted',
                'started_at' => $finalizedAt, 'finalized_at' => $finalizedAt, 'received_at' => $finalizedAt,
                'latitude' => 10.74, 'longitude' => 121.94, 'location_accuracy_meters' => 5,
                'location_captured_at' => $finalizedAt, 'representative_name' => 'Owner',
                'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.png',
                'officer_signature_sha256' => str_repeat('a', 64),
                'representative_signature_disk' => 'local', 'representative_signature_path' => 'owner.png',
                'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
                'protocol_mode' => 'standard',
            ]);
            MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id,
                'recorded_price' => $price, 'baseline_price' => 50, 'is_anomaly' => false,
            ]);
        }

        $response = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-09-09',
            'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated();

        $response->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.effective_state', 'draft')
            ->assertJsonPath('data.source_week.timezone', 'Asia/Manila')
            ->assertJsonPath('data.source_week.starts_at', '2026-08-30T16:00:00+00:00')
            ->assertJsonPath('data.source_week.ends_at', '2026-09-06T16:00:00+00:00')
            ->assertJsonPath('data.source_week.starts_on', '2026-08-31')
            ->assertJsonPath('data.source_week.ends_on', '2026-09-06')
            ->assertJsonPath('data.candidates.0.commodity_key', 'rice')
            ->assertJsonPath('data.candidates.0.minimum_price', 10)
            ->assertJsonPath('data.candidates.0.maximum_price', 10.01)
            ->assertJsonPath('data.candidates.0.observed_average_price', 10.01)
            ->assertJsonPath('data.candidates.0.computed_apc_price', 10.01)
            ->assertJsonPath('data.candidates.0.observation_count', 2)
            ->assertJsonPath('data.candidates.0.establishment_count', 2)
            ->assertJsonPath('data.candidates.0.source_observations.0.store_name', 'Market A')
            ->assertJsonPath('data.candidates.0.source_observations.1.store_name', 'Market B')
            ->assertJsonPath('data.covered_commodity_keys', ['milk', 'rice'])
            ->assertJsonPath('data.missing_commodity_keys', ['milk'])
            ->assertJsonCount(2, 'data.candidates.0.source_item_ids');

        $this->assertDatabaseMissing('regulatory_emergencies', ['status' => 'active']);
        $this->assertDatabaseCount('regulatory_price_records', 0);
    }

    public function test_activation_rejects_a_stale_review_then_creates_official_apc_from_the_refreshed_candidate(): void
    {
        $admin = User::create([
            'name' => 'DTI Admin', 'email' => 'activate-admin@dti.test',
            'password' => 'password', 'role' => 'dti_evaluator',
        ]);
        $officer = User::create([
            'name' => 'Field Officer', 'email' => 'activate-field@dti.test',
            'password' => 'password', 'role' => 'field_officer',
        ]);
        Sanctum::actingAs($admin);
        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Rice', 'unit' => 'kg', 'commodity_key' => 'rice',
            'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026',
        ]);
        $this->acceptedObservation($officer, $bulletin, 'Market A', '2026-09-01 09:00:00', 40);

        $draft = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'ends_on' => '2026-09-30', 'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated();
        $emergencyId = $draft->json('data.id');
        $reviewedHash = $draft->json('data.preparation_hash');

        $this->postJson('/api/admin/emergency-prices', [
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 999,
        ])->assertNotFound();

        $this->acceptedObservation($officer, $bulletin, 'Market B', '2026-09-05 09:00:00', 50);

        $this->postJson("/api/admin/emergencies/{$emergencyId}/activate", [
            'confirmed' => true, 'preparation_hash' => $reviewedHash,
        ])->assertConflict()->assertJsonPath('status', 'APC_PREPARATION_STALE');
        $this->assertDatabaseHas('regulatory_emergencies', ['id' => $emergencyId, 'status' => 'draft']);
        $this->assertDatabaseCount('regulatory_price_records', 0);

        $refreshed = $this->postJson("/api/admin/emergencies/{$emergencyId}/prepare")
            ->assertOk()
            ->assertJsonPath('data.candidates.0.minimum_price', 40)
            ->assertJsonPath('data.candidates.0.maximum_price', 50)
            ->assertJsonPath('data.candidates.0.computed_apc_price', 45);

        $this->postJson("/api/admin/emergencies/{$emergencyId}/activate", [
            'confirmed' => true,
            'preparation_hash' => $refreshed->json('data.preparation_hash'),
            'authoritative_price' => 999,
        ])->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.official_prices.0.authoritative_price', 45)
            ->assertJsonPath('data.official_prices.0.source_reference', 'PDRRMC-2026-09 | Monitoring week 2026-08-31 to 2026-09-06');

        $this->assertDatabaseHas('regulatory_price_records', [
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 45,
        ]);
        $this->assertDatabaseHas('audit_events', ['action' => 'emergency.confirmed', 'subject_id' => $emergencyId]);

        $this->getJson('/api/admin/emergencies')->assertOk()
            ->assertJsonPath('data.0.effective_state', 'in_effect')
            ->assertJsonPath('data.0.candidates.0.computed_apc_price', 45)
            ->assertJsonPath('data.0.official_prices.0.authoritative_price', 45);

        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'ended', 'ends_on' => '2026-09-10', 'confirmed' => true,
        ])->assertOk()
            ->assertJsonPath('data.effective_state', 'in_effect')
            ->assertJsonPath('data.official_prices.0.effective_until', '2026-09-10');
        $this->assertDatabaseHas('regulatory_price_records', [
            'regulatory_emergency_id' => $emergencyId, 'effective_until' => '2026-09-10 00:00:00',
        ]);
        $resolver = app(FieldReferenceResolver::class);
        $this->assertSame('emergency_ceiling', $resolver->resolve($bulletin, '2026-09-10 23:59:59')['type']);
        $this->assertSame('standard_srp', $resolver->resolve($bulletin, '2026-09-11 00:00:00')['type']);
    }

    private function acceptedObservation(User $officer, SrpBulletin $bulletin, string $storeName, string $finalizedAt, float $price): MonitoringRecordItem
    {
        $store = Store::create([
            'store_name' => $storeName, 'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true,
        ]);
        $record = MonitoringRecord::create([
            'client_uuid' => fake()->uuid(), 'officer_user_id' => $officer->id,
            'store_id' => $store->id, 'status' => 'accepted', 'started_at' => $finalizedAt,
            'finalized_at' => $finalizedAt, 'received_at' => $finalizedAt,
            'latitude' => 10.74, 'longitude' => 121.94, 'location_accuracy_meters' => 5,
            'location_captured_at' => $finalizedAt, 'representative_name' => 'Owner',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.png',
            'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'owner.png',
            'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
            'protocol_mode' => 'standard',
        ]);

        return MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id,
            'recorded_price' => $price, 'baseline_price' => $bulletin->baseline_price,
            'is_anomaly' => false,
        ]);
    }
}
