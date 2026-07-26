<?php

namespace App\Services\Admin;

use App\Mail\VendorInvitationMail;
use App\Models\AuditEvent;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class VendorInvitationService
{
    public function __construct(private readonly AuditTrailService $audit) {}

    public function create(Store $store, string $email, User $actor, Request $request, int $hours = 24): array
    {
        if (!in_array(config('mail.default'), ['array', 'log'], true)) {
            throw ValidationException::withMessages(['email' => ['Vendor invitations require the array or log mail driver during development.']]);
        }

        $raw = Str::random(64);
        $invitation = VendorInvitation::create([
            'store_id' => $store->id,
            'email' => strtolower($email),
            'token_hash' => hash('sha256', $raw),
            'status' => 'pending',
            'expires_at' => now()->addHours($hours),
            'invited_by' => $actor->id,
        ]);
        $url = rtrim(config('app.frontend_url'), '/').'/vendor-invitation?token='.urlencode($raw);
        Mail::to($email)->queue(new VendorInvitationMail($url, $store->store_name));
        $this->audit->record($request, 'invitation.created', $invitation, [
            'email' => strtolower($email), 'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);

        return ['invitation' => $invitation, 'invitation_url' => $url];
    }

    public function accept(string $raw, string $name, string $password, Request $request): User
    {
        $user = DB::transaction(function () use ($raw, $name, $password, $request) {
            $invitation = VendorInvitation::where('token_hash', hash('sha256', $raw))->lockForUpdate()->first();
            if (!$invitation || $invitation->status !== 'pending' || $invitation->expires_at->isPast()) {
                if ($invitation && $invitation->status === 'pending') {
                    $invitation->update(['status' => 'expired']);
                    AuditEvent::create(['action' => 'invitation.expired', 'subject_type' => 'vendor_invitation', 'subject_id' => $invitation->id]);
                }
                return null;
            }

            $user = User::firstOrCreate(
                ['email' => $invitation->email],
                ['name' => $name, 'password' => $password, 'role' => 'vendor']
            );
            if ($user->role !== 'vendor') {
                throw ValidationException::withMessages(['email' => ['This email already belongs to a non-vendor account.']]);
            }
            $invitation->update(['status' => 'accepted', 'accepted_by' => $user->id, 'accepted_at' => now()]);
            Store::whereKey($invitation->store_id)->update(['vendor_user_id' => $user->id]);
            AuditEvent::create([
                'actor_id' => $user->id, 'action' => 'invitation.accepted',
                'subject_type' => 'vendor_invitation', 'subject_id' => $invitation->id,
                'metadata' => ['store_id' => $invitation->store_id],
            ]);
            return $user;
        });

        if (!$user) {
            throw ValidationException::withMessages(['token' => ['Invitation is invalid, expired, or already used.']]);
        }

        return $user;
    }

    public function cancel(VendorInvitation $invitation, Request $request): VendorInvitation
    {
        if ($invitation->status !== 'pending') {
            throw ValidationException::withMessages(['invitation' => ['Only pending invitations can be cancelled.']]);
        }
        $invitation->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        $this->audit->record($request, 'invitation.cancelled', $invitation, [
            'email' => $invitation->email,
        ]);
        return $invitation->fresh();
    }
}
