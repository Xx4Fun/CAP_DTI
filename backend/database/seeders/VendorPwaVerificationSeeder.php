<?php

namespace Database\Seeders;

use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Local-only fixtures for the vendor PWA end-to-end walkthrough: a dedicated fixture store linked to the demo vendor,
 * an issued and delivered LOI with a real one-page PDF, and a pending invitation for a second fixture store.
 * It never links a real establishment and bypasses the legal policy gate on purpose; never run it against real data.
 */
class VendorPwaVerificationSeeder extends Seeder
{
    private const LINKED_STORE = 'E2E Vendor Fixture Mart';
    private const INVITE_STORE = 'E2E Invitation Fixture Store';

    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            throw new RuntimeException('VendorPwaVerificationSeeder only runs in local or testing environments.');
        }

        $officer = User::where('role', 'field_officer')->firstOrFail();
        $vendor = User::where('email', 'vendor@grocery.com')->where('role', 'vendor')->firstOrFail();
        $bulletin = SrpBulletin::where('is_active', true)->where('baseline_price', '>', 0)->orderBy('id')->firstOrFail();

        $store = $this->fixtureStore(self::LINKED_STORE);
        if ($store->vendor_user_id && (int) $store->vendor_user_id !== (int) $vendor->id) {
            throw new RuntimeException(self::LINKED_STORE.' is already linked to another vendor.');
        }
        $store->forceFill(['vendor_user_id' => $vendor->id])->save();

        $record = MonitoringRecord::create([
            'client_uuid' => (string) Str::uuid(), 'officer_user_id' => $officer->id, 'store_id' => $store->id,
            'status' => 'accepted', 'started_at' => now()->subHours(2), 'finalized_at' => now()->subHour(), 'received_at' => now()->subHour(),
            'latitude' => $store->latitude, 'longitude' => $store->longitude, 'location_accuracy_meters' => 8, 'location_captured_at' => now()->subHour(),
            'representative_name' => $vendor->name, 'representative_title' => 'Owner',
            'officer_signature_disk' => 'local', 'officer_signature_path' => 'e2e/officer.sig', 'officer_signature_sha256' => str_repeat('a', 64),
            'representative_signature_disk' => 'local', 'representative_signature_path' => 'e2e/representative.sig', 'representative_signature_sha256' => str_repeat('b', 64),
            'sync_source' => 'online',
        ]);
        $observed = round($bulletin->baseline_price * 1.25, 2);
        $item = MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id, 'recorded_price' => $observed,
            'baseline_price' => $bulletin->baseline_price, 'variance_percent' => 25, 'is_anomaly' => true,
            'reference_status' => 'available', 'reference_type' => 'standard_srp', 'reference_label' => 'SRP baseline (provisional)',
            'reference_value' => $bulletin->baseline_price, 'reference_source' => $bulletin->source_reference ?? 'E2E fixture',
            'reference_effective_date' => $bulletin->effective_date,
        ]);

        $notice = LegalNotice::create([
            'store_id' => $store->id, 'monitoring_record_id' => $record->id, 'notice_type' => 'LOI', 'prepared_by' => $officer->id,
            'control_number' => 'E2E-LOI-'.now()->format('YmdHis'), 'status' => 'issued', 'issued_at' => now()->subHour(),
            'intended_delivery_method' => 'hand_copy', 'delivery_state' => 'received', 'delivered_at' => now()->subMinutes(30),
            'due_date_timestamp' => now()->addDays(3),
            'source_snapshot' => [
                'monitoring_record_id' => $record->id, 'monitoring_date' => $record->finalized_at->toIso8601String(),
                'store' => $store->only(['id', 'store_name', 'address', 'dti_sec_number']),
                'items' => [[
                    'id' => $item->id, 'commodity_name' => $bulletin->commodity_name, 'unit' => $bulletin->unit,
                    'observed_price' => $observed, 'reference_value' => $bulletin->baseline_price, 'reference_label' => 'SRP baseline (provisional)',
                    'reference_source' => $item->reference_source, 'variance_percent' => 25,
                ]],
            ],
            'draft_payload' => ['recipient_name' => $vendor->name, 'address' => $store->address],
        ]);
        $path = "legal-notices/{$notice->id}/{$notice->control_number}.pdf";
        $pdf = Pdf::loadHTML('<h1>TEST FIXTURE — NOT AN OFFICIAL NOTICE</h1><p>'.e($notice->control_number).' for '.e($store->store_name).'</p>')->setPaper('a4')->output();
        Storage::disk(LegalNotice::DOCUMENT_DISK)->put($path, $pdf);
        $notice->update(['pdf_disk' => LegalNotice::DOCUMENT_DISK, 'pdf_file_path' => $path, 'pdf_sha256' => hash('sha256', $pdf)]);

        $inviteStore = $this->fixtureStore(self::INVITE_STORE);
        if ($inviteStore->vendor_user_id) {
            throw new RuntimeException(self::INVITE_STORE.' is already linked; reset the local database first.');
        }
        $raw = 'e2e-invitation-'.Str::random(24);
        VendorInvitation::create([
            'store_id' => $inviteStore->id, 'email' => 'new-vendor@e2e.test', 'token_hash' => hash('sha256', $raw),
            'status' => 'pending', 'expires_at' => now()->addDay(), 'invited_by' => $officer->id,
        ]);

        $this->command?->info("Seeded notice {$notice->control_number} for {$store->store_name}.");
        $this->command?->info('Pending invitation URL: '.rtrim(config('app.vendor_pwa_url'), '/').'/vendor-invitation?token='.$raw);
    }

    private function fixtureStore(string $name): Store
    {
        return Store::firstOrCreate(['store_name' => $name], [
            'address' => 'Fixture address, San Jose de Buenavista, Antique', 'latitude' => 10.7440, 'longitude' => 121.9410,
            'is_active' => true, 'is_verified' => true, 'is_public' => false,
        ]);
    }
}
