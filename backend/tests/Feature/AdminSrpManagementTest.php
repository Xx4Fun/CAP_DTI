<?php

namespace Tests\Feature;

use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

final class AdminSrpManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'DTI Evaluator',
            'email' => 'srp-evaluator@dti.test',
            'password' => 'secret-password',
            'role' => 'dti_evaluator',
        ]);

        Sanctum::actingAs($this->admin);
    }

    public function test_admin_srp_list_supports_search_filters_and_laravel_pagination_metadata(): void
    {
        foreach ([
            ['Premium Rice', 'Rice', 'premium-rice-1kg'],
            ['Regular Rice', 'Rice', 'regular-rice-1kg'],
            ['Brown Rice', 'Rice', 'brown-rice-1kg'],
            ['Canned Tuna', 'Canned Goods', 'canned-tuna-155g'],
        ] as [$name, $category, $key]) {
            SrpBulletin::create([
                'commodity_name' => $name,
                'category' => $category,
                'unit' => '1kg',
                'commodity_key' => $key,
                'baseline_price' => 50,
                'effective_date' => '2026-05-11',
                'source_reference' => 'DTI-SRP-2026-05',
                'is_active' => true,
            ]);
        }

        $this->getJson('/api/admin/srp?view=history&query=rice&category=Rice&per_page=2&page=2')
            ->assertOk()
            ->assertJsonPath('data.current_page', 2)
            ->assertJsonPath('data.per_page', 2)
            ->assertJsonPath('data.total', 3)
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('capabilities.can_publish', true);
    }

    public function test_revision_preview_and_creation_append_a_new_version_without_overwriting_history(): void
    {
        $original = SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'source_reference' => 'DTI-SRP-2026-05',
            'is_active' => true,
        ]);

        $payload = [
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'change_reason' => 'Approved August bulletin.',
        ];

        $this->postJson("/api/admin/srp/{$original->id}/revisions/preview", $payload)
            ->assertOk()
            ->assertJsonPath('data.original.id', $original->id)
            ->assertJsonPath('data.proposed.baseline_price', 50.25)
            ->assertJsonPath('data.becomes_public_on', '2026-08-01');

        $response = $this->postJson("/api/admin/srp/{$original->id}/revisions", $payload)
            ->assertCreated()
            ->assertJsonPath('data.commodity_key', 'premium-rice-1kg')
            ->assertJsonPath('data.baseline_price', 50.25);

        $original->refresh();
        $this->assertSame(48.0, $original->baseline_price);
        $this->assertNotSame($original->id, $response->json('data.id'));
        $this->assertDatabaseHas('audit_events', [
            'action' => 'srp.revision_created',
            'subject_id' => $response->json('data.id'),
        ]);
    }

    public function test_srp_revision_fails_closed_when_audit_storage_is_unavailable(): void
    {
        $original = SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        Schema::drop('audit_events');

        $this->postJson("/api/admin/srp/{$original->id}/revisions", [
            'commodity_name' => 'Premium Rice',
            'unit' => '1kg',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'change_reason' => 'Approved August bulletin.',
        ])
            ->assertStatus(503)
            ->assertJsonPath('status', 'SRP_VERSIONING_UNAVAILABLE');

        $this->assertSame(1, SrpBulletin::count());
    }

    public function test_public_catalog_publishes_only_the_date_correct_version_and_hides_internal_fields(): void
    {
        Carbon::setTestNow('2026-07-30 12:00:00');

        SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 48,
            'effective_date' => '2026-05-11',
            'source_reference' => 'DTI-SRP-2026-05',
            'created_by' => $this->admin->id,
            'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Premium Rice',
            'category' => 'Rice',
            'unit' => '1kg',
            'commodity_key' => 'premium-rice-1kg',
            'baseline_price' => 50.25,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-2026-08',
            'created_by' => $this->admin->id,
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=rice')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.baseline_price', 48)
            ->assertJsonPath('data.0.source_reference', 'DTI-SRP-2026-05')
            ->assertJsonMissingPath('data.0.created_by')
            ->assertJsonMissingPath('data.0.commodity_key');

        Carbon::setTestNow('2026-08-02 12:00:00');

        $this->getJson('/api/public/commodities?query=rice')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.baseline_price', 50.25)
            ->assertJsonPath('data.0.effective_date', '2026-08-01')
            ->assertJsonPath('data.0.source_reference', 'DTI-SRP-2026-08');
    }

    public function test_admin_can_manually_create_srp_item(): void
    {
        $payload = [
            'commodity_name' => 'Instant Mami Beef',
            'unit' => '55g',
            'category' => 'Instant Noodles',
            'regulatory_classification' => 'BASIC_NECESSITY',
            'baseline_price' => 9.50,
            'effective_date' => '2026-08-01',
            'source_reference' => 'DTI-SRP-MANUAL-01',
        ];

        $response = $this->postJson('/api/admin/srp', $payload)
            ->assertCreated()
            ->assertJsonPath('data.commodity_name', 'Instant Mami Beef')
            ->assertJsonPath('data.baseline_price', 9.50)
            ->assertJsonPath('data.commodity_key', 'instant-mami-beef-55g');

        $this->assertDatabaseHas('srp_bulletins', [
            'id' => $response->json('data.id'),
            'commodity_name' => 'Instant Mami Beef',
        ]);
    }

    public function test_admin_can_update_srp_metadata_without_creating_new_version(): void
    {
        $item = SrpBulletin::create([
            'commodity_name' => 'Sardines Old Typo',
            'category' => 'Canned Goods',
            'unit' => '155g',
            'commodity_key' => 'sardines-old-typo-155g',
            'baseline_price' => 20.00,
            'effective_date' => '2026-05-11',
            'source_reference' => 'DTI-SRP-2026-05',
            'is_active' => true,
        ]);

        $this->putJson("/api/admin/srp/{$item->id}", [
            'commodity_name' => 'Mega Sardines Tomato',
            'unit' => '155g',
            'category' => 'Canned Goods',
            'regulatory_classification' => 'BASIC_NECESSITY',
        ])
            ->assertOk()
            ->assertJsonPath('data.commodity_name', 'Mega Sardines Tomato');

        $this->assertSame(1, SrpBulletin::count());
        $item->refresh();
        $this->assertSame('Mega Sardines Tomato', $item->commodity_name);
        $this->assertSame(20.00, (float) $item->baseline_price);
    }

    public function test_metadata_unit_change_is_blocked_once_any_revision_has_monitoring_prices(): void
    {
        $srp = fn (string $unit, string $effective) => SrpBulletin::create([
            'commodity_name' => 'Evaporated Milk',
            'unit' => $unit,
            'commodity_key' => 'evap-milk',
            'baseline_price' => 30,
            'effective_date' => $effective,
            'source_reference' => 'DTI-SRP-2026-05',
            'is_active' => true,
        ]);
        $pack = $srp('pack', '2026-05-01');
        $kg = $srp('kg', '2026-06-01');
        $payload = fn (string $unit) => ['commodity_name' => 'Evaporated Milk', 'unit' => $unit];

        // No recorded prices yet: unit edits are still allowed.
        $this->putJson("/api/admin/srp/{$kg->id}", $payload('kg'))->assertOk();
        SrpBulletin::whereKey($pack->id)->update(['unit' => 'pack']);

        $this->recordPrice($pack);

        // Editing the kg sibling with unit kg would relabel the priced pack revision.
        $this->putJson("/api/admin/srp/{$kg->id}", $payload('kg'))->assertStatus(422)->assertJsonValidationErrors('unit');
        $this->putJson("/api/admin/srp/{$pack->id}", $payload('kg'))->assertStatus(422)->assertJsonValidationErrors('unit');
        $this->assertSame('pack', $pack->fresh()->unit);

        // A name-only edit that keeps every priced unit is still allowed.
        SrpBulletin::whereKey($kg->id)->update(['unit' => 'pack']);
        $this->putJson("/api/admin/srp/{$pack->id}", ['commodity_name' => 'Evap Milk', 'unit' => ' Pack'])->assertOk();
        $this->assertSame('Evap Milk', $pack->fresh()->commodity_name);
    }

    private function recordPrice(SrpBulletin $srp): void
    {
        $officer = User::create(['name' => 'Field Officer', 'email' => 'srp-officer@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $store = Store::create(['store_name' => 'Store A', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94, 'is_active' => true]);
        $record = MonitoringRecord::create([
            'client_uuid' => 'srp-guard-1',
            'officer_user_id' => $officer->id,
            'store_id' => $store->id,
            'status' => 'accepted',
            'started_at' => now()->subHour(),
            'finalized_at' => now(),
            'received_at' => now(),
            'latitude' => 10.74,
            'longitude' => 121.94,
            'location_accuracy_meters' => 5,
            'location_captured_at' => now(),
            'representative_name' => 'Store Rep',
            'officer_signature_disk' => 'local',
            'officer_signature_path' => 'sig1.png',
            'officer_signature_sha256' => hash('sha256', 'sig1'),
            'representative_signature_disk' => 'local',
            'representative_signature_path' => 'sig2.png',
            'representative_signature_sha256' => hash('sha256', 'sig2'),
        ]);
        MonitoringRecordItem::create([
            'monitoring_record_id' => $record->id,
            'srp_id' => $srp->id,
            'recorded_price' => 30,
            'baseline_price' => 30,
            'variance_percent' => 0,
            'is_anomaly' => false,
        ]);
    }

    public function test_admin_can_batch_update_srp_prices(): void
    {
        $item1 = SrpBulletin::create([
            'commodity_name' => 'Item 1',
            'unit' => '100g',
            'commodity_key' => 'item-1-100g',
            'baseline_price' => 10.00,
            'effective_date' => '2026-01-01',
            'source_reference' => 'REF-1',
            'is_active' => true,
        ]);

        $item2 = SrpBulletin::create([
            'commodity_name' => 'Item 2',
            'unit' => '200g',
            'commodity_key' => 'item-2-200g',
            'baseline_price' => 20.00,
            'effective_date' => '2026-01-01',
            'source_reference' => 'REF-1',
            'is_active' => true,
        ]);

        $payload = [
            'effective_date' => '2026-08-01',
            'source_reference' => 'BATCH-REF-01',
            'change_reason' => 'Quarterly Price Adjustment',
            'updates' => [
                ['id' => $item1->id, 'baseline_price' => 12.50],
                ['id' => $item2->id, 'baseline_price' => 22.00],
            ],
        ];

        $this->postJson('/api/admin/srp/batch-revisions', $payload)
            ->assertCreated()
            ->assertJsonPath('data.updated_count', 2);

        $this->assertSame(4, SrpBulletin::count());
    }

    public function test_admin_uploads_commodity_image_to_the_configured_disk_and_returns_its_url(): void
    {
        config()->set('filesystems.commodity_images_disk', 'commodity-images-test');
        config()->set('filesystems.disks.commodity-images-test', [
            'driver' => 'local',
            'root' => storage_path('framework/testing/disks/commodity-images-test'),
            'url' => 'https://assets.example.test',
            'visibility' => 'public',
            'throw' => true,
        ]);
        Storage::fake('commodity-images-test', ['url' => 'https://assets.example.test']);
        $file = UploadedFile::fake()->image('coffee.png');

        $response = $this->postJson('/api/admin/srp/upload-image', [
            'image' => $file,
        ])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['image_path', 'url']]);

        $path = $response->json('data.image_path');
        Storage::disk('commodity-images-test')->assertExists($path);
        $this->assertSame('https://assets.example.test/'.$path, $response->json('data.url'));
    }

    public function test_admin_fails_closed_when_commodity_image_storage_is_unavailable(): void
    {
        config()->set('filesystems.commodity_images_disk', 'unavailable-commodity-images');
        config()->set('filesystems.disks.unavailable-commodity-images', [
            'driver' => 'unavailable',
        ]);

        $this->postJson('/api/admin/srp/upload-image', [
            'image' => UploadedFile::fake()->image('coffee.png'),
        ])
            ->assertStatus(503)
            ->assertJsonPath('status', 'COMMODITY_IMAGE_STORAGE_UNAVAILABLE');
    }

    public function test_public_catalog_resolves_commodity_image_keys_through_the_configured_disk(): void
    {
        config()->set('filesystems.commodity_images_disk', 'commodity-images-test');
        config()->set('filesystems.disks.commodity-images-test', [
            'driver' => 'local',
            'root' => storage_path('framework/testing/disks/commodity-images-test'),
            'url' => 'https://assets.example.test',
            'visibility' => 'public',
            'throw' => true,
        ]);
        Storage::fake('commodity-images-test', ['url' => 'https://assets.example.test']);

        SrpBulletin::create([
            'commodity_name' => 'Roasted Coffee',
            'commodity_key' => 'roasted-coffee-100g',
            'image_path' => 'commodity_images/coffee.webp',
            'baseline_price' => 25.50,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=Roasted')
            ->assertOk()
            ->assertJsonPath(
                'data.0.image_path',
                'https://assets.example.test/commodity_images/coffee.webp'
            );
    }

    public function test_public_catalog_preserves_legacy_absolute_commodity_image_urls(): void
    {
        SrpBulletin::create([
            'commodity_name' => 'Legacy Coffee',
            'commodity_key' => 'legacy-coffee-100g',
            'image_path' => 'https://legacy.example.test/coffee.webp',
            'baseline_price' => 24.50,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=Legacy')
            ->assertOk()
            ->assertJsonPath('data.0.image_path', 'https://legacy.example.test/coffee.webp');
    }

    public function test_public_catalog_inherits_the_configured_image_url_across_commodity_revisions(): void
    {
        config()->set('filesystems.commodity_images_disk', 'commodity-images-test');
        config()->set('filesystems.disks.commodity-images-test', [
            'driver' => 'local',
            'root' => storage_path('framework/testing/disks/commodity-images-test'),
            'url' => 'https://assets.example.test',
            'visibility' => 'public',
            'throw' => true,
        ]);
        Storage::fake('commodity-images-test', ['url' => 'https://assets.example.test']);

        SrpBulletin::create([
            'commodity_name' => 'Revision Coffee',
            'commodity_key' => 'revision-coffee-100g',
            'image_path' => 'commodity_images/revision-coffee.webp',
            'baseline_price' => 24.50,
            'effective_date' => now()->subMonth()->toDateString(),
            'is_active' => true,
        ]);
        SrpBulletin::create([
            'commodity_name' => 'Revision Coffee',
            'commodity_key' => 'revision-coffee-100g',
            'image_path' => null,
            'baseline_price' => 25.50,
            'effective_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);

        $this->getJson('/api/public/commodities?query=Revision')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath(
                'data.0.image_path',
                'https://assets.example.test/commodity_images/revision-coffee.webp'
            );
    }
}
