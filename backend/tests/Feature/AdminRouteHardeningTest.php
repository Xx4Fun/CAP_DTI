<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminRouteHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        return User::create([
            'name' => ucfirst(str_replace('_', ' ', $role)),
            'email' => $role.'@example.test',
            'password' => 'correct-password',
            'role' => $role,
        ]);
    }

    public function test_vendor_cannot_read_or_decide_legacy_tip_evidence(): void
    {
        Sanctum::actingAs($this->user('vendor'));

        $this->getJson('/api/tips')->assertForbidden();
        $this->postJson('/api/tips/1/status', ['status' => 'validated'])->assertForbidden();
    }

    public function test_legacy_calamity_toggle_is_blocked_without_formal_declaration_record(): void
    {
        Cache::put('state_of_calamity', false);
        Sanctum::actingAs($this->user('dti_evaluator'));

        $this->postJson('/api/calamity/toggle', ['state' => true])
            ->assertUnprocessable()
            ->assertJsonPath('status', 'REGULATORY_EMERGENCY_RECORD_REQUIRED');

        $this->assertFalse(Cache::get('state_of_calamity'));
    }

    public function test_field_officer_cannot_read_admin_analytics_options(): void
    {
        Store::create([
            'dti_sec_number' => 'PRIVATE-SEC-001',
            'store_name' => 'Public Store Label',
            'owner_name' => 'Private Owner',
            'address' => 'San Jose de Buenavista',
            'latitude' => 10.74,
            'longitude' => 121.94,
        ]);
        Sanctum::actingAs($this->user('field_officer'));

        $this->getJson('/api/admin/analytics/options')->assertForbidden();
    }

    public function test_emergency_activation_requires_recent_reauthentication(): void
    {
        $admin = $this->user('dti_evaluator');
        $token = $admin->createToken('dti-admin-web', ['dti-admin'], now()->addHours(8))->plainTextToken;
        $payload = [
            'location' => 'San Jose de Buenavista, Antique',
            'starts_on' => '2026-07-30',
            'declaration_reference' => 'DECL-2026-01',
            'confirmed' => true,
        ];

        $prepared = $this->withToken($token)->postJson('/api/admin/emergencies', $payload)->assertCreated();
        $activate = ['confirmed' => true, 'preparation_hash' => $prepared->json('data.preparation_hash')];

        $this->withToken($token)
            ->postJson('/api/admin/emergencies/'.$prepared->json('data.id').'/activate', $activate)
            ->assertForbidden()->assertJsonPath('status', 'REAUTHENTICATION_REQUIRED');

        $this->withToken($token)
            ->postJson('/api/admin/reauthenticate', ['password' => 'correct-password'])
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/admin/emergencies/'.$prepared->json('data.id').'/activate', $activate)
            ->assertUnprocessable()->assertJsonPath('status', 'APC_SOURCE_WEEK_EMPTY');
    }

    public function test_store_cannot_be_public_until_active_and_verified(): void
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-002',
            'store_name' => 'Unverified Store',
            'owner_name' => 'Owner',
            'address' => 'Antique',
            'latitude' => 10.74,
            'longitude' => 121.94,
            'is_active' => true,
            'is_verified' => false,
            'is_public' => false,
        ]);
        $admin = $this->user('dti_evaluator');
        $token = $admin->createToken('dti-admin-web', ['dti-admin'], now()->addHours(8))->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/admin/reauthenticate', ['password' => 'correct-password'])
            ->assertOk();

        $this->withToken($token)
            ->patchJson('/api/admin/stores/'.$store->id, ['is_public' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['is_public']);
    }

    public function test_manager_created_store_is_public_without_unknown_registration_metadata(): void
    {
        $admin = $this->user('dti_evaluator');
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/stores', [
            'store_name' => 'Official List Store',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'is_active' => false,
            'is_verified' => false,
            'is_public' => false,
        ])
            ->assertCreated()
            ->assertJsonPath('data.dti_sec_number', null)
            ->assertJsonPath('data.owner_name', null)
            ->assertJsonPath('data.image_path', '/stores/store.webp')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.is_verified', true)
            ->assertJsonPath('data.is_public', true)
            ->assertJsonPath('data.verified_by', $admin->id);

        $this->assertDatabaseHas('audit_events', [
            'actor_id' => $admin->id,
            'action' => 'store.created',
        ]);
    }

    private function storePayload(array $extra = []): array
    {
        return array_merge([
            'store_name' => 'Photo Store',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
        ], $extra);
    }

    private function useStoreImageDisk(string $url): void
    {
        config()->set('filesystems.commodity_images_disk', 'store-images-test');
        Storage::fake('store-images-test', ['url' => $url]);
    }

    public function test_manager_created_store_saves_uploaded_photo_as_absolute_url(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        $this->useStoreImageDisk('https://assets.example.test');

        $response = $this->postJson('/api/admin/stores', $this->storePayload(['image' => UploadedFile::fake()->image('shop.jpg')]))
            ->assertCreated();

        $files = Storage::disk('store-images-test')->files('store_images');
        $this->assertCount(1, $files);
        $this->assertSame('https://assets.example.test/'.$files[0], $response->json('data.image_path'));
        $this->assertDatabaseHas('stores', ['store_name' => 'Photo Store', 'image_path' => 'https://assets.example.test/'.$files[0]]);
    }

    public function test_manager_created_store_rejects_non_image_upload(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        $this->useStoreImageDisk('https://assets.example.test');

        $this->postJson('/api/admin/stores', $this->storePayload(['image' => UploadedFile::fake()->create('permit.pdf', 10, 'application/pdf')]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('image');
        $this->assertDatabaseCount('stores', 0);
    }

    public function test_store_photo_storage_failure_creates_no_store(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        config()->set('filesystems.commodity_images_disk', 'unavailable-store-images');
        config()->set('filesystems.disks.unavailable-store-images', ['driver' => 'unavailable']);

        $this->postJson('/api/admin/stores', $this->storePayload(['image' => UploadedFile::fake()->image('shop.jpg')]))
            ->assertStatus(503)
            ->assertJsonPath('status', 'STORE_IMAGE_STORAGE_UNAVAILABLE');
        $this->assertDatabaseCount('stores', 0);
    }

    public function test_store_photo_with_relative_url_is_rejected_and_removed(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        $this->useStoreImageDisk('/storage');

        $this->postJson('/api/admin/stores', $this->storePayload(['image' => UploadedFile::fake()->image('shop.jpg')]))
            ->assertStatus(503)
            ->assertJsonPath('status', 'STORE_IMAGE_STORAGE_UNAVAILABLE');
        $this->assertDatabaseCount('stores', 0);
        $this->assertSame([], Storage::disk('store-images-test')->files('store_images'));
    }

    public function test_store_photo_is_removed_when_audit_storage_is_unavailable(): void
    {
        Sanctum::actingAs($this->user('dti_evaluator'));
        $this->useStoreImageDisk('https://assets.example.test');
        Schema::drop('audit_events');

        $this->postJson('/api/admin/stores', $this->storePayload(['image' => UploadedFile::fake()->image('shop.jpg')]))
            ->assertStatus(503);
        $this->assertDatabaseCount('stores', 0);
        $this->assertSame([], Storage::disk('store-images-test')->files('store_images'));
    }
}
