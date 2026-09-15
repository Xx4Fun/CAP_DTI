<?php

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VendorAuthController extends Controller
{
    use ResolvesVendor;

    public const TOKEN_NAME = 'vendor-portal-pwa';

    public function login(Request $request, AuditTrailService $audit)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);

        // Check credentials and issue the token under the user-row lock that Admin password resets and deactivation also take,
        // so a reset committed mid-login is either seen here (old password rejected) or revokes the token issued here.
        [$user, $token, $expiresAt] = DB::transaction(function () use ($data) {
            $user = User::where('email', Str::lower($data['email']))->lockForUpdate()->first();
            if (! $user || ! Hash::check($data['password'], $user->password)) {
                throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
            }
            if ($user->role !== 'vendor' || ! $user->is_active) {
                $this->vendorError(403, 'VENDOR_ACCESS_DENIED', 'This account does not have access to the Vendor Portal.');
            }
            $expiresAt = now()->addHours((int) config('app.vendor_token_hours'));

            return [$user, $user->createToken(self::TOKEN_NAME, ['vendor-portal'], $expiresAt), $expiresAt];
        });
        $audit->recordAs($request, $user, 'auth.vendor_login_succeeded', $user);

        return response()->json(['token' => $token->plainTextToken, 'expires_at' => $expiresAt->toIso8601String(), 'user' => $user]);
    }

    public function session(Request $request)
    {
        return response()->json(['data' => ['user' => $this->vendorUser($request)]]);
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
        $user = $this->vendorUser($request);
        $user->currentAccessToken()->delete();
        $audit->recordAs($request, $user, 'auth.vendor_logout', $user);

        return response()->json(['message' => 'Logged out successfully']);
    }
}
