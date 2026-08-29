<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AdminSessionController extends Controller
{
    public function show(Request $request, AdminAuthorizationService $authorization)
    {
        abort_unless($authorization->canViewAnalytics($request->user()), 403, 'Forbidden');

        $token = $request->user()->currentAccessToken();

        return response()->json(['data' => [
            'user' => $request->user()->only(['id', 'name', 'email', 'role']),
            'session' => [
                'expires_at' => $token?->expires_at?->toIso8601String(),
                'idle_timeout_seconds' => config('admin_security.idle_timeout_minutes') * 60,
                'absolute_timeout_seconds' => config('admin_security.absolute_timeout_hours') * 3600,
                'reauthenticated_until' => $token
                    ? Cache::get($this->reauthenticationCacheKey($token->getKey()))
                    : null,
            ],
        ]]);
    }

    public function reauthenticate(
        Request $request,
        AdminAuthorizationService $authorization,
        AuditTrailService $audit
    ) {
        abort_unless($authorization->canViewAnalytics($request->user()), 403, 'Forbidden');
        $data = $request->validate(['password' => 'required|string']);

        if (! Hash::check($data['password'], $request->user()->password)) {
            throw ValidationException::withMessages([
                'password' => ['The password is incorrect.'],
            ]);
        }

        $token = $request->user()->currentAccessToken();
        abort_unless($token && method_exists($token, 'getKey'), 403, 'Token reauthentication is unavailable.');

        $until = now()->addMinutes(config('admin_security.reauthentication_minutes'));
        $audit->recordOrFail($request, 'auth.reauthenticated', $request->user());
        Cache::put(
            $this->reauthenticationCacheKey($token->getKey()),
            $until->toIso8601String(),
            $until
        );
        return response()->json(['data' => [
            'reauthenticated_until' => $until->toIso8601String(),
        ]]);
    }

    private function reauthenticationCacheKey(int|string $tokenId): string
    {
        return 'admin:reauthenticated:'.$tokenId;
    }
}
