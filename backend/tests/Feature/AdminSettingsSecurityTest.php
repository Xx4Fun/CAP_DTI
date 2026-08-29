<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSettingsSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_password_change_requires_twelve_characters(): void
    {
        $user = User::create([
            'name' => 'Admin User',
            'email' => 'admin@example.com',
            'password' => Hash::make('existing-password'),
            'role' => 'dti_evaluator',
        ]);
        Sanctum::actingAs($user, ['dti-admin']);

        $this->putJson('/api/admin/settings/profile', [
            'name' => $user->name,
            'email' => $user->email,
            'current_password' => 'existing-password',
            'new_password' => 'shortpass',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('new_password');

        $this->assertTrue(Hash::check('existing-password', $user->fresh()->password));
    }
}
