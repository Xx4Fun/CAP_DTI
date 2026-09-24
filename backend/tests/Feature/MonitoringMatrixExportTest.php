<?php

namespace Tests\Feature;

use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringMatrixExportTest extends TestCase
{
    use RefreshDatabase;

    public function test_evaluator_can_fetch_monitoring_records_matrix_data(): void
    {
        $evaluator = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => 'password',
            'role' => 'dti_evaluator',
        ]);
        $officer = User::create([
            'name' => 'Field Officer',
            'email' => 'officer@dti.test',
            'password' => 'password',
            'role' => 'field_officer',
        ]);

        $store = Store::create([
            'store_name' => 'Antique City Square',
            'address' => 'San Jose de Buenavista',
            'latitude' => 10.74,
            'longitude' => 121.94,
            'is_active' => true,
        ]);

        $srp = SrpBulletin::create([
            'commodity_name' => 'Toyo Bonus Green EOC (155g)',
            'unit' => '155g',
            'category' => 'Canned Sardines in Tomato Sauce',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 20.00,
            'is_active' => true,
            'effective_date' => now()->subDay()->toDateString(),
        ]);

        $record = MonitoringRecord::create([
            'client_uuid' => 'matrix-record-1',
            'officer_user_id' => $officer->id,
            'store_id' => $store->id,
            'status' => 'accepted',
            'started_at' => now()->subHour(),
            'finalized_at' => now(),
            'received_at' => now(),
            'latitude' => 10.74,
            'longitude' => 121.94,
            'location_accuracy_meters' => 5,
            'location_captured_at' => now(),
            'representative_name' => 'Store Rep',
            'officer_signature_disk' => 'local',
            'officer_signature_path' => 'sig1.png',
            'officer_signature_sha256' => hash('sha256', 'sig1'),
            'representative_signature_disk' => 'local',
            'representative_signature_path' => 'sig2.png',
            'representative_signature_sha256' => hash('sha256', 'sig2'),
        ]);

        MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id,
            'srp_id' => $srp->id,
            'recorded_price' => 20.00,
            'baseline_price' => 20.00,
            'variance_percent' => 0,
            'is_anomaly' => false,
        ]);

        Sanctum::actingAs($evaluator, ['dti-admin']);

        $response = $this->getJson('/api/admin/monitoring-records-matrix?period=this_week');

        $response->assertOk()
            ->assertJsonPath('data.period', 'this_week')
            ->assertJsonPath('data.commodities.0.commodity_name', 'Toyo Bonus Green EOC (155g)')
            ->assertJsonPath('data.commodities.0.regulatory_classification', 'Basic Necessities')
            ->assertJsonPath('data.commodities.0.category', 'Canned Sardines in Tomato Sauce')
            ->assertJsonPath('data.commodities.0.srp', 20)
            ->assertJsonPath('data.weeks.0.establishments.0.store_name', 'Antique City Square')
            ->assertJsonPath('data.weeks.0.establishments.0.prices.'.$srp->id.'.recorded_price', 20);
    }

    public function test_srp_revisions_fold_into_one_row_per_commodity_and_unit(): void
    {
        $srp = fn (string $unit, float $price, string $effective) => SrpBulletin::create([
            'commodity_key' => 'evap-milk',
            'commodity_name' => 'Evaporated Milk',
            'unit' => $unit,
            'category' => 'Milk',
            'baseline_price' => $price,
            'is_active' => true,
            'effective_date' => $effective,
        ]);
        $oldPack = $srp('pack', 30, now()->subDays(30)->toDateString());
        $pack = $srp('Pack ', 31, now()->subDays(20)->toDateString());
        $kg = $srp('kg', 90, now()->subDays(10)->toDateString());
        $futurePack = $srp('pack', 33, now()->addMonth()->toDateString());

        $storeA = $this->store('Store A');
        $storeB = $this->store('Store B');
        $this->record($storeA, [$oldPack->id => 29, $kg->id => 88]);
        $this->record($storeB, [$pack->id => 32]);

        Sanctum::actingAs($this->evaluator(), ['dti-admin']);
        $data = $this->getJson('/api/admin/monitoring-records-matrix?period=this_week')->assertOk()->json('data');

        $rows = collect($data['commodities']);
        $this->assertEqualsCanonicalizing([$kg->id, $pack->id], $rows->pluck('id')->all());
        $this->assertSame(90.0, (float) $rows->firstWhere('id', $kg->id)['srp']);
        $this->assertNull($rows->firstWhere('id', $futurePack->id));

        $prices = collect($data['weeks'][0]['establishments'])->keyBy('store_name');
        $this->assertEquals(29, $prices['Store A']['prices'][$pack->id]['recorded_price']);
        $this->assertEquals(88, $prices['Store A']['prices'][$kg->id]['recorded_price']);
        $this->assertEquals(32, $prices['Store B']['prices'][$pack->id]['recorded_price']);
        $this->assertArrayNotHasKey($oldPack->id, $prices['Store A']['prices']);
    }

    private function evaluator(): User
    {
        return User::create(['name' => 'DTI Evaluator', 'email' => 'evaluator@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
    }

    private function store(string $name): Store
    {
        return Store::create(['store_name' => $name, 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true]);
    }

    private function record(Store $store, array $pricesBySrpId): void
    {
        $officer = User::firstOrCreate(['email' => 'officer@dti.test'], ['name' => 'Field Officer', 'password' => 'password', 'role' => 'field_officer']);
        $record = MonitoringRecord::create([
            'client_uuid' => 'matrix-'.$store->id,
            'officer_user_id' => $officer->id,
            'store_id' => $store->id,
            'status' => 'accepted',
            'started_at' => now()->subHour(),
            'finalized_at' => now(),
            'received_at' => now(),
            'latitude' => 10.74,
            'longitude' => 121.94,
            'location_accuracy_meters' => 5,
            'location_captured_at' => now(),
            'representative_name' => 'Store Rep',
            'officer_signature_disk' => 'local',
            'officer_signature_path' => 'sig1.png',
            'officer_signature_sha256' => hash('sha256', 'sig1'),
            'representative_signature_disk' => 'local',
            'representative_signature_path' => 'sig2.png',
            'representative_signature_sha256' => hash('sha256', 'sig2'),
        ]);
        foreach ($pricesBySrpId as $srpId => $price) {
            MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id,
                'srp_id' => $srpId,
                'recorded_price' => $price,
                'baseline_price' => $price,
                'variance_percent' => 0,
                'is_anomaly' => false,
            ]);
        }
    }
}
