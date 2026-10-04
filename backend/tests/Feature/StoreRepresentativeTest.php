<?php

namespace Tests\Feature;

use App\Http\Controllers\Vendor\VendorAuthController;
use App\Models\AuditEvent;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StoreRepresentativeTest extends TestCase
{
    use RefreshDatabase;

    private function vendor(): User
    {
        return User::factory()->create(['role' => 'vendor', 'is_active' => true]);
    }

    private function store(?User $vendor): Store
    {
        return Store::create(['store_name' => 'Market', 'owner_name' => 'Registered Owner', 'address' => 'Antique', 'latitude' => 10, 'longitude' => 121, 'vendor_user_id' => $vendor?->id, 'is_active' => true, 'is_public' => true, 'is_verified' => true]);
    }

    private function authenticate(User $user, bool $field = false): void
    {
        $this->app['auth']->forgetGuards();
        $this->withToken($user->createToken($field ? 'field' : VendorAuthController::TOKEN_NAME, [$field ? 'field-monitoring' : 'vendor-portal'])->plainTextToken);
    }

    public function test_linked_vendor_saves_trimmed_details_per_establishment_with_audit(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $other = $this->store($vendor);
        $this->authenticate($vendor);
        $this->getJson('/api/vendor/overview')->assertOk()->assertJsonPath('data.stores.0.current_representative', null);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => '  Maria Santos  ', 'title' => 'Manager'])
            ->assertOk()->assertJsonPath('data.name', 'Maria Santos')->assertJsonPath('data.title', 'Manager');
        $this->assertNull($other->fresh()->current_representative_name);
        $this->assertSame('Registered Owner', $store->fresh()->owner_name);
        $event = AuditEvent::where('action', 'store.representative_changed')->firstOrFail();
        $this->assertSame($vendor->id, $event->actor_id);
        $this->assertSame($store->id, $event->subject_id);
        $this->assertNull($event->metadata['previous']);
        $this->assertSame('Maria Santos', $event->metadata['current']['name']);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ana', 'title' => 'Owner'])->assertOk();
        $this->assertSame('Maria Santos', AuditEvent::latest('id')->first()->metadata['previous']['name']);
        $this->getJson('/api/vendor/overview')->assertOk()->assertJsonPath('data.stores.0.current_representative.name', 'Ana');
    }

    public function test_validation_and_revoked_or_foreign_links_cannot_write(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $foreign = $this->store(null);
        $this->authenticate($vendor);
        foreach ([['name' => '   ', 'title' => 'Owner'], ['name' => str_repeat('a', 256), 'title' => 'Owner'], ['name' => 'Ana', 'title' => 'Staff']] as $invalid) {
            $this->putJson("/api/vendor/stores/{$store->id}/representative", $invalid)->assertUnprocessable();
        }
        $valid = ['name' => 'Ana', 'title' => 'Owner'];
        $this->putJson("/api/vendor/stores/{$foreign->id}/representative", $valid)->assertForbidden();
        $store->update(['vendor_user_id' => null]);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", $valid)->assertForbidden();
        $store->update(['vendor_user_id' => $vendor->id]);
        $vendor->update(['is_active' => false]);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", $valid)->assertForbidden();
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_audit_failure_rolls_back_the_save(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $this->authenticate($vendor);
        $this->mock(AuditTrailService::class, fn ($mock) => $mock->shouldReceive('recordOrFail')->once()->andThrow(new \RuntimeException('Audit failed')));
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ana', 'title' => 'Owner'])->assertStatus(500);
        $this->assertNull($store->fresh()->current_representative_name);
    }

    public function test_audit_unavailability_returns_503_without_changing_existing_details(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $this->authenticate($vendor);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ana', 'title' => 'Owner'])->assertOk();
        $this->partialMock(AuditTrailService::class, fn ($mock) => $mock->shouldReceive('available')->andReturn(false));
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ben', 'title' => 'Manager'])
            ->assertStatus(503)->assertJsonPath('status', 'AUDIT_TRAIL_UNAVAILABLE');
        $this->assertSame('Ana', $store->fresh()->currentRepresentative()['name']);
        $this->assertDatabaseCount('audit_events', 1);
    }

    public function test_link_is_rechecked_after_route_binding_before_the_transaction_write(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $this->authenticate($vendor);
        $revoked = false;
        Store::retrieved(function (Store $bound) use ($store, &$revoked) {
            if ($bound->id === $store->id && ! $revoked) {
                $revoked = true;
                \Illuminate\Support\Facades\DB::table('stores')->where('id', $store->id)->update(['vendor_user_id' => null]);
            }
        });
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ana', 'title' => 'Owner'])->assertForbidden();
        $this->assertNull($store->fresh()->currentRepresentative());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_field_and_admin_see_current_details_but_generic_and_public_payloads_do_not(): void
    {
        $vendor = $this->vendor();
        $store = $this->store($vendor);
        $this->authenticate($vendor);
        $this->putJson("/api/vendor/stores/{$store->id}/representative", ['name' => 'Ana', 'title' => 'Manager'])->assertOk();
        $serialized = $store->fresh()->toArray();
        $this->assertArrayNotHasKey('current_representative_name', $serialized);
        $this->assertArrayNotHasKey('current_representative', $serialized);
        $field = User::factory()->create(['role' => 'field_officer', 'is_active' => true]);
        $this->authenticate($field, true);
        $this->getJson('/api/field/bootstrap')->assertOk()->assertJsonPath('data.stores.0.current_representative.title', 'Manager');
        $this->getJson("/api/field/stores/{$store->id}/representative")->assertOk()->assertJsonPath('data.current_representative.name', 'Ana')->assertJsonPath('data.owner_name', 'Registered Owner');
        $admin = User::factory()->create(['role' => 'dti_evaluator', 'is_active' => true]);
        $this->authenticate($admin, true);
        $this->getJson("/api/field/stores/{$store->id}/representative")->assertForbidden();
        $this->getJson('/api/admin/stores')->assertOk()->assertJsonPath('data.0.current_representative.name', 'Ana');
        $this->getJson("/api/admin/monitoring-establishments/{$store->id}")->assertOk()->assertJsonPath('data.store.current_representative.name', 'Ana');
        $public = $this->getJson('/api/public/establishments')->assertOk()->getContent();
        $this->assertStringNotContainsString('current_representative', $public);
        $this->assertStringNotContainsString('Ana', $public);
    }
}
