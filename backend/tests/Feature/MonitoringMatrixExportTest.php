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
}
