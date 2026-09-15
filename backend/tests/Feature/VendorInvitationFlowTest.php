<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\VendorInvitation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VendorInvitationFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        config(['app.vendor_pwa_url' => 'https://vendor.test']);
        $this->admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);
        $this->store = $this->makeStore('Invite Store');
    }

    public function test_invitation_link_points_to_vendor_pwa_and_is_listed_as_pending(): void
    {
        Sanctum::actingAs($this->admin);
        $url = $this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'Owner@Shop.test'])
            ->assertCreated()->json('invitation_url');

        $this->assertStringStartsWith('https://vendor.test/vendor-invitation?token=', $url);
        $this->getJson('/api/admin/vendor-invitations')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'owner@shop.test')
            ->assertJsonPath('data.0.store.store_name', 'Invite Store')
            ->assertJsonPath('data.0.inviter.name', 'Evaluator')
            ->assertJsonMissingPath('data.0.token_hash');
    }

    public function test_inviting_for_an_already_linked_store_is_rejected(): void
    {
        $this->store->forceFill(['vendor_user_id' => $this->vendorUser('linked@shop.test')->id])->save();
        Sanctum::actingAs($this->admin);

        $this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'new@shop.test'])
            ->assertUnprocessable()->assertJsonPath('status', 'STORE_ALREADY_LINKED');
        $this->assertSame(0, VendorInvitation::count());
    }

    public function test_reinviting_supersedes_the_previous_link(): void
    {
        Sanctum::actingAs($this->admin);
        $old = $this->tokenFrom($this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'owner@shop.test'])->json('invitation_url'));
        $new = $this->tokenFrom($this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'owner@shop.test'])->json('invitation_url'));

        $this->accept($old)->assertUnprocessable();
        $this->accept($new)->assertOk()->assertJsonPath('existing_account', false);

        $this->assertSame(['cancelled', 'accepted'], VendorInvitation::orderBy('id')->pluck('status')->all());
        $this->assertDatabaseHas('audit_events', ['action' => 'invitation.superseded']);
        $this->assertNotNull($this->store->fresh()->vendor_user_id);
    }

    public function test_cancelled_invitation_cannot_be_accepted(): void
    {
        Sanctum::actingAs($this->admin);
        $response = $this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'owner@shop.test']);
        $this->postJson('/api/admin/invitations/'.$response->json('invitation.id').'/cancel')->assertOk();
        $this->postJson('/api/admin/invitations/'.$response->json('invitation.id').'/cancel')->assertUnprocessable();

        $this->accept($this->tokenFrom($response->json('invitation_url')))->assertUnprocessable();
        $this->assertNull($this->store->fresh()->vendor_user_id);
        $this->assertSame(0, User::where('email', 'owner@shop.test')->count());
    }

    public function test_unlinking_cancels_pending_invitations_and_blocks_old_links(): void
    {
        $vendor = $this->vendorUser('linked@shop.test');
        $this->store->forceFill(['vendor_user_id' => $vendor->id])->save();
        VendorInvitation::create(['store_id' => $this->store->id, 'email' => 'someone@shop.test', 'token_hash' => hash('sha256', 'stale-token'), 'status' => 'pending', 'expires_at' => now()->addDay(), 'invited_by' => $this->admin->id]);
        Sanctum::actingAs($this->admin);

        $this->patchJson("/api/admin/stores/{$this->store->id}", ['vendor_user_id' => null])->assertOk()->assertJsonPath('data.vendor_user_id', null);

        $this->assertNull($this->store->fresh()->vendor_user_id);
        $this->assertSame('cancelled', VendorInvitation::sole()->status);
        $this->assertDatabaseHas('audit_events', ['action' => 'store.vendor_unlinked', 'subject_id' => $this->store->id]);
        $this->accept('stale-token')->assertUnprocessable();
    }

    public function test_store_update_cannot_link_vendors_or_mix_unlink_with_other_changes(): void
    {
        $vendor = $this->vendorUser('linked@shop.test');
        Sanctum::actingAs($this->admin);

        $this->patchJson("/api/admin/stores/{$this->store->id}", ['vendor_user_id' => $vendor->id])->assertUnprocessable();
        $this->patchJson("/api/admin/stores/{$this->store->id}", ['vendor_user_id' => null, 'store_name' => 'Renamed'])->assertUnprocessable();
        $this->assertNull($this->store->fresh()->vendor_user_id);
        $this->assertSame('Invite Store', $this->store->fresh()->store_name);
    }

    public function test_existing_vendor_accepts_a_second_store_without_changing_password(): void
    {
        $vendor = $this->vendorUser('owner@shop.test');
        $this->makeStore('First Store')->forceFill(['vendor_user_id' => $vendor->id])->save();
        Sanctum::actingAs($this->admin);
        $token = $this->tokenFrom($this->postJson("/api/admin/stores/{$this->store->id}/invitations", ['email' => 'owner@shop.test'])->json('invitation_url'));

        $this->accept($token, 'Attacker Chosen Password')->assertOk()->assertJsonPath('existing_account', true);

        $this->assertSame($vendor->id, $this->store->fresh()->vendor_user_id);
        $this->assertTrue(Hash::check('original-password', $vendor->fresh()->password));
    }

    public function test_acceptance_fails_when_store_was_linked_to_another_vendor_meanwhile(): void
    {
        VendorInvitation::create(['store_id' => $this->store->id, 'email' => 'owner@shop.test', 'token_hash' => hash('sha256', 'raced-token'), 'status' => 'pending', 'expires_at' => now()->addDay(), 'invited_by' => $this->admin->id]);
        $other = $this->vendorUser('other@shop.test');
        $this->store->forceFill(['vendor_user_id' => $other->id])->save();

        $this->accept('raced-token')->assertUnprocessable();
        $this->assertSame($other->id, $this->store->fresh()->vendor_user_id);
        $this->assertSame(0, User::where('email', 'owner@shop.test')->count());
    }

    public function test_invitation_cannot_link_a_store_to_a_deactivated_vendor(): void
    {
        User::create(['name' => 'Dormant Vendor', 'email' => 'dormant@shop.test', 'password' => Hash::make('original-password'), 'role' => 'vendor', 'is_active' => false]);
        VendorInvitation::create(['store_id' => $this->store->id, 'email' => 'dormant@shop.test', 'token_hash' => hash('sha256', 'dormant-token'), 'status' => 'pending', 'expires_at' => now()->addDay(), 'invited_by' => $this->admin->id]);

        $this->accept('dormant-token')->assertUnprocessable()->assertJsonValidationErrors('email');

        $this->assertNull($this->store->fresh()->vendor_user_id);
        $this->assertSame('pending', VendorInvitation::sole()->status);
    }

    private function accept(string $token, string $password = 'A-secure-vendor-password')
    {
        $this->app['auth']->forgetGuards();
        return $this->postJson("/api/vendor-invitations/{$token}/accept", ['name' => 'New Owner', 'password' => $password, 'password_confirmation' => $password]);
    }

    private function tokenFrom(string $url): string
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        return $query['token'];
    }

    private function vendorUser(string $email): User
    {
        return User::create(['name' => 'Vendor '.$email, 'email' => $email, 'password' => Hash::make('original-password'), 'role' => 'vendor']);
    }

    private function makeStore(string $name): Store
    {
        return Store::create(['store_name' => $name, 'owner_name' => 'Owner', 'latitude' => 10, 'longitude' => 121, 'address' => 'Antique']);
    }
}
