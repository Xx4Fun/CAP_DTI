<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\Store;
use App\Models\User;
use App\Models\VendorRegistration;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VendorSelfRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('filesystems.commodity_images_disk', 'public-images-test');
        Storage::fake('public-images-test', ['url' => 'https://cdn.pricewatch.test/storage']);
        $this->admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'evaluator@dti.test',
            'password' => 'secret-password-123',
            'role' => 'dti_evaluator',
        ]);
    }

    public function test_vendor_can_self_register_and_does_not_pollute_store_registry_before_approval(): void
    {
        $response = $this->post('/api/vendor/register', [
            'name' => 'Maria Clara Santos',
            'email' => 'Maria@AntiqueMart.test',
            'password' => 'VendorSecurePass123!',
            'password_confirmation' => 'VendorSecurePass123!',
            'store_name' => 'Antique Quality Mart',
            'owner_name' => 'Maria Clara Santos',
            'representative_title' => 'Owner',
            'dti_sec_number' => 'DTI-ANT-2026-001',
            'address' => 'Trade Town Dalipe, San Jose de Buenavista, Antique',
            'latitude' => 10.7424,
            'longitude' => 121.9406,
            'image' => UploadedFile::fake()->image('storefront.jpg', 800, 600),
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('account_state', 'pending_review')
            ->assertJsonPath('user.email', 'maria@antiquemart.test')
            ->assertJsonPath('registration.status', 'pending')
            ->assertJsonPath('registration.store_name', 'Antique Quality Mart');

        $this->assertStringStartsWith(
            'https://cdn.pricewatch.test/storage/store_images/',
            (string) $response->json('registration.image_path')
        );

        // No Store row exists yet until DTI Admin approves the registration.
        $this->assertSame(0, Store::count());
        $user = User::where('email', 'maria@antiquemart.test')->firstOrFail();
        $this->assertFalse($user->is_active);
        $this->assertDatabaseHas('audit_events', [
            'action' => 'vendor.registration_submitted',
            'actor_id' => $user->id,
        ]);

        // Pending registration token cannot access normal Vendor Portal overview or notices.
        $registrationToken = $response->json('token');
        $this->withToken($registrationToken)
            ->getJson('/api/vendor/overview')
            ->assertForbidden()
            ->assertJsonPath('status', 'VENDOR_ACCESS_REVOKED');

        // But it can check registration status.
        $this->withToken($registrationToken)
            ->getJson('/api/vendor/registration')
            ->assertOk()
            ->assertJsonPath('data.account_state', 'pending_review')
            ->assertJsonPath('data.registration.store_name', 'Antique Quality Mart');

        // Unapproved vendor does not appear in the active/inactive Managed Users table yet,
        // and is counted under pending_registrations.
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($this->admin);
        $this->getJson('/api/admin/users')
            ->assertOk()
            ->assertJsonPath('counts.total', 0)
            ->assertJsonPath('counts.pending_registrations', 1);
    }

    public function test_admin_can_approve_registration_as_new_establishment_and_vendor_can_login(): void
    {
        $registerResponse = $this->post('/api/vendor/register', [
            'name' => 'Juan Dela Cruz',
            'email' => 'juan@sanjosegrocery.test',
            'password' => 'VendorSecurePass123!',
            'password_confirmation' => 'VendorSecurePass123!',
            'store_name' => 'San Jose Family Grocery',
            'owner_name' => 'Juan Dela Cruz',
            'representative_title' => 'Owner',
            'dti_sec_number' => 'DTI-SJ-8899',
            'address' => 'Atabay, San Jose de Buenavista, Antique',
            'latitude' => 10.7450,
            'longitude' => 121.9412,
            'image' => UploadedFile::fake()->image('storefront.png', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated();

        $registrationId = $registerResponse->json('registration.id');
        $registrationToken = $registerResponse->json('token');

        Sanctum::actingAs($this->admin);
        $this->getJson('/api/admin/vendor-registrations?status=pending')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $registrationId)
            ->assertJsonPath('data.0.user.email', 'juan@sanjosegrocery.test');

        $approveResponse = $this->postJson("/api/admin/vendor-registrations/{$registrationId}/approve", [
            'mode' => 'create_new',
        ])->assertOk();

        $storeId = $approveResponse->json('data.store.id');
        $this->assertNotNull($storeId);
        $store = Store::findOrFail($storeId);
        $this->assertTrue($store->is_active);
        $this->assertTrue($store->is_verified);
        $this->assertTrue($store->is_public);
        $this->assertSame('Juan Dela Cruz', $store->currentRepresentative()['name'] ?? null);

        $this->assertDatabaseHas('audit_events', [
            'action' => 'vendor_registration.approved',
            'subject_id' => $registrationId,
        ]);

        // Polling registration status upgrades the registration token to a full portal token.
        $this->app['auth']->forgetGuards();
        $statusResponse = $this->withToken($registrationToken)
            ->getJson('/api/vendor/registration')
            ->assertOk()
            ->assertJsonPath('data.account_state', 'active');

        $portalToken = $statusResponse->json('data.token');
        $this->assertNotEmpty($portalToken);

        $this->app['auth']->forgetGuards();
        $this->withToken($portalToken)
            ->getJson('/api/vendor/overview')
            ->assertOk()
            ->assertJsonPath('data.stores.0.store_name', 'San Jose Family Grocery');

        // Normal vendor login also succeeds.
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/vendor/login', [
            'email' => 'juan@sanjosegrocery.test',
            'password' => 'VendorSecurePass123!',
        ])->assertOk()
            ->assertJsonPath('account_state', 'active');
    }

    public function test_admin_can_approve_registration_by_linking_to_existing_unlinked_store(): void
    {
        $existingStore = Store::create([
            'store_name' => 'CPT Mart',
            'owner_name' => 'Old Recorded Owner',
            'address' => 'San Jose de Buenavista, Antique',
            'latitude' => 10.7400,
            'longitude' => 121.9400,
            'is_active' => true,
            'is_verified' => true,
            'is_public' => true,
        ]);

        $registerResponse = $this->post('/api/vendor/register', [
            'name' => 'Roberto Sy',
            'email' => 'roberto@cptmart.test',
            'password' => 'VendorSecurePass123!',
            'password_confirmation' => 'VendorSecurePass123!',
            'store_name' => 'CPT Mart - San Jose',
            'owner_name' => 'Roberto Sy',
            'representative_title' => 'Manager',
            'dti_sec_number' => 'SEC-CPT-2026',
            'address' => 'T. Fornier St., San Jose de Buenavista, Antique',
            'latitude' => 10.7431,
            'longitude' => 121.9419,
            'image' => UploadedFile::fake()->image('cptmart.jpg', 640, 480),
        ], ['Accept' => 'application/json'])->assertCreated();

        $registrationId = $registerResponse->json('registration.id');

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/admin/vendor-registrations/{$registrationId}/approve", [
            'mode' => 'link_existing',
            'existing_store_id' => $existingStore->id,
            'update_existing_store' => true,
        ])->assertOk()
            ->assertJsonPath('data.store.id', $existingStore->id);

        $this->assertSame(1, Store::count());
        $existingStore->refresh();
        $vendor = User::where('email', 'roberto@cptmart.test')->firstOrFail();
        $this->assertSame($vendor->id, (int) $existingStore->vendor_user_id);
        $this->assertSame('SEC-CPT-2026', $existingStore->dti_sec_number);
        $this->assertSame('Manager', $existingStore->currentRepresentative()['title'] ?? null);
    }

    public function test_admin_can_reject_registration_and_vendor_can_login_to_resubmit(): void
    {
        $registerResponse = $this->post('/api/vendor/register', [
            'name' => 'Elena Gomez',
            'email' => 'elena@store.test',
            'password' => 'VendorSecurePass123!',
            'password_confirmation' => 'VendorSecurePass123!',
            'store_name' => 'Elena Mini Mart',
            'owner_name' => 'Elena Gomez',
            'representative_title' => 'Owner',
            'address' => 'San Pedro, San Jose de Buenavista, Antique',
            'latitude' => 10.7510,
            'longitude' => 121.9380,
            'image' => UploadedFile::fake()->image('blurry.jpg', 400, 300),
        ], ['Accept' => 'application/json'])->assertCreated();

        $registrationId = $registerResponse->json('registration.id');

        Sanctum::actingAs($this->admin);
        $this->postJson("/api/admin/vendor-registrations/{$registrationId}/reject", [
            'reason' => 'The uploaded storefront photo is blurry. Please upload a clear photo showing your store signage.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        // Vendor signs in and receives account_state=rejected with the feedback reason.
        $this->app['auth']->forgetGuards();
        $loginResponse = $this->postJson('/api/vendor/login', [
            'email' => 'elena@store.test',
            'password' => 'VendorSecurePass123!',
        ])->assertOk()
            ->assertJsonPath('account_state', 'rejected')
            ->assertJsonPath('registration.rejection_reason', 'The uploaded storefront photo is blurry. Please upload a clear photo showing your store signage.');

        $token = $loginResponse->json('token');

        // Vendor updates and resubmits the registration.
        $this->withToken($token)->post('/api/vendor/registration/resubmit', [
            'name' => 'Elena Gomez',
            'store_name' => 'Elena Super Mini Mart',
            'owner_name' => 'Elena Gomez',
            'representative_title' => 'Owner',
            'dti_sec_number' => 'DTI-ELENA-101',
            'address' => 'Brgy. San Pedro, San Jose de Buenavista, Antique',
            'latitude' => 10.7512,
            'longitude' => 121.9382,
            'image' => UploadedFile::fake()->image('clear-signage.jpg', 800, 600),
        ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonPath('data.account_state', 'pending_review')
            ->assertJsonPath('data.registration.status', 'pending')
            ->assertJsonPath('data.registration.rejection_reason', null)
            ->assertJsonPath('data.registration.store_name', 'Elena Super Mini Mart');

        $this->assertSame('pending', VendorRegistration::findOrFail($registrationId)->status);
    }
}
