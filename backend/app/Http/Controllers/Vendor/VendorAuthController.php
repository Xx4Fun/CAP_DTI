<?php

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\VendorRegistration;
use App\Services\Admin\AuditTrailService;
use App\Services\CommodityImageStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

class VendorAuthController extends Controller
{
    use ResolvesVendor;

    public const TOKEN_NAME = 'vendor-portal-pwa';
    public const REGISTRATION_TOKEN_NAME = 'vendor-registration-pwa';

    public function register(Request $request, CommodityImageStorage $images, AuditTrailService $audit)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
            'store_name' => ['required', 'string', 'max:255'],
            'owner_name' => ['required', 'string', 'max:255'],
            'representative_title' => ['required', 'string', 'in:Owner,Manager'],
            'dti_sec_number' => ['nullable', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:1000'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'image' => ['required', 'image', 'mimes:webp,jpeg,png,jpg', 'max:2048'],
        ]);

        $email = Str::lower(trim($data['email']));
        if (User::whereRaw('LOWER(email) = ?', [$email])->exists()) {
            throw ValidationException::withMessages(['email' => ['This email address is already registered.']]);
        }

        $dtiSecNumber = isset($data['dti_sec_number']) && trim($data['dti_sec_number']) !== ''
            ? trim($data['dti_sec_number'])
            : null;

        $storedImage = null;
        try {
            $storedImage = $images->store($request->file('image'), 'store_images');
            $this->assertPublicUrl($images->publicUrl($storedImage));
        } catch (Throwable $exception) {
            $this->discardImage($images, $storedImage);
            report($exception);

            return response()->json([
                'status' => 'STORE_IMAGE_STORAGE_UNAVAILABLE',
                'message' => 'Establishment photo storage is temporarily unavailable. Your registration was not submitted.',
            ], 503);
        }

        try {
            [$user, $registration, $token, $expiresAt] = DB::transaction(function () use ($data, $email, $dtiSecNumber, $storedImage, $request, $audit) {
                if (User::whereRaw('LOWER(email) = ?', [$email])->lockForUpdate()->exists()) {
                    throw ValidationException::withMessages(['email' => ['This email address is already registered.']]);
                }

                $user = User::create([
                    'name' => trim($data['name']),
                    'email' => $email,
                    'password' => $data['password'],
                    'role' => 'vendor',
                    'is_active' => false,
                    'must_change_password' => false,
                ]);

                $registration = VendorRegistration::create([
                    'user_id' => $user->id,
                    'store_name' => trim($data['store_name']),
                    'owner_name' => trim($data['owner_name']),
                    'representative_title' => $data['representative_title'],
                    'dti_sec_number' => $dtiSecNumber,
                    'address' => trim($data['address']),
                    'latitude' => (float) $data['latitude'],
                    'longitude' => (float) $data['longitude'],
                    'image_path' => $storedImage,
                    'status' => 'pending',
                    'submitted_at' => now(),
                ]);

                $expiresAt = now()->addHours((int) config('app.vendor_token_hours'));
                $token = $user->createToken(self::REGISTRATION_TOKEN_NAME, ['vendor-registration'], $expiresAt);

                $audit->recordAs($request, $user, 'vendor.registration_submitted', $registration, [
                    'store_name' => $registration->store_name,
                    'email' => $user->email,
                    'has_custom_image' => $storedImage !== null,
                ]);

                return [$user, $registration, $token, $expiresAt];
            });
        } catch (Throwable $exception) {
            $this->discardImage($images, $storedImage);
            throw $exception;
        }

        return response()->json([
            'account_state' => 'pending_review',
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'user' => $user->only(['id', 'name', 'email', 'role']),
            'registration' => $this->formatRegistration($registration),
        ], 201);
    }

    public function login(Request $request, AuditTrailService $audit)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);

        // Check credentials and issue the token under the user-row lock that Admin password resets and deactivation also take,
        // so a reset committed mid-login is either seen here (old password rejected) or revokes the token issued here.
        [$user, $token, $expiresAt, $accountState, $registration] = DB::transaction(function () use ($data) {
            $user = User::where('email', Str::lower($data['email']))->lockForUpdate()->first();
            if (! $user || ! Hash::check($data['password'], $user->password)) {
                throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
            }
            if ($user->role !== 'vendor') {
                $this->vendorError(403, 'VENDOR_ACCESS_DENIED', 'This account does not have access to the Vendor Portal.');
            }

            $registration = VendorRegistration::where('user_id', $user->id)->lockForUpdate()->first();
            $expiresAt = now()->addHours((int) config('app.vendor_token_hours'));

            if (! $user->is_active) {
                if ($registration && in_array($registration->status, ['pending', 'rejected'], true)) {
                    $state = $registration->status === 'rejected' ? 'rejected' : 'pending_review';
                    $token = $user->createToken(self::REGISTRATION_TOKEN_NAME, ['vendor-registration'], $expiresAt);

                    return [$user, $token, $expiresAt, $state, $registration];
                }

                $this->vendorError(403, 'VENDOR_ACCESS_DENIED', 'This account does not have access to the Vendor Portal.');
            }

            return [$user, $user->createToken(self::TOKEN_NAME, ['vendor-portal'], $expiresAt), $expiresAt, 'active', $registration];
        });

        $audit->recordAs(
            $request,
            $user,
            $accountState === 'active' ? 'auth.vendor_login_succeeded' : 'auth.vendor_registration_login',
            $user,
            $accountState === 'active' ? [] : ['account_state' => $accountState]
        );

        return response()->json([
            'account_state' => $accountState,
            'token' => $token->plainTextToken,
            'expires_at' => $expiresAt->toIso8601String(),
            'user' => $user,
            'registration' => $registration ? $this->formatRegistration($registration) : null,
        ]);
    }

    public function session(Request $request)
    {
        return response()->json(['data' => ['user' => $this->vendorUser($request)]]);
    }

    public function registrationStatus(Request $request)
    {
        $user = $this->vendorRegistrationUser($request);
        $currentToken = $user->currentAccessToken();

        $payload = DB::transaction(function () use ($user, $currentToken) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if ($locked->role !== 'vendor' || ! $locked->tokens()->whereKey($currentToken->getKey())->exists()) {
                $this->vendorError(403, 'VENDOR_ACCESS_REVOKED', 'This session no longer has Vendor Portal access. Sign in again.');
            }

            $registration = VendorRegistration::where('user_id', $locked->id)->lockForUpdate()->first();

            if ($locked->is_active && (! $registration || $registration->status === 'approved')) {
                $upgraded = [];
                if ($currentToken->name === self::REGISTRATION_TOKEN_NAME) {
                    $expiresAt = now()->addHours((int) config('app.vendor_token_hours'));
                    $newToken = $locked->createToken(self::TOKEN_NAME, ['vendor-portal'], $expiresAt);
                    $locked->tokens()->whereKey($currentToken->getKey())->delete();
                    $upgraded = [
                        'token' => $newToken->plainTextToken,
                        'expires_at' => $expiresAt->toIso8601String(),
                    ];
                }

                return [
                    'account_state' => 'active',
                    'user' => $locked->only(['id', 'name', 'email', 'role']),
                    'registration' => $registration ? $this->formatRegistration($registration) : null,
                    ...$upgraded,
                ];
            }

            if (! $registration || ! in_array($registration->status, ['pending', 'rejected'], true)) {
                $this->vendorError(403, 'VENDOR_ACCESS_REVOKED', 'This session no longer has Vendor Portal access. Sign in again.');
            }

            return [
                'account_state' => $registration->status === 'rejected' ? 'rejected' : 'pending_review',
                'user' => $locked->only(['id', 'name', 'email', 'role']),
                'registration' => $this->formatRegistration($registration),
            ];
        });

        return response()->json(['data' => $payload]);
    }

    public function resubmitRegistration(Request $request, CommodityImageStorage $images, AuditTrailService $audit)
    {
        $user = $this->vendorRegistrationUser($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'store_name' => ['required', 'string', 'max:255'],
            'owner_name' => ['required', 'string', 'max:255'],
            'representative_title' => ['required', 'string', 'in:Owner,Manager'],
            'dti_sec_number' => ['nullable', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:1000'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'image' => ['nullable', 'image', 'mimes:webp,jpeg,png,jpg', 'max:2048'],
        ]);

        $dtiSecNumber = isset($data['dti_sec_number']) && trim($data['dti_sec_number']) !== ''
            ? trim($data['dti_sec_number'])
            : null;

        $storedImage = null;
        if ($request->hasFile('image')) {
            try {
                $storedImage = $images->store($request->file('image'), 'store_images');
                $this->assertPublicUrl($images->publicUrl($storedImage));
            } catch (Throwable $exception) {
                $this->discardImage($images, $storedImage);
                report($exception);

                return response()->json([
                    'status' => 'STORE_IMAGE_STORAGE_UNAVAILABLE',
                    'message' => 'Establishment photo storage is temporarily unavailable. Your changes were not saved.',
                ], 503);
            }
        }

        $previousImage = null;
        try {
            [$locked, $registration] = DB::transaction(function () use ($user, $data, $dtiSecNumber, $storedImage, $request, $audit, &$previousImage) {
                $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
                $registration = VendorRegistration::where('user_id', $locked->id)->lockForUpdate()->first();

                if (! $registration || ! in_array($registration->status, ['pending', 'rejected'], true)) {
                    throw ValidationException::withMessages([
                        'registration' => ['This registration has already been approved and cannot be resubmitted.'],
                    ]);
                }

                $locked->forceFill(['name' => trim($data['name'])])->save();

                $updates = [
                    'store_name' => trim($data['store_name']),
                    'owner_name' => trim($data['owner_name']),
                    'representative_title' => $data['representative_title'],
                    'dti_sec_number' => $dtiSecNumber,
                    'address' => trim($data['address']),
                    'latitude' => (float) $data['latitude'],
                    'longitude' => (float) $data['longitude'],
                    'status' => 'pending',
                    'rejection_reason' => null,
                    'submitted_at' => now(),
                    'reviewed_at' => null,
                    'reviewed_by' => null,
                ];

                if ($storedImage !== null) {
                    $previousImage = $registration->getRawOriginal('image_path');
                    $updates['image_path'] = $storedImage;
                }

                $registration->forceFill($updates)->save();

                $audit->recordAs($request, $locked, 'vendor.registration_resubmitted', $registration, [
                    'store_name' => $registration->store_name,
                    'replaced_image' => $storedImage !== null,
                ]);

                return [$locked, $registration->fresh()];
            });
        } catch (Throwable $exception) {
            $this->discardImage($images, $storedImage);
            throw $exception;
        }

        if ($previousImage && $previousImage !== $storedImage) {
            $this->discardImage($images, $previousImage);
        }

        return response()->json([
            'data' => [
                'account_state' => 'pending_review',
                'user' => $locked->only(['id', 'name', 'email', 'role']),
                'registration' => $this->formatRegistration($registration),
            ],
        ]);
    }

    public function password(Request $request, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $data = $request->validate(['current_password' => ['required', 'string'], 'password' => ['required', 'string', 'min:12', 'confirmed']]);
        $tokenId = $user->currentAccessToken()->getKey();

        DB::transaction(function () use ($user, $data, $tokenId) {
            $locked = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            // An Admin reset or deactivation that committed first deleted this session's token or changed the password.
            if ($locked->role !== 'vendor' || ! $locked->is_active || ! $locked->tokens()->whereKey($tokenId)->exists()) {
                $this->vendorError(403, 'VENDOR_ACCESS_REVOKED', 'This session no longer has Vendor Portal access. Sign in again.');
            }
            if (! Hash::check($data['current_password'], $locked->password)) {
                throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
            }
            $locked->forceFill(['password' => $data['password']])->save();
            $locked->tokens()->whereKeyNot($tokenId)->delete();
        });
        $audit->record($request, 'auth.vendor_password_changed', $user);

        return response()->json(['message' => 'Password changed.']);
    }

    public function logout(Request $request, AuditTrailService $audit)
    {
        $user = $this->vendorRegistrationUser($request);
        $user->currentAccessToken()->delete();
        $audit->recordAs($request, $user, 'auth.vendor_logout', $user);

        return response()->json(['message' => 'Logged out successfully']);
    }

    public static function formatRegistration(VendorRegistration $registration): array
    {
        return [
            'id' => (int) $registration->id,
            'user_id' => (int) $registration->user_id,
            'store_id' => $registration->store_id ? (int) $registration->store_id : null,
            'store_name' => (string) $registration->store_name,
            'owner_name' => (string) $registration->owner_name,
            'representative_title' => (string) $registration->representative_title,
            'dti_sec_number' => $registration->dti_sec_number,
            'address' => (string) $registration->address,
            'latitude' => (float) $registration->latitude,
            'longitude' => (float) $registration->longitude,
            'image_path' => $registration->image_path,
            'status' => (string) $registration->status,
            'rejection_reason' => $registration->rejection_reason,
            'submitted_at' => $registration->submitted_at?->toIso8601String(),
            'reviewed_at' => $registration->reviewed_at?->toIso8601String(),
        ];
    }

    private function assertPublicUrl(?string $url): void
    {
        $usable = $url
            && filter_var($url, FILTER_VALIDATE_URL)
            && in_array(parse_url($url, PHP_URL_SCHEME), ['http', 'https'], true)
            && ! (app()->environment('production') && in_array(parse_url($url, PHP_URL_HOST), ['localhost', '127.0.0.1'], true));
        if (! $usable) {
            throw new RuntimeException('Store image storage did not return a public absolute URL.');
        }
    }

    private function discardImage(CommodityImageStorage $images, ?string $path): void
    {
        if (! $path) {
            return;
        }
        try {
            $images->delete($path);
        } catch (Throwable $exception) {
            report($exception);
        }
    }
}
