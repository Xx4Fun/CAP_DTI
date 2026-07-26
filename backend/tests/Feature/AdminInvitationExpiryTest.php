<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminInvitationExpiryTest extends TestCase
{
    use RefreshDatabase;

    public function test_expired_invitation_attempt_persists_expiry_and_audit_event(): void
    {
        $admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'expiry-admin@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);
        $store = Store::create([
            'dti_sec_number' => 'SEC-EXPIRY-001',
            'store_name' => 'Expiry Test Store',
            'owner_name' => 'Vendor Owner',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'address' => 'San Jose, Antique',
        ]);
        $rawToken = 'expired-raw-token';
        $invitation = VendorInvitation::create([
            'store_id' => $store->id,
            'email' => 'expired-vendor@example.test',
            'token_hash' => hash('sha256', $rawToken),
            'status' => 'pending',
            'expires_at' => now()->subMinute(),
            'invited_by' => $admin->id,
        ]);

        $this->postJson("/api/vendor-invitations/{$rawToken}/accept", [
            'name' => 'Vendor Owner',
            'password' => 'A-secure-vendor-password',
            'password_confirmation' => 'A-secure-vendor-password',
        ])->assertUnprocessable();

        $this->assertDatabaseHas('vendor_invitations', ['id' => $invitation->id, 'status' => 'expired']);
        $this->assertDatabaseHas('audit_events', [
            'action' => 'invitation.expired',
            'subject_id' => $invitation->id,
        ]);
    }
}
