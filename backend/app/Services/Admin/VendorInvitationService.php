<?php

namespace App\Services\Admin;

use App\Mail\VendorInvitationMail;
use App\Models\AuditEvent;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Every writer of stores.vendor_user_id and vendor invitations locks the store row first, then invitations.
 * Vendor notice responses follow the same store-first order.
 */
class VendorInvitationService
{
    public function __construct(private readonly AuditTrailService $audit) {}

    public function create(Store $store, string $email, User $actor, Request $request, int $hours = 24): array
    {
        $raw = Str::random(64);
        $email = strtolower($email);
        $url = rtrim(config('app.vendor_pwa_url'), '/').'/vendor-invitation?token='.urlencode($raw);
        $invitation = DB::transaction(function () use ($store, $email, $raw, $hours, $actor, $request) {
            $locked = Store::whereKey($store->id)->lockForUpdate()->firstOrFail();
            if ($locked->vendor_user_id) {
                throw new HttpResponseException(response()->json([
                    'status' => 'STORE_ALREADY_LINKED',
                    'message' => 'This establishment already has a linked vendor account. Unlink it before inviting someone else.',
                    'errors' => ['email' => ['This establishment already has a linked vendor account.']],
                ], 422));
            }
            VendorInvitation::where('store_id', $locked->id)->where('status', 'pending')->lockForUpdate()->get()
                ->each(function (VendorInvitation $previous) use ($request) {
                    $previous->update(['status' => 'cancelled', 'cancelled_at' => now()]);
                    $this->audit->recordOrFail($request, 'invitation.superseded', $previous, ['email' => $previous->email]);
                });
            $invitation = VendorInvitation::create([
                'store_id' => $locked->id,
                'email' => $email,
                'token_hash' => hash('sha256', $raw),
                'status' => 'pending',
                'expires_at' => now()->addHours($hours),
                'invited_by' => $actor->id,
            ]);
            $this->audit->recordOrFail($request, 'invitation.created', $invitation, [
                'email' => $email, 'expires_at' => $invitation->expires_at->toIso8601String(),
            ]);
            return $invitation;
        });

        Mail::to($email)->queue(new VendorInvitationMail($url, $store->store_name));

        return ['invitation' => $invitation, 'invitation_url' => $url, 'delivery_status' => 'queued'];
    }

    /** @return array{user: User, existing_account: bool} */
    public function accept(string $raw, string $name, string $password, Request $request): array
    {
        $hash = hash('sha256', $raw);
        $storeId = VendorInvitation::where('token_hash', $hash)->value('store_id');
        $result = $storeId ? DB::transaction(function () use ($hash, $storeId, $name, $password) {
            $store = Store::whereKey($storeId)->lockForUpdate()->first();
            $invitation = VendorInvitation::where('token_hash', $hash)->lockForUpdate()->first();
            if (! $store || ! $invitation || $invitation->status !== 'pending' || $invitation->expires_at->isPast()) {
                if ($invitation && $invitation->status === 'pending') {
                    $invitation->update(['status' => 'expired']);
                    AuditEvent::create(['action' => 'invitation.expired', 'subject_type' => 'vendor_invitation', 'subject_id' => $invitation->id]);
                }
                return null;
            }

            // Invitations for different stores lock different store rows, so two can race to create the same account.
            // createOrFirst recovers from the unique-email conflict (inside a savepoint) and never overwrites an existing account.
            $user = User::createOrFirst(
                ['email' => $invitation->email],
                ['name' => $name, 'password' => $password, 'role' => 'vendor']
            );
            $existing = ! $user->wasRecentlyCreated;
            if ($user->role !== 'vendor') {
                throw ValidationException::withMessages(['email' => ['This email already belongs to a non-vendor account.']]);
            }
            // Lock order store → invitation → user. Admin deactivation holds the same user-row lock, so this check cannot race it.
            $user = User::whereKey($user->id)->lockForUpdate()->firstOrFail();
            if (! $user->is_active) {
                throw ValidationException::withMessages(['email' => ['This vendor account is deactivated. Ask DTI Antique to reactivate it before accepting the invitation.']]);
            }
            if ($store->vendor_user_id && (int) $store->vendor_user_id !== (int) $user->id) {
                throw ValidationException::withMessages(['token' => ['This establishment is already linked to another vendor account.']]);
            }

            $invitation->update(['status' => 'accepted', 'accepted_by' => $user->id, 'accepted_at' => now()]);
            $store->forceFill(['vendor_user_id' => $user->id])->save();
            AuditEvent::create([
                'actor_id' => $user->id, 'action' => 'invitation.accepted',
                'subject_type' => 'vendor_invitation', 'subject_id' => $invitation->id,
                'metadata' => ['store_id' => $store->id, 'existing_account' => $existing],
            ]);
            return ['user' => $user, 'existing_account' => $existing];
        }) : null;

        if (! $result) {
            throw ValidationException::withMessages(['token' => ['Invitation is invalid, expired, or already used.']]);
        }

        return $result;
    }

    public function cancel(VendorInvitation $invitation, Request $request): VendorInvitation
    {
        DB::transaction(function () use ($invitation, $request) {
            Store::whereKey($invitation->store_id)->lockForUpdate()->first();
            $locked = VendorInvitation::whereKey($invitation->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages(['invitation' => ['Only pending invitations can be cancelled.']]);
            }
            $locked->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            $this->audit->recordOrFail($request, 'invitation.cancelled', $locked, ['email' => $locked->email]);
        });
        return $invitation->fresh();
    }

    public function unlink(Store $store, Request $request): Store
    {
        return DB::transaction(function () use ($store, $request) {
            $locked = Store::whereKey($store->id)->lockForUpdate()->firstOrFail();
            $previousVendorId = $locked->vendor_user_id;
            VendorInvitation::where('store_id', $locked->id)->where('status', 'pending')->lockForUpdate()->get()
                ->each(function (VendorInvitation $invitation) use ($request) {
                    $invitation->update(['status' => 'cancelled', 'cancelled_at' => now()]);
                    $this->audit->recordOrFail($request, 'invitation.cancelled', $invitation, ['email' => $invitation->email, 'reason' => 'store_unlinked']);
                });
            $locked->forceFill(['vendor_user_id' => null])->save();
            $this->audit->recordOrFail($request, 'store.vendor_unlinked', $locked, ['previous_vendor_user_id' => $previousVendorId]);
            return $locked;
        });
    }
}
