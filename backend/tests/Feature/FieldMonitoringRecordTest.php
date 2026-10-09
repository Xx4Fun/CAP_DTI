<?php

namespace Tests\Feature;

use App\Models\FieldOfflineLease;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldMonitoringRecordTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function fieldSession(): array
    {
        $officer = User::create([
            'name' => 'Field Officer', 'email' => 'field@dti.test',
            'password' => 'secure-password', 'role' => 'field_officer',
        ]);
        $login = $this->postJson('/api/field/login', ['email' => $officer->email, 'password' => 'secure-password'])->assertOk();

        return [$officer, $login->json('token'), $login->json('offline_lease.id')];
    }

    private function store(): Store
    {
        return Store::create([
            'dti_sec_number' => 'SEC-FIELD-1', 'store_name' => 'San Isidro Grocery',
            'owner_name' => 'Maria Santos', 'latitude' => 10.7424, 'longitude' => 121.9406,
            'address' => 'San Jose de Buenavista', 'is_active' => true,
        ]);
    }

    private function bulletin(string $name, float $price): SrpBulletin
    {
        return SrpBulletin::create([
            'commodity_name' => $name, 'commodity_key' => strtolower($name), 'baseline_price' => $price,
            'effective_date' => now()->subDay()->toDateString(), 'source_reference' => 'SRP-'.strtoupper($name), 'is_active' => true,
        ]);
    }

    private function priorInspection(Store $store, SrpBulletin $bulletin, float $price, ?Carbon $at = null): TemporalInspection
    {
        return TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => $price, 'is_flagged' => false,
            'inspection_timestamp' => $at ?? now()->subDays(7), 'officer_signature' => 'signed', 'validation_status' => 'verified',
        ]);
    }

    private function payload(Store $store, array $bulletins, string $uuid = '4cb0a181-a590-4f95-b96e-aadab8e09a67', ?Carbon $finalizedAt = null): array
    {
        $finalizedAt ??= now()->subMinute();
        $resolver = app(FieldReferenceResolver::class);

        return [
            'records' => [[
                'client_uuid' => $uuid,
                'store_id' => $store->id,
                'offline_lease_id' => $this->leaseId,
                'started_at' => now()->subMinutes(20)->toIso8601String(),
                'finalized_at' => $finalizedAt->toIso8601String(),
                'location' => [
                    'latitude' => 10.7425, 'longitude' => 121.9407,
                    'accuracy_meters' => 12.5, 'captured_at' => now()->subMinute()->toIso8601String(),
                ],
                'representative' => ['name' => 'Maria Santos', 'title' => 'Store manager'],
                'signatures' => [
                    'officer_png_base64' => base64_encode("\x89PNG\r\n\x1a\nofficer-signature"),
                    'representative_png_base64' => base64_encode("\x89PNG\r\n\x1a\nrepresentative-signature"),
                ],
                'sync_source' => 'offline_queue', 'client_version' => '1.1.0',
                'items' => collect($bulletins)->map(function (SrpBulletin $bulletin, int $index) use ($resolver, $finalizedAt) {
                    $reference = $resolver->resolve($bulletin, $finalizedAt);

                    return [
                        'srp_id' => $bulletin->id,
                        'recorded_price' => $index === 0 ? 115.00 : 45.00,
                        'reference_snapshot' => [
                            'status' => $reference['status'], 'type' => $reference['type'],
                            'source_id' => $reference['source_id'], 'value' => $reference['value'],
                            'label' => $reference['label'], 'source_reference' => $reference['source'],
                            'effective_date' => $reference['effective_date'],
                            'reference_version' => $resolver->version($reference),
                        ],
                    ];
                })->all(),
            ]],
        ];
    }

    private string $leaseId;

    public function test_a_signed_visit_queued_before_manual_ending_retains_its_freeze_reference_when_synced_afterward(): void
    {
        Storage::fake('receipt_evidence');
        Carbon::setTestNow(Carbon::parse('2026-10-08 01:59:00', 'UTC'));
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $rice = $this->bulletin('Rice', 100);
        $rice->update(['price_freeze_applicable' => true]);
        $milk = $this->bulletin('Milk', 50);
        $admin = User::factory()->create(['role' => 'dti_evaluator']);
        $emergency = RegulatoryEmergency::create(['location' => 'San Jose', 'starts_on' => '2026-10-07', 'declaration_reference' => 'QUEUED-FREEZE', 'status' => 'active', 'confirmed_at' => '2026-10-07', 'responsible_admin_id' => $admin->id]);
        RegulatoryPriceRecord::create(['regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC', 'authoritative_price' => 90, 'effective_from' => '2026-10-07', 'location' => 'San Jose', 'declaration_reference' => 'QUEUED-FREEZE', 'source_reference' => 'Confirmed APC', 'created_by' => $admin->id]);
        $payload = $this->payload($this->store(), [$rice, $milk]);
        $this->assertSame('emergency_ceiling', $payload['records'][0]['items'][0]['reference_snapshot']['type']);
        Carbon::setTestNow(Carbon::parse('2026-10-08 02:00:00.123456', 'UTC'));
        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/emergencies/{$emergency->id}", ['status' => 'ended', 'ends_on' => '2026-10-08', 'confirmed' => true])
            ->assertOk()->assertJsonPath('data.effective_state', 'ended');
        $this->app['auth']->forgetGuards();
        Carbon::setTestNow(Carbon::parse('2026-10-08 02:05:00', 'UTC'));
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_records', ['id' => $recordId, 'protocol_mode' => 'emergency', 'protocol_reference' => 'QUEUED-FREEZE']);
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'srp_id' => $rice->id, 'reference_type' => 'emergency_ceiling', 'reference_value' => 90]);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertSame('standard_srp', (new FieldReferenceResolver)->resolve($rice, now())['type']);
    }

    public function test_sync_accepts_one_complete_visit_exactly_once_and_projects_verified_temporal_rows(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletins[0]->id,
            'recorded_price' => 108, 'is_flagged' => false,
            'inspection_timestamp' => now()->subDays(2), 'officer_signature' => 'legacy-signed',
            'validation_status' => 'verified',
        ]);

        $payload = $this->payload($store, $bulletins);
        $first = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()
            ->assertJsonPath('data.results.0.status', 'accepted')
            ->assertJsonPath('data.results.0.item_count', 2)
            ->assertJsonPath('data.results.0.anomaly_count', 1);

        $recordId = $first->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_records', ['id' => $recordId, 'officer_user_id' => $officer->id, 'status' => 'accepted']);
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'is_anomaly' => true]);
        $this->assertSame(2, TemporalInspection::where('monitoring_record_id', $recordId)->where('validation_status', 'verified')->count());
        $this->assertCount(2, Storage::disk('receipt_evidence')->allFiles("field-monitoring/{$recordId}"));

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');

        $bulletins[0]->update(['is_active' => false]);
        SrpBulletin::create([
            'commodity_name' => 'Rice revised', 'commodity_key' => 'rice', 'baseline_price' => 105,
            'effective_date' => now('Asia/Manila')->toDateString(), 'source_reference' => 'SRP-RICE-REVISED', 'is_active' => true,
        ]);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertDatabaseCount('monitoring_records', 1);
        $this->assertSame(2, TemporalInspection::where('monitoring_record_id', $recordId)->count());
    }

    public function test_sync_rejects_a_second_routine_visit_in_the_same_monitoring_period(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated();
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload(
            $store, $bulletins, '5cb0a181-a590-4f95-b96e-aadab8e09a67'
        ))->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.store_id')
            ->assertJsonFragment(['This establishment already has an accepted routine visit for the current monitoring period.']);

        $this->assertDatabaseCount('monitoring_records', 1);
    }

    public function test_price_freeze_requires_an_emergency_routine_visit_even_after_a_standard_visit_that_day(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated();

        RegulatoryEmergency::create([
            'location' => 'Systemwide', 'starts_on' => now('Asia/Manila')->toDateString(),
            'declaration_reference' => 'PF-TODAY', 'status' => 'active',
            'confirmed_at' => now(), 'responsible_admin_id' => $officer->id,
        ]);

        $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()
            ->assertJsonPath('data.monitoring_period.cadence', 'daily')
            ->assertJsonPath('data.monitoring_period.protocol_mode', 'emergency')
            ->assertJsonPath('data.stores.0.routine_status', 'due');
    }

    public function test_normal_weekly_routine_resumes_after_price_freeze_ends(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15 02:00:00', 'UTC'));
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $emergency = RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-09-14', 'ends_on' => '2026-09-15',
            'declaration_reference' => 'PF-RESUME', 'status' => 'active',
            'confirmed_at' => '2026-09-14 00:00:00', 'responsible_admin_id' => $officer->id,
        ]);

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated();
        $emergency->update(['status' => 'ended', 'active_scope_key' => null]);
        Carbon::setTestNow(Carbon::parse('2026-09-16 02:00:00', 'UTC'));

        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonPath('data.monitoring_period.protocol_mode', 'standard')
            ->assertJsonPath('data.stores.0.routine_status', 'due')
            ->assertJsonPath('data.stores.0.weekly_routine_status', 'not_yet_monitored');

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload(
            $store, $bulletins, '6cb0a181-a590-4f95-b96e-aadab8e09a67'
        ))->assertCreated();
        $this->assertDatabaseCount('monitoring_records', 2);
        $this->assertSame(['emergency', 'standard'], MonitoringRecord::orderBy('id')->pluck('protocol_mode')->all());
    }

    public function test_bootstrap_downloads_active_field_data_and_returns_the_full_payload_even_when_the_version_matches(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $store->update(['image_path' => 'store_images/gaisano-grand.webp']);
        $bulletin = $this->bulletin('Rice', 100);
        TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id,
            'recorded_price' => 108, 'is_flagged' => false,
            'inspection_timestamp' => now()->subDay(), 'officer_signature' => 'signed',
            'validation_status' => 'verified',
        ]);

        $full = $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonPath('data.is_delta', false)
            ->assertJsonPath('data.stores.0.id', $store->id)
            ->assertJsonPath('data.stores.0.owner_name', $store->owner_name)
            ->assertJsonPath('data.stores.0.image_path', Storage::disk('public')->url('store_images/gaisano-grand.webp'))
            ->assertJsonPath('data.srp_bulletins.0.id', $bulletin->id)
            ->assertJsonPath('data.monitoring_references.0.srp_id', $bulletin->id)
            ->assertJsonPath('data.monitoring_references.0.type', 'standard_srp')
            ->assertJsonPath('data.monitoring_references.0.source_id', $bulletin->id)
            ->assertJsonPath('data.monitoring_references.0.value', 100)
            ->assertJsonPath('data.recent_prices.0.recorded_price', 108);

        // Versions come from second-precision timestamps and can collide across writes in the same second, so never answer with a delta.
        $version = rawurlencode($full->json('data.version'));
        $this->withToken($token)->getJson("/api/field/bootstrap?since={$version}")
            ->assertOk()->assertJsonPath('data.is_delta', false)
            ->assertJsonPath('data.stores.0.id', $store->id)
            ->assertJsonPath('data.srp_bulletins.0.id', $bulletin->id)
            ->assertJsonPath('data.monitoring_references.0.srp_id', $bulletin->id)
            ->assertJsonPath('data.recent_prices.0.recorded_price', 108);
    }

    public function test_sync_preserves_a_validated_reference_snapshot_and_rejects_a_mismatch_before_creating_evidence(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $references = collect($this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.monitoring_references'))
            ->keyBy('srp_id');
        $payload = $this->payload($store, $bulletins);
        foreach ($payload['records'][0]['items'] as &$item) {
            unset($item['reference_snapshot']);
        }
        unset($item);
        $payload['records'][0]['client_version'] = '1.0.0';
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()->assertJsonPath('status', 'REFERENCE_SNAPSHOT_REQUIRED');
        foreach ($payload['records'][0]['items'] as &$item) {
            $reference = $references->get($item['srp_id']);
            $item['reference_snapshot'] = [
                'status' => $reference['status'], 'type' => $reference['type'],
                'source_id' => $reference['source_id'], 'value' => $reference['value'],
                'label' => $reference['label'], 'source_reference' => $reference['source'],
                'effective_date' => $reference['effective_date'],
                'reference_version' => $reference['reference_version'],
            ];
        }
        unset($item);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'reference_type' => 'standard_srp', 'reference_value' => 100,
            'reference_version' => $references->get($bulletins[0]->id)['reference_version'],
        ]);

        $otherStore = Store::create([
            'store_name' => 'Mismatch Market', 'address' => 'San Jose de Buenavista',
            'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true,
        ]);
        $forged = $this->payload($otherStore, $bulletins, '9cb0a181-a590-4f95-b96e-aadab8e09a67');
        $forged['records'][0]['items'][0]['reference_snapshot'] = $payload['records'][0]['items'][0]['reference_snapshot'];
        $forged['records'][0]['items'][0]['reference_snapshot']['reference_version'] = str_repeat('f', 64);
        $forged['records'][0]['items'][1]['reference_snapshot'] = $payload['records'][0]['items'][1]['reference_snapshot'];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $forged)
            ->assertConflict()->assertJsonPath('status', 'REFERENCE_PACKAGE_MISMATCH');
        $this->assertDatabaseMissing('monitoring_records', ['client_uuid' => '9cb0a181-a590-4f95-b96e-aadab8e09a67']);
        $this->assertSame([], Storage::disk('receipt_evidence')->allFiles('field-monitoring/2'));
    }

    public function test_bootstrap_keeps_current_unkeyed_srp_rows_distinct_by_id(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $first = SrpBulletin::create([
            'commodity_name' => 'Argentina (150g)', 'commodity_key' => null,
            'category' => 'Meat Loaf', 'unit' => '150g', 'baseline_price' => 23.75,
            'effective_date' => now('Asia/Manila')->subDay()->toDateString(), 'is_active' => true,
        ]);
        $second = SrpBulletin::create([
            'commodity_name' => 'Argentina (150g)', 'commodity_key' => null,
            'category' => 'Corned Beef', 'unit' => '150g', 'baseline_price' => 36.75,
            'effective_date' => now('Asia/Manila')->subDay()->toDateString(), 'is_active' => true,
        ]);

        $response = $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()->assertJsonCount(2, 'data.srp_bulletins');

        $this->assertEqualsCanonicalizing(
            [$first->id, $second->id],
            collect($response->json('data.srp_bulletins'))->pluck('id')->all(),
        );
    }

    public function test_sync_rejects_missing_dual_signature_or_an_inaccurate_location(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        unset($payload['records'][0]['signatures']['representative_png_base64']);
        $payload['records'][0]['location']['accuracy_meters'] = 150;

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'records.0.signatures.representative_png_base64',
                'records.0.location.accuracy_meters',
            ]);
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_signature_content_that_is_not_a_png(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['signatures']['officer_png_base64'] = base64_encode('not-a-png-file');

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.signatures.officer_png_base64');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_a_commodity_that_is_no_longer_active(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $bulletins[0]->update(['is_active' => false]);

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('records.0.items');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_rejects_a_visit_finalized_after_its_offline_lease_expired(): void
    {
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        FieldOfflineLease::findOrFail($this->leaseId)->update(['expires_at' => now()->subMinutes(5)]);
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The offline authorization lease did not cover this finalized visit.');
        $this->assertDatabaseCount('monitoring_records', 0);
    }

    public function test_sync_fails_closed_and_removes_signature_files_when_its_acceptance_audit_cannot_be_written(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        Schema::drop('audit_events');

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');

        $this->assertDatabaseCount('monitoring_records', 0);
        $this->assertSame([], Storage::disk('receipt_evidence')->allFiles('field-monitoring'));
    }

    public function test_sync_uses_an_unsourced_unkeyed_current_srp_as_a_provisional_baseline(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $bulletins[0]->update(['commodity_key' => null, 'source_reference' => null]);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'reference_status' => 'available', 'reference_type' => 'standard_srp',
            'reference_label' => 'SRP baseline (provisional)', 'reference_value' => 100,
            'reference_source' => null, 'is_anomaly' => true,
        ]);
    }

    public function test_standard_reference_flags_any_price_above_the_srp_and_not_the_srp_itself(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['items'][0]['recorded_price'] = 100.01;
        $payload['records'][0]['items'][1]['recorded_price'] = 50;

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'is_anomaly' => true, 'finding_basis' => 'standard_srp',
        ]);
        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[1]->id,
            'is_anomaly' => false, 'finding_basis' => null,
        ]);
    }

    public function test_a_price_within_the_srp_is_flagged_when_it_rose_more_than_ten_percent_over_the_store_previous_price(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        // Earlier verified visits recorded rice at 80 and milk at 40.
        $this->priorInspection($store, $bulletins[0], 80);
        $this->priorInspection($store, $bulletins[1], 40);

        // 90 is still inside the 100 SRP but is a 12.5% increase over the 80 recorded last time.
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['items'][0]['recorded_price'] = 90;
        $payload['records'][0]['items'][1]['recorded_price'] = 44;
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'previous_price' => 80, 'previous_price_variance_percent' => 12.50,
            'is_previous_price_spike' => true, 'is_anomaly' => true,
            'finding_basis' => 'previous_price_spike',
        ]);
        // 44 over 40 is a 10% increase exactly: at the threshold, not over it.
        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[1]->id,
            'previous_price' => 40, 'previous_price_variance_percent' => 10.00,
            'is_previous_price_spike' => false, 'is_anomaly' => false, 'finding_basis' => null,
        ]);
    }

    public function test_a_first_visit_records_no_previous_price_movement(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['items'][0]['recorded_price'] = 90;

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'previous_price' => null, 'previous_price_variance_percent' => null,
            'is_previous_price_spike' => false, 'is_anomaly' => false, 'finding_basis' => null,
        ]);
    }

    public function test_a_reference_breach_names_the_finding_basis_even_when_the_price_also_spiked(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];

        $this->priorInspection($store, $bulletins[0], 80);

        // 130 is above the 100 SRP and also 62.5% over the 80 recorded last visit: the reference is the stronger basis.
        $payload = $this->payload($store, $bulletins);
        $payload['records'][0]['items'][0]['recorded_price'] = 130;
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId, 'srp_id' => $bulletins[0]->id,
            'is_previous_price_spike' => true, 'is_anomaly' => true, 'finding_basis' => 'standard_srp',
        ]);
    }

    public function test_bootstrap_only_returns_current_effective_reference_rows_and_declares_emergency_mode(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $admin = User::factory()->create(['role' => 'dti_evaluator']);
        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 50,
            'effective_date' => now()->subDay()->toDateString(), 'source_reference' => 'SRP-CURRENT', 'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Rice future', 'commodity_key' => 'rice', 'baseline_price' => 70,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-FUTURE', 'is_active' => true,
        ]);
        $emergency = RegulatoryEmergency::create([
            'location' => 'Antique', 'starts_on' => now()->subDay(), 'declaration_reference' => 'DECL-CURRENT',
            'status' => 'active', 'confirmed_at' => now(), 'responsible_admin_id' => $admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC',
            'authoritative_price' => 55, 'effective_from' => now()->subDay(), 'effective_until' => now()->addDay(),
            'location' => 'Antique', 'declaration_reference' => 'DECL-CURRENT', 'source_reference' => 'APC-CURRENT', 'created_by' => $admin->id,
        ]);
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'milk', 'price_type' => 'APC',
            'authoritative_price' => 80, 'effective_from' => now('Asia/Manila')->addDay(),
            'location' => 'Antique', 'declaration_reference' => 'DECL-CURRENT', 'source_reference' => 'APC-FUTURE', 'created_by' => $admin->id,
        ]);

        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonCount(1, 'data.srp_bulletins')
            ->assertJsonPath('data.srp_bulletins.0.id', $current->id)
            ->assertJsonCount(1, 'data.regulatory_prices')
            ->assertJsonPath('data.protocol.mode', 'emergency')
            ->assertJsonPath('data.protocol.declaration_reference', 'DECL-CURRENT');

        $emergency->update(['status' => 'ended', 'active_scope_key' => null, 'ends_on' => now('Asia/Manila')->toDateString()]);
        $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()
            ->assertJsonCount(1, 'data.regulatory_prices')
            ->assertJsonPath('data.protocol.mode', 'emergency')
            ->assertJsonPath('data.protocol.declaration_reference', 'DECL-CURRENT');
    }

    public function test_bootstrap_counts_accepted_visits_by_the_manila_calendar_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-31 18:00:00', 'UTC'));
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()->json('data.results.0.record_id');
        MonitoringRecord::findOrFail($recordId)->update(['received_at' => '2026-08-31 15:00:00']);

        $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()->assertJsonPath('data.accepted_today', 0);
    }

    public function test_bootstrap_version_changes_when_the_manila_effective_date_rolls_over(): void
    {
        try {
            Carbon::setTestNow(Carbon::parse('2026-08-31 15:59:00', 'UTC'));
            [, $token, $this->leaseId] = $this->fieldSession();
            $version = $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.version');
            Carbon::setTestNow(Carbon::parse('2026-08-31 16:01:00', 'UTC'));

            $this->withToken($token)->getJson('/api/field/bootstrap?since='.rawurlencode($version))
                ->assertOk()->assertJsonPath('data.is_delta', false);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_sync_rejects_same_client_uuid_when_any_canonical_visit_value_changes(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $payload = $this->payload($store, $bulletins);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)->assertCreated();
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');

        $changedItem = $payload;
        $changedItem['records'][0]['items'][0]['recorded_price'] = 116;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedItem)->assertConflict();
        $changedSignature = $payload;
        $changedSignature['records'][0]['signatures']['officer_png_base64'] = base64_encode("\x89PNG\r\n\x1a\nother-officer");
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedSignature)->assertConflict();
        $otherStore = Store::create([
            'dti_sec_number' => 'SEC-FIELD-2', 'store_name' => 'Other Store', 'owner_name' => 'Owner',
            'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'Antique', 'is_active' => true,
        ]);
        $changedStore = $payload;
        $changedStore['records'][0]['store_id'] = $otherStore->id;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedStore)->assertConflict();
    }

    public function test_sync_rejects_duplicate_client_uuids_inside_one_batch(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $payload = $this->payload($this->store(), [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)]);
        $payload['records'][] = $payload['records'][0];

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('records.1.client_uuid');
    }

    public function test_sync_treats_a_resend_at_stored_column_precision_as_the_same_visit(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $payload = $this->payload($this->store(), [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)]);
        $withMilliseconds = fn (string $value) => Carbon::parse($value)->addMilliseconds(723)->format('Y-m-d\TH:i:s.vP');
        $payload['records'][0]['started_at'] = $withMilliseconds($payload['records'][0]['started_at']);
        $payload['records'][0]['finalized_at'] = $withMilliseconds($payload['records'][0]['finalized_at']);
        $payload['records'][0]['location'] = [
            'latitude' => 10.742512345678, 'longitude' => 121.940712345678, 'accuracy_meters' => 12.345,
            'captured_at' => $withMilliseconds($payload['records'][0]['location']['captured_at']),
        ];
        $payload['records'][0]['items'][0]['recorded_price'] = 115.004;

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)->assertCreated();
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertDatabaseCount('monitoring_records', 1);

        $changedPrice = $payload;
        $changedPrice['records'][0]['items'][0]['recorded_price'] = 115.01;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $changedPrice)->assertConflict();
    }

    public function test_sync_rejects_a_resend_whose_reference_evidence_differs_from_the_accepted_visit(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $payload = $this->payload($this->store(), [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)]);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)->assertCreated();

        $forgedValue = $payload;
        $forgedValue['records'][0]['items'][0]['reference_snapshot']['value'] = 90;
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $forgedValue)->assertConflict();

        $forgedVersion = $payload;
        $forgedVersion['records'][0]['items'][0]['reference_snapshot']['reference_version'] = str_repeat('f', 64);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $forgedVersion)->assertConflict();

        $droppedSnapshot = $payload;
        unset($droppedSnapshot['records'][0]['items'][0]['reference_snapshot']);
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $droppedSnapshot)->assertConflict();

        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertOk()->assertJsonPath('data.results.0.status', 'duplicate');
        $this->assertDatabaseCount('monitoring_records', 1);
    }

    public function test_bootstrap_recent_prices_keep_only_the_latest_verified_row_per_store_and_commodity(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $rice = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);
        $inspect = fn (SrpBulletin $bulletin, float $price, $at, string $status = 'verified') => TemporalInspection::create([
            'store_id' => $store->id, 'srp_id' => $bulletin->id, 'recorded_price' => $price, 'is_flagged' => false,
            'inspection_timestamp' => $at, 'officer_signature' => 'signed', 'validation_status' => $status,
        ]);
        $shared = now()->subDays(3)->startOfSecond();
        $inspect($rice, 101, $shared); // stale rice row sharing milk's latest timestamp
        $inspect($rice, 108, now()->subDay()->startOfSecond());
        $inspect($rice, 200, now()->subHour()->startOfSecond(), 'pending');
        $inspect($milk, 55, now()->subWeeks(4)); // superseded by the newer milk row below
        $inspect($milk, 52, $shared);

        $prices = collect($this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.recent_prices'))
            ->mapWithKeys(fn (array $row) => [$row['srp_id'] => (float) $row['recorded_price']])->all();

        $this->assertSame([$rice->id => 108.0, $milk->id => 52.0], $prices);
    }

    public function test_bootstrap_recent_prices_reach_back_past_three_weeks_so_the_officer_sees_what_the_server_compares(): void
    {
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $rice = $this->bulletin('Rice', 100);
        $this->priorInspection($store, $rice, 77, now()->subMonths(2));

        $prices = collect($this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.recent_prices'))
            ->mapWithKeys(fn (array $row) => [$row['srp_id'] => (float) $row['recorded_price']])->all();

        $this->assertSame([$rice->id => 77.0], $prices);
    }

    public function test_a_visit_finalized_before_manila_midnight_and_synced_after_it_keeps_its_week_and_srp(): void
    {
        Storage::fake('receipt_evidence');
        Carbon::setTestNow(Carbon::parse('2026-09-06 15:40:00', 'UTC')); // Sunday 23:40 Manila, last day of the week
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $rice = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);
        $payload = $this->payload($store, [$rice, $milk], '7cb0a181-a590-4f95-b96e-aadab8e09a67', Carbon::parse('2026-09-06 15:59:59', 'UTC'));

        Carbon::setTestNow(Carbon::parse('2026-09-06 16:05:00', 'UTC')); // Monday 00:05 Manila
        SrpBulletin::create([
            'commodity_name' => 'Rice Monday', 'commodity_key' => 'rice', 'baseline_price' => 120,
            'effective_date' => '2026-09-07', 'source_reference' => 'SRP-RICE-MONDAY', 'is_active' => true,
        ]);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'srp_id' => $rice->id, 'baseline_price' => 100]);

        $sameWeek = $this->payload($store, [$rice, $milk], '8cb0a181-a590-4f95-b96e-aadab8e09a67', Carbon::parse('2026-09-06 15:30:00', 'UTC'));
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $sameWeek)
            ->assertUnprocessable()->assertJsonValidationErrors('records.0.store_id');
    }

    public function test_sync_uses_the_effective_bulletin_for_future_or_stale_submissions_and_rejects_when_none_exists(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $past = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);
        $future = SrpBulletin::create([
            'commodity_name' => 'Rice future', 'commodity_key' => 'rice', 'baseline_price' => 120,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-RICE-FUTURE', 'is_active' => true,
        ]);
        $futurePayload = $this->payload($store, [$future, $milk]);
        $futureRecordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $futurePayload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $futureRecordId, 'srp_id' => $past->id, 'baseline_price' => 100]);

        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 110,
            'effective_date' => now('Asia/Manila')->toDateString(), 'source_reference' => 'SRP-RICE-CURRENT', 'is_active' => true,
        ]);
        $staleStore = Store::create([
            'dti_sec_number' => 'SEC-FIELD-STALE', 'store_name' => 'Stale Bulletin Store', 'owner_name' => 'Owner',
            'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'Antique', 'is_active' => true,
        ]);
        $stalePayload = $this->payload($staleStore, [$past, $milk], 'f0b0a181-a590-4f95-b96e-aadab8e09a67');
        $stalePayload['records'][0]['finalized_at'] = now()->subMinutes(2)->toIso8601String();
        $stalePayload['records'][0]['location']['captured_at'] = now()->subMinutes(2)->toIso8601String();
        $staleRecordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $stalePayload)
            ->assertCreated()->json('data.results.0.record_id');
        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $staleRecordId, 'srp_id' => $current->id, 'baseline_price' => 110]);

        $onlyFuture = SrpBulletin::create([
            'commodity_name' => 'Oil future', 'commodity_key' => 'oil', 'baseline_price' => 90,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(), 'source_reference' => 'SRP-OIL-FUTURE', 'is_active' => true,
        ]);
        $noneStore = Store::create([
            'dti_sec_number' => 'SEC-FIELD-NONE', 'store_name' => 'No Bulletin Store', 'owner_name' => 'Owner',
            'latitude' => 10.74, 'longitude' => 121.94, 'address' => 'Antique', 'is_active' => true,
        ]);
        $nonePayload = $this->payload($noneStore, [$onlyFuture, $milk], 'e0b0a181-a590-4f95-b96e-aadab8e09a67');
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $nonePayload)
            ->assertUnprocessable()->assertJsonValidationErrors('records.0.items');
    }

    public function test_sync_uses_the_manila_calendar_date_for_effective_bulletins(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-31 16:30:00', 'UTC'));
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $past = SrpBulletin::create([
            'commodity_name' => 'Rice prior', 'commodity_key' => 'rice', 'baseline_price' => 100,
            'effective_date' => '2026-08-31', 'source_reference' => 'SRP-RICE-PRIOR', 'is_active' => true,
        ]);
        $current = SrpBulletin::create([
            'commodity_name' => 'Rice current', 'commodity_key' => 'rice', 'baseline_price' => 110,
            'effective_date' => '2026-09-01', 'source_reference' => 'SRP-RICE-CURRENT', 'is_active' => true,
        ]);
        $milk = $this->bulletin('Milk', 50);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$past, $milk]))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', ['monitoring_record_id' => $recordId, 'srp_id' => $current->id]);
    }

    public function test_sync_preserves_a_downloaded_temporal_reference_after_the_bulletin_is_deactivated(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $rice = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);
        $payload = $this->payload($store, [$rice, $milk]);

        $rice->update(['is_active' => false]);
        SrpBulletin::create([
            'commodity_name' => 'Rice future', 'commodity_key' => 'rice', 'baseline_price' => 105,
            'effective_date' => now('Asia/Manila')->addDay()->toDateString(),
            'source_reference' => 'SRP-RICE-FUTURE', 'is_active' => true,
        ]);

        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $payload)
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_record_items', [
            'monitoring_record_id' => $recordId,
            'srp_id' => $rice->id,
            'reference_source_id' => $rice->id,
            'reference_value' => 100,
        ]);
    }

    public function test_officer_history_and_admin_review_are_paginated_and_do_not_expose_signature_paths(): void
    {
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))->assertCreated();

        $this->withToken($token)->getJson('/api/field/monitoring-records?per_page=10')
            ->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonMissingPath('data.data.0.officer_signature_path');

        $manager = User::create(['name' => 'Manager', 'email' => 'manager@dti.test', 'password' => 'manager-password', 'role' => 'dti_evaluator']);
        Sanctum::actingAs($manager, ['dti-admin']);
        $list = $this->getJson('/api/admin/monitoring-records?anomaly=all&per_page=10')
            ->assertOk()->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.officer.email', $officer->email)
            ->assertJsonMissingPath('data.data.0.representative_signature_path');

        $recordId = $list->json('data.data.0.id');
        $this->getJson("/api/admin/monitoring-records/{$recordId}")
            ->assertOk()->assertJsonCount(2, 'data.items')
            ->assertJsonMissingPath('data.officer_signature_path');
        $this->get("/api/admin/monitoring-records/{$recordId}/signatures/officer")
            ->assertOk()->assertHeader('content-type', 'image/png');
        $this->assertDatabaseHas('audit_events', [
            'action' => 'monitoring_record.signature_viewed',
            'subject_id' => $recordId,
        ]);
    }

    public function test_officer_history_excludes_superseded_records(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$this->bulletin('Rice', 100)]))
            ->assertCreated()->json('data.results.0.record_id');
        MonitoringRecord::query()->whereKey($recordId)->update(['status' => 'superseded']);

        $this->withToken($token)->getJson('/api/field/monitoring-records?per_page=10')
            ->assertOk()->assertJsonPath('data.total', 0);
        $this->withToken($token)->getJson("/api/field/monitoring-records/{$recordId}")->assertNotFound();
    }

    public function test_admin_monitoring_workspace_uses_captured_references_and_establishment_summaries(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $store->update(['image_path' => 'store_images/gaisano-grand.webp']);
        $rice = $this->bulletin('Rice', 100);
        $milk = $this->bulletin('Milk', 50);

        $recordId = $this->withToken($token)
            ->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$rice, $milk]))
            ->assertCreated()->json('data.results.0.record_id');

        $this->assertDatabaseHas('monitoring_records', [
            'id' => $recordId,
            'protocol_mode' => 'standard',
            'protocol_reference' => null,
        ]);
        $rice->update(['baseline_price' => 999]);

        $this->withToken($token)->getJson('/api/field/bootstrap')
            ->assertOk()
            ->assertJsonPath('data.monitoring_week.timezone', 'Asia/Manila')
            ->assertJsonPath('data.stores.0.weekly_routine_status', 'monitored_this_week')
            ->assertJsonPath('data.stores.0.has_prior_routine_monitoring', true)
            ->assertJsonPath('data.stores.0.latest_routine_monitoring_at', fn ($value) => str_starts_with($value, now()->subMinute()->toDateString()));

        $manager = User::create([
            'name' => 'Manager', 'email' => 'workspace-manager@dti.test',
            'password' => 'manager-password', 'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($manager, ['dti-admin']);

        $this->getJson('/api/admin/monitoring-establishments?weekly_status=monitored_this_week&additional_task=all&observation=with_observations&search=San&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.monitoring_period.cadence', 'weekly')
            ->assertJsonPath('data.routine_summary.due', 0)
            ->assertJsonPath('data.routine_summary.completed', 1)
            ->assertJsonPath('data.monitoring_week.timezone', 'Asia/Manila')
            ->assertJsonPath('data.weekly_summary.total_establishments', 1)
            ->assertJsonPath('data.weekly_summary.not_yet_monitored', 0)
            ->assertJsonPath('data.weekly_summary.monitored_this_week', 1)
            ->assertJsonPath('data.weekly_summary.verification_required', 0)
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.id', $store->id)
            ->assertJsonPath('data.establishments.data.0.image_path', Storage::disk('public')->url('store_images/gaisano-grand.webp'))
            ->assertJsonPath('data.establishments.data.0.routine_status', 'completed')
            ->assertJsonPath('data.establishments.data.0.weekly_routine_status', 'monitored_this_week')
            ->assertJsonPath('data.establishments.data.0.has_prior_routine_monitoring', true)
            ->assertJsonPath('data.establishments.data.0.latest_result', 'with_observations')
            ->assertJsonPath('data.establishments.data.0.latest_officer.name', 'Field Officer');

        $this->getJson("/api/admin/monitoring-establishments/{$store->id}")
            ->assertOk()
            ->assertJsonPath('data.monitoring_period.cadence', 'weekly')
            ->assertJsonPath('data.routine_status', 'completed')
            ->assertJsonPath('data.completed_records_count', 1)
            ->assertJsonPath('data.records_with_observations_count', 1)
            ->assertJsonPath('data.latest_record.id', $recordId)
            ->assertJsonPath('data.latest_routine_record.id', $recordId)
            ->assertJsonPath('data.weekly_routine_status', 'monitored_this_week')
            ->assertJsonPath('data.verification_task_status', 'none')
            ->assertJsonPath('data.latest_record.protocol_mode', 'standard')
            ->assertJsonFragment(['selector' => 'key:milk'])
            ->assertJsonFragment(['selector' => 'key:rice']);

        $this->getJson("/api/admin/monitoring-establishments/{$store->id}/price-history?per_page=10")
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.data.0.monitoring_record_id', $recordId)
            ->assertJsonFragment(['reference_value' => 100]);

        $this->getJson("/api/admin/analytics/stores/{$store->id}?commodity_key={$rice->commodity_key}")
            ->assertOk()
            ->assertJsonPath('data.srp_series.0', 100);

        $this->getJson("/api/admin/monitoring-records?store_id={$store->id}&per_page=10")
            ->assertOk()->assertJsonPath('data.total', 1);
    }

    public function test_establishment_status_uses_only_latest_visit_and_missing_reference_precedence(): void
    {
        Carbon::setTestNow('2026-09-06 10:00:00');
        $officer = User::create(['name' => 'Latest Officer', 'email' => 'latest@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $manager = User::create(['name' => 'Manager', 'email' => 'latest-manager@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store();
        $bulletin = $this->bulletin('Rice', 100);
        foreach ([['2026-08-01', true, 'available'], ['2026-09-05', false, 'unavailable']] as $index => [$date, $anomaly, $reference]) {
            $record = MonitoringRecord::create([
                'client_uuid' => "00000000-0000-4000-8000-00000000000{$index}", 'officer_user_id' => $officer->id,
                'store_id' => $store->id, 'status' => 'accepted', 'started_at' => "$date 08:00:00", 'finalized_at' => "$date 09:00:00",
                'received_at' => "$date 09:01:00", 'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8,
                'location_captured_at' => "$date 08:59:00", 'representative_name' => 'Owner', 'officer_signature_disk' => 'local',
                'officer_signature_path' => 'a', 'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
                'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
            ]);
            MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 100,
                'baseline_price' => 100, 'variance_percent' => 0, 'is_anomaly' => $anomaly,
                'reference_status' => $reference, 'reference_type' => 'standard_srp',
                'reference_label' => $reference === 'available' ? 'SRP' : 'SRP reference unavailable',
                'reference_value' => $reference === 'available' ? 100 : null,
            ]);
        }
        Sanctum::actingAs($manager, ['dti-admin']);

        $this->getJson('/api/admin/monitoring-establishments?observation=with_observations')->assertOk()->assertJsonPath('data.establishments.total', 0);
        $this->getJson('/api/admin/monitoring-establishments?observation=reference_unavailable')->assertOk()
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.latest_result', 'reference_unavailable')
            ->assertJsonPath('data.establishments.data.0.latest_officer.name', 'Latest Officer');
        $this->getJson('/api/admin/monitoring-establishments?weekly_status=monitored_this_week')->assertOk()
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.weekly_routine_status', 'monitored_this_week');

        $rejectedStore = Store::create(['store_name' => 'Rejected Only', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121, 'is_active' => true]);
        MonitoringRecord::create([
            'client_uuid' => '00000000-0000-4000-8000-000000000099', 'officer_user_id' => $officer->id, 'store_id' => $rejectedStore->id,
            'status' => 'rejected', 'started_at' => now(), 'finalized_at' => now()->addDay(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Owner', 'officer_signature_disk' => 'local', 'officer_signature_path' => 'a',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
            'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
        ]);
        $this->getJson('/api/admin/monitoring-establishments?weekly_status=not_yet_monitored')->assertOk()
            ->assertJsonPath('data.establishments.total', 1)
            ->assertJsonPath('data.establishments.data.0.store_name', 'Rejected Only')
            ->assertJsonPath('data.establishments.data.0.has_prior_routine_monitoring', false);
        Carbon::setTestNow();
    }

    public function test_establishment_findings_endpoint_filters_anomalies_by_period(): void
    {
        $officer = User::create(['name' => 'Field Officer', 'email' => 'officer-findings@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $manager = User::create(['name' => 'DTI Evaluator', 'email' => 'evaluator-findings@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = $this->store();
        $bulletin = $this->bulletin('Sugar', 80);
        $bulletin2 = $this->bulletin('Cooking Oil', 50);

        // Record 1: Anomaly 5 days ago
        $record1 = MonitoringRecord::create([
            'client_uuid' => '00000000-0000-4000-8000-000000000101', 'officer_user_id' => $officer->id,
            'store_id' => $store->id, 'status' => 'accepted', 'started_at' => now()->subDays(5)->setTime(8, 0),
            'finalized_at' => now()->subDays(5)->setTime(9, 0), 'received_at' => now()->subDays(5)->setTime(9, 5),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8,
            'location_captured_at' => now()->subDays(5)->setTime(8, 59),
            'representative_name' => 'Owner', 'officer_signature_disk' => 'local', 'officer_signature_path' => 'a',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
            'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
        ]);
        MonitoringRecordItem::create([
            'monitoring_record_id' => $record1->id, 'srp_id' => $bulletin->id, 'recorded_price' => 120,
            'baseline_price' => 80, 'variance_percent' => 50, 'is_anomaly' => true,
            'reference_status' => 'available', 'reference_type' => 'standard_srp',
            'reference_label' => 'SRP', 'reference_value' => 80,
        ]);

        // Record 2 item: Non-anomaly
        MonitoringRecordItem::create([
            'monitoring_record_id' => $record1->id, 'srp_id' => $bulletin2->id, 'recorded_price' => 50,
            'baseline_price' => 50, 'variance_percent' => 0, 'is_anomaly' => false,
            'reference_status' => 'available', 'reference_type' => 'standard_srp',
            'reference_label' => 'SRP', 'reference_value' => 50,
        ]);

        Sanctum::actingAs($manager, ['dti-admin']);

        // Query findings for store
        $response = $this->getJson("/api/admin/monitoring-establishments/{$store->id}/findings?period=last_4_weeks")
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.commodity_name', 'Sugar')
            ->assertJsonPath('data.data.0.recorded_price', 120)
            ->assertJsonPath('data.data.0.is_anomaly', true);
    }

    private function secondOfficerToken(): string
    {
        User::create([
            'name' => 'Second Officer', 'email' => 'second-field@dti.test',
            'password' => 'secure-password', 'role' => 'field_officer',
        ]);

        return $this->postJson('/api/field/login', ['email' => 'second-field@dti.test', 'password' => 'secure-password'])->assertOk()->json('token');
    }

    private function currentRoutineRecordUrl(Store $store, string $token): string
    {
        $period = $this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.monitoring_period');

        return "/api/field/stores/{$store->id}/current-routine-record?".http_build_query([
            'period_starts_at' => $period['starts_at'], 'period_ends_at' => $period['ends_at'], 'period_protocol_mode' => $period['protocol_mode'],
        ]);
    }

    public function test_any_field_officer_can_view_the_current_period_routine_visit_with_signatures_and_it_is_audited(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $bulletins = [$this->bulletin('Rice', 100), $this->bulletin('Milk', 50)];
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, $bulletins))
            ->assertCreated()->json('data.results.0.record_id');
        $otherToken = $this->secondOfficerToken();

        $response = $this->withToken($otherToken)->getJson($this->currentRoutineRecordUrl($store, $otherToken))
            ->assertOk()
            ->assertJsonPath('data.id', $recordId)
            ->assertJsonPath('data.officer.name', 'Field Officer')
            ->assertJsonPath('data.representative.name', 'Maria Santos')
            ->assertJsonCount(2, 'data.items')
            ->assertJsonStructure(['data' => ['items' => [['category', 'regulatory_classification']]]]);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertSame('data:image/png;base64,'.base64_encode("\x89PNG\r\n\x1a\nofficer-signature"), $response->json('data.signature_images.officer_png_base64'));
        $this->assertSame('data:image/png;base64,'.base64_encode("\x89PNG\r\n\x1a\nrepresentative-signature"), $response->json('data.signature_images.representative_png_base64'));
        $this->assertDatabaseHas('audit_events', ['action' => 'monitoring_record.signature_viewed', 'subject_id' => $recordId]);
    }

    public function test_current_routine_record_refuses_inactive_stores_and_non_field_users(): void
    {
        Storage::fake('receipt_evidence');
        [, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$this->bulletin('Rice', 100)]))
            ->assertCreated();
        $url = $this->currentRoutineRecordUrl($store, $token);

        $store->update(['is_active' => false]);
        $this->withToken($token)->getJson($url)->assertNotFound();

        $store->update(['is_active' => true]);
        $evaluator = User::create(['name' => 'Evaluator', 'email' => 'evaluator@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $evaluatorToken = $evaluator->createToken('admin', ['*'])->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($evaluatorToken)->getJson($url)->assertForbidden();
        $this->assertDatabaseMissing('audit_events', ['action' => 'monitoring_record.signature_viewed']);
    }

    public function test_current_routine_record_is_null_without_a_matching_period_or_a_current_routine_visit(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-15 02:00:00', 'UTC')); // Tuesday in Manila
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$this->bulletin('Rice', 100)]))
            ->assertCreated()->json('data.results.0.record_id');
        $url = $this->currentRoutineRecordUrl($store, $token);

        // Missing period identity never returns the visit.
        $this->withToken($token)->getJson("/api/field/stores/{$store->id}/current-routine-record")->assertOk()->assertJsonPath('data', null);

        // A verification visit does not count as the routine visit.
        $verification = FieldVerificationRequest::create([
            'consumer_report_id' => null, 'source_type' => 'supervisor_directive',
            'store_id' => $store->id, 'requested_by' => $officer->id, 'claimed_by' => $officer->id, 'status' => 'claimed',
            'reason' => 'Directive.', 'context_json' => [], 'requested_at' => now(), 'claimed_at' => now(),
        ]);
        MonitoringRecord::whereKey($recordId)->update(['field_verification_request_id' => $verification->id]);
        $this->withToken($token)->getJson($url)->assertOk()->assertJsonPath('data', null);
        MonitoringRecord::whereKey($recordId)->update(['field_verification_request_id' => null]);
        $this->withToken($token)->getJson($url)->assertOk()->assertJsonPath('data.id', $recordId);

        // Next week: the cached period no longer matches, and the new period has no visit yet.
        Carbon::setTestNow(Carbon::parse('2026-09-22 02:00:00', 'UTC'));
        $this->withToken($token)->getJson($url)->assertOk()->assertJsonPath('data', null);
        $this->withToken($token)->getJson($this->currentRoutineRecordUrl($store, $token))->assertOk()->assertJsonPath('data', null);
        $this->assertSame(1, DB::table('audit_events')->where('action', 'monitoring_record.signature_viewed')->count());
    }

    public function test_a_weekly_period_card_does_not_receive_a_monday_price_freeze_daily_period_visit(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-13 17:00:00', 'UTC')); // Monday 01:00 Manila: weekly and daily periods start together
        Storage::fake('receipt_evidence');
        [$officer, $token, $this->leaseId] = $this->fieldSession();
        $store = $this->store();
        $recordId = $this->withToken($token)->postJson('/api/field/monitoring-records/sync', $this->payload($store, [$this->bulletin('Rice', 100)]))
            ->assertCreated()->json('data.results.0.record_id');
        $weeklyUrl = $this->currentRoutineRecordUrl($store, $token);

        RegulatoryEmergency::create([
            'location' => 'Systemwide', 'starts_on' => now('Asia/Manila')->toDateString(),
            'declaration_reference' => 'PF-MONDAY', 'status' => 'active',
            'confirmed_at' => now(), 'responsible_admin_id' => $officer->id,
        ]);
        // Re-tag the visit as emergency so the new daily period has a current record.
        MonitoringRecord::whereKey($recordId)->update(['protocol_mode' => 'emergency']);
        $dailyUrl = $this->currentRoutineRecordUrl($store, $token);

        $this->assertStringContainsString(rawurlencode(now('Asia/Manila')->startOfDay()->utc()->toIso8601String()), $weeklyUrl);
        $this->assertNotSame($weeklyUrl, $dailyUrl);
        $this->withToken($token)->getJson($weeklyUrl)->assertOk()->assertJsonPath('data', null);
        $this->withToken($token)->getJson($dailyUrl)->assertOk()->assertJsonPath('data.id', $recordId);
    }
}
