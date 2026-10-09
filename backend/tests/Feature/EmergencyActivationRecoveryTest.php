<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\AuditEvent;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\EmergencyApcPreparationService;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmergencyActivationRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(Carbon::parse('2026-10-09 12:00:00', 'Asia/Manila'));
        $this->admin = User::factory()->create(['role' => 'dti_evaluator']);
        Sanctum::actingAs($this->admin);
        SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg',
            'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true, 'price_freeze_applicable' => true]);
    }

    private function draft(string $startsOn = '2026-10-09', ?string $endsOn = '2026-10-10'): array
    {
        return $this->postJson('/api/admin/emergencies', ['location' => 'San Jose de Buenavista, Antique',
            'declaration_reference' => 'NEW', 'starts_on' => $startsOn, 'ends_on' => $endsOn])->assertCreated()->json('data');
    }

    private function previous(?string $endsOn = '2026-10-08', string $startsOn = '2026-10-07'): RegulatoryEmergency
    {
        $record = RegulatoryEmergency::create(['location' => 'San Jose de Buenavista, Antique',
            'declaration_reference' => 'PREVIOUS', 'starts_on' => $startsOn, 'ends_on' => $endsOn,
            'status' => 'active', 'active_scope_key' => 'systemwide', 'confirmed_at' => '2026-10-07 00:00:00',
            'responsible_admin_id' => $this->admin->id]);
        RegulatoryPriceRecord::create(['regulatory_emergency_id' => $record->id, 'commodity_key' => 'rice',
            'price_type' => 'APC', 'authoritative_price' => 45, 'effective_from' => $startsOn,
            'effective_until' => $endsOn, 'location' => $record->location, 'declaration_reference' => 'PREVIOUS',
            'source_reference' => 'Original monitoring evidence', 'created_by' => $this->admin->id]);

        return $record;
    }

    private function activate(array $draft)
    {
        return $this->postJson('/api/admin/emergencies/'.$draft['id'].'/activate',
            ['confirmed' => true, 'preparation_hash' => $draft['preparation_hash']]);
    }

    private function release(RegulatoryEmergency $record)
    {
        return $this->postJson('/api/admin/emergencies/'.$record->id.'/release-expired-lock', ['confirmed' => true]);
    }

    public function test_expired_draft_cannot_acquire_a_lock_or_save_prices(): void
    {
        $draft = $this->draft('2026-10-07', '2026-10-08');
        $this->activate($draft)->assertUnprocessable()->assertJsonPath('status', 'EMERGENCY_DATE_EXPIRED');
        $this->assertDatabaseHas('regulatory_emergencies', ['id' => $draft['id'], 'status' => 'draft', 'active_scope_key' => null]);
        $this->assertDatabaseCount('regulatory_price_records', 0);
        $this->assertSame(0, AuditEvent::where('action', 'emergency.confirmed')->count());
    }

    public function test_valid_activation_releases_expired_lock_and_preserves_history(): void
    {
        $old = $this->previous();
        $historicalAttributes = $old->only(['starts_on', 'ends_on', 'confirmed_at', 'ended_at']);
        $prices = $old->priceRecords->toArray();
        $this->getJson('/api/admin/emergencies?view=summary')->assertOk()
            ->assertJsonPath('data.0.effective_state', 'expired')->assertJsonPath('data.0.activation_lock_held', true)
            ->assertJsonPath('data.0.can_release_expired_lock', true);
        $this->assertSame('active', $old->fresh()->status); // Reads never repair production data.
        $draft = $this->draft();
        $this->activate($draft)->assertOk()->assertJsonPath('data.effective_state', 'in_effect')
            ->assertJsonPath('data.activation_lock_held', true)->assertJsonCount(1, 'data.official_prices');
        $this->assertSame('ended', $old->fresh()->status);
        $this->assertNull($old->fresh()->active_scope_key);
        $this->assertEquals($historicalAttributes, $old->fresh()->only(array_keys($historicalAttributes)));
        $this->assertEquals($prices, $old->fresh()->priceRecords->toArray());
        $this->getJson('/api/admin/emergencies/'.$old->id)->assertOk()
            ->assertJsonPath('data.effective_state', 'expired')->assertJsonPath('data.activation_lock_held', false);
        $event = AuditEvent::where('action', 'emergency.expired_lock_released')->firstOrFail();
        $this->assertSame('automatic', $event->metadata['recovery_mode']);
        $this->assertSame('active', $event->metadata['previous_status']);
        $this->assertSame('2026-10-08', $event->metadata['original_ends_on']);
        $rice = SrpBulletin::firstOrFail();
        $this->assertSame(45.0, app(FieldReferenceResolver::class)->resolve($rice, '2026-10-08 12:00:00')['value']);
        $this->assertSame(50.0, app(FieldReferenceResolver::class)->resolve($rice, '2026-10-09 12:00:00')['value']);
        $this->assertSame($draft['id'], MonitoringPeriod::effectiveEmergency(now())->id);
    }

    public function test_manual_recovery_is_idempotent_and_requires_confirmation_and_reauthentication(): void
    {
        $old = $this->previous();
        $this->postJson('/api/admin/emergencies/'.$old->id.'/release-expired-lock', ['confirmed' => false])->assertUnprocessable();
        $this->release($old)->assertOk()->assertJsonPath('data.status', 'ended')->assertJsonPath('data.effective_state', 'expired');
        $this->release($old)->assertOk()->assertJsonPath('data.activation_lock_held', false);
        $this->assertSame(1, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
        $this->assertSame('manual', AuditEvent::where('action', 'emergency.expired_lock_released')->firstOrFail()->metadata['recovery_mode']);
        Sanctum::actingAs(User::factory()->create(['role' => 'field_officer']));
        $this->release($old)->assertForbidden();
        $token = $this->admin->createToken('dti-admin-web', ['dti-admin'])->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->release($old)->assertForbidden()->assertJsonPath('status', 'REAUTHENTICATION_REQUIRED');
    }

    public function test_scheduled_open_ended_and_current_declarations_are_real_blockers(): void
    {
        foreach ([['2026-10-10', '2026-10-10', 'scheduled'], [null, '2026-10-07', 'in_effect'], ['2026-10-09', '2026-10-07', 'in_effect']] as [$end, $start, $state]) {
            $old = $this->previous($end, $start);
            $draft = $this->draft();
            $this->activate($draft)->assertConflict()->assertJsonPath('status', 'EMERGENCY_ACTIVATION_BLOCKED')
                ->assertJsonPath('blocking_emergency.id', $old->id)->assertJsonPath('blocking_emergency.effective_state', $state);
            $this->release($old)->assertConflict();
            $this->assertSame('active', $old->fresh()->status);
            $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
            $old->update(['status' => 'cancelled', 'active_scope_key' => null]);
        }
    }

    public function test_today_is_inclusive_and_manila_midnight_expires_the_draft(): void
    {
        $this->travelTo(Carbon::parse('2026-10-09T15:59:59Z'));
        $draft = $this->draft('2026-10-09', '2026-10-09');
        $this->activate($draft)->assertOk();
        $draft = $this->draft('2026-10-09', '2026-10-09');
        $this->travelTo(Carbon::parse('2026-10-09T16:00:00Z'));
        $this->activate($draft)->assertUnprocessable()->assertJsonPath('status', 'EMERGENCY_DATE_EXPIRED');
        $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
    }

    public function test_future_and_open_ended_drafts_can_still_be_confirmed(): void
    {
        $future = $this->draft('2026-10-10', '2026-10-11');
        $this->activate($future)->assertOk()->assertJsonPath('data.effective_state', 'scheduled');
        RegulatoryEmergency::findOrFail($future['id'])->update(['status' => 'cancelled', 'active_scope_key' => null]);
        $this->activate($this->draft('2026-10-09', null))->assertOk()->assertJsonPath('data.effective_state', 'in_effect');
    }

    public function test_stale_preparation_leaves_the_expired_lock_untouched(): void
    {
        $old = $this->previous();
        $draft = $this->draft();
        $draft['preparation_hash'] = str_repeat('0', 64);
        $this->activate($draft)->assertConflict()->assertJsonPath('status', 'APC_PREPARATION_STALE');
        $this->assertSame('active', $old->fresh()->status);
        $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
    }

    public function test_audit_failure_rolls_back_recovery_and_activation(): void
    {
        $old = $this->previous();
        $draft = $this->draft();
        $this->partialMock(AuditTrailService::class, function ($mock) {
            $mock->shouldReceive('record')->withArgs(fn ($request, $action) => $action === 'emergency.expired_lock_released')->once()->passthru();
            $mock->shouldReceive('record')->withArgs(fn ($request, $action) => $action === 'emergency.confirmed')->once()->andReturnNull();
        });
        $this->activate($draft)->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');
        $this->assertSame('active', $old->fresh()->status);
        $this->assertSame('systemwide', $old->fresh()->active_scope_key);
        $this->assertDatabaseHas('regulatory_emergencies', ['id' => $draft['id'], 'status' => 'draft']);
        $this->assertDatabaseCount('regulatory_price_records', 1);
        $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
    }

    public function test_unrelated_database_error_is_not_reported_as_an_active_emergency(): void
    {
        $old = $this->previous();
        $draft = $this->draft();
        RegulatoryPriceRecord::creating(function ($price) use ($draft) {
            if ($price->regulatory_emergency_id === $draft['id']) {
                throw new QueryException('sqlite', 'insert official price', [], new \PDOException('Synthetic storage failure'));
            }
        });
        try {
            $this->activate($draft)->assertStatus(500);
            $this->assertSame('active', $old->fresh()->status);
            $this->assertDatabaseCount('regulatory_price_records', 1);
            $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
        } finally {
            RegulatoryPriceRecord::flushEventListeners();
        }
    }

    public function test_midnight_during_preparation_cannot_activate_an_expired_draft(): void
    {
        $this->travelTo(Carbon::parse('2026-10-09T15:59:59Z'));
        $old = $this->previous();
        $draft = $this->draft('2026-10-09', '2026-10-09');
        $snapshot = app(EmergencyApcPreparationService::class)->snapshot(RegulatoryEmergency::findOrFail($draft['id']));
        $this->partialMock(EmergencyApcPreparationService::class, function ($mock) use ($snapshot) {
            $mock->shouldReceive('snapshot')->once()->andReturnUsing(function () use ($snapshot) {
                $this->travelTo(Carbon::parse('2026-10-09T16:00:00Z'));

                return $snapshot;
            });
        });
        $this->activate($draft)->assertUnprocessable()->assertJsonPath('status', 'EMERGENCY_DATE_EXPIRED');
        $this->assertSame('active', $old->fresh()->status);
        $this->assertSame(0, AuditEvent::where('action', 'emergency.expired_lock_released')->count());
        $this->assertDatabaseCount('regulatory_price_records', 1);
    }

    public function test_manual_recovery_rolls_back_when_audit_is_unavailable(): void
    {
        $old = $this->previous();
        $this->partialMock(AuditTrailService::class, fn ($mock) => $mock->shouldReceive('record')->once()->andReturnNull());
        $this->release($old)->assertStatus(503);
        $this->assertSame('active', $old->fresh()->status);
        $this->assertSame('systemwide', $old->fresh()->active_scope_key);
        $this->assertDatabaseCount('regulatory_price_records', 1);
    }

    public function test_recovery_never_backdates_the_confirmation_of_an_expired_activation(): void
    {
        $old = $this->previous();
        $old->update(['confirmed_at' => now('UTC')]);
        $this->release($old)->assertOk();
        $this->assertNull(MonitoringPeriod::effectiveEmergency('2026-10-08 12:00:00'));
        $this->assertSame('standard_srp', app(FieldReferenceResolver::class)->resolve(SrpBulletin::firstOrFail(), '2026-10-08 12:00:00')['type']);
    }

    public function test_consumer_field_and_vendor_reads_follow_recovery_and_the_new_activation(): void
    {
        $old = $this->previous();
        $this->release($old)->assertOk();
        $draft = $this->draft();
        $officer = User::factory()->create(['role' => 'field_officer', 'is_active' => true]);
        $vendor = User::factory()->create(['role' => 'vendor', 'is_active' => true]);
        $vendorToken = $vendor->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken;
        foreach ([false, true] as $active) {
            Sanctum::actingAs($this->admin);
            if ($active) {
                $this->activate($draft)->assertOk();
            }
            $this->getJson('/api/public/config')->assertOk()->assertJsonPath('data.state_of_calamity', $active);
            Sanctum::actingAs($officer, ['field-monitoring']);
            $this->getJson('/api/field/bootstrap')->assertOk()
                ->assertJsonPath('data.protocol.mode', $active ? 'emergency' : 'standard')
                ->assertJsonPath('data.monitoring_period.cadence', $active ? 'daily' : 'weekly');
            $this->app['auth']->forgetGuards();
            $this->withToken($vendorToken)->getJson('/api/vendor/srp')->assertOk()
                ->assertJsonPath('data.protocol.mode', $active ? 'emergency' : 'standard')
                ->assertJsonPath('data.items.0.reference.type', $active ? 'emergency_ceiling' : 'standard_srp');
        }
    }
}
