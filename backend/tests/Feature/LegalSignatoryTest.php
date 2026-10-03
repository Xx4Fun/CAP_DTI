<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\LegalPolicyService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LegalSignatoryTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;
    private User $evaluator;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        // No env signatory names: issuing depends on what is set in Settings.
        config(['legal_policy.rules.LOI.signatory.name' => null, 'legal_policy.rules.SCO.signatory.name' => null]);
        $this->superAdmin = User::create(['name' => 'Super Admin', 'email' => 'super@dti.test', 'password' => 'password', 'role' => 'super_admin']);
        $this->evaluator = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
    }

    public function test_super_admin_sets_the_signatory_which_enables_issuing_and_is_audited(): void
    {
        $this->assertSame('LEGAL_POLICY_UNAVAILABLE', app(LegalPolicyService::class)->availability('LOI')['status']);

        $this->actingAs($this->superAdmin, 'sanctum')->putJson('/api/admin/legal-signatories/loi', ['name' => 'Atty. Ana Reyes', 'office' => 'Provincial Director, DTI Antique'])
            ->assertOk()->assertJsonPath('data.name', 'Atty. Ana Reyes')->assertJsonPath('data.source', 'settings');
        $this->assertSame('LEGAL_POLICY_AVAILABLE', app(LegalPolicyService::class)->availability('LOI')['status']);
        $this->assertSame('LEGAL_POLICY_UNAVAILABLE', app(LegalPolicyService::class)->availability('SCO')['status']);
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.signatory_updated', 'subject_type' => 'legal-signatory:LOI']);

        $this->actingAs($this->evaluator, 'sanctum')->getJson('/api/admin/legal-signatories')->assertOk()->assertJsonPath('data.LOI.name', 'Atty. Ana Reyes');
    }

    public function test_dti_evaluators_can_change_signatories_but_field_officers_cannot(): void
    {
        $this->actingAs($this->evaluator, 'sanctum')->putJson('/api/admin/legal-signatories/LOI', ['name' => 'Atty. Ana Reyes', 'office' => 'Provincial Director, DTI Antique'])
            ->assertOk()->assertJsonPath('data.name', 'Atty. Ana Reyes');
        $this->actingAs($this->evaluator, 'sanctum')->post('/api/admin/legal-signatories/LOI/signature', ['signature' => UploadedFile::fake()->image('sig.png', 600, 200)], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.has_signature', true);
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.signature_uploaded', 'subject_type' => 'legal-signatory:LOI']);

        $officer = User::create(['name' => 'Officer', 'email' => 'officer@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $this->actingAs($officer, 'sanctum')->putJson('/api/admin/legal-signatories/LOI', ['name' => 'Someone', 'office' => 'Office'])->assertForbidden();
        $this->actingAs($officer, 'sanctum')->post('/api/admin/legal-signatories/LOI/signature', ['signature' => UploadedFile::fake()->image('sig.png', 600, 200)], ['Accept' => 'application/json'])->assertForbidden();
        $this->actingAs($this->evaluator, 'sanctum')->putJson('/api/admin/legal-signatories/XYZ', ['name' => 'Someone', 'office' => 'Office'])->assertNotFound();
    }

    public function test_signature_image_is_private_validated_replaced_and_removable(): void
    {
        $upload = fn ($file) => $this->actingAs($this->superAdmin, 'sanctum')->post('/api/admin/legal-signatories/SCO/signature', ['signature' => $file], ['Accept' => 'application/json']);
        $upload(UploadedFile::fake()->create('sig.svg', 2, 'image/svg+xml'))->assertUnprocessable();
        $upload(UploadedFile::fake()->image('huge.png', 5000, 200))->assertUnprocessable();

        $upload(UploadedFile::fake()->image('sig.png', 600, 200))->assertOk()->assertJsonPath('data.has_signature', true);
        $first = Storage::disk(LegalNotice::DOCUMENT_DISK)->files('legal-signatures');
        $upload(UploadedFile::fake()->image('sig2.png', 600, 200))->assertOk();
        $this->assertCount(1, Storage::disk(LegalNotice::DOCUMENT_DISK)->files('legal-signatures'));
        $this->assertNotSame($first, Storage::disk(LegalNotice::DOCUMENT_DISK)->files('legal-signatures'));
        $this->actingAs($this->evaluator, 'sanctum')->get('/api/admin/legal-signatories/SCO/signature')->assertOk();

        $this->actingAs($this->superAdmin, 'sanctum')->deleteJson('/api/admin/legal-signatories/SCO/signature')->assertOk()->assertJsonPath('data.has_signature', false);
        $this->assertCount(0, Storage::disk(LegalNotice::DOCUMENT_DISK)->files('legal-signatures'));
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.signature_removed']);
    }

    public function test_e_signature_is_stamped_only_when_the_issuer_applies_it(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum')->putJson('/api/admin/legal-signatories/LOI', ['name' => 'Atty. Ana Reyes', 'office' => 'Provincial Director, DTI Antique'])->assertOk();
        $without = $this->draft();
        $this->actingAs($this->evaluator, 'sanctum')->postJson("/api/admin/legal-notices/$without/issue", ['confirmed' => true, 'apply_signature' => true])->assertUnprocessable();

        $this->actingAs($this->superAdmin, 'sanctum')->post('/api/admin/legal-signatories/LOI/signature', ['signature' => UploadedFile::fake()->image('sig.png', 600, 200)], ['Accept' => 'application/json'])->assertOk();
        $rendered = [];
        Pdf::shouldReceive('loadView')->andReturnUsing(function (string $view, array $data) use (&$rendered) {
            $rendered[] = view($view, $data)->render();
            return Pdf::getFacadeRoot();
        });
        Pdf::shouldReceive('setPaper')->andReturnSelf();
        Pdf::shouldReceive('output')->andReturn('%PDF-fake');

        $this->actingAs($this->evaluator, 'sanctum')->postJson("/api/admin/legal-notices/$without/issue", ['confirmed' => true])->assertOk();
        $this->assertStringNotContainsString('max-height:34pt', $rendered[0]);
        $this->assertFalse(LegalNotice::find($without)->signatory_snapshot['signature_applied']);

        LegalNotice::find($without)->update(['status' => 'closed']);
        $with = $this->draft();
        $this->actingAs($this->evaluator, 'sanctum')->postJson("/api/admin/legal-notices/$with/issue", ['confirmed' => true, 'apply_signature' => true])->assertOk();
        $this->assertMatchesRegularExpression('#<img src="data:image/png;base64,[^"]+" alt="" style="position:absolute;left:63.2pt;top:510pt;max-height:34pt#', $rendered[1]);
        $this->assertStringContainsString('Atty. Ana Reyes', $rendered[1]);
        $snapshot = LegalNotice::find($with)->signatory_snapshot;
        $this->assertTrue($snapshot['signature_applied']);
        $this->assertSame(64, strlen($snapshot['signature_sha256']));
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.notice_issued', 'subject_id' => $with]);
    }

    private function draft(): int
    {
        static $seed = 0;
        $seed++;
        // Notices are issued through the portal only, so each store has an active linked vendor and a registered owner.
        $vendor = User::create(['name' => "Vendor $seed", 'email' => "vendor$seed@shop.test", 'password' => 'password', 'role' => 'vendor']);
        $store = Store::create(['store_name' => "Store $seed", 'owner_name' => "Owner $seed", 'address' => 'San Jose, Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $vendor->id]);
        $record = MonitoringRecord::create([
            'client_uuid' => sprintf('20000000-0000-4000-8000-%012d', $seed), 'officer_user_id' => $this->evaluator->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHour(), 'finalized_at' => now(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Store Representative', 'representative_title' => 'Manager',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'o.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'r.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);
        $bulletin = SrpBulletin::create(['commodity_name' => "Rice $seed", 'baseline_price' => 50, 'effective_date' => '2026-01-01', 'is_active' => true]);
        $item = MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 62, 'baseline_price' => 50, 'variance_percent' => 24,
            'is_anomaly' => true, 'reference_status' => 'available', 'reference_type' => 'standard_srp', 'reference_label' => 'SRP',
            'reference_value' => 50, 'reference_source' => 'DTI', 'reference_effective_date' => '2026-01-01',
        ]);
        $id = $this->actingAs($this->evaluator, 'sanctum')->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'item_ids' => [$item->id]])->assertCreated()->json('data.id');
        $this->actingAs($this->evaluator, 'sanctum')->patchJson("/api/admin/legal-notices/$id", ['intended_delivery_method' => 'portal', 'internal_justification' => 'Reviewed.'])->assertOk();
        return $id;
    }
}
