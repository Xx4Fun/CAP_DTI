<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\VendorInvitation;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\VendorInvitationService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VendorInvitationController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['status' => ['nullable', Rule::in(['pending', 'accepted', 'expired', 'cancelled'])]]);

        return response()->json(['data' => VendorInvitation::query()
            ->where('status', $data['status'] ?? 'pending')
            ->with(['store:id,store_name', 'inviter:id,name'])
            ->latest()->limit(200)->get()
            ->map(fn (VendorInvitation $invitation) => [
                ...$invitation->only(['id', 'email', 'status', 'expires_at', 'created_at']),
                'is_expired' => $invitation->expires_at->isPast(),
                'store' => $invitation->store,
                'inviter' => $invitation->inviter,
            ])]);
    }

    public function store(Request $request, Store $store, AdminAuthorizationService $auth, VendorInvitationService $service)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['email' => 'required|email', 'expires_in_hours' => 'nullable|integer|between:1,168']);
        return response()->json($service->create($store, $data['email'], $request->user(), $request, $data['expires_in_hours'] ?? 24), 201);
    }

    public function accept(Request $request, string $token, VendorInvitationService $service)
    {
        $data = $request->validate(['name' => 'required|string|max:255', 'password' => 'required|string|min:12|confirmed']);
        ['user' => $user, 'existing_account' => $existing] = $service->accept($token, $data['name'], $data['password'], $request);
        return response()->json([
            'message' => $existing ? 'Invitation accepted. Sign in with your existing password.' : 'Invitation accepted.',
            'existing_account' => $existing,
            'user' => ['id' => $user->id, 'email' => $user->email, 'role' => $user->role],
        ]);
    }

    public function cancel(Request $request, VendorInvitation $invitation, AdminAuthorizationService $auth, VendorInvitationService $service)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => $service->cancel($invitation, $request)]);
    }
}
