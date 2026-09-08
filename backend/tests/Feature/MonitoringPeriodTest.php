<?php

namespace Tests\Feature;

use App\Models\RegulatoryEmergency;
use App\Models\User;
use App\Support\MonitoringPeriod;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class MonitoringPeriodTest extends TestCase
{
    use RefreshDatabase;

    public function test_standard_monitoring_uses_the_manila_week(): void
    {
        $period = MonitoringPeriod::for(Carbon::parse('2026-09-13 23:59:59', 'Asia/Manila'));

        $this->assertSame('weekly', $period['cadence']);
        $this->assertSame('standard', $period['protocol_mode']);
        $this->assertNull($period['declaration_reference']);
        $this->assertSame('2026-09-06T16:00:00+00:00', $period['starts_at']->toIso8601String());
        $this->assertSame('2026-09-13T16:00:00+00:00', $period['ends_at']->toIso8601String());
    }

    public function test_price_freeze_monitoring_uses_the_manila_day(): void
    {
        $admin = User::create([
            'name' => 'Admin', 'email' => 'period-admin@dti.test', 'password' => 'password',
            'role' => 'dti_evaluator',
        ]);
        RegulatoryEmergency::create([
            'location' => 'Systemwide', 'starts_on' => '2026-09-10', 'ends_on' => '2026-09-15',
            'declaration_reference' => 'PF-2026-01', 'status' => 'active',
            'responsible_admin_id' => $admin->id,
        ]);

        $period = MonitoringPeriod::for(Carbon::parse('2026-09-13 09:30:00', 'Asia/Manila'));

        $this->assertSame('daily', $period['cadence']);
        $this->assertSame('emergency', $period['protocol_mode']);
        $this->assertSame('PF-2026-01', $period['declaration_reference']);
        $this->assertSame('2026-09-12T16:00:00+00:00', $period['starts_at']->toIso8601String());
        $this->assertSame('2026-09-13T16:00:00+00:00', $period['ends_at']->toIso8601String());
    }
}
