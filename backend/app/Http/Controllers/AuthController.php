<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller {
    public function login(Request $request, AuditTrailService $audit) {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || ! $user->is_active || !Hash::check($request->password, $user->password)) {
            $audit->recordAs($request, $user, 'auth.login_failed', $user ?? 'authentication', [
                'email_fingerprint' => hash('sha256', strtolower($request->email)),
            ]);
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if ($user->role === 'field_officer') {
            $audit->recordAs($request, $user, 'auth.admin_login_redirected', $user, [
                'required_client' => 'field-monitoring-pwa',
            ]);

            return response()->json([
                'status' => 'FIELD_PWA_REQUIRED',
                'message' => 'Use the Field Monitoring PWA to sign in with this account.',
            ], 403);
        }

        $isDtiUser = in_array($user->role, ['super_admin', 'dti_evaluator'], true);
        $expiresAt = $isDtiUser
            ? now()->addHours(config('admin_security.absolute_timeout_hours'))
            : null;
        $newToken = $user->createToken(
            $isDtiUser ? 'dti-admin-web' : 'auth_token',
            $isDtiUser ? ['dti-admin'] : ['*'],
            $expiresAt
        );
        $audit->recordAs($request, $user, 'auth.login_succeeded', $user, [
            'session_type' => $isDtiUser ? 'dti-admin-web' : 'standard',
        ]);

        $response = [
            'token' => $newToken->plainTextToken,
            'user' => $user
        ];

        if ($isDtiUser) {
            $response['session'] = [
                'expires_at' => $expiresAt->toIso8601String(),
                'idle_timeout_seconds' => config('admin_security.idle_timeout_minutes') * 60,
                'absolute_timeout_seconds' => config('admin_security.absolute_timeout_hours') * 3600,
            ];
        }

        return response()->json($response);
    }

    public function logout(Request $request, AuditTrailService $audit) {
        $user = $request->user();
        if ($user && $user->currentAccessToken()) {
            if ($user->currentAccessToken()->can('dti-admin')) {
                $audit->record($request, 'auth.logout', $user);
            }
            $user->currentAccessToken()->delete();
        }
        return response()->json(['message' => 'Logged out successfully']);
    }
}
