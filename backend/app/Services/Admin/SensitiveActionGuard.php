<?php

namespace App\Services\Admin;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class SensitiveActionGuard
{
    public function requireRecentReauthentication(Request $request): void
    {
        $token = $request->user()?->currentAccessToken();

        // Sanctum's in-process test token is not a browser bearer token.
        if (! $token || ! $token->can('dti-admin')) {
            return;
        }

        $until = method_exists($token, 'getKey')
            ? Cache::get('admin:reauthenticated:'.$token->getKey())
            : null;

        if (! $until || Carbon::parse($until)->isPast()) {
            throw new HttpResponseException(response()->json([
                'status' => 'REAUTHENTICATION_REQUIRED',
                'message' => 'Confirm your password before performing this sensitive action.',
            ], 403));
        }
    }
}
