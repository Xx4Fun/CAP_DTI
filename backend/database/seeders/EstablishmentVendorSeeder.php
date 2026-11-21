<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\LegalNotice;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Models\User;
use App\Models\VendorInvitation;
use App\Services\Admin\LegalSignatoryService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class EstablishmentVendorSeeder extends Seeder
{
    /**
     * Seeds active vendor accounts and links for all official San Jose de Buenavista establishments,
     * preserves pre-existing vendor accounts and issued legal notice recipients, populates registered
     * owner names and representative profiles, seeds official legal notice signatories, and reconciles
     * draft notices and store communications.
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

            // 1. Identify the rightful vendor account:
            // Check if a legal notice was already issued for this store (e.g. Gaisano Grand Mall's original account)
            $targetVendor = null;
            $noticeVendorId = LegalNotice::query()
                ->where('store_id', $store->id)
                ->whereNotNull('vendor_user_id')
                ->where('vendor_user_id', '>', 0)
                ->latest('issued_at')
                ->value('vendor_user_id');

            if ($noticeVendorId) {
                $noticeVendor = User::whereKey($noticeVendorId)->where('role', 'vendor')->first();
                if ($noticeVendor) {
                    $targetVendor = $noticeVendor;
                }
            }

            // If no notice vendor, check if the store currently has an active vendor linked that isn't the placeholder
            if (! $targetVendor && $store->vendor_user_id) {
                $existingVendor = User::whereKey($store->vendor_user_id)->where('role', 'vendor')->first();
                if ($existingVendor && $existingVendor->is_active) {
                    $targetVendor = $existingVendor;
                }
            }

            // If an established vendor already exists, preserve it; otherwise create/update the standardized vendor
            if ($targetVendor) {
                $targetVendor->is_active = true;
                $targetVendor->save();

                // If a redundant synthetic user was created previously under the item's email, clean it up
                if ($targetVendor->email !== $item['vendor_email']) {
                    User::query()->where('email', $item['vendor_email'])->delete();
                }

                $user = $targetVendor;
            } else {
                $user = User::updateOrCreate(
                    ['email' => $item['vendor_email']],
                    [
                        'name' => $item['vendor_name'],
                        'password' => Hash::make($demoPassword),
                        'role' => 'vendor',
                        'is_active' => true,
                    ]
                );
            }

            // 2. Link store to the vendor and ensure owner / representative names are populated
            $store->vendor_user_id = $user->id;
            if (empty($store->owner_name)) {
                $store->owner_name = $item['owner_name'];
            }
            if (empty($store->current_representative_name)) {
                $store->current_representative_name = $user->name ?: $item['vendor_name'];
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

            // 4. Synchronize all notices (drafts and issued) to the active vendor user ID
            LegalNotice::query()
                ->where('store_id', $store->id)
                ->whereIn('status', ['issued', 'response_received', 'closed', 'cancelled'])
                ->update(['vendor_user_id' => $user->id]);

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
                $draft->vendor_user_id = $user->id;
                $draft->save();
            }

            // 5. Reconcile store messages so the active vendor can access communication history
            StoreMessage::query()
                ->where('store_id', $store->id)
                ->where('vendor_user_id', '!=', $user->id)
                ->update(['vendor_user_id' => $user->id]);

            // 6. Audit event
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

        // 7. Seed official DTI signatories in system_settings if not already configured
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
