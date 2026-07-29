<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AdminSessionSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('unused');
    }

    private function admin(array $attributes = []): User
    {
        return User::create(array_merge([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => Hash::make('correct-password'),
            'role' => 'dti_evaluator',
        ], $attributes));
    }

    public function test_dti_login_issues_an_expiring_admin_token_and_session_metadata(): void
    {
        Carbon::setTestNow('2026-07-30 08:00:00');
        $this->admin();

        $response = $this->postJson('/api/login', [
            'email' => 'evaluator@dti.test',
            'password' => 'correct-password',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.role', 'dti_evaluator')
            ->assertJsonPath('session.idle_timeout_seconds', 900)
            ->assertJsonPath('session.absolute_timeout_seconds', 28800)
            ->assertJsonPath('session.expires_at', '2026-07-30T16:00:00+00:00');

        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_id' => User::first()->id,
            'name' => 'dti-admin-web',
            'abilities' => '["dti-admin"]',
        ]);
        $this->assertDatabaseHas('audit_events', [
            'actor_id' => User::first()->id,
            'action' => 'auth.login_succeeded',
        ]);
    }

    public function test_admin_session_endpoint_validates_the_server_token_instead_of_saved_browser_user(): void
    {
        $admin = $this->admin();
        $plainToken = $admin->createToken(
            'dti-admin-web',
            ['dti-admin'],
            now()->addHours(8)
        )->plainTextToken;

        $this->withToken($plainToken)
            ->getJson('/api/admin/session')
            ->assertOk()
            ->assertJsonPath('data.user.email', 'evaluator@dti.test')
            ->assertJsonPath('data.user.role', 'dti_evaluator')
            ->assertJsonPath('data.session.idle_timeout_seconds', 900);
    }

    public function test_admin_token_is_rejected_and_audited_after_fifteen_idle_minutes(): void
    {
        Carbon::setTestNow('2026-07-30 08:00:00');
        $admin = $this->admin();
        $newToken = $admin->createToken(
            'dti-admin-web',
            ['dti-admin'],
            now()->addHours(8)
        );
        $newToken->accessToken->forceFill([
            'last_used_at' => now()->subMinutes(16),
        ])->save();

        $this->withToken($newToken->plainTextToken)
            ->getJson('/api/admin/session')
            ->assertUnauthorized();

        $this->assertDatabaseHas('audit_events', [
            'actor_id' => $admin->id,
            'action' => 'auth.session_expired',
        ]);
    }

    public function test_logout_revokes_the_current_token_and_records_the_event(): void
    {
        $admin = $this->admin();
        $plainToken = $admin->createToken(
            'dti-admin-web',
            ['dti-admin'],
            now()->addHours(8)
        )->plainTextToken;

        $this->withToken($plainToken)
            ->postJson('/api/logout')
            ->assertOk();

        $this->assertCount(0, $admin->tokens()->get());
        $this->assertDatabaseHas('audit_events', [
            'actor_id' => $admin->id,
            'action' => 'auth.logout',
        ]);
    }

    public function test_login_is_rate_limited_after_five_failed_attempts_for_the_same_identity(): void
    {
        $this->admin();
        $payload = [
            'email' => 'evaluator@dti.test',
            'password' => 'wrong-password',
        ];

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/login', $payload)->assertUnprocessable();
        }

        $this->postJson('/api/login', $payload)->assertTooManyRequests();
    }

    public function test_admin_can_reauthenticate_for_sensitive_actions_without_exposing_password(): void
    {
        Carbon::setTestNow('2026-07-30 08:00:00');
        $admin = $this->admin();
        $plainToken = $admin->createToken(
            'dti-admin-web',
            ['dti-admin'],
            now()->addHours(8)
        )->plainTextToken;

        $this->withToken($plainToken)
            ->postJson('/api/admin/reauthenticate', ['password' => 'correct-password'])
            ->assertOk()
            ->assertJsonPath('data.reauthenticated_until', '2026-07-30T08:05:00+00:00')
            ->assertJsonMissing(['password']);

        $this->assertDatabaseHas('audit_events', [
            'actor_id' => $admin->id,
            'action' => 'auth.reauthenticated',
        ]);
    }
}
