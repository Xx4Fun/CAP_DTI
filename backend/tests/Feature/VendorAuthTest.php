<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VendorAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_vendor_logs_in_with_a_scoped_expiring_token(): void
    {
        $vendor = $this->vendor();

        $this->postJson('/api/vendor/login', ['email' => 'VENDOR@shop.test', 'password' => 'correct-password'])
            ->assertOk()->assertJsonStructure(['token', 'expires_at', 'user']);

        $token = $vendor->tokens()->sole();
        $this->assertSame(VendorAuthController::TOKEN_NAME, $token->name);
        $this->assertSame(['vendor-portal'], $token->abilities);
        $this->assertTrue($token->expires_at->isFuture());
        $this->assertDatabaseHas('audit_events', ['action' => 'auth.vendor_login_succeeded', 'actor_id' => $vendor->id]);
    }

    public function test_wrong_password_is_rejected(): void
    {
        $this->vendor();
        $this->postJson('/api/vendor/login', ['email' => 'vendor@shop.test', 'password' => 'wrong-password'])->assertUnprocessable();
    }

    public function test_vendor_routes_return_json_unauthorized_without_an_accept_header(): void
    {
        $this->get('/api/vendor/overview')
            ->assertUnauthorized()
            ->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_non_vendor_and_inactive_vendor_are_denied_without_tokens(): void
    {
        $evaluator = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => Hash::make('correct-password'), 'role' => 'dti_evaluator']);
        $inactive = $this->vendor(['email' => 'inactive@shop.test', 'is_active' => false]);

        $this->postJson('/api/vendor/login', ['email' => $evaluator->email, 'password' => 'correct-password'])
            ->assertForbidden()->assertJsonPath('status', 'VENDOR_ACCESS_DENIED');
        $this->postJson('/api/vendor/login', ['email' => $inactive->email, 'password' => 'correct-password'])
            ->assertForbidden()->assertJsonPath('status', 'VENDOR_ACCESS_DENIED');
        $this->assertCount(0, $evaluator->tokens);
        $this->assertCount(0, $inactive->tokens);
    }

    public function test_vendor_routes_reject_legacy_wildcard_tokens(): void
    {
        $vendor = $this->vendor();

        $this->withToken($vendor->createToken('auth_token', ['*'])->plainTextToken)
            ->getJson('/api/vendor/session')->assertForbidden()->assertJsonPath('status', 'VENDOR_ACCESS_REVOKED');

        $this->app['auth']->forgetGuards();
        $this->withToken($this->token($vendor))->getJson('/api/vendor/session')->assertOk()->assertJsonPath('data.user.email', 'vendor@shop.test');
    }

    public function test_expired_token_is_unauthenticated(): void
    {
        $vendor = $this->vendor();
        $token = $vendor->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'], now()->subMinute())->plainTextToken;

        $this->withToken($token)->getJson('/api/vendor/session')->assertUnauthorized();
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $vendor = $this->vendor();
        $token = $this->token($vendor);

        $this->withToken($token)->postJson('/api/vendor/logout')->assertOk();
        $this->assertCount(0, $vendor->fresh()->tokens);

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/vendor/session')->assertUnauthorized();
    }

    public function test_admin_deactivation_revokes_vendor_access(): void
    {
        $vendor = $this->vendor();
        $token = $this->token($vendor);
        $admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);

        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/users/{$vendor->id}", ['is_active' => false])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/vendor/overview')->assertUnauthorized();
    }

    public function test_password_change_requires_current_password_and_revokes_other_tokens(): void
    {
        $vendor = $this->vendor();
        $other = $this->token($vendor);
        $current = $this->token($vendor);

        $this->withToken($current)->postJson('/api/vendor/password', [
            'current_password' => 'not-the-password', 'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password',
        ])->assertUnprocessable()->assertJsonValidationErrors('current_password');

        $this->withToken($current)->postJson('/api/vendor/password', [
            'current_password' => 'correct-password', 'password' => 'new-secure-password', 'password_confirmation' => 'new-secure-password',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secure-password', $vendor->fresh()->password));
        $this->assertCount(1, $vendor->fresh()->tokens);
        $this->app['auth']->forgetGuards();
        $this->withToken($other)->getJson('/api/vendor/session')->assertUnauthorized();
    }

    public function test_admin_password_reset_rejects_the_old_password_and_blocks_a_pending_password_change(): void
    {
        $vendor = $this->vendor();
        $token = $this->token($vendor);
        $admin = User::create(['name' => 'Evaluator', 'email' => 'eval@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator']);

        Sanctum::actingAs($admin);
        $this->putJson("/api/admin/users/{$vendor->id}/password", ['password' => 'admin-reset-password', 'password_confirmation' => 'admin-reset-password'])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/vendor/login', ['email' => 'vendor@shop.test', 'password' => 'correct-password'])->assertUnprocessable();
        $this->withToken($token)->postJson('/api/vendor/password', [
            'current_password' => 'correct-password', 'password' => 'vendor-chosen-password', 'password_confirmation' => 'vendor-chosen-password',
        ])->assertUnauthorized();

        $this->assertTrue(Hash::check('admin-reset-password', $vendor->fresh()->password));
        $this->assertCount(0, $vendor->fresh()->tokens);
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/vendor/login', ['email' => 'vendor@shop.test', 'password' => 'admin-reset-password'])->assertOk();
    }

    private function vendor(array $overrides = []): User
    {
        return User::create(array_merge([
            'name' => 'Shop Owner', 'email' => 'vendor@shop.test', 'password' => Hash::make('correct-password'), 'role' => 'vendor',
        ], $overrides));
    }

    private function token(User $user): string
    {
        return $user->createToken(VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken;
    }
}
