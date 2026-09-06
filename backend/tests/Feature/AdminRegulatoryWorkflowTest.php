<?php

namespace Tests\Feature;

use App\Mail\VendorInvitationMail;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminRegulatoryWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Mail::fake();
        $this->admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);
        $this->store = Store::create([
            'dti_sec_number' => 'SEC-ADMIN-001',
            'store_name' => 'Antique Market',
            'owner_name' => 'Vendor Owner',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
        ]);
        Sanctum::actingAs($this->admin);
    }

    public function test_store_invitation_is_hashed_expiring_audited_and_accepts_a_real_password(): void
    {
        config(['mail.default' => 'smtp']);
        $response = $this->postJson("/api/admin/stores/{$this->store->id}/invitations", [
            'email' => 'vendor@market.test',
            'expires_in_hours' => 24,
        ])->assertCreated();

        $url = $response->json('invitation_url');
        parse_str(parse_url($url, PHP_URL_QUERY) ?: '', $query);
        $token = $query['token'] ?? null;
        $this->assertStringContainsString('/vendor-invitation?', $url);
        $this->assertNotEmpty($token);
        $this->assertDatabaseMissing('vendor_invitations', ['token_hash' => $token]);
        $this->assertDatabaseHas('vendor_invitations', ['token_hash' => hash('sha256', $token), 'status' => 'pending']);
        Mail::assertQueued(VendorInvitationMail::class);
        $response->assertJsonPath('delivery_status', 'queued');

        $this->postJson("/api/vendor-invitations/{$token}/accept", [
            'name' => 'Vendor Owner',
            'password' => 'A-secure-vendor-password',
            'password_confirmation' => 'A-secure-vendor-password',
        ])->assertOk();

        $vendor = User::where('email', 'vendor@market.test')->firstOrFail();
        $this->assertSame('vendor', $vendor->role);
        $this->assertNotSame('A-secure-vendor-password', $vendor->getRawOriginal('password'));
        $this->assertDatabaseHas('audit_events', ['action' => 'invitation.accepted']);
    }

    public function test_srp_import_is_append_only_and_resolves_by_observation_date(): void
    {
        $old = SrpBulletin::create([
            'commodity_name' => 'Saba Sardines',
            'unit' => '155g',
            'commodity_key' => 'saba-sardines-155g',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $payload = [
            'metadata' => ['effective_date' => '2026-08-01', 'source_reference' => 'DTI-SRP-2026-08'],
            'items' => [[
                'item_name' => 'Saba Sardines',
                'unit' => '155g',
                'srp' => 22.25,
                'category' => 'Canned Fish',
                'regulatory_classification' => 'BASIC_NECESSITY',
            ]],
        ];

        $this->postJson('/api/admin/srp/import/preview', $payload)
            ->assertOk()
            ->assertJsonPath('data.insert_count', 1);
        $this->postJson('/api/admin/srp/import', $payload)->assertCreated();

        $old->refresh();
        $this->assertSame(21.5, $old->baseline_price);
        $this->getJson('/api/admin/srp/resolve?commodity_key=saba-sardines-155g&observed_at=2026-07-01')
            ->assertOk()
            ->assertJsonPath('data.id', $old->id);
        $this->getJson('/api/admin/srp/resolve?commodity_key=saba-sardines-155g&observed_at=2026-08-02')
            ->assertOk()
            ->assertJsonPath('data.baseline_price', 22.25);
    }

    public function test_review_queue_uses_only_consumer_reports_and_preserves_original_ocr(): void
    {
        $report = ConsumerReport::create([
            'report_reference' => 'REP-ADMIN-001',
            'tracking_token_hash' => hash('sha256', 'tracking'),
            'store_id' => $this->store->id,
            'submission_uuid' => 'submission-admin-001',
            'image_hash' => hash('sha256', 'image'),
            'image_vault_path' => 'receipt_vault/report.jpg',
            'raw_ocr_json' => ['items' => [['commodity_name' => 'OCR Saba', 'receipt_price' => '30.00']], 'metadata' => ['transactionDate' => '2026-07-20']],
            'status' => 'Under initial evaluation',
        ]);
        CitizenTip::create([
            'store_id' => $this->store->id,
            'extracted_text_json' => ['shelf_tag' => true],
            'image_hash_path' => 'scan_vault/tag.jpg',
            'status' => 'pending',
        ]);

        $this->getJson('/api/admin/reports')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.report_reference', 'REP-ADMIN-001');

        Storage::disk('local')->put('receipt_vault/report.jpg', 'private evidence');
        $this->get("/api/admin/reports/{$report->id}/evidence")->assertOk();
        $this->assertDatabaseHas('audit_events', ['action' => 'report.evidence_accessed', 'subject_id' => $report->id]);

        $original = $report->raw_ocr_json;
        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct',
            'reason' => 'Receipt line checked, but no regulatory finding selected.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g',
                'commodity_name' => 'Saba Sardines',
                'receipt_price' => 29.50,
                'observed_at' => '2026-07-20',
            ],
        ])->assertUnprocessable();

        $this->postJson("/api/admin/reports/{$report->id}/decision", [
            'action' => 'correct',
            'reason' => 'Receipt line verified manually.',
            'corrected' => [
                'commodity_key' => 'saba-sardines-155g',
                'commodity_name' => 'Saba Sardines',
                'receipt_price' => 29.50,
                'observed_at' => '2026-07-20',
                'regulatory_finding' => 'confirmed_violation',
            ],
        ])->assertOk();

        $report->refresh();
        $this->assertSame($original, $report->raw_ocr_json);
        $this->assertSame('Saba Sardines', $report->evaluator_confirmed_json['commodity_name']);
        $this->assertSame(1, RegulatoryFinding::where('decision', 'confirmed')->count());
        $this->store->refresh();
        $this->assertSame(1, $this->store->recidivism_index);
    }

    public function test_analytics_emergency_and_legal_actions_are_truthful_and_side_effect_safe(): void
    {
        $srp = SrpBulletin::create([
            'commodity_name' => 'Saba Sardines',
            'unit' => '155g',
            'commodity_key' => 'saba-sardines-155g',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);
        RegulatoryFinding::create([
            'store_id' => $this->store->id,
            'srp_bulletin_id' => $srp->id,
            'source_type' => 'consumer_report',
            'source_id' => 700,
            'observed_price' => 24.00,
            'observed_at' => now()->subWeek(),
            'decision' => 'confirmed',
            'decided_by' => $this->admin->id,
            'decided_at' => now(),
        ]);
        TemporalInspection::create([
            'store_id' => $this->store->id,
            'srp_id' => $srp->id,
            'recorded_price' => 25.00,
            'is_flagged' => true,
            'inspection_timestamp' => now()->subDays(2),
            'officer_signature' => 'signed',
            'validation_status' => 'verified',
            'validated_by' => $this->admin->id,
            'validated_at' => now(),
        ]);

        $this->getJson("/api/admin/analytics/stores/{$this->store->id}?commodity_key=saba-sardines-155g")
            ->assertOk()
            ->assertJsonCount(2, 'data.table_rows')
            ->assertJsonPath('data.recidivism_count', 1);

        $emergencyId = $this->postJson('/api/admin/emergencies', [
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-07-26',
            'declaration_reference' => 'PDRRMC-2026-07',
            'confirmed' => true,
        ])->assertCreated()->json('data.id');

        $this->getJson('/api/admin/emergency-prices/resolve?commodity_key=saba-sardines-155g&location=San%20Jose%20de%20Buenavista%2C%20Antique&observed_at=2026-07-26')
            ->assertOk()
            ->assertJsonPath('status', 'REGULATORY_PRICE_UNAVAILABLE');

        $this->postJson('/api/admin/emergency-prices', [
            'regulatory_emergency_id' => $emergencyId,
            'commodity_key' => 'saba-sardines-155g',
            'price_type' => 'PRICE_FREEZE',
            'authoritative_price' => 21.25,
            'effective_from' => '2026-07-26',
            'location' => 'San Jose de Buenavista, Antique',
            'declaration_reference' => 'PDRRMC-2026-07',
            'source_reference' => 'DTI-PF-2026-07',
        ])->assertCreated();
        $this->getJson('/api/admin/emergency-prices/resolve?commodity_key=saba-sardines-155g&location=San%20Jose%20de%20Buenavista%2C%20Antique&observed_at=2026-07-26')
            ->assertOk()
            ->assertJsonPath('status', 'REGULATORY_PRICE_FOUND')
            ->assertJsonPath('label', 'Frozen prevailing price');

        $this->patchJson("/api/admin/emergencies/{$emergencyId}", [
            'status' => 'ended',
            'ends_on' => '2026-07-26',
            'confirmed' => true,
        ])->assertOk();
        $this->getJson('/api/admin/emergency-prices/resolve?commodity_key=saba-sardines-155g&location=San%20Jose%20de%20Buenavista%2C%20Antique&observed_at=2026-07-27')
            ->assertOk()
            ->assertJsonPath('status', 'REGULATORY_PRICE_UNAVAILABLE');
        $this->assertDatabaseHas('audit_events', [
            'action' => 'emergency.status_changed',
            'subject_id' => $emergencyId,
        ]);

        $noticesBefore = \App\Models\LegalNotice::count();
        $this->postJson('/api/admin/legal/dispatch', ['store_id' => $this->store->id])
            ->assertNotFound();
        $this->assertSame($noticesBefore, \App\Models\LegalNotice::count());

        $this->postJson('/api/admin/legal-notices', [])
            ->assertUnprocessable();

        $record = \App\Models\MonitoringRecord::query()->first();
        $item = $record?->items()->where('is_anomaly', true)->whereNotNull('reference_value')->first();
        if ($item) {
            $draft = $this->postJson('/api/admin/legal-notices', [
            'monitoring_record_id' => $record->id,
            'item_ids' => [$item->id],
            'notice_type' => 'LOI',
            ])->assertCreated();
            $this->postJson('/api/admin/legal-notices/'.$draft->json('data.id').'/preview')
                ->assertOk()->assertSee('DRAFT — NOT AN OFFICIAL NOTICE')->assertSee((string) $item->recorded_price);
        }
    }
}
