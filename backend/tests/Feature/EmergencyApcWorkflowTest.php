<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmergencyApcWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_summary_keeps_official_prices_without_loading_preparation_sources(): void
    {
        [$admin, $officer] = $this->adminAndOfficer('summary');
        Sanctum::actingAs($admin);
        $rice = $this->coveredBulletin('Rice', 'rice', 50);
        $this->acceptedObservation($officer, $rice, 'Market A', '2026-09-01 09:00:00', 45);
        $draft = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'declaration_reference' => 'SUMMARY-1',
        ])->assertCreated()->json('data');
        RegulatoryPriceRecord::create([
            'regulatory_emergency_id' => $draft['id'], 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 45, 'effective_from' => '2026-09-09',
            'location' => $draft['location'], 'declaration_reference' => 'SUMMARY-1',
            'source_reference' => 'Monitoring week', 'created_by' => $admin->id,
        ]);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $summary = $this->getJson('/api/admin/emergencies?view=summary')->assertOk()
            ->assertJsonPath('data.0.declaration_reference', 'SUMMARY-1')
            ->assertJsonPath('data.0.preparation_hash', $draft['preparation_hash'])
            ->assertJsonPath('data.0.official_prices.0.authoritative_price', 45);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();
        foreach (['candidates', 'source_week', 'srp_fallbacks', 'covered_commodity_keys', 'missing_commodity_keys'] as $key) {
            $this->assertArrayNotHasKey($key, $summary->json('data.0'));
        }
        foreach ($queries as $query) {
            $this->assertDoesNotMatchRegularExpression('/monitoring_record|regulatory_price_candidates|srp_bulletins/', $query['query']);
        }
        $legacy = $this->getJson('/api/admin/emergencies')->assertOk()
            ->assertJsonPath('data.0.candidates.0.source_observations.0.store_name', 'Market A');
        $this->getJson('/api/admin/emergencies/'.$draft['id'])->assertOk()
            ->assertJsonPath('data.candidates.0.computed_apc_price', 45);
        $this->assertLessThan(strlen($legacy->getContent()), strlen($summary->getContent()));
    }

    public function test_summary_effective_states_match_detail_with_constant_query_count(): void
    {
        [$admin] = $this->adminAndOfficer('summary-states');
        Sanctum::actingAs($admin);
        $this->travelTo(Carbon::parse('2026-09-10 10:00:00', 'Asia/Manila'));
        foreach ([
            ['draft', null, null, '2026-09-09', null],
            ['active', '2026-09-09 00:00:00', null, '2026-09-09', null],
            ['ended', '2026-09-09 00:00:00', '2026-09-10 01:00:00', '2026-09-09', null],
            ['active', '2026-09-09 00:00:00', null, '2026-09-11', null],
            ['active', '2026-09-09 00:00:00', null, '2026-09-01', '2026-09-09'],
            ['cancelled', '2026-09-09 00:00:00', null, '2026-09-09', null],
            ['ended', '2026-09-09 00:00:00', null, '2026-09-09', '2026-09-10'],
        ] as $i => [$status, $confirmedAt, $endedAt, $startsOn, $endsOn]) {
            $emergency = RegulatoryEmergency::create([
                'location' => 'San Jose de Buenavista, Antique', 'declaration_reference' => 'STATE-'.$i,
                'starts_on' => $startsOn, 'ends_on' => $endsOn, 'status' => $status,
                'confirmed_at' => $confirmedAt, 'ended_at' => $endedAt,
                'responsible_admin_id' => $admin->id,
            ]);
            $summaries = $this->getJson('/api/admin/emergencies?view=summary')->assertOk()->json('data');
            $summary = collect($summaries)->firstWhere('id', $emergency->id);
            $this->getJson('/api/admin/emergencies/'.$emergency->id)->assertOk()
                ->assertJsonPath('data.effective_state', $summary['effective_state']);
            // Only one active declaration may exist; finish each active fixture before inserting the next.
            if ($status === 'active') {
                $emergency->update(['status' => 'cancelled']);
            }
        }
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson('/api/admin/emergencies?view=summary')->assertOk();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();
        RegulatoryEmergency::create([
            'location' => 'San Jose de Buenavista, Antique', 'declaration_reference' => 'MORE',
            'starts_on' => '2026-09-09', 'status' => 'active', 'confirmed_at' => '2026-09-09 00:00:00',
            'responsible_admin_id' => $admin->id,
        ]);
        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson('/api/admin/emergencies?view=summary')->assertOk();
        $this->assertSame($count, count(DB::getQueryLog()));
        DB::disableQueryLog();
    }

    public function test_summary_does_not_grant_field_officers_admin_access(): void
    {
        [, $officer] = $this->adminAndOfficer('summary-access');
        Sanctum::actingAs($officer);
        $this->getJson('/api/admin/emergencies?view=summary')->assertForbidden();
    }

    public function test_representative_summary_and_selected_detail_use_less_payload_and_queries(): void
    {
        [$admin, $officer] = $this->adminAndOfficer('summary-volume');
        Sanctum::actingAs($admin);
        $this->travelTo(Carbon::parse('2026-09-10 10:00:00', 'Asia/Manila'));
        for ($i = 0; $i < 123; $i++) {
            $bulletin = $this->coveredBulletin('Product '.$i, 'product-'.$i, 50);
            foreach ([40, 45, 50] as $j => $price) {
                $this->acceptedObservation($officer, $bulletin, 'Market '.$j, '2026-09-01 09:00:00', $price);
            }
        }
        for ($i = 0; $i < 3; $i++) {
            $draft = $this->postJson('/api/admin/emergencies', [
                'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
                'declaration_reference' => 'VOLUME-'.$i,
            ])->assertCreated()->json('data');
            if ($i < 2) {
                RegulatoryEmergency::findOrFail($draft['id'])->update([
                    'status' => 'ended', 'confirmed_at' => '2026-09-09 00:00:00', 'ends_on' => '2026-09-09',
                ]);
                foreach ($draft['candidates'] as $candidate) {
                    RegulatoryPriceRecord::create([
                        'regulatory_emergency_id' => $draft['id'], 'commodity_key' => $candidate['commodity_key'],
                        'price_type' => 'APC', 'authoritative_price' => 45, 'effective_from' => '2026-09-09',
                        'effective_until' => '2026-09-09', 'location' => $draft['location'],
                        'declaration_reference' => $draft['declaration_reference'], 'source_reference' => 'Monitoring week',
                        'created_by' => $admin->id,
                    ]);
                }
            }
        }
        $measure = function (string $url): array {
            DB::enableQueryLog();
            DB::flushQueryLog();
            $start = hrtime(true);
            $response = $this->getJson($url)->assertOk();
            $result = [
                'milliseconds' => round((hrtime(true) - $start) / 1e6, 2),
                'bytes' => strlen($response->getContent()), 'queries' => count(DB::getQueryLog()),
            ];
            DB::disableQueryLog();

            return $result;
        };
        $urls = [
            'legacy_list' => '/api/admin/emergencies', 'summary_list' => '/api/admin/emergencies?view=summary',
            'selected_detail' => '/api/admin/emergencies/'.$draft['id'],
        ];
        // Warm each path, then compare the same immutable fixture over five paired reads.
        foreach ($urls as $url) {
            $measure($url);
        }
        $samples = [];
        for ($i = 0; $i < 5; $i++) {
            foreach ($urls as $name => $url) {
                $samples[$name][] = $measure($url);
            }
        }
        $this->assertLessThan($samples['legacy_list'][0]['bytes'], $samples['summary_list'][0]['bytes'] + $samples['selected_detail'][0]['bytes']);
        $this->assertLessThan($samples['legacy_list'][0]['queries'], $samples['summary_list'][0]['queries'] + $samples['selected_detail'][0]['queries']);
        fwrite(STDERR, 'Emergency read benchmark (SQLite in memory, 3 declarations, 123 products, 369 observations, 246 official prices): '.json_encode($samples).PHP_EOL);
    }

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
            ->assertJsonPath('data.candidates.0.source_week.starts_on', '2026-08-31')
            ->assertJsonPath('data.candidates.0.source_week.ends_on', '2026-09-06')
            ->assertJsonPath('data.covered_commodity_keys', ['milk', 'rice'])
            ->assertJsonPath('data.missing_commodity_keys', ['milk'])
            ->assertJsonCount(1, 'data.srp_fallbacks')
            ->assertJsonPath('data.srp_fallbacks.0.commodity_key', 'milk')
            ->assertJsonPath('data.srp_fallbacks.0.commodity_name', 'Milk')
            ->assertJsonPath('data.srp_fallbacks.0.srp_price', 40)
            ->assertJsonCount(2, 'data.candidates.0.source_item_ids');

        $this->assertDatabaseMissing('regulatory_emergencies', ['status' => 'active']);
        $this->assertDatabaseCount('regulatory_price_records', 0);
    }

    public function test_activation_rejects_a_stale_review_then_creates_official_apc_from_the_refreshed_candidate(): void
    {
        // Effective state compares against the Manila calendar; pin "today" inside the declaration window (09-09 to 09-10).
        \Illuminate\Support\Carbon::setTestNow('2026-09-09 02:00:00');
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

        \Illuminate\Support\Carbon::setTestNow('2026-09-09 02:01:00');
        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'ended', 'ends_on' => '2026-09-10', 'confirmed' => true,
        ])->assertOk()
            ->assertJsonPath('data.effective_state', 'ended')
            ->assertJsonPath('data.official_prices.0.effective_until', '2026-09-10');
        $this->assertDatabaseHas('regulatory_price_records', [
            'regulatory_emergency_id' => $emergencyId, 'effective_until' => '2026-09-10 00:00:00',
        ]);
        $resolver = app(FieldReferenceResolver::class);
        $this->assertSame('emergency_ceiling', $resolver->resolve($bulletin, '2026-09-09 10:00:59')['type']);
        $this->assertSame('standard_srp', $resolver->resolve($bulletin, '2026-09-09 10:01:00')['type']);
        $this->assertSame('standard_srp', $resolver->resolve($bulletin, '2026-09-11 00:00:00')['type']);
    }

    public function test_each_product_uses_its_own_latest_completed_week_with_observations(): void
    {
        [$admin, $officer] = $this->adminAndOfficer('lookback');
        Sanctum::actingAs($admin);
        $rice = $this->coveredBulletin('Rice', 'rice', 50);
        $sugar = $this->coveredBulletin('Sugar', 'sugar', 70);
        // A later revision that only changes the unit's letter case still counts as the same unit.
        $sugarRevision = $this->coveredBulletin('Sugar', 'sugar', 72, '2026-08-25', ' KG ');

        $this->acceptedObservation($officer, $rice, 'Market A', '2026-08-18 09:00:00', 30);
        $this->acceptedObservation($officer, $rice, 'Market B', '2026-09-08 09:00:00', 99);
        $this->acceptedObservation($officer, $sugar, 'Market C', '2026-08-18 09:00:00', 60);
        $this->acceptedObservation($officer, $sugarRevision, 'Market D', '2026-09-01 09:00:00', 70);
        $this->acceptedObservation($officer, $sugarRevision, 'Market E', '2026-09-02 09:00:00', 80);

        $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated()
            ->assertJsonPath('data.source_week.starts_on', '2026-08-31')
            ->assertJsonCount(2, 'data.candidates')
            ->assertJsonPath('data.candidates.0.commodity_key', 'rice')
            ->assertJsonPath('data.candidates.0.observation_count', 1)
            ->assertJsonPath('data.candidates.0.computed_apc_price', 30)
            ->assertJsonPath('data.candidates.0.source_week.starts_on', '2026-08-17')
            ->assertJsonPath('data.candidates.0.source_week.ends_on', '2026-08-23')
            ->assertJsonPath('data.candidates.1.commodity_key', 'sugar')
            ->assertJsonPath('data.candidates.1.observation_count', 2)
            ->assertJsonPath('data.candidates.1.minimum_price', 70)
            ->assertJsonPath('data.candidates.1.maximum_price', 80)
            ->assertJsonPath('data.candidates.1.computed_apc_price', 75)
            ->assertJsonPath('data.candidates.1.source_week.starts_on', '2026-08-31')
            ->assertJsonPath('data.srp_fallbacks', [])
            // An admin tab on the previous build must stay blocked while any candidate comes from an earlier week.
            ->assertJsonPath('data.missing_commodity_keys', ['rice']);
    }

    public function test_never_observed_covered_product_is_held_at_srp_on_activation(): void
    {
        \Illuminate\Support\Carbon::setTestNow('2026-09-09 02:00:00');
        [$admin, $officer] = $this->adminAndOfficer('fallback');
        Sanctum::actingAs($admin);
        $rice = $this->coveredBulletin('Rice', 'rice', 50);
        $milk = $this->coveredBulletin('Milk', 'milk', 38);
        $this->acceptedObservation($officer, $rice, 'Market A', '2026-09-01 09:00:00', 40);

        $draft = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'ends_on' => '2026-09-30', 'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated();
        $emergencyId = $draft->json('data.id');

        $this->postJson("/api/admin/emergencies/{$emergencyId}/activate", [
            'confirmed' => true, 'preparation_hash' => $draft->json('data.preparation_hash'),
        ])->assertOk()->assertJsonPath('data.status', 'active')->assertJsonCount(2, 'data.official_prices');

        $this->assertDatabaseHas('regulatory_price_records', [
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 40,
        ]);
        $this->assertDatabaseHas('regulatory_price_records', [
            'regulatory_emergency_id' => $emergencyId, 'commodity_key' => 'milk',
            'price_type' => 'SRP', 'authoritative_price' => 38, 'source_candidate_id' => null,
            'source_reference' => "PDRRMC-2026-09 | SRP bulletin #{$milk->id}, no routine observation on record",
        ]);
        $reference = app(FieldReferenceResolver::class)->resolve($milk, '2026-09-10 12:00:00');
        $this->assertSame(['available', 'emergency_ceiling', 38.0], [$reference['status'], $reference['type'], $reference['value']]);
        $this->assertSame(1, AuditEvent::query()->where('action', 'emergency.confirmed')->firstOrFail()->metadata['srp_fallback_count']);

        // An activated declaration can no longer be refreshed, so its confirmed candidates stay as reviewed.
        $this->postJson("/api/admin/emergencies/{$emergencyId}/prepare")->assertUnprocessable();
        $this->assertDatabaseCount('regulatory_price_candidates', 1);

        // Milk has no monitoring item, so only the Price Freeze reference stops a rename or unit change from orphaning it.
        $this->putJson("/api/admin/srp/{$milk->id}", ['commodity_name' => 'Milk', 'unit' => '370 ml'])
            ->assertUnprocessable()->assertJsonValidationErrors('commodity_name');
        $this->assertSame('milk', $milk->fresh()->commodity_key);
        $this->assertSame('emergency_ceiling', app(FieldReferenceResolver::class)->resolve($milk->fresh(), '2026-09-10 12:00:00')['type']);
    }

    public function test_revision_cannot_change_the_unit_of_a_frozen_product(): void
    {
        \Illuminate\Support\Carbon::setTestNow('2026-09-09 02:00:00');
        [$admin] = $this->adminAndOfficer('frozen-unit');
        Sanctum::actingAs($admin);
        $perCan = $this->coveredBulletin('Milk', 'milk', 30, '2025-06-01', '370 ml');
        $milk = $this->coveredBulletin('Milk', 'milk', 38);

        $draft = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'ends_on' => '2026-09-30', 'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated();
        $revision = [
            'commodity_name' => 'Milk', 'unit' => '370 ml', 'baseline_price' => 30, 'effective_date' => '2026-09-15',
            'source_reference' => 'SRP-2026-09', 'change_reason' => 'September bulletin.',
        ];
        // No official reference yet: a draft declaration freezes nothing.
        $this->postJson("/api/admin/srp/{$milk->id}/revisions/preview", $revision)->assertOk();

        $this->postJson('/api/admin/emergencies/'.$draft->json('data.id').'/activate', [
            'confirmed' => true, 'preparation_hash' => $draft->json('data.preparation_hash'),
        ])->assertOk()->assertJsonPath('data.official_prices.0.price_type', 'SRP');

        $this->postJson("/api/admin/srp/{$milk->id}/revisions/preview", $revision)
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->postJson("/api/admin/srp/{$milk->id}/revisions", $revision)
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        // The ceiling was confirmed per kg, so an older per-can row cannot be republished unchanged either.
        $this->postJson("/api/admin/srp/{$perCan->id}/revisions", $revision)
            ->assertUnprocessable()->assertJsonValidationErrors('unit');
        $this->assertDatabaseCount('srp_bulletins', 2);

        // The unit comparison ignores case and surrounding spaces, and a price-only revision stays allowed.
        $this->postJson("/api/admin/srp/{$milk->id}/revisions", [...$revision, 'unit' => ' KG ', 'baseline_price' => 41])
            ->assertCreated()->assertJsonPath('data.commodity_key', 'milk');
        $this->postJson('/api/admin/srp/batch-revisions', [
            'effective_date' => '2026-09-20', 'source_reference' => 'SRP-2026-09B', 'change_reason' => 'Batch update.',
            'updates' => [['id' => $milk->id, 'baseline_price' => 42]],
        ])->assertCreated()->assertJsonPath('data.updated_count', 1);
        $reference = app(FieldReferenceResolver::class)->resolve($milk, '2026-09-21 12:00:00');
        $this->assertSame(['emergency_ceiling', 38.0], [$reference['type'], $reference['value']]);
    }

    public function test_revised_fallback_srp_makes_the_reviewed_preparation_stale(): void
    {
        [$admin] = $this->adminAndOfficer('stale-srp');
        Sanctum::actingAs($admin);
        $this->coveredBulletin('Milk', 'milk', 38);

        $draft = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated()->assertJsonPath('data.srp_fallbacks.0.srp_price', 38);
        $emergencyId = $draft->json('data.id');

        $this->coveredBulletin('Milk', 'milk', 45, '2026-09-05');

        $this->postJson("/api/admin/emergencies/{$emergencyId}/activate", [
            'confirmed' => true, 'preparation_hash' => $draft->json('data.preparation_hash'),
        ])->assertConflict()->assertJsonPath('status', 'APC_PREPARATION_STALE');
        $this->assertDatabaseCount('regulatory_price_records', 0);

        $refreshed = $this->postJson("/api/admin/emergencies/{$emergencyId}/prepare")
            ->assertOk()->assertJsonPath('data.srp_fallbacks.0.srp_price', 45);
        $this->postJson("/api/admin/emergencies/{$emergencyId}/activate", [
            'confirmed' => true, 'preparation_hash' => $refreshed->json('data.preparation_hash'),
        ])->assertOk()->assertJsonPath('data.official_prices.0.authoritative_price', 45);
    }

    public function test_observations_under_a_different_unit_are_not_used(): void
    {
        [$admin, $officer] = $this->adminAndOfficer('unit');
        Sanctum::actingAs($admin);
        $perKilo = $this->coveredBulletin('Rice', 'rice', 50);
        $this->acceptedObservation($officer, $perKilo, 'Market A', '2026-09-01 09:00:00', 48);
        $perBag = $this->coveredBulletin('Rice', 'rice', 250, '2026-09-08', '5 kg');

        $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09',
            'declaration_reference' => 'PDRRMC-2026-09',
        ])->assertCreated()
            ->assertJsonCount(0, 'data.candidates')
            ->assertJsonPath('data.srp_fallbacks.0.commodity_key', 'rice')
            ->assertJsonPath('data.srp_fallbacks.0.srp_id', $perBag->id)
            ->assertJsonPath('data.srp_fallbacks.0.srp_price', 250);
    }

    public function test_declaration_reference_is_bounded_so_official_source_references_fit(): void
    {
        [$admin] = $this->adminAndOfficer('length');
        Sanctum::actingAs($admin);
        $this->coveredBulletin('Milk', 'milk', 38);
        $payload = ['location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-09-09'];

        $this->postJson('/api/admin/emergencies', [...$payload, 'declaration_reference' => str_repeat('D', 151)])
            ->assertUnprocessable()->assertJsonValidationErrors('declaration_reference');

        $draft = $this->postJson('/api/admin/emergencies', [...$payload, 'declaration_reference' => str_repeat('D', 150)])
            ->assertCreated();
        $this->postJson('/api/admin/emergencies/'.$draft->json('data.id').'/activate', [
            'confirmed' => true, 'preparation_hash' => $draft->json('data.preparation_hash'),
        ])->assertOk();
        $this->assertLessThanOrEqual(255, strlen(RegulatoryPriceRecord::query()->firstOrFail()->source_reference));
    }

    /** @return array{0: User, 1: User} */
    private function adminAndOfficer(string $slug): array
    {
        return [
            User::create(['name' => 'DTI Admin', 'email' => "{$slug}-admin@dti.test", 'password' => 'password', 'role' => 'dti_evaluator']),
            User::create(['name' => 'Field Officer', 'email' => "{$slug}-field@dti.test", 'password' => 'password', 'role' => 'field_officer']),
        ];
    }

    private function coveredBulletin(string $name, string $key, float $price, string $effectiveDate = '2026-01-01', string $unit = 'kg'): SrpBulletin
    {
        return SrpBulletin::create([
            'commodity_name' => $name, 'unit' => $unit, 'commodity_key' => $key,
            'baseline_price' => $price, 'effective_date' => $effectiveDate, 'is_active' => true,
            'price_freeze_applicable' => true, 'source_reference' => 'SRP-2026',
        ]);
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
