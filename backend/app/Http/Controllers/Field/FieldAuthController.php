<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldOfflineLease;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FieldAuthController extends Controller
{
    public function login(Request $request, AuditTrailService $audit)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::where('email', Str::lower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }
        abort_unless($user->role === 'field_officer' && $user->is_active, 403, 'This account does not have access to Field Monitoring.');

        $expiresAt = now()->addHours(24);
        $lease = FieldOfflineLease::create(['id' => (string) Str::uuid(), 'user_id' => $user->id, 'expires_at' => $expiresAt]);
        $token = $user->createToken('field-monitoring-pwa', ['field-monitoring'], $expiresAt);
        $audit->recordAs($request, $user, 'auth.field_login_succeeded', $user, ['lease_id' => $lease->id]);

        return response()->json([
            'token' => $token->plainTextToken,
            'user' => $user,
            'must_change_password' => (bool) $user->must_change_password,
            'offline_lease' => ['id' => $lease->id, 'expires_at' => $expiresAt->toIso8601String()],
        ]);
    }

    public function session(Request $request)
    {
        $user = $this->fieldUser($request);
        return response()->json(['data' => ['user' => $user, 'must_change_password' => (bool) $user->must_change_password]]);
    }

    public function password(Request $request, AuditTrailService $audit)
    {
        $user = $this->fieldUser($request);
        $data = $request->validate(['password' => ['required', 'string', 'min:12', 'confirmed']]);
        $user->forceFill(['password' => $data['password'], 'must_change_password' => false])->save();
        $audit->record($request, 'auth.field_password_changed', $user);
        return response()->json(['must_change_password' => false]);
    }

    public function logout(Request $request, AuditTrailService $audit)
    {
        $user = $this->fieldUser($request);
        $request->user()->currentAccessToken()?->delete();
        FieldOfflineLease::where('user_id', $user->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
        $audit->recordAs($request, $user, 'auth.field_logout', $user);
        return response()->json(['message' => 'Logged out successfully']);
    }

    private function fieldUser(Request $request): User
    {
        $user = $request->user();
        abort_unless($user && $user->role === 'field_officer' && $user->is_active, 403, 'Forbidden');
        abort_unless($user->currentAccessToken()?->can('field-monitoring'), 403, 'Forbidden');
        return $user;
    }
}
