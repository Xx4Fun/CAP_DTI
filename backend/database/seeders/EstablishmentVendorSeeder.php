<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\LegalNotice;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use App\Services\Admin\LegalSignatoryService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class EstablishmentVendorSeeder extends Seeder
{
    /**
     * Seeds active vendor accounts and links for all official San Jose de Buenavista establishments,
     * populates registered owner names and representative profiles, seeds official legal notice signatories,
     * and reconciles any unissued draft notices.
     */
    public function run(): void
    {
        $demoPassword = (string) env('SEED_DEMO_PASSWORD', 'password123');
        $evaluatorId = User::where('role', 'dti_evaluator')->value('id')
            ?? User::where('role', 'field_officer')->value('id')
            ?? 1;

        foreach ($this->establishments() as $item) {
            $store = match ($item['store_name']) {
                'Gaisano Grand Mall' => Store::query()->where('store_name', 'like', 'Gaisano Grand%')->first(),
                'Robinsons Supermarket Corp.' => Store::query()->where('store_name', 'like', 'Robinsons%')->first(),
                default => Store::query()->where('store_name', $item['store_name'])->first(),
            };

            if (! $store) {
                continue;
            }

            // 1. Create or update the vendor user
            $user = User::updateOrCreate(
                ['email' => $item['vendor_email']],
                [
                    'name' => $item['vendor_name'],
                    'password' => Hash::make($demoPassword),
                    'role' => 'vendor',
                    'is_active' => true,
                ]
            );

            // 2. Link store to vendor and ensure owner / representative names are populated
            $store->vendor_user_id = $user->id;
            if (empty($store->owner_name)) {
                $store->owner_name = $item['owner_name'];
            }
            if (empty($store->current_representative_name)) {
                $store->current_representative_name = $item['vendor_name'];
                $store->current_representative_title = $item['rep_title'];
                $store->current_representative_updated_at = now();
            }
            $store->save();

            // 3. Ensure an accepted VendorInvitation record exists for audit consistency
            VendorInvitation::firstOrCreate(
                ['store_id' => $store->id, 'email' => $user->email],
                [
                    'token_hash' => hash('sha256', "seeded-invitation-{$store->id}-{$user->id}"),
                    'status' => 'accepted',
                    'accepted_by' => $user->id,
                    'accepted_at' => now(),
                    'expires_at' => now()->addDays(30),
                    'invited_by' => $evaluatorId,
                ]
            );

            // 4. Reconcile any existing unissued draft notices to prevent 409 RECIPIENT_REVIEW_REQUIRED
            $existingDrafts = LegalNotice::query()->where('status', 'draft')->where('store_id', $store->id)->get();
            foreach ($existingDrafts as $draft) {
                $payload = $draft->draft_payload ?? [];
                $payload['linked_vendor_user_id'] = $user->id;
                $payload['registered_owner_name'] = $store->owner_name;
                if (empty($payload['recipient_name'])) {
                    $payload['recipient_name'] = $store->owner_name;
                }
                if (empty($payload['recipient_email'])) {
                    $payload['recipient_email'] = $user->email;
                }
                $draft->draft_payload = $payload;
                $draft->save();
            }

            // 5. Audit event
            AuditEvent::create([
                'action' => 'store.vendor_seeded',
                'subject_type' => Store::class,
                'subject_id' => $store->id,
                'metadata' => [
                    'vendor_user_id' => $user->id,
                    'email' => $user->email,
                    'owner_name' => $store->owner_name,
                ],
            ]);
        }

        // 6. Seed official DTI signatories in system_settings if not already configured
        $signatoryUser = User::where('role', 'dti_evaluator')->first()
            ?? User::where('role', 'field_officer')->first()
            ?? User::first();
        $signatoryUserId = $signatoryUser ? $signatoryUser->id : 1;
        $signatoryService = app(LegalSignatoryService::class);

        $loiSignatory = $signatoryService->forType('LOI');
        if (empty($loiSignatory['name'])) {
            $signatoryService->put('LOI', 'name', 'Mercedes A. Young', $signatoryUserId);
            $signatoryService->put('LOI', 'office', 'Provincial Director, DTI Antique Provincial Office', $signatoryUserId);
        }

        $scoSignatory = $signatoryService->forType('SCO');
        if (empty($scoSignatory['name'])) {
            $signatoryService->put('SCO', 'name', 'Atty. Fina P. De Leon', $signatoryUserId);
            $signatoryService->put('SCO', 'office', 'Director, Fair Trade Enforcement Bureau', $signatoryUserId);
        }
    }

    /**
     * Official establishment vendor mapping for San Jose de Buenavista.
     * HARO MART uses the standard demo vendor account vendor@grocery.com (Maria Clara).
     */
    public function establishments(): array
    {
        return [
            [
                'store_name' => 'Robinsons Supermarket Corp.',
                'owner_name' => 'Robinsons Supermarket Corporation',
                'vendor_email' => 'vendor.robinsons@price-watch.ph',
                'vendor_name' => 'Elena V. Ramos',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'Gaisano Grand Mall',
                'owner_name' => 'Gaisano Grand Malls Inc.',
                'vendor_email' => 'vendor.gaisano@price-watch.ph',
                'vendor_name' => 'Roberto S. Gaisano',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'Puregold Price Club Incorporated',
                'owner_name' => 'Puregold Price Club, Inc.',
                'vendor_email' => 'vendor.puregold@price-watch.ph',
                'vendor_name' => 'Lucio L. Co',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => "Licanda's Retail Chain Branch 2 (Licandas OPC 1)",
                'owner_name' => "Licanda's Retail Chain OPC",
                'vendor_email' => 'vendor.licandas2@price-watch.ph',
                'vendor_name' => 'Ramon T. Licanda',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'Merrymart Consumer Corp.',
                'owner_name' => 'MerryMart Consumer Corp.',
                'vendor_email' => 'vendor.merrymart@price-watch.ph',
                'vendor_name' => 'Edgar J. Sia II',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'Antique City Square',
                'owner_name' => 'Antique City Square Commercial Corp.',
                'vendor_email' => 'vendor.citysquare@price-watch.ph',
                'vendor_name' => 'Grace M. Tan',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'Unitop General Merchandise',
                'owner_name' => 'Unitop General Merchandise Inc.',
                'vendor_email' => 'vendor.unitop@price-watch.ph',
                'vendor_name' => 'Ricardo C. Sy',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => 'HARO MART',
                'owner_name' => 'Haro Mart Enterprises',
                'vendor_email' => 'vendor@grocery.com',
                'vendor_name' => 'Maria Clara Santos',
                'rep_title' => 'Owner',
            ],
            [
                'store_name' => 'CPT Mart- Antique Branch',
                'owner_name' => 'CPT Mart Trading Corporation',
                'vendor_email' => 'vendor.cptmart@price-watch.ph',
                'vendor_name' => 'Carlos P. Torres',
                'rep_title' => 'Manager',
            ],
            [
                'store_name' => "Licanda's Retail Chain Branch 1",
                'owner_name' => "Licanda's Retail Chain OPC",
                'vendor_email' => 'vendor.licandas1@price-watch.ph',
                'vendor_name' => 'Ana L. Licanda',
                'rep_title' => 'Owner',
            ],
        ];
    }
}
