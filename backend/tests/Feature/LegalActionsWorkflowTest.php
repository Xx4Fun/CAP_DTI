<?php

namespace Tests\Feature;

use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Http\Controllers\Vendor\VendorAuthController;
use App\Mail\LegalNoticeAvailableMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LegalActionsWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_manager_creates_one_multi_item_draft_from_accepted_captured_evidence(): void
    {
        [$manager, $vendor, $record, $items] = $this->evidence();

        $response = $this->actingAs($manager, 'sanctum')->postJson('/api/admin/legal-notices', [
            'monitoring_record_id' => $record->id,
            'notice_type' => 'LOI',
            'item_ids' => collect($items)->pluck('id')->all(),
        ])->assertCreated()->assertJsonPath('data.status', 'draft');

        $notice = LegalNotice::findOrFail($response->json('data.id'));
        $this->assertSame($record->id, $notice->monitoring_record_id);
        $this->assertSame(2, count($notice->source_snapshot['items']));
        $this->assertSame('Vendor Representative', $notice->draft_payload['recipient_name']);
        $this->assertSame($vendor->email, $notice->draft_payload['recipient_email']);
        $this->assertDatabaseHas('audit_events', ['action' => 'legal.draft_created', 'subject_id' => $notice->id]);

        $this->app['auth']->forgetGuards();
        $this->withToken($vendor->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken)
            ->getJson('/api/vendor/notices')->assertOk()->assertJsonCount(0);
    }

    public function test_draft_rejects_an_item_without_an_available_captured_reference(): void
    {
        [$manager, , $record, $items] = $this->evidence();
        $items[1]->update(['reference_status' => 'unavailable', 'reference_value' => null]);

        $this->actingAs($manager, 'sanctum')->postJson('/api/admin/legal-notices', [
            'monitoring_record_id' => $record->id,
            'notice_type' => 'LOI',
            'item_ids' => [$items[0]->id, $items[1]->id],
        ])->assertUnprocessable();

        $this->assertSame(0, LegalNotice::count());
    }

    public function test_policy_unavailable_issue_is_atomic_and_legacy_dispatch_is_removed(): void
    {
        [$manager, , $record, $items] = $this->evidence();
        config(['legal_policy.approved' => false]);
        $notice = LegalNotice::create([
            'store_id' => $record->store_id,
            'monitoring_record_id' => $record->id,
            'prepared_by' => $manager->id,
            'notice_type' => 'LOI',
            'status' => 'draft',
            'source_snapshot' => ['items' => [['id' => $items[0]->id]]],
            'draft_payload' => ['recipient_name' => 'Vendor Representative'],
        ]);

        $this->actingAs($manager, 'sanctum')->postJson("/api/admin/legal-notices/{$notice->id}/issue", [
            'confirmed' => true,
        ])->assertUnprocessable()->assertJsonPath('status', 'LEGAL_POLICY_UNAVAILABLE');

        $this->assertSame('draft', $notice->fresh()->status);
        $this->assertNull($notice->fresh()->pdf_file_path);
        $this->actingAs($manager, 'sanctum')->postJson('/api/notices/dispatch', [])->assertNotFound();
    }

    public function test_approved_policy_issues_one_private_hashed_pdf_and_rejects_repeat_issue(): void
    {
        Storage::fake(LegalNotice::DOCUMENT_DISK);
        Mail::fake();
        [$manager, $vendor, $record, $items] = $this->evidence();
        $vendor->forceFill(['email_verified_at' => now()])->save();
        config([
            'legal_policy.approved' => true, 'legal_policy.policy_version' => 'test-v1',
            'legal_policy.rules.LOI' => [
                'template' => 'notices.official-loi', 'reasons' => ['Request explanation'], 'legal_bases' => ['RA 7581'],
                'required_fields' => ['recipient_name', 'address', 'reason'], 'signatory' => ['name' => 'Authorized Director', 'office' => 'Provincial Office'],
                'response_period' => ['unit' => 'hours', 'value' => 48], 'deadline_anchor' => 'received',
                'control_number_pattern' => 'PM-{year}-{type}-{id}',
            ],
        ]);
        $draft = $this->actingAs($manager, 'sanctum')->postJson('/api/admin/legal-notices', ['monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'item_ids' => [$items[0]->id]])->json('data');
        $this->patchJson("/api/admin/legal-notices/{$draft['id']}", ['reason' => 'Request explanation', 'legal_bases' => ['RA 7581'], 'intended_delivery_method' => 'email_and_hand_copy', 'internal_justification' => 'Evaluator review completed.'])->assertOk();

        $issued = $this->postJson("/api/admin/legal-notices/{$draft['id']}/issue", ['confirmed' => true])->assertOk()->json('data');
        $this->assertSame('issued', $issued['status']);
        $this->assertMatchesRegularExpression('/^PM-\d{4}-LOI-\d{6}$/', $issued['control_number']);
        $stored = LegalNotice::findOrFail($issued['id']);
        $this->assertSame(LegalNotice::DOCUMENT_DISK, $stored->pdf_disk);
        Storage::disk(LegalNotice::DOCUMENT_DISK)->assertExists($stored->pdf_file_path);
        $this->assertSame(hash('sha256', Storage::disk(LegalNotice::DOCUMENT_DISK)->get($stored->pdf_file_path)), $stored->pdf_sha256);
        Mail::assertQueued(LegalNoticeAvailableMail::class, fn ($mail) => $mail->noticeId === $issued['id'] && count($mail->attachments) === 0);
        $this->postJson("/api/admin/legal-notices/{$draft['id']}/issue", ['confirmed' => true])->assertConflict();
    }

    private function evidence(): array
    {
        $manager = User::create(['name' => 'DTI Evaluator', 'email' => 'manager@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']);
        $vendor = User::create(['name' => 'Vendor', 'email' => 'vendor@example.test', 'password' => 'password', 'role' => 'vendor']);
        $store = Store::create(['store_name' => 'Captured Store', 'address' => 'San Jose, Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $vendor->id]);
        $record = MonitoringRecord::create([
            'client_uuid' => '10000000-0000-4000-8000-000000000100', 'officer_user_id' => $manager->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHour(), 'finalized_at' => now(), 'received_at' => now(),
            'latitude' => 10, 'longitude' => 121, 'location_accuracy_meters' => 8, 'location_captured_at' => now(),
            'representative_name' => 'Vendor Representative', 'representative_title' => 'Manager',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'officer.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'representative.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);

        $items = collect(['Rice', 'Milk'])->map(function (string $name, int $index) use ($record) {
            $bulletin = SrpBulletin::create(['commodity_name' => $name, 'baseline_price' => 50 + $index, 'effective_date' => '2026-01-01', 'is_active' => true]);
            return MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => 62 + $index,
                'baseline_price' => 50 + $index, 'variance_percent' => 24, 'is_anomaly' => true,
                'reference_status' => 'available', 'reference_type' => 'standard_srp', 'reference_label' => 'Captured SRP',
                'reference_value' => 50 + $index, 'reference_source' => 'DTI-2026', 'reference_effective_date' => '2026-01-01',
            ]);
        })->all();

        return [$manager, $vendor, $record, $items];
    }
}
