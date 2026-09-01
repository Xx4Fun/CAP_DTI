<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SensitiveActionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;

class StoreAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => Store::query()->orderBy('store_name')->get()]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'dti_sec_number' => 'nullable|string|unique:stores,dti_sec_number',
            'store_name' => 'required|string|max:255',
            'owner_name' => 'nullable|string|max:255',
            'address' => 'required|string',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
        ]);
        $data = array_merge($data, [
            'image_path' => '/stores/store.webp',
            'is_active' => true,
            'is_verified' => true,
            'is_public' => true,
            'verified_at' => now(),
            'verified_by' => $request->user()->id,
        ]);
        $store = DB::transaction(function () use ($data, $request, $audit) {
            $store = Store::create($data);
            $audit->recordOrFail($request, 'store.created', $store, ['visibility' => [
                'active' => (bool) $store->is_active, 'verified' => (bool) $store->is_verified, 'public' => (bool) $store->is_public,
            ]]);
            return $store;
        });
        return response()->json(['data' => $store], 201);
    }

    public function update(Request $request, Store $store, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'dti_sec_number' => ['sometimes', 'nullable', 'string', Rule::unique('stores')->ignore($store->id)],
            'store_name' => 'sometimes|string|max:255', 'owner_name' => 'sometimes|nullable|string|max:255',
            'address' => 'sometimes|string', 'latitude' => 'sometimes|numeric|between:-90,90',
            'longitude' => 'sometimes|numeric|between:-180,180', 'is_active' => 'sometimes|boolean',
            'is_verified' => 'sometimes|boolean', 'is_public' => 'sometimes|boolean',
        ]);
        if (array_intersect(['is_verified', 'is_public'], array_keys($data))) {
            $guard->requireRecentReauthentication($request);
        }
        $willBeActive = $data['is_active'] ?? (bool) $store->is_active;
        $willBeVerified = $data['is_verified'] ?? (bool) $store->is_verified;
        $willBePublic = $data['is_public'] ?? (bool) $store->is_public;
        if ($willBePublic && (! $willBeActive || ! $willBeVerified)) {
            throw ValidationException::withMessages([
                'is_public' => ['A store must be active and verified before it can be public.'],
            ]);
        }
        if (($data['is_verified'] ?? null) === true) {
            $data['verified_at'] = now();
            $data['verified_by'] = $request->user()->id;
        }
        DB::transaction(function () use ($data, $request, $audit, $store) {
            $store->forceFill($data)->save();
            $audit->recordOrFail($request, 'store.updated', $store, ['changed_fields' => array_keys($data)]);
        });
        return response()->json(['data' => $store]);
    }
}
