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
use Database\Seeders\OfficialEstablishmentSeeder;
use Database\Seeders\SrpMasterListSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class CapstoneMonitoringSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_complete_historical_records_evidence_and_temporal_mirrors(): void
    {
        $this->prepareCatalog();
        $this->seed(CapstoneMonitoringSeeder::class);

        $records = MonitoringRecord::query()->with(['store', 'officer', 'items.bulletin'])->orderBy('finalized_at')->get();
        $this->assertCount(10, $records);
        $this->assertSame(
            ['08:15', '08:30', '09:00', '10:15', '11:00', '12:00', '13:15', '14:00', '15:00', '15:30'],
            $records->map(fn ($record) => $record->finalized_at->setTimezone('Asia/Manila')->format('H:i'))->all()
        );
        $this->assertTrue($records->every(fn ($record) => $record->status === 'accepted'
            && $record->protocol_mode === 'standard' && $record->protocol_reference === null
            && $record->field_verification_request_id === null && $record->offline_lease_id === null
            && $record->sync_source === 'online' && $record->client_version === 'capstone-seed-2026-09-01'
            && $record->started_at->diffInMinutes($record->finalized_at) === 35.0
            && $record->finalized_at->diffInMinutes($record->received_at) === 2.0
            && $record->client_uuid === sprintf('20260901-0000-5000-8000-%012d', $record->store_id)
            && $record->representative_name === 'CAPSTONE DEMO Representative'
            && $record->representative_title === 'Store Representative'));
        $this->assertSame(3, User::query()->where('role', 'field_officer')->where('is_active', false)
            ->where('email', 'like', '%@price-watch.invalid')->count());
        $this->assertSame(
            ['HARO MART' => 6, 'Unitop General Merchandise' => 6],
            $records->filter(fn ($record) => $record->items->contains('is_anomaly', true))
                ->mapWithKeys(fn ($record) => [$record->store->store_name => $record->items->where('is_anomaly', true)->count()])
                ->sortKeys()->all()
        );
        $this->assertSame(
            array_fill_keys(SrpBulletin::query()->where('price_freeze_applicable', true)->pluck('id')->all(), 3),
            $records->flatMap->items->where('bulletin.price_freeze_applicable', true)->countBy('srp_id')->sortKeys()->all()
        );
        $this->assertTrue($records->flatMap->items->where('bulletin.price_freeze_applicable', true)
            ->groupBy('srp_id')->every(fn ($observations) => $observations->pluck('recorded_price')->unique()->count() > 1));
        $this->assertTrue($records->flatMap->items->where('bulletin.price_freeze_applicable', true)->groupBy('srp_id')
            ->every(fn ($observations) => $observations->pluck('recorded_price')->unique()->count() > 1));
        $this->assertTrue($records->every(fn ($record) => $record->items->where('bulletin.price_freeze_applicable', false)->count() === 8));

        $items = $records->flatMap->items;
        $cleanItems = $items->where('is_anomaly', false);
        $equalCount = $cleanItems->filter(fn ($item) => $item->recorded_price === $item->reference_value)->count();
        $this->assertGreaterThan(0, $equalCount);
        $this->assertLessThan($items->count() / 2, $equalCount);
        $this->assertTrue($cleanItems->every(fn ($item) => $item->recorded_price <= $item->reference_value));
        $this->assertTrue($items->every(fn ($item) => $item->reference_status === 'available'
            && $item->reference_type === 'standard_srp' && $item->reference_value > 0
            && $item->reference_effective_date && $item->reference_source_id && strlen($item->reference_version) === 64));

        foreach ($records as $record) {
            $this->assertLessThan(10, $this->distanceMeters($record->store->latitude, $record->store->longitude, $record->latitude, $record->longitude));
            $this->assertGreaterThanOrEqual(5, $record->location_accuracy_meters);
            $this->assertLessThanOrEqual(12, $record->location_accuracy_meters);
            foreach ([[$record->officer_signature_path, $record->officer_signature_sha256], [$record->representative_signature_path, $record->representative_signature_sha256]] as [$path, $hash]) {
                Storage::disk('receipt_evidence')->assertExists($path);
                $bytes = Storage::disk('receipt_evidence')->get($path);
                $this->assertSame($hash, hash('sha256', $bytes));
                $this->assertNotFalse(getimagesizefromstring($bytes));
            }
            foreach ($record->items as $item) {
                $mirror = TemporalInspection::query()->where('monitoring_record_item_id', $item->id)->first();
                $this->assertNotNull($mirror);
                $this->assertSame($record->id, $mirror->monitoring_record_id);
                $this->assertSame($record->store_id, $mirror->store_id);
                $this->assertSame($record->officer_user_id, $mirror->officer_user_id);
                $this->assertSame($item->srp_id, $mirror->srp_id);
                $this->assertSame($item->recorded_price, $mirror->recorded_price);
                $this->assertSame($item->is_anomaly, $mirror->is_flagged);
                $this->assertSame('verified', $mirror->validation_status);
                $this->assertTrue($record->finalized_at->equalTo($mirror->inspection_timestamp));
            }
        }
        $this->assertDatabaseCount('temporal_inspections', $items->count());
        $this->assertSame(10, AuditEvent::query()->where('action', 'monitoring.capstone_demo_seeded')->count());
    }

    public function test_a_second_run_is_a_no_op(): void
    {
        $this->prepareCatalog();
        $this->seed(CapstoneMonitoringSeeder::class);
        $before = $this->datasetCounts();
        $files = Storage::disk('receipt_evidence')->allFiles();

        $this->seed(CapstoneMonitoringSeeder::class);

        $this->assertSame($before, $this->datasetCounts());
        $this->assertSame($files, Storage::disk('receipt_evidence')->allFiles());
    }

    public function test_a_different_partial_dataset_aborts_without_repairing_history(): void
    {
        $this->prepareCatalog();
        $this->seed(CapstoneMonitoringSeeder::class);
        $item = MonitoringRecordItem::query()->firstOrFail();
        $item->update(['recorded_price' => $item->recorded_price + 1]);
        $before = $this->datasetCounts();
        $files = Storage::disk('receipt_evidence')->allFiles();

        try {
            $this->seed(CapstoneMonitoringSeeder::class);
            $this->fail('Expected mismatched historical data to abort.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('differs for store', $exception->getMessage());
        }

        $this->assertSame($before, $this->datasetCounts());
        $this->assertSame($item->recorded_price, $item->fresh()->recorded_price);
        $this->assertSame($files, Storage::disk('receipt_evidence')->allFiles());
    }

    public function test_non_demo_weekly_data_aborts_before_any_capstone_write(): void
    {
        $this->prepareCatalog();
        $officer = User::create(['name' => 'Real Officer', 'email' => 'real@example.test', 'password' => 'password', 'role' => 'field_officer']);
        $this->createAcceptedRecord($officer, Store::query()->where('is_active', true)->firstOrFail());

        try {
            $this->seed(CapstoneMonitoringSeeder::class);
            $this->fail('Expected the non-demo weekly record preflight to abort.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('non-demo accepted standard routine record', $exception->getMessage());
        }
        $this->assertSame(0, MonitoringRecord::query()->where('client_version', 'capstone-seed-2026-09-01')->count());
        $this->assertSame(0, User::query()->where('email', 'like', '%@price-watch.invalid')->count());
        $this->assertSame([], Storage::disk('receipt_evidence')->allFiles());
    }

    public function test_incomplete_covered_catalog_identity_aborts_before_writes(): void
    {
        $this->prepareCatalog();
        SrpBulletin::query()->where('price_freeze_applicable', true)->firstOrFail()->update(['commodity_key' => null]);

        try {
            $this->seed(CapstoneMonitoringSeeder::class);
            $this->fail('Expected the incomplete catalog preflight to abort.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('incomplete or duplicated', $exception->getMessage());
        }
        $this->assertSame(0, MonitoringRecord::query()->count());
    }

    public function test_colliding_covered_catalog_identity_aborts_before_writes(): void
    {
        $this->prepareCatalog();
        SrpBulletin::create([
            'commodity_name' => 'Wrong Commodity', 'unit' => '1 kg', 'commodity_key' => 'covered-product-1',
            'baseline_price' => 99, 'effective_date' => '2026-08-01', 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'Wrong source',
        ]);
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('incomplete or duplicated');
        $this->seed(CapstoneMonitoringSeeder::class);
    }

    public function test_snapshots_stay_historical_and_apc_candidates_use_only_the_seeded_source_week(): void
    {
        $this->prepareCatalog();
        $this->seed(CapstoneMonitoringSeeder::class);
        $sample = MonitoringRecord::query()->with('items.bulletin')->firstOrFail()->items->firstOrFail();
        $snapshot = $sample->only(['reference_value', 'reference_source_id', 'reference_version']);
        SrpBulletin::create([
            'commodity_name' => $sample->bulletin->commodity_name, 'unit' => $sample->bulletin->unit,
            'commodity_key' => $sample->bulletin->commodity_key, 'baseline_price' => 999,
            'effective_date' => '2026-09-08', 'is_active' => true,
            'price_freeze_applicable' => $sample->bulletin->price_freeze_applicable, 'source_reference' => 'Later revision',
        ]);
        $this->assertSame($snapshot, $sample->fresh()->only(array_keys($snapshot)));

        $admin = User::create(['name' => 'DTI Admin', 'email' => 'capstone-admin@example.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $emergency = RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'declaration_reference' => 'CAPSTONE-DRAFT-ONLY', 'status' => 'draft', 'responsible_admin_id' => $admin->id,
        ]);
        $prepared = app(EmergencyApcPreparationService::class)->prepare($emergency, $admin);

        $this->assertSame('2026-08-30T16:00:00+00:00', $prepared->source_week_starts_at->toIso8601String());
        $this->assertSame('2026-09-06T16:00:00+00:00', $prepared->source_week_ends_at->toIso8601String());
        $this->assertCount(30, $prepared->candidates);
        foreach ($prepared->candidates as $candidate) {
            $prices = collect($candidate->source_item_ids)->map(fn ($id) => (float) MonitoringRecordItem::findOrFail($id)->recorded_price);
            $this->assertSame(3, $candidate->observation_count);
            $this->assertSame(3, $candidate->establishment_count);
            $this->assertSame($prices->min(), $candidate->minimum_price);
            $this->assertSame($prices->max(), $candidate->maximum_price);
            $this->assertSame(round($prices->average(), 2), $candidate->observed_average_price);
            $this->assertSame(round(($prices->min() + $prices->max()) / 2, 2), $candidate->computed_apc_price);
        }
        $this->assertDatabaseCount('regulatory_price_records', 0);
        $this->assertSame([], $prepared->candidates->pluck('commodity_key')->intersect(
            SrpBulletin::query()->where('price_freeze_applicable', false)->pluck('commodity_key')
        )->values()->all());
    }

    public function test_master_list_derives_missing_keys_and_preserves_existing_keys(): void
    {
        SrpBulletin::create([
            'commodity_name' => 'Preserved Product (1 kg)', 'unit' => '1 kg', 'commodity_key' => 'regulatory-lineage-key',
            'baseline_price' => 10, 'effective_date' => '2026-01-01', 'is_active' => true,
        ]);
        File::shouldReceive('exists')->andReturn(true);
        File::shouldReceive('get')->andReturn(json_encode(['metadata' => ['effective_date' => '2026-05-11'], 'items' => [
            ['item_name' => 'Derived Product', 'unit' => '500 g', 'srp' => 25, 'price_freeze_applicable' => true],
            ['item_name' => 'Preserved Product', 'unit' => '1 kg', 'srp' => 30, 'price_freeze_applicable' => true],
        ]]));
        $this->seed(SrpMasterListSeeder::class);
        $this->assertDatabaseHas('srp_bulletins', ['commodity_name' => 'Derived Product (500 g)', 'commodity_key' => 'derived-product-500-g']);
        $this->assertDatabaseHas('srp_bulletins', ['commodity_name' => 'Preserved Product (1 kg)', 'commodity_key' => 'regulatory-lineage-key']);
    }

    public function test_master_list_rejects_a_derived_key_collision(): void
    {
        SrpBulletin::create([
            'commodity_name' => 'Different Product', 'unit' => 'box', 'commodity_key' => 'derived-product-500-g',
            'baseline_price' => 10, 'effective_date' => '2026-01-01', 'is_active' => true,
        ]);
        File::shouldReceive('exists')->andReturn(true);
        File::shouldReceive('get')->andReturn(json_encode(['items' => [
            ['item_name' => 'Derived Product', 'unit' => '500 g', 'srp' => 25, 'price_freeze_applicable' => true],
        ]]));
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('commodity_key collision');
        $this->seed(SrpMasterListSeeder::class);
    }

    private function prepareCatalog(): void
    {
        Storage::fake('receipt_evidence');
        $this->seed(OfficialEstablishmentSeeder::class);
        $this->createBulletins(30, true);
        $this->createBulletins(12, false);
    }

    private function createBulletins(int $count, bool $covered): void
    {
        for ($index = 1; $index <= $count; $index++) {
            SrpBulletin::create([
                'commodity_name' => ($covered ? 'Covered' : 'Other').' Product '.$index,
                'unit' => '500 g', 'commodity_key' => ($covered ? 'covered' : 'other').'-product-'.$index,
                'baseline_price' => $covered && $index === 2 ? 0.10 : 20 + $index + ($index % 2 ? 0.20 : 0),
                'effective_date' => '2026-05-11', 'is_active' => true,
                'price_freeze_applicable' => $covered, 'source_reference' => 'DTI SRP 2026-05-11',
            ]);
        }
    }

    private function createAcceptedRecord(User $officer, Store $store): void
    {
        MonitoringRecord::create([
            'client_uuid' => '00000000-0000-4000-8000-000000000001', 'officer_user_id' => $officer->id,
            'store_id' => $store->id, 'status' => 'accepted', 'started_at' => '2026-09-01 00:00:00',
            'finalized_at' => '2026-09-01 00:35:00', 'received_at' => '2026-09-01 00:37:00',
            'latitude' => $store->latitude, 'longitude' => $store->longitude, 'location_accuracy_meters' => 5,
            'location_captured_at' => '2026-09-01 00:33:00', 'representative_name' => 'Real Representative',
            'officer_signature_disk' => 'receipt_evidence', 'officer_signature_path' => 'real-officer.png',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'receipt_evidence',
            'representative_signature_path' => 'real-representative.png', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online', 'protocol_mode' => 'standard',
        ]);
    }

    private function datasetCounts(): array
    {
        return [User::query()->count(), MonitoringRecord::query()->count(), MonitoringRecordItem::query()->count(),
            TemporalInspection::query()->count(), AuditEvent::query()->count()];
    }

    private function distanceMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $lat = deg2rad(($lat1 + $lat2) / 2);
        $x = deg2rad($lon2 - $lon1) * cos($lat);
        $y = deg2rad($lat2 - $lat1);

        return sqrt($x * $x + $y * $y) * 6371000;
    }
}
