<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use App\Models\VendorRegistration;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class VendorRegistrationAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'rejected', 'approved', 'all'])],
        ]);
        $status = $data['status'] ?? 'pending';

        $query = VendorRegistration::query()
            ->with([
                'user:id,name,email,is_active,created_at',
                'store:id,store_name,address',
                'reviewer:id,name',
            ])
            ->orderByDesc('submitted_at')
            ->orderByDesc('id');

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        return response()->json([
            'data' => $query->limit(200)->get()->map(fn (VendorRegistration $registration) => $this->serialize($registration)),
        ]);
    }

    public function approve(
        Request $request,
        VendorRegistration $registration,
        AdminAuthorizationService $auth,
        AuditTrailService $audit,
    ) {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'mode' => ['nullable', Rule::in(['create_new', 'link_existing'])],
            'existing_store_id' => ['nullable', 'integer', 'required_if:mode,link_existing', 'exists:stores,id'],
            'update_existing_store' => ['nullable', 'boolean'],
        ]);

        $mode = $data['mode'] ?? 'create_new';
        $updateExisting = (bool) ($data['update_existing_store'] ?? true);

        [$approvedRegistration, $store, $vendorUser] = DB::transaction(function () use ($request, $registration, $mode, $data, $updateExisting, $audit) {
            $targetStore = null;
            if ($mode === 'link_existing') {
                // Lock store first to match the store -> invitation/registration -> user lock order across the codebase.
                $targetStore = Store::whereKey((int) $data['existing_store_id'])->lockForUpdate()->firstOrFail();
            }

            $locked = VendorRegistration::whereKey($registration->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages([
                    'registration' => ['Only pending vendor registrations can be approved.'],
                ]);
            }

            $vendorUser = User::whereKey($locked->user_id)->lockForUpdate()->firstOrFail();
            if ($vendorUser->role !== 'vendor') {
                throw ValidationException::withMessages([
                    'user' => ['This registration does not belong to a vendor account.'],
                ]);
            }

            $rawImagePath = $locked->getRawOriginal('image_path');

            if ($mode === 'link_existing' && $targetStore) {
                if ($targetStore->vendor_user_id && (int) $targetStore->vendor_user_id !== (int) $vendorUser->id) {
                    throw new HttpResponseException(response()->json([
                        'status' => 'STORE_ALREADY_LINKED',
                        'message' => 'This establishment already has a linked vendor account. Unlink it first or approve as a new establishment.',
                        'errors' => ['existing_store_id' => ['This establishment already has a linked vendor account.']],
                    ], 422));
                }

                if ($updateExisting && $locked->dti_sec_number) {
                    $conflict = Store::where('dti_sec_number', $locked->dti_sec_number)
                        ->whereKeyNot($targetStore->id)
                        ->exists();
                    if ($conflict) {
                        throw ValidationException::withMessages([
                            'dti_sec_number' => ['This SEC / DTI registration number is already assigned to another establishment.'],
                        ]);
                    }
                }

                VendorInvitation::where('store_id', $targetStore->id)->where('status', 'pending')->lockForUpdate()->get()
                    ->each(function (VendorInvitation $pending) use ($request, $audit) {
                        $pending->update(['status' => 'cancelled', 'cancelled_at' => now()]);
                        $audit->recordOrFail($request, 'invitation.cancelled', $pending, [
                            'email' => $pending->email,
                            'reason' => 'vendor_registration_approved',
                        ]);
                    });

                $storeUpdates = [
                    'vendor_user_id' => $vendorUser->id,
                    'is_active' => true,
                    'is_verified' => true,
                    'is_public' => true,
                    'verified_at' => now(),
                    'verified_by' => $request->user()->id,
                    'current_representative_name' => $locked->owner_name,
                    'current_representative_title' => $locked->representative_title ?: 'Owner',
                    'current_representative_updated_at' => now(),
                ];

                if ($updateExisting) {
                    $storeUpdates['owner_name'] = $locked->owner_name;
                    $storeUpdates['address'] = $locked->address;
                    $storeUpdates['latitude'] = $locked->latitude;
                    $storeUpdates['longitude'] = $locked->longitude;
                    if ($locked->dti_sec_number) {
                        $storeUpdates['dti_sec_number'] = $locked->dti_sec_number;
                    }
                    if ($rawImagePath) {
                        $storeUpdates['image_path'] = $rawImagePath;
                    }
                }

                $targetStore->forceFill($storeUpdates)->save();
                $store = $targetStore;
            } else {
                if ($locked->dti_sec_number && Store::where('dti_sec_number', $locked->dti_sec_number)->exists()) {
                    throw ValidationException::withMessages([
                        'dti_sec_number' => ['This SEC / DTI registration number is already assigned to an existing establishment. Choose "Link to an existing establishment" instead.'],
                    ]);
                }

                $store = new Store([
                    'dti_sec_number' => $locked->dti_sec_number,
                    'store_name' => $locked->store_name,
                    'owner_name' => $locked->owner_name,
                    'address' => $locked->address,
                    'latitude' => $locked->latitude,
                    'longitude' => $locked->longitude,
                    'image_path' => $rawImagePath,
                    'is_active' => true,
                    'is_verified' => true,
                    'is_public' => true,
                    'vendor_user_id' => $vendorUser->id,
                    'verified_at' => now(),
                    'verified_by' => $request->user()->id,
                ]);
                $store->forceFill([
                    'current_representative_name' => $locked->owner_name,
                    'current_representative_title' => $locked->representative_title ?: 'Owner',
                    'current_representative_updated_at' => now(),
                ])->save();
            }

            $vendorUser->forceFill(['is_active' => true])->save();

            $locked->forceFill([
                'status' => 'approved',
                'store_id' => $store->id,
                'rejection_reason' => null,
                'reviewed_at' => now(),
                'reviewed_by' => $request->user()->id,
            ])->save();

            $audit->recordOrFail($request, 'vendor_registration.approved', $locked, [
                'user_id' => $vendorUser->id,
                'store_id' => $store->id,
                'store_name' => $store->store_name,
                'mode' => $mode,
            ]);

            return [
                $locked->fresh(['user:id,name,email,is_active,created_at', 'store:id,store_name,address', 'reviewer:id,name']),
                $store,
                $vendorUser->fresh('stores:id,vendor_user_id,store_name'),
            ];
        });

        return response()->json([
            'data' => [
                'registration' => $this->serialize($approvedRegistration),
                'store' => [...$store->toArray(), 'current_representative' => $store->currentRepresentative()],
                'user' => $vendorUser,
            ],
        ]);
    }

    public function reject(
        Request $request,
        VendorRegistration $registration,
        AdminAuthorizationService $auth,
        AuditTrailService $audit,
    ) {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $reason = trim($data['reason']);
        if ($reason === '') {
            throw ValidationException::withMessages([
                'reason' => ['Provide a clear reason explaining why the registration needs changes.'],
            ]);
        }

        $rejected = DB::transaction(function () use ($request, $registration, $reason, $audit) {
            $locked = VendorRegistration::whereKey($registration->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages([
                    'registration' => ['Only pending vendor registrations can be returned or rejected.'],
                ]);
            }

            $vendorUser = User::whereKey($locked->user_id)->lockForUpdate()->firstOrFail();
            $vendorUser->forceFill(['is_active' => false])->save();

            $locked->forceFill([
                'status' => 'rejected',
                'rejection_reason' => $reason,
                'reviewed_at' => now(),
                'reviewed_by' => $request->user()->id,
            ])->save();

            $audit->recordOrFail($request, 'vendor_registration.rejected', $locked, [
                'user_id' => $vendorUser->id,
                'store_name' => $locked->store_name,
                'reason' => $reason,
            ]);

            return $locked->fresh(['user:id,name,email,is_active,created_at', 'store:id,store_name,address', 'reviewer:id,name']);
        });

        return response()->json(['data' => $this->serialize($rejected)]);
    }

    private function serialize(VendorRegistration $registration): array
    {
        return [
            ...VendorAuthController::formatRegistration($registration),
            'user' => $registration->user ? [
                'id' => (int) $registration->user->id,
                'name' => (string) $registration->user->name,
                'email' => (string) $registration->user->email,
                'is_active' => (bool) $registration->user->is_active,
                'created_at' => $registration->user->created_at?->toIso8601String(),
            ] : null,
            'store' => $registration->store ? [
                'id' => (int) $registration->store->id,
                'store_name' => (string) $registration->store->store_name,
                'address' => (string) $registration->store->address,
            ] : null,
            'reviewer' => $registration->reviewer ? [
                'id' => (int) $registration->reviewer->id,
                'name' => (string) $registration->reviewer->name,
            ] : null,
        ];
    }
}
