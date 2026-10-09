<?php

namespace Tests\Feature;

use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_list_and_matrix_search_ignore_case_for_store_and_officer(): void
    {
        $srp = $this->bulletin();
        $store = $this->store('Antique City Square');
        $officer = User::create(['name' => 'Alice Rivera', 'email' => 'Alice@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $record = $this->record($store, [$srp->id => 20], $officer);
        $this->record($this->store('Other Store'), [$srp->id => 90]);
        Sanctum::actingAs($this->evaluator(), ['dti-admin']);

        $sqlite = DB::connection()->getDriverName() === 'sqlite';
        if ($sqlite) DB::statement('PRAGMA case_sensitive_like = ON');
        try {
            foreach (['antique', 'ANTIQUE', 'aNtIqUe', '  antique  ', 'alice rivera', 'ALICE RIVERA', 'aLiCe RiVeRa', '  alice rivera  ', 'alice@dti.test', 'ALICE@DTI.TEST', 'aLiCe@DtI.TeSt', '  alice@dti.test  '] as $search) {
                $params = http_build_query(['period' => 'this_week', 'search' => $search]);
                $this->getJson('/api/admin/monitoring-records?'.$params)->assertOk()
                    ->assertJsonPath('data.total', 1)->assertJsonPath('data.data.0.id', $record->id);
                $this->getJson('/api/admin/monitoring-records-matrix?'.$params)->assertOk()
                    ->assertJsonCount(1, 'data.weeks')->assertJsonCount(1, 'data.weeks.0.establishments')
                    ->assertJsonPath('data.weeks.0.establishments.0.store_id', $store->id);
            }
        } finally {
            if ($sqlite) DB::statement('PRAGMA case_sensitive_like = OFF');
        }
    }

    public function test_matrix_combines_search_and_period_before_grouping_store_prices(): void
    {
        $srp = $this->bulletin();
        $store = $this->store('Shared Store');
        $officer = User::create(['name' => 'Alice Rivera', 'email' => 'alice@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $this->record($store, [$srp->id => 20], $officer);
        $this->record($store, [$srp->id => 90])->update(['finalized_at' => now()->addMinute()]);
        $this->record($this->store('Old Store'), [$srp->id => 70], $officer)
            ->update(['finalized_at' => now()->subMonths(2)]);
        $this->record($this->store('Rejected Store'), [$srp->id => 80], $officer)
            ->update(['status' => 'rejected']);
        Sanctum::actingAs($this->evaluator(), ['dti-admin']);

        $this->getJson('/api/admin/monitoring-records?period=this_week&search=Alice')->assertOk()
            ->assertJsonPath('data.total', 1);
        $this->getJson('/api/admin/monitoring-records-matrix?period=this_week&search=Alice')->assertOk()
            ->assertJsonCount(1, 'data.weeks')->assertJsonCount(1, 'data.weeks.0.establishments')
            ->assertJsonPath('data.weeks.0.establishments.0.store_id', $store->id)
            ->assertJsonPath('data.weeks.0.establishments.0.prices.'.$srp->id.'.recorded_price', 20);
    }

    public function test_matrix_exports_all_matching_pages_and_clearing_search_restores_stores(): void
    {
        $srp = $this->bulletin();
        $storeIds = [];
        for ($index = 1; $index <= 12; $index++) {
            $store = $this->store('Matching Store '.$index);
            $storeIds[] = $store->id;
            $this->record($store, [$srp->id => 20 + $index]);
        }
        $this->record($this->store('Other Store'), [$srp->id => 90]);
        Sanctum::actingAs($this->evaluator(), ['dti-admin']);

        $this->getJson('/api/admin/monitoring-records?period=this_week&search=Matching&per_page=10')->assertOk()
            ->assertJsonCount(10, 'data.data')->assertJsonPath('data.total', 12)->assertJsonPath('data.last_page', 2);
        $data = $this->getJson('/api/admin/monitoring-records-matrix?period=this_week&search=Matching')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing($storeIds, collect($data['weeks'])->flatMap(fn ($week) => $week['establishments'])->pluck('store_id')->all());
        $this->getJson('/api/admin/monitoring-records-matrix?period=this_week&search=')->assertOk()
            ->assertJsonCount(13, 'data.weeks.0.establishments');
        $this->getJson('/api/admin/monitoring-records-matrix?period=this_week&search=NoMatch')->assertOk()
            ->assertJsonCount(0, 'data.weeks');
    }

    public function test_matrix_validates_search(): void
    {
        Sanctum::actingAs($this->evaluator(), ['dti-admin']);
        $this->getJson('/api/admin/monitoring-records-matrix?'.http_build_query(['search' => str_repeat('x', 256)]))
            ->assertUnprocessable()->assertJsonValidationErrors('search');
        $this->getJson('/api/admin/monitoring-records-matrix?search[]=store')
            ->assertUnprocessable()->assertJsonValidationErrors('search');
    }

    private function bulletin(): SrpBulletin
    {
        return SrpBulletin::create(['commodity_name' => 'Rice', 'unit' => 'kg', 'category' => 'Rice', 'baseline_price' => 20, 'is_active' => true, 'effective_date' => now()->subDay()->toDateString()]);
    }

    private function evaluator(): User
    {
        return User::create(['name' => 'DTI Evaluator', 'email' => 'evaluator@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
    }

    private function store(string $name): Store
    {
        return Store::create(['store_name' => $name, 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true]);
    }

    private function record(Store $store, array $pricesBySrpId, ?User $officer = null): MonitoringRecord
    {
        $officer ??= User::firstOrCreate(['email' => 'officer@dti.test'], ['name' => 'Field Officer', 'password' => 'password', 'role' => 'field_officer']);
        $record = MonitoringRecord::create([
            'client_uuid' => 'matrix-'.$store->id.'-'.MonitoringRecord::count(),
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

        return $record;
    }
}
