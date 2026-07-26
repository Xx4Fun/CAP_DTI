<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminInvitationCancellationTest extends TestCase
{
    use RefreshDatabase;

    public function test_pending_invitation_can_be_cancelled_and_audited(): void
    {
        $admin = User::create(['name' => 'Evaluator', 'email' => 'cancel@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        $store = Store::create(['dti_sec_number' => 'SEC-CANCEL', 'store_name' => 'Cancel Store', 'owner_name' => 'Owner', 'latitude' => 10, 'longitude' => 121, 'address' => 'Antique']);
        $invitation = VendorInvitation::create([
            'store_id' => $store->id, 'email' => 'pending@vendor.test',
            'token_hash' => hash('sha256', 'pending-token'), 'status' => 'pending',
            'expires_at' => now()->addDay(), 'invited_by' => $admin->id,
        ]);
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/invitations/{$invitation->id}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertDatabaseHas('audit_events', ['action' => 'invitation.cancelled', 'subject_id' => $invitation->id]);
    }
}
