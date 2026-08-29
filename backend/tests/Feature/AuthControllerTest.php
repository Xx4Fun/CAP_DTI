<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AuthControllerTest extends TestCase {
    use RefreshDatabase;

    public function test_user_can_login_and_receive_sanctum_token(): void {
        $user = User::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator'
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'john@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_user_cannot_login_with_invalid_credentials(): void {
        $user = User::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator'
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'john@example.com',
            'password' => 'wrongpassword'
        ]);

        $response->assertStatus(422);
    }

    public function test_field_officer_is_directed_to_the_dedicated_field_login(): void {
        $user = User::create([
            'name' => 'Field Officer',
            'email' => 'field@example.com',
            'password' => Hash::make('password123'),
            'role' => 'field_officer',
        ]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password123',
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('status', 'FIELD_PWA_REQUIRED')
            ->assertJsonMissingPath('token');
        $this->assertCount(0, $user->fresh()->tokens);
    }

    public function test_user_can_logout_and_revoke_token(): void {
        $user = User::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator'
        ]);

        $token = $user->createToken('test_token')->plainTextToken;

        $response = $this->withHeaders([
            'Authorization' => 'Bearer ' . $token,
        ])->postJson('/api/logout');

        $response->assertStatus(200)
            ->assertJson(['message' => 'Logged out successfully']);

        $this->assertCount(0, $user->tokens);
    }

    public function test_admin_login_remains_available_when_audit_storage_has_not_been_migrated(): void {
        User::create([
            'name' => 'John Doe',
            'email' => 'john@example.com',
            'password' => Hash::make('password123'),
            'role' => 'dti_evaluator'
        ]);
        Schema::drop('audit_events');

        $response = $this->postJson('/api/login', [
            'email' => 'john@example.com',
            'password' => 'password123'
        ]);

        $response->assertOk()
            ->assertJsonStructure(['token', 'user', 'session']);
        $this->assertStringNotContainsString('SQLSTATE', $response->getContent());
        $this->assertStringNotContainsString('audit_events', $response->getContent());
    }
}
