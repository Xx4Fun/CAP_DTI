<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SensitiveActionGuard;
use App\Services\Admin\VendorInvitationService;
use App\Services\CommodityImageStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use RuntimeException;
use Throwable;

class StoreAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => Store::query()->orderBy('store_name')->get()]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit, CommodityImageStorage $images)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'dti_sec_number' => 'nullable|string|unique:stores,dti_sec_number',
            'store_name' => 'required|string|max:255',
            'owner_name' => 'nullable|string|max:255',
            'address' => 'required|string',
            'latitude' => 'required|numeric|between:-90,90',
            'longitude' => 'required|numeric|between:-180,180',
            'image' => 'nullable|image|mimes:webp,jpeg,png,jpg|max:2048',
        ]);
        unset($data['image']);
        $storedImage = null;
        $imageUrl = '/stores/store.webp';
        if ($request->hasFile('image')) {
            try {
                $storedImage = $images->store($request->file('image'), 'store_images');
                $imageUrl = $this->publicImageUrl($request, $images->url($storedImage));
            } catch (Throwable $exception) {
                $this->discardImage($images, $storedImage);
                report($exception);

                return response()->json([
                    'status' => 'STORE_IMAGE_STORAGE_UNAVAILABLE',
                    'message' => 'Store photo storage is temporarily unavailable. The establishment was not registered.',
                ], 503);
            }
        }
        $data = array_merge($data, [
            'image_path' => $imageUrl,
            'is_active' => true,
            'is_verified' => true,
            'is_public' => true,
            'verified_at' => now(),
            'verified_by' => $request->user()->id,
        ]);
        try {
            $store = DB::transaction(function () use ($data, $request, $audit, $storedImage) {
                $store = Store::create($data);
                $audit->recordOrFail($request, 'store.created', $store, ['visibility' => [
                    'active' => (bool) $store->is_active, 'verified' => (bool) $store->is_verified, 'public' => (bool) $store->is_public,
                ], 'has_custom_image' => $storedImage !== null]);
                return $store;
            });
        } catch (Throwable $exception) {
            $this->discardImage($images, $storedImage);
            throw $exception;
        }
        return response()->json(['data' => $store], 201);
    }

    /** Every client renders image_path directly as an <img> src, so it must be an absolute URL a browser can load. */
    private function publicImageUrl(Request $request, string $url): string
    {
        $production = app()->environment('production');
        if (str_starts_with($url, 'http://') && ($request->isSecure() || $request->header('X-Forwarded-Proto') === 'https' || $production)) {
            $url = 'https://'.substr($url, 7);
        }
        $usable = filter_var($url, FILTER_VALIDATE_URL)
            && in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)
            && ! ($production && in_array(parse_url($url, PHP_URL_HOST), ['localhost', '127.0.0.1'], true));
        if (! $usable) {
            throw new RuntimeException('Store image storage did not return a public absolute URL.');
        }
        return $url;
    }

    private function discardImage(CommodityImageStorage $images, ?string $path): void
    {
        if (! $path) return;
        try {
            $images->delete($path);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    public function update(Request $request, Store $store, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard, VendorInvitationService $invitations)
    {
        $auth->requireManager($request->user());
        // Linking happens only through an accepted invitation; the only accepted vendor change here is unlinking.
        if ($request->exists('vendor_user_id')) {
            abort_if($request->input('vendor_user_id') !== null, 422, 'Vendors can only be linked through an accepted invitation.');
            abort_if(count($request->except('vendor_user_id')) > 0, 422, 'Unlink the vendor in a separate request.');
            $guard->requireRecentReauthentication($request);
            return response()->json(['data' => $invitations->unlink($store, $request)]);
        }
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
