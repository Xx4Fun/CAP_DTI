<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
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

    public function test_draft_preview_is_bound_to_captured_observation_evidence(): void
    {
        $admin = User::create(['name' => 'Evaluator', 'email' => 'preview@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $store = Store::create(['store_name' => 'Captured Store', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121]);
        $srp = SrpBulletin::create(['commodity_name' => 'Captured Rice', 'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true]);
        $record = MonitoringRecord::create([
            'client_uuid' => '10000000-0000-4000-8000-000000000001', 'officer_user_id' => $admin->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHour(), 'finalized_at' => now(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Owner', 'officer_signature_disk' => 'local', 'officer_signature_path' => 'a',
            'officer_signature_sha256' => str_repeat('a', 64), 'representative_signature_disk' => 'local',
            'representative_signature_path' => 'b', 'representative_signature_sha256' => str_repeat('b', 64), 'sync_source' => 'online',
        ]);
        $item = MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id, 'srp_id' => $srp->id, 'recorded_price' => 62, 'baseline_price' => 50,
            'variance_percent' => 24, 'is_anomaly' => true, 'reference_status' => 'available', 'reference_type' => 'standard_srp',
            'reference_label' => 'Captured SRP', 'reference_value' => 50, 'reference_source' => 'DTI-2026', 'reference_effective_date' => '2026-01-01',
        ]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/admin/legal/draft-preview', [])->assertUnprocessable();
        $this->postJson('/api/admin/legal/draft-preview', ['monitoring_record_id' => $record->id, 'monitoring_record_item_id' => $item->id, 'notice_type' => 'LOI'])
            ->assertOk()->assertSee('Captured Store')->assertSee('Captured Rice')->assertSee('62.00')->assertSee('50.00')->assertSee('DTI-2026');
        $item->update(['is_anomaly' => false]);
        $this->postJson('/api/admin/legal/draft-preview', ['monitoring_record_id' => $record->id, 'monitoring_record_item_id' => $item->id, 'notice_type' => 'SCO'])->assertNotFound();
        $this->assertSame(0, LegalNotice::count());
    }
}
