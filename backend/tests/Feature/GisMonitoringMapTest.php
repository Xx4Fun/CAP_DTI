<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Data behind the GIS Monitoring layers: one Manila monitoring week of visits, prices and coverage inputs. */
class GisMonitoringMapTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private SrpBulletin $sardines;

    private int $seed = 0;

    protected function setUp(): void
    {
        parent::setUp();
        // Wednesday of the Manila week Monday 28 Sep - Sunday 4 Oct 2026.
        $this->travelTo(CarbonImmutable::parse('2026-09-30 12:00', 'Asia/Manila'));
        $this->admin = User::create(['name' => 'DTI Evaluator', 'email' => 'evaluator@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        Sanctum::actingAs($this->admin);
        $this->sardines = SrpBulletin::create(['commodity_name' => 'Saba Sardines', 'unit' => '155g', 'commodity_key' => 'saba-sardines-155g', 'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true]);
    }

    private function store(string $name): Store
    {
        return Store::create(['store_name' => $name, 'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'San Jose, Antique', 'is_active' => true]);
    }

    /** A Manila wall-clock time as the UTC instant the database stores. */
    private function manila(string $time): CarbonImmutable
    {
        return CarbonImmutable::parse($time, 'Asia/Manila')->utc();
    }

    /** An accepted visit; pass a price to record the sardines line against a captured reference of 50. */
    private function visit(Store $store, string $manilaTime, ?float $price = null, array $overrides = []): MonitoringRecord
    {
        $at = $this->manila($manilaTime);
        $record = MonitoringRecord::create($overrides + [
            'client_uuid' => sprintf('30000000-0000-4000-8000-%012d', ++$this->seed), 'officer_user_id' => $this->admin->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => $at->subHour(), 'finalized_at' => $at, 'received_at' => $at,
            'latitude' => 10.7401, 'longitude' => 121.9402, 'location_accuracy_meters' => 8, 'location_captured_at' => $at,
            'representative_name' => 'Store Representative', 'protocol_mode' => 'standard',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'representative.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);
        if ($price !== null) {
            MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $this->sardines->id, 'recorded_price' => $price, 'baseline_price' => 50,
                'variance_percent' => round(($price - 50) / 50 * 100, 2), 'is_anomaly' => $price > 55, 'reference_status' => 'available',
                'reference_type' => 'standard_srp', 'reference_label' => 'Captured SRP', 'reference_value' => 50,
                'reference_source' => 'DTI-2026', 'reference_effective_date' => '2026-01-01',
            ]);
        }

        return $record;
    }

    private function verification(Store $store, string $status = 'claimed'): FieldVerificationRequest
    {
        return FieldVerificationRequest::create([
            'source_type' => 'supervisor_directive', 'store_id' => $store->id, 'requested_by' => $this->admin->id,
            'claimed_by' => $this->admin->id, 'status' => $status, 'reason' => 'Check posted prices.', 'context_json' => [],
            'requested_at' => now(), 'claimed_at' => now(),
        ]);
    }

    private function map(string $query = ''): array
    {
        return $this->getJson('/api/admin/gis/monitoring'.$query)->assertOk()->json('data');
    }

    private function storeIn(array $data, Store $store): array
    {
        return collect($data['stores'])->firstWhere('id', $store->id);
    }

    public function test_a_week_is_the_manila_week_and_is_keyed_by_its_manila_monday(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        // Monday 01:00 in Manila is still Sunday in UTC.
        $this->visit($store, '2026-09-28 01:00');
        $this->visit($store, '2026-09-27 23:00');

        $data = $this->map('?week=2026-09-30');

        $this->assertSame('2026-09-28', $data['week']['key']);
        $this->assertSame('2026-10-04', $data['week']['ends_on']);
        $this->assertSame('2026-09-27T16:00:00+00:00', $data['week']['starts_at']);
        $this->assertTrue($data['week']['is_current']);
        $this->assertCount(1, $this->storeIn($data, $store)['visits']);
        // No week given: the current one.
        $this->assertSame('2026-09-28', $this->map()['week']['key']);
        $this->assertFalse($this->map('?week=2026-09-21')['week']['is_current']);
    }

    public function test_coverage_inputs_count_routine_visits_only(): void
    {
        $monitored = $this->store('A Monitored');
        $lapsed = $this->store('B Not monitored');
        $never = $this->store('C Never monitored');
        $verifiedOnly = $this->store('D Verification only');
        $this->visit($monitored, '2026-09-29 10:00');
        $this->visit($lapsed, '2026-09-22 10:00');
        $this->visit($verifiedOnly, '2026-09-29 11:00', null, ['field_verification_request_id' => $this->verification($verifiedOnly, 'completed')->id]);

        $data = $this->map();

        $this->assertTrue($this->storeIn($data, $monitored)['visits'][0]['is_routine']);
        $this->assertSame([], $this->storeIn($data, $lapsed)['visits']);
        $this->assertTrue($this->storeIn($data, $lapsed)['has_prior_routine_visit']);
        $this->assertSame([], $this->storeIn($data, $never)['visits']);
        $this->assertFalse($this->storeIn($data, $never)['has_prior_routine_visit']);
        // A verification visit is listed but is not routine coverage, this week or as history for a later one.
        $this->assertFalse($this->storeIn($data, $verifiedOnly)['visits'][0]['is_routine']);
        $this->assertFalse($this->storeIn($data, $verifiedOnly)['has_prior_routine_visit']);
        $this->assertFalse($this->storeIn($this->map('?week=2026-10-05'), $verifiedOnly)['has_prior_routine_visit']);
        // A visit in the selected week is not "prior" to it.
        $this->assertFalse($this->storeIn($data, $monitored)['has_prior_routine_visit']);
        $this->assertTrue($this->storeIn($this->map('?week=2026-10-05'), $monitored)['has_prior_routine_visit']);

        // In a normal week the map agrees with Field Monitoring's weekly status.
        $weekly = collect($this->getJson('/api/admin/monitoring-establishments?per_page=50')->assertOk()->json('data.establishments.data'))
            ->mapWithKeys(fn ($row) => [$row['id'] => $row['weekly_routine_status'] === 'monitored_this_week']);
        foreach ($data['stores'] as $row) {
            $this->assertSame($weekly[$row['id']], collect($row['visits'])->contains('is_routine', true), $row['store_name']);
        }
    }

    public function test_an_open_verification_request_is_flagged(): void
    {
        $flagged = $this->store('Flagged');
        $clear = $this->store('Clear');
        $this->verification($flagged, 'open');
        $this->verification($clear, 'completed');

        $data = $this->map();

        $this->assertTrue($this->storeIn($data, $flagged)['verification_required']);
        $this->assertFalse($this->storeIn($data, $clear)['verification_required']);
    }

    public function test_coordinates_are_released_only_on_request_and_audited(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $record = $this->visit($store, '2026-09-29 10:00');

        $plain = $this->getJson('/api/admin/gis/monitoring')->assertOk();
        $this->assertFalse($plain->json('data.locations'));
        $this->assertArrayNotHasKey('latitude', $this->storeIn($plain->json('data'), $store)['visits'][0]);
        $this->assertStringNotContainsString('no-store', (string) $plain->headers->get('Cache-Control'));
        $this->assertSame(0, AuditEvent::where('action', 'gis.visit_locations_viewed')->count());

        $located = $this->getJson('/api/admin/gis/monitoring?locations=1')->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertTrue($located->json('data.locations'));
        $visit = $this->storeIn($located->json('data'), $store)['visits'][0];
        $this->assertEquals([10.7401, 121.9402, 8], [$visit['latitude'], $visit['longitude'], $visit['accuracy_meters']]);
        $event = AuditEvent::where('action', 'gis.visit_locations_viewed')->sole();
        $this->assertSame($this->admin->id, $event->actor_id);
        $this->assertSame(['week' => '2026-09-28', 'record_ids' => [$record->id]], $event->metadata);

        // Axios would send "true"; only 1 or 0 is a valid wire value.
        $this->getJson('/api/admin/gis/monitoring?locations=true')->assertUnprocessable();
    }

    public function test_coordinates_are_withheld_when_the_audit_trail_is_unavailable(): void
    {
        $this->visit($this->store('Gaisano Grand Mall'), '2026-09-29 10:00');
        Schema::drop('audit_events');

        $this->getJson('/api/admin/gis/monitoring?locations=1')->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE')->assertJsonMissingPath('data');
        // The coordinate-free map still works.
        $this->getJson('/api/admin/gis/monitoring')->assertOk();
    }

    public function test_a_price_keeps_the_reference_captured_on_the_visit(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $record = $this->visit($store, '2026-09-29 10:00', 60);
        // The SRP is revised afterwards; the visit's captured reference must not move.
        $this->sardines->forceFill(['baseline_price' => 80])->save();

        $price = $this->storeIn($this->map(), $store)['prices'][0];

        $this->assertSame('saba-sardines-155g|155g', $price['commodity']);
        $this->assertSame('Saba Sardines', $price['commodity_name']);
        $this->assertSame($record->id, $price['monitoring_record_id']);
        $this->assertEquals(60, $price['recorded_price']);
        $this->assertEquals(50, $price['reference_value']);
        $this->assertSame('available', $price['reference_status']);
        $this->assertTrue($price['is_anomaly']);
    }

    public function test_the_latest_visit_supplies_a_commodity_price_and_ties_go_to_the_higher_id(): void
    {
        $later = $this->store('Later wins');
        $this->visit($later, '2026-09-30 09:00', 58);
        $this->visit($later, '2026-09-29 09:00', 52);
        $tied = $this->store('Tie');
        $this->visit($tied, '2026-09-29 09:00', 53);
        $second = $this->visit($tied, '2026-09-29 09:00', 57, ['field_verification_request_id' => $this->verification($tied, 'completed')->id]);

        $data = $this->map();

        $this->assertEquals(58, $this->storeIn($data, $later)['prices'][0]['recorded_price']);
        $this->assertCount(1, $this->storeIn($data, $tied)['prices']);
        $this->assertEquals(57, $this->storeIn($data, $tied)['prices'][0]['recorded_price']);
        $this->assertSame($second->id, $this->storeIn($data, $tied)['prices'][0]['monitoring_record_id']);
        $this->assertSame($second->id, collect($this->storeIn($data, $tied)['visits'])->last()['id']);
    }

    public function test_weeks_lists_every_week_with_an_accepted_visit_plus_the_current_week(): void
    {
        $store = $this->store('Gaisano Grand Mall');
        $this->visit($store, '2026-09-08 10:00');
        $this->visit($store, '2026-09-14 00:30');
        $this->visit($store, '2026-09-16 10:00', null, ['status' => 'rejected']);
        $this->visit($store, '2026-08-20 10:00', null, ['status' => 'rejected']);

        $this->assertSame(['2026-09-07', '2026-09-14', '2026-09-28'], $this->map()['weeks']);
    }

    public function test_an_invalid_week_is_rejected(): void
    {
        $this->getJson('/api/admin/gis/monitoring?week=30-09-2026')->assertUnprocessable();
    }

    public function test_a_field_officer_cannot_read_the_map(): void
    {
        Sanctum::actingAs(User::create(['name' => 'Officer', 'email' => 'officer@dti.test', 'password' => 'secret-password', 'role' => 'field_officer']));

        $this->getJson('/api/admin/gis/monitoring')->assertForbidden();
    }
}
