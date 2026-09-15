<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\FieldOfflineLease;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SensitiveActionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserManagementController extends Controller
{
    private const MANAGED_ROLES = ['field_officer', 'vendor'];

    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'role' => ['nullable', Rule::in(['all', ...self::MANAGED_ROLES])],
            'status' => ['nullable', Rule::in(['all', 'active', 'inactive'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);

        $base = User::query()->whereIn('role', self::MANAGED_ROLES);
        $counts = [
            'total' => (clone $base)->count(),
            'field_officer' => (clone $base)->where('role', 'field_officer')->count(),
            'vendor' => (clone $base)->where('role', 'vendor')->count(),
            'inactive' => (clone $base)->where('is_active', false)->count(),
        ];

        $query = $base->with(['stores:id,vendor_user_id,store_name']);
        if (($filters['role'] ?? 'all') !== 'all') {
            $query->where('role', $filters['role']);
        }
        if (($filters['status'] ?? 'all') !== 'all') {
            $query->where('is_active', $filters['status'] === 'active');
        }
        if ($search = trim($filters['search'] ?? '')) {
            $searchTerm = '%'.strtolower($search).'%';
            $query->where(function ($nested) use ($searchTerm) {
                $nested->whereRaw('LOWER(name) LIKE ?', [$searchTerm])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$searchTerm])
                    ->orWhereHas('stores', fn ($stores) => $stores->whereRaw('LOWER(store_name) LIKE ?', [$searchTerm]));
            });
        }

        return response()->json([
            'data' => $query->latest()->paginate($filters['per_page'] ?? 10)->withQueryString(),
            'counts' => $counts,
        ]);
    }

    public function storeFieldOfficer(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        $user = DB::transaction(function () use ($data, $request, $audit) {
            $user = User::create([
                ...$data,
                'email' => strtolower($data['email']),
                'role' => 'field_officer',
                'is_active' => $data['is_active'] ?? true,
                'must_change_password' => false,
            ]);
            $audit->recordOrFail($request, 'user.created', $user, ['role' => $user->role, 'is_active' => $user->is_active]);
            return $user;
        });

        return response()->json(['data' => $user->load('stores:id,vendor_user_id,store_name')], 201);
    }

    public function update(Request $request, User $managedUser, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard)
    {
        $auth->requireManager($request->user());
        $this->requireManagedRole($managedUser);
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'email' => ['sometimes', 'required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($managedUser->id)],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        if (array_key_exists('is_active', $data)) {
            $guard->requireRecentReauthentication($request);
        }
        if (isset($data['email'])) {
            $data['email'] = strtolower($data['email']);
        }
        DB::transaction(function () use ($data, $request, $audit, $managedUser) {
            // Lock the account row so vendor login and password changes serialize with deactivation.
            User::whereKey($managedUser->id)->lockForUpdate()->firstOrFail();
            $managedUser->refresh();
            $wasActive = (bool) $managedUser->is_active;
            $managedUser->fill($data)->save();
            if ($wasActive && ! $managedUser->is_active) {
                $managedUser->tokens()->delete();
                FieldOfflineLease::where('user_id', $managedUser->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
            }
            $audit->recordOrFail($request, 'user.updated', $managedUser, ['changed_fields' => array_keys($data)]);
        });

        return response()->json(['data' => $managedUser->load('stores:id,vendor_user_id,store_name')]);
    }

    public function updatePassword(Request $request, User $managedUser, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard)
    {
        $auth->requireManager($request->user());
        $this->requireManagedRole($managedUser);
        $guard->requireRecentReauthentication($request);
        $data = $request->validate(['password' => ['required', 'string', 'min:12', 'confirmed']]);
        DB::transaction(function () use ($data, $request, $audit, $managedUser) {
            // Same row lock as vendor login/password change: a reset cannot be undone by a credential check already in flight.
            User::whereKey($managedUser->id)->lockForUpdate()->firstOrFail();
            $managedUser->forceFill([
                'password' => $data['password'],
                'must_change_password' => false,
            ])->save();
            $managedUser->tokens()->delete();
            FieldOfflineLease::where('user_id', $managedUser->id)->whereNull('revoked_at')->update(['revoked_at' => now()]);
            $audit->recordOrFail($request, 'user.password_reset', $managedUser);
        });

        return response()->json(['data' => ['message' => 'Password updated and active sessions revoked.']]);
    }

    private function requireManagedRole(User $user): void
    {
        if (! in_array($user->role, self::MANAGED_ROLES, true)) {
            throw ValidationException::withMessages(['user' => ['Only vendor and field monitoring accounts can be managed here.']]);
        }
    }
}
