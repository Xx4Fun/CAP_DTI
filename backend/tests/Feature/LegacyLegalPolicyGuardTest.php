<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LegacyLegalPolicyGuardTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_dispatch_is_also_blocked_without_approved_policy(): void
    {
        $admin = User::create(['name' => 'Evaluator', 'email' => 'guard@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        $store = Store::create(['dti_sec_number' => 'SEC-GUARD', 'store_name' => 'Guard Store', 'owner_name' => 'Owner', 'latitude' => 10, 'longitude' => 121, 'address' => 'Antique']);
        $srp = SrpBulletin::create(['commodity_name' => 'Guard Item', 'baseline_price' => 20, 'effective_date' => '2026-01-01', 'is_active' => true]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/notices/dispatch', [
            'store_id' => $store->id, 'srp_id' => $srp->id,
            'recorded_price' => 30, 'recorded_date' => '2026-07-26',
        ])->assertStatus(422)->assertJsonPath('status', 'LEGAL_POLICY_UNAVAILABLE');

        $this->assertSame(0, LegalNotice::count());
        $this->assertSame(0, $store->fresh()->recidivism_index);
    }

    public function test_approved_flag_without_complete_versioned_rules_remains_unavailable(): void
    {
        config([
            'legal_policy.approved' => true,
            'legal_policy.policy_version' => 'unapproved-draft',
            'legal_policy.rules' => [],
        ]);

        $this->assertSame('LEGAL_POLICY_UNAVAILABLE', app(\App\Services\Admin\LegalPolicyService::class)->availability()['status']);
    }
}
