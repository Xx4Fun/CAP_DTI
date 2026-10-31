<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Services\Admin\EmergencyApcPreparationService;
use Database\Seeders\CapstoneMonitoringSeeder;
use Database\Seeders\CapstoneTwoMonthMonitoringSeeder;
use Database\Seeders\OfficialEstablishmentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CapstoneTwoMonthMonitoringSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_eight_weeks_of_monitoring_records_with_randomized_item_counts_one_off_pin_visit_and_three_anomaly_types(): void
    {
        $this->prepareCatalog(123, 36);
        $this->seed(CapstoneTwoMonthMonitoringSeeder::class);

        $records = MonitoringRecord::query()
            ->where('status', 'accepted')
            ->with(['store', 'officer', 'items.bulletin'])
            ->orderBy('finalized_at')
            ->orderBy('id')
            ->get();

        // 10 active establishments x 8 weekly periods = 80 records
        $this->assertCount(80, $records);

        $weeks = $records->map(fn (MonitoringRecord $r) => $r->finalized_at->setTimezone('Asia/Manila')->toDateString())
            ->unique()->values()->all();
        $this->assertSame(CapstoneTwoMonthMonitoringSeeder::TARGET_DATES, $weeks);

        // Every record has between 60 and 100 items, with varied counts including 70s, 80s, and 100
        $itemCounts = $records->map(fn (MonitoringRecord $r) => $r->items->count());
        $this->assertTrue($itemCounts->every(fn (int $count) => $count >= 60 && $count <= 100));
        $this->assertTrue($itemCounts->contains(fn (int $count) => $count >= 70 && $count < 80));
        $this->assertTrue($itemCounts->contains(fn (int $count) => $count >= 80 && $count < 90));
        $this->assertTrue($itemCounts->contains(100));
        $this->assertGreaterThanOrEqual(8, $itemCounts->unique()->count());

        // Location check: exactly 1 record out of 80 is >150m from its registered pin after subtracting GPS accuracy
        $offPinRecords = $records->filter(function (MonitoringRecord $record): bool {
            $distance = $this->distanceMeters(
                (float) $record->store->latitude,
                (float) $record->store->longitude,
                (float) $record->latitude,
                (float) $record->longitude
            );

            return ($distance - (float) $record->location_accuracy_meters) > 150.0;
        })->values();

        $this->assertCount(1, $offPinRecords);
        $offPin = $offPinRecords->first();
        $this->assertSame(CapstoneTwoMonthMonitoringSeeder::OFF_PIN_STORE, $offPin->store->store_name);
        $this->assertSame(
            CapstoneTwoMonthMonitoringSeeder::OFF_PIN_DATE,
            $offPin->finalized_at->setTimezone('Asia/Manila')->toDateString()
        );

        $atPinRecords = $records->reject(fn (MonitoringRecord $r) => $r->id === $offPin->id);
        $this->assertCount(79, $atPinRecords);
        $this->assertTrue($atPinRecords->every(function (MonitoringRecord $record): bool {
            $distance = $this->distanceMeters(
                (float) $record->store->latitude,
                (float) $record->store->longitude,
                (float) $record->latitude,
                (float) $record->longitude
            );

            return $distance < 15.0 && ($distance - (float) $record->location_accuracy_meters) <= 150.0;
        }));

        // Check all 3 anomaly types exist
        $items = $records->flatMap->items;

        // Type 1: Above SRP only (not a >10% previous price spike)
        $type1 = $items->filter(fn (MonitoringRecordItem $item) => $item->is_anomaly
            && $item->recorded_price > $item->reference_value
            && ! $item->is_previous_price_spike
            && $item->finding_basis === 'standard_srp');
        $this->assertNotEmpty($type1, 'Expected Type 1 anomalies (above SRP only).');

        // Type 2: >10% spike over previous record while within SRP
        $type2 = $items->filter(fn (MonitoringRecordItem $item) => $item->is_anomaly
            && $item->recorded_price <= $item->reference_value
            && $item->is_previous_price_spike
            && $item->previous_price !== null
            && $item->previous_price_variance_percent > 10.0
            && $item->finding_basis === MonitoringRecordItem::SPIKE_BASIS);
        $this->assertNotEmpty($type2, 'Expected Type 2 anomalies (>10% previous-record spike within SRP).');

        // Type 3: Both Above SRP AND >10% spike over previous record
        $type3 = $items->filter(fn (MonitoringRecordItem $item) => $item->is_anomaly
            && $item->recorded_price > $item->reference_value
            && $item->is_previous_price_spike
            && $item->previous_price !== null
            && $item->previous_price_variance_percent > 10.0
            && $item->finding_basis === 'standard_srp');
        $this->assertNotEmpty($type3, 'Expected Type 3 anomalies (both above SRP and >10% previous-record spike).');

        // All clean items must be <= reference_value and not a spike
        $clean = $items->where('is_anomaly', false);
        $this->assertNotEmpty($clean);
        $this->assertTrue($clean->every(fn (MonitoringRecordItem $item) => $item->recorded_price <= $item->reference_value
            && ! $item->is_previous_price_spike
            && $item->finding_basis === null));

        // Temporal inspections mirror every item
        $this->assertSame($items->count(), TemporalInspection::query()->where('validation_status', 'verified')->count());
        $this->assertSame(80, AuditEvent::query()->where('action', 'monitoring.capstone_demo_seeded')
            ->where('metadata->dataset_version', CapstoneTwoMonthMonitoringSeeder::DATASET_VERSION)->count());

        // Signatures exist on disk
        $sample = $records->first();
        Storage::disk('receipt_evidence')->assertExists($sample->officer_signature_path);
        Storage::disk('receipt_evidence')->assertExists($sample->representative_signature_path);
    }

    public function test_it_supersedes_old_single_week_demo_records_and_is_idempotent_on_rerun(): void
    {
        $this->prepareCatalog(123, 36);
        $this->seed(CapstoneMonitoringSeeder::class);
        $this->assertSame(10, MonitoringRecord::query()->where('status', 'accepted')->count());

        $this->seed(CapstoneTwoMonthMonitoringSeeder::class);

        $this->assertSame(
            10,
            MonitoringRecord::query()->where('client_version', 'capstone-seed-2026-09-01')->where('status', 'superseded')->count()
        );
        $this->assertSame(
            80,
            MonitoringRecord::query()->where('client_version', CapstoneTwoMonthMonitoringSeeder::CLIENT_VERSION)->where('status', 'accepted')->count()
        );

        $countsBefore = [
            MonitoringRecord::query()->count(),
            MonitoringRecordItem::query()->count(),
            TemporalInspection::query()->count(),
        ];

        $this->seed(CapstoneTwoMonthMonitoringSeeder::class);

        $this->assertSame($countsBefore, [
            MonitoringRecord::query()->count(),
            MonitoringRecordItem::query()->count(),
            TemporalInspection::query()->count(),
        ]);
    }

    public function test_apc_preparation_uses_the_latest_seeded_week_and_covers_all_applicable_commodities(): void
    {
        $this->prepareCatalog(123, 36);
        $this->seed(CapstoneTwoMonthMonitoringSeeder::class);

        $admin = User::create([
            'name' => 'DTI Admin',
            'email' => 'capstone-2m-admin@example.test',
            'password' => 'password',
            'role' => 'dti_evaluator',
        ]);
        $emergency = RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-11-03',
            'declaration_reference' => 'CAPSTONE-2M-DRAFT',
            'status' => 'draft',
            'responsible_admin_id' => $admin->id,
        ]);

        $prepared = app(EmergencyApcPreparationService::class)->prepare($emergency, $admin);
        $this->assertCount(123, $prepared->candidates);
        $this->assertTrue($prepared->candidates->every(fn ($c) => $c->observation_count >= 3 && $c->establishment_count >= 3));

        // Verify GIS Monitoring, Weekly Price Matrix, and 12-week Temporal Trends APIs expose the 8 weeks cleanly
        $gisResponse = $this->actingAs($admin)->getJson('/api/admin/gis/monitoring?week=2026-10-26&locations=1')->assertOk();
        $gisWeeks = $gisResponse->json('data.weeks');
        foreach (['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'] as $mondayKey) {
            $this->assertContains($mondayKey, $gisWeeks);
        }

        $matrixResponse = $this->actingAs($admin)->getJson('/api/admin/monitoring-records-matrix?period=all_time')->assertOk();
        $this->assertCount(8, $matrixResponse->json('data.weeks'));

        $haroMart = Store::query()->where('store_name', CapstoneTwoMonthMonitoringSeeder::OFF_PIN_STORE)->firstOrFail();
        $trendsResponse = $this->actingAs($admin)->getJson("/api/admin/analytics/stores/{$haroMart->id}?weeks=12")->assertOk();
        $this->assertCount(8, collect($trendsResponse->json('data.table_rows'))->pluck('date')->unique());
    }

    private function prepareCatalog(int $covered = 123, int $other = 36): void
    {
        Storage::fake('receipt_evidence');
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->createBulletins($covered, true);
        $this->createBulletins($other, false);
    }

    private function createBulletins(int $count, bool $covered): void
    {
        for ($index = 1; $index <= $count; $index++) {
            SrpBulletin::create([
                'commodity_name' => ($covered ? 'Covered' : 'Other').' Product '.$index,
                'unit' => '500 g',
                'commodity_key' => ($covered ? 'covered' : 'other').'-product-'.$index,
                'baseline_price' => 20 + ($index % 60) + ($index % 2 ? 0.25 : 0.00),
                'effective_date' => '2026-05-11',
                'is_active' => true,
                'price_freeze_applicable' => $covered,
                'source_reference' => 'DTI SRP 2026-05-11',
            ]);
        }
    }

    private function distanceMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $lat = deg2rad(($lat1 + $lat2) / 2);
        $x = deg2rad($lon2 - $lon1) * cos($lat);
        $y = deg2rad($lat2 - $lat1);

        return sqrt($x * $x + $y * $y) * 6371000;
    }
}
