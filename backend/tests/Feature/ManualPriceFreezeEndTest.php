<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\EmergencyPriceResolver;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ManualPriceFreezeEndTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function declaration(?string $endsOn = null, string $status = 'active'): array
    {
        Carbon::setTestNow(CarbonImmutable::parse('2026-10-08T02:00:00.123456Z'));
        $admin = User::factory()->create(['role' => 'dti_evaluator']);
        $officer = User::factory()->create(['role' => 'field_officer', 'is_active' => true]);
        $bulletin = SrpBulletin::create(['commodity_name' => 'Rice', 'commodity_key' => 'rice', 'unit' => 'kg', 'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true, 'price_freeze_applicable' => true]);
        $emergency = RegulatoryEmergency::create(['location' => 'San Jose de Buenavista, Antique', 'starts_on' => '2026-10-07', 'ends_on' => $endsOn, 'declaration_reference' => 'MANUAL-END', 'status' => $status, 'active_scope_key' => $status === 'active' ? 'systemwide' : null, 'confirmed_at' => '2026-10-07 00:00:00', 'responsible_admin_id' => $admin->id]);
        $price = RegulatoryPriceRecord::create(['regulatory_emergency_id' => $emergency->id, 'commodity_key' => 'rice', 'price_type' => 'APC', 'authoritative_price' => 45, 'effective_from' => '2026-10-07', 'effective_until' => $endsOn, 'location' => $emergency->location, 'declaration_reference' => $emergency->declaration_reference, 'source_reference' => 'Confirmed APC', 'created_by' => $admin->id]);
        return [$admin, $officer, $bulletin, $emergency, $price];
    }

    private function end(RegulatoryEmergency $emergency, string $endsOn = '2026-10-08')
    {
        return $this->patchJson("/api/admin/emergencies/{$emergency->id}", ['status' => 'ended', 'ends_on' => $endsOn, 'confirmed' => true]);
    }

    public function test_open_ended_freeze_stops_at_the_exact_cutoff_across_status_references_and_cadence(): void
    {
        [$admin, $officer, $bulletin, $emergency, $price] = $this->declaration();
        Sanctum::actingAs($admin);
        $this->end($emergency)->assertOk()->assertJsonPath('data.effective_state', 'ended')
            ->assertJsonPath('data.ended_at', '2026-10-08T02:00:00.123456Z');
        $this->assertSame('2026-10-08T02:00:00.123456Z', $emergency->fresh()->ended_at->toISOString());
        $this->assertNull($emergency->fresh()->active_scope_key);
        $this->assertFalse(RegulatoryPriceRecord::stillApplicable()->whereKey($price->id)->exists());
        $before = CarbonImmutable::parse('2026-10-08T02:00:00.123455Z');
        $cutoff = $before->addMicrosecond();
        $resolver = new FieldReferenceResolver;
        $this->assertSame('daily', MonitoringPeriod::for($before)['cadence']);
        $this->assertSame(45.0, $resolver->resolve($bulletin, $before)['value']);
        $this->assertSame('emergency', $resolver->protocolAt($before)['mode']);
        $this->assertSame('weekly', MonitoringPeriod::for($cutoff)['cadence']);
        $this->assertSame(50.0, $resolver->resolve($bulletin, $cutoff)['value']);
        $this->assertSame('standard', $resolver->protocolAt($cutoff)['mode']);
        $official = app(EmergencyPriceResolver::class);
        $this->assertSame(45.0, $official->resolve('rice', 'San Jose', $before)['value']);
        $this->assertNull($official->resolve('rice', 'San Jose', $cutoff)['value']);
        $this->getJson('/api/public/config')->assertOk()->assertJsonPath('data.state_of_calamity', false);
        $this->getJson('/api/admin/overview')->assertOk()->assertJsonPath('data.active_emergencies', 0);
        $this->getJson('/api/public/commodities')->assertOk()->assertJsonPath('data.0.reference.value', 50);
        Sanctum::actingAs($officer, ['field-monitoring']);
        $bootstrap = $this->getJson('/api/field/bootstrap')->assertOk();
        $bootstrap->assertJsonCount(0, 'data.regulatory_prices');
        $this->assertSame('standard_srp', $bootstrap->json('data.monitoring_references.0.type'));
        $vendor = User::factory()->create(['role' => 'vendor', 'is_active' => true]);
        $token = $vendor->createToken('vendor-portal-pwa', ['vendor-portal'])->plainTextToken;
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/vendor/advisories')->assertOk()->assertJsonPath('data.0.state', 'ended')->assertJsonPath('data.0.is_active', false);
        $this->assertSame($cutoff->toISOString(), AuditEvent::where('action', 'emergency.status_changed')->sole()->metadata['ended_at']);
        $this->assertSame($cutoff->toISOString(), $officer->notifications()->sole()->data['payload']['ended_at']);
    }

    public function test_future_end_date_does_not_delay_manual_ending_and_retry_is_idempotent(): void
    {
        [$admin, $officer, , $emergency] = $this->declaration('2026-11-01');
        Sanctum::actingAs($admin);
        $first = $this->end($emergency, '2026-11-01')->assertOk()->assertJsonPath('data.effective_state', 'ended')->json('data.ended_at');
        Carbon::setTestNow('2026-10-09 03:00:00');
        $this->end($emergency)->assertOk()->assertJsonPath('data.ended_at', $first)->assertJsonPath('data.ends_on', '2026-11-01T00:00:00.000000Z');
        $this->assertSame(1, AuditEvent::where('action', 'emergency.status_changed')->count());
        $this->assertSame(1, $officer->notifications()->count());
        $this->assertNull(MonitoringPeriod::effectiveEmergency(now()));
    }

    public function test_legacy_ended_declaration_can_be_stopped_without_backfilling_other_history(): void
    {
        [$admin, , , $emergency] = $this->declaration('2026-10-08', 'ended');
        $old = RegulatoryEmergency::create(['location' => 'San Jose', 'starts_on' => '2026-01-01', 'ends_on' => '2026-01-02', 'declaration_reference' => 'OLD', 'status' => 'ended', 'confirmed_at' => '2026-01-01', 'responsible_admin_id' => $admin->id]);
        Sanctum::actingAs($admin);
        $this->assertSame($emergency->id, MonitoringPeriod::effectiveEmergency(now())->id);
        $this->end($emergency)->assertOk()->assertJsonPath('data.effective_state', 'ended');
        $this->assertNotNull($emergency->fresh()->ended_at);
        $this->assertNull($old->fresh()->ended_at);
        $this->end($old)->assertUnprocessable();
    }

    public function test_future_confirmed_freezes_keep_commodity_editing_restrictions(): void
    {
        [, , , $emergency, $price] = $this->declaration('2026-11-01');
        $emergency->update(['starts_on' => '2026-10-10']);
        $price->update(['effective_from' => '2026-10-10']);
        $this->assertNull(MonitoringPeriod::effectiveEmergency(now()));
        $this->assertTrue(RegulatoryPriceRecord::stillApplicable()->whereKey($price->id)->exists());
    }

    public function test_failed_authorization_confirmation_and_audit_leave_the_freeze_unchanged(): void
    {
        [$admin, $officer, , $emergency, $price] = $this->declaration('2026-11-01');
        $this->end($emergency)->assertUnauthorized();
        Sanctum::actingAs($officer);
        $this->end($emergency)->assertForbidden();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/emergencies/{$emergency->id}", ['status' => 'ended', 'ends_on' => '2026-10-08', 'confirmed' => false])->assertUnprocessable();
        $this->partialMock(AuditTrailService::class, fn ($mock) => $mock->shouldReceive('record')->once()->andReturnNull());
        $this->end($emergency)->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');
        $this->assertSame('active', $emergency->fresh()->status);
        $this->assertSame('systemwide', $emergency->fresh()->active_scope_key);
        $this->assertNull($emergency->fresh()->ended_at);
        $this->assertSame('2026-11-01', $price->fresh()->effective_until->toDateString());
        $this->assertSame(0, AuditEvent::where('action', 'emergency.status_changed')->count());
        $this->assertSame(0, $officer->notifications()->count());
    }

    public function test_browser_token_requires_password_reconfirmation_before_manual_ending(): void
    {
        [$admin, , , $emergency] = $this->declaration();
        $token = $admin->createToken('dti-admin-web', ['dti-admin'])->plainTextToken;
        $this->withToken($token)->end($emergency)->assertForbidden()->assertJsonPath('status', 'REAUTHENTICATION_REQUIRED');
        $this->assertSame('active', $emergency->fresh()->status);
        $this->assertNull($emergency->fresh()->ended_at);
    }
}
