<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\CommodityImageStorage;
use App\Services\Ocr\ScanSessionRepository;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** One public image rule: DB keeps object keys, the backend sends loadable URLs or null (docs/plans/image-urls). */
final class PublicImageRuleTest extends TestCase
{
    use RefreshDatabase;

    private const ASSETS = 'https://assets.example.test';

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config()->set('filesystems.commodity_images_disk', 'public-images-test');
        Storage::fake('public-images-test', ['url' => self::ASSETS]);
    }

    private function images(): CommodityImageStorage
    {
        return app(CommodityImageStorage::class);
    }

    private function actingAsManager(): void
    {
        Sanctum::actingAs(User::create([
            'name' => 'DTI Evaluator', 'email' => 'images@dti.test', 'password' => 'secret-password', 'role' => 'dti_evaluator',
        ]));
    }

    private function bulletin(array $attributes): SrpBulletin
    {
        return SrpBulletin::create($attributes + [
            'baseline_price' => 20, 'effective_date' => '2026-01-01', 'source_reference' => 'REF', 'is_active' => true,
        ]);
    }

    public function test_public_url_turns_keys_into_disk_urls_and_rejects_paths_a_browser_cannot_load(): void
    {
        $images = $this->images();

        $this->assertNull($images->publicUrl(null));
        $this->assertNull($images->publicUrl(''));
        $this->assertSame(self::ASSETS.'/commodity_images/a.webp', $images->publicUrl('commodity_images/a.webp'));
        $this->assertSame(self::ASSETS.'/commodity_images/a.webp', $images->publicUrl('/storage/commodity_images/a.webp'));
        $this->assertSame(self::ASSETS.'/store_images/b.webp', $images->publicUrl('store_images/b.webp'));
        $this->assertSame('https://legacy.example.test/c.webp', $images->publicUrl('https://legacy.example.test/c.webp'));
        foreach (['/stores/robinsons.webp', '/products/x.png', 'commodity_images/../secret', 'other/a.webp'] as $unsupported) {
            $this->assertNull($images->publicUrl($unsupported), $unsupported);
        }

        request()->headers->set('X-Forwarded-Proto', 'https');
        $this->assertSame('https://legacy.example.test/c.webp', $images->publicUrl('http://legacy.example.test/c.webp'));
    }

    public function test_store_keeps_the_key_and_every_client_gets_the_url(): void
    {
        $store = Store::create([
            'store_name' => 'Key Store', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94,
            'image_path' => 'store_images/key-store.webp', 'is_active' => true, 'is_verified' => true, 'is_public' => true,
        ]);

        $this->assertSame('store_images/key-store.webp', $store->getRawOriginal('image_path'));
        $this->assertSame(self::ASSETS.'/store_images/key-store.webp', $store->image_path);
        $this->getJson('/api/public/establishments')->assertOk()
            ->assertJsonPath('data.0.image_path', self::ASSETS.'/store_images/key-store.webp');

        $store->update(['image_path' => null]);
        $this->assertNull($store->fresh()->image_path);
    }

    public function test_store_image_migration_rewrites_only_the_mapped_bundled_photos(): void
    {
        $ids = collect(['/stores/robinsons.webp', '/stores/store.webp', '/stores/gaisano-grand.jpg', 'https://x.test/s.webp', null])
            ->mapWithKeys(fn (?string $path, int $i) => [$path ?? 'null' => DB::table('stores')->insertGetId([
                'store_name' => "Store $i", 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94,
                'image_path' => $path, 'created_at' => now(), 'updated_at' => now(),
            ])]);
        $raw = fn (string $from) => DB::table('stores')->where('id', $ids[$from])->value('image_path');
        $migration = require database_path('migrations/2026_10_03_000001_store_image_paths_to_bucket_keys.php');

        $migration->up();
        $this->assertSame('store_images/robinsons.webp', $raw('/stores/robinsons.webp'));
        $this->assertNull($raw('/stores/store.webp'));
        $this->assertSame('/stores/gaisano-grand.jpg', $raw('/stores/gaisano-grand.jpg'));
        $this->assertSame('https://x.test/s.webp', $raw('https://x.test/s.webp'));
        $this->assertNull($raw('null'));

        $migration->down();
        $this->assertSame('/stores/robinsons.webp', $raw('/stores/robinsons.webp'));
        $this->assertNull($raw('/stores/store.webp'));
        $this->assertSame('/stores/gaisano-grand.jpg', $raw('/stores/gaisano-grand.jpg'));
    }

    public function test_new_srp_items_accept_only_uploaded_images(): void
    {
        $this->actingAsManager();
        $item = fn (array $extra) => $this->postJson('/api/admin/srp', $extra + [
            'commodity_name' => 'Upload Coffee '.Str::random(4), 'unit' => '100g', 'baseline_price' => 25,
            'effective_date' => '2026-05-01', 'source_reference' => 'REF',
        ]);

        $item(['image_path' => 'commodity_images/never-uploaded.webp'])->assertUnprocessable()->assertJsonValidationErrors('image_path');
        $item(['image_path' => 'https://elsewhere.example.test/coffee.webp'])->assertUnprocessable()->assertJsonValidationErrors('image_path');

        $key = $this->postJson('/api/admin/srp/upload-image', ['image' => UploadedFile::fake()->image('coffee.png')])
            ->assertCreated()->json('data.image_path');
        $item(['image_path' => $key])->assertCreated()
            ->assertJsonPath('data.image_path', $key)
            ->assertJsonPath('data.image_url', self::ASSETS.'/'.$key);
    }

    public function test_import_rejects_image_keys_that_were_never_uploaded(): void
    {
        $this->actingAsManager();

        $this->postJson('/api/admin/srp/import/preview', [
            'metadata' => ['effective_date' => '2026-05-01', 'source_reference' => 'REF'],
            'items' => [['item_name' => 'Ghost Coffee', 'unit' => '100g', 'srp' => '25.00', 'image_path' => 'commodity_images/ghost.webp']],
        ])->assertUnprocessable()->assertJsonValidationErrors('items');
    }

    public function test_metadata_edit_without_an_image_keeps_every_revision_photo(): void
    {
        $this->actingAsManager();
        $older = $this->bulletin(['commodity_name' => 'Kept Coffee', 'unit' => '100g', 'commodity_key' => 'kept-coffee-100g',
            'image_path' => 'commodity_images/kept.webp', 'effective_date' => '2026-01-01']);
        $current = $this->bulletin(['commodity_name' => 'Kept Coffee', 'unit' => '100g', 'commodity_key' => 'kept-coffee-100g',
            'image_path' => null, 'effective_date' => '2026-03-01']);

        $this->putJson("/api/admin/srp/{$current->id}", ['commodity_name' => 'Kept Coffee', 'unit' => '100g', 'category' => 'Coffee'])->assertOk();

        $this->assertSame('commodity_images/kept.webp', $older->fresh()->image_path);
        $this->getJson('/api/public/commodities?query=Kept')->assertOk()
            ->assertJsonPath('data.0.image_path', self::ASSETS.'/commodity_images/kept.webp');
    }

    public function test_metadata_edit_may_resubmit_a_legacy_absolute_url_unchanged(): void
    {
        $this->actingAsManager();
        $legacy = $this->bulletin(['commodity_name' => 'Legacy Tea', 'unit' => '50g', 'commodity_key' => 'legacy-tea-50g',
            'image_path' => 'https://legacy.example.test/tea.webp']);

        $this->putJson("/api/admin/srp/{$legacy->id}", ['commodity_name' => 'Legacy Tea', 'unit' => '50g', 'image_path' => 'https://legacy.example.test/tea.webp'])
            ->assertOk()->assertJsonPath('data.image_url', 'https://legacy.example.test/tea.webp');
    }

    public function test_metadata_edit_resubmitting_the_current_photo_keeps_different_historical_photos(): void
    {
        $this->actingAsManager();
        $older = $this->bulletin(['commodity_name' => 'Two Photo Tea', 'unit' => '50g', 'commodity_key' => 'two-photo-tea-50g',
            'image_path' => 'commodity_images/old-pack.webp', 'effective_date' => '2026-01-01']);
        $current = $this->bulletin(['commodity_name' => 'Two Photo Tea', 'unit' => '50g', 'commodity_key' => 'two-photo-tea-50g',
            'image_path' => 'commodity_images/new-pack.webp', 'effective_date' => '2026-03-01']);

        // The Admin edit form resubmits the row's current image_path when no new photo is uploaded.
        $this->putJson("/api/admin/srp/{$current->id}", ['commodity_name' => 'Two Photo Tea', 'unit' => '50g', 'category' => 'Tea', 'image_path' => 'commodity_images/new-pack.webp'])
            ->assertOk();

        $this->assertSame('commodity_images/old-pack.webp', $older->fresh()->image_path);
        $this->assertSame('Tea', $older->fresh()->category);
    }

    public function test_import_accepts_stored_references_and_rejects_non_text_image_paths(): void
    {
        $this->actingAsManager();
        $this->bulletin(['commodity_name' => 'Legacy Cocoa', 'unit' => '100g', 'commodity_key' => 'legacy-cocoa-100g',
            'image_path' => 'https://legacy.example.test/cocoa.webp']);
        $preview = fn (mixed $imagePath) => $this->postJson('/api/admin/srp/import/preview', [
            'metadata' => ['effective_date' => '2026-06-01', 'source_reference' => 'REF'],
            'items' => [['item_name' => 'Legacy Cocoa', 'unit' => '100g', 'srp' => '30.00', 'image_path' => $imagePath]],
        ]);

        $preview('https://legacy.example.test/cocoa.webp')->assertOk();
        $preview(['commodity_images/a.webp'])->assertUnprocessable()->assertJsonValidationErrors('items');
        $preview(false)->assertUnprocessable()->assertJsonValidationErrors('items');

        // Another commodity's stored URL is not this item's unchanged reference.
        $this->postJson('/api/admin/srp/import/preview', [
            'metadata' => ['effective_date' => '2026-06-01', 'source_reference' => 'REF'],
            'items' => [['item_name' => 'Other Cocoa', 'unit' => '100g', 'srp' => '30.00', 'image_path' => 'https://legacy.example.test/cocoa.webp']],
        ])->assertUnprocessable()->assertJsonValidationErrors('items');
    }

    public function test_a_keyed_lineage_never_lends_its_photo_by_name_and_admin_current_view_matches_customers(): void
    {
        // A renamed lineage keeps its key; an unrelated keyed item now shares its name, unit and category.
        $this->bulletin(['commodity_name' => 'Shared Name', 'unit' => '1L', 'category' => 'Oil',
            'commodity_key' => 'original-oil-1l', 'image_path' => 'commodity_images/original-oil.webp']);
        $this->bulletin(['commodity_name' => 'Shared Name', 'unit' => '1L', 'category' => 'Oil',
            'commodity_key' => 'shared-name-1l-oil', 'image_path' => null]);
        // Photo only on an older revision of a keyed lineage.
        $this->bulletin(['commodity_name' => 'History Photo Rice', 'unit' => '1kg', 'commodity_key' => 'history-photo-rice-1kg',
            'image_path' => 'commodity_images/rice.webp', 'effective_date' => '2026-01-01']);
        $this->bulletin(['commodity_name' => 'History Photo Rice', 'unit' => '1kg', 'commodity_key' => 'history-photo-rice-1kg',
            'image_path' => null, 'effective_date' => '2026-03-01']);

        $resolve = app(\App\Services\Admin\SrpCatalogService::class)->imageResolver();
        $this->assertNull($resolve(SrpBulletin::where('commodity_key', 'shared-name-1l-oil')->first()));

        $this->actingAsManager();
        $this->getJson('/api/admin/srp?view=current&query=History')->assertOk()
            ->assertJsonPath('data.data.0.image_url', self::ASSETS.'/commodity_images/rice.webp');
        $history = collect($this->getJson('/api/admin/srp?view=history&query=History')->assertOk()->json('data.data'))
            ->pluck('image_url', 'effective_date');
        $this->assertContains(null, $history->all());
    }

    public function test_photos_are_inherited_within_a_commodity_and_never_across_lineages(): void
    {
        // Keyless master-list history, then a keyed current revision of the same commodity.
        $this->bulletin(['commodity_name' => 'Roasted Coffee (100g)', 'unit' => '100g', 'category' => 'Coffee',
            'commodity_key' => null, 'image_path' => 'commodity_images/roasted.webp', 'effective_date' => '2026-01-01', 'is_active' => false]);
        $this->bulletin(['commodity_name' => 'Roasted Coffee (100g)', 'unit' => '100g', 'category' => 'Coffee',
            'commodity_key' => 'roasted-coffee-100g', 'image_path' => null, 'effective_date' => '2026-03-01']);
        // Same name and unit, split by category into two lineages; only one has a photo.
        $this->bulletin(['commodity_name' => 'Argentina (150g)', 'unit' => '150g', 'category' => 'Corned Beef',
            'commodity_key' => 'argentina-150g', 'image_path' => 'commodity_images/corned.webp']);
        $meatLoaf = $this->bulletin(['commodity_name' => 'Argentina (150g)', 'unit' => '150g', 'category' => 'Meat Loaf',
            'commodity_key' => 'argentina-150g-meat-loaf', 'image_path' => null]);
        // Same name, different unit.
        $this->bulletin(['commodity_name' => 'Salt', 'unit' => '1kg', 'commodity_key' => null, 'image_path' => 'commodity_images/salt-1kg.webp']);
        $this->bulletin(['commodity_name' => 'Salt', 'unit' => '250g', 'commodity_key' => null, 'image_path' => null]);

        $catalog = collect($this->getJson('/api/public/commodities')->assertOk()->json('data'))
            ->mapWithKeys(fn (array $row) => [$row['commodity_name'].'|'.$row['category'].'|'.$row['unit'] => $row['image_path']]);

        $this->assertSame(self::ASSETS.'/commodity_images/roasted.webp', $catalog['Roasted Coffee (100g)|Coffee|100g']);
        $this->assertSame(self::ASSETS.'/commodity_images/corned.webp', $catalog['Argentina (150g)|Corned Beef|150g']);
        $this->assertNull($catalog['Argentina (150g)|Meat Loaf|150g']);
        $this->assertNull($catalog['Salt||250g']);

        $this->actingAsManager();
        $this->postJson('/api/admin/srp/batch-revisions', [
            'effective_date' => '2026-08-01', 'source_reference' => 'BATCH', 'change_reason' => 'Adjustment',
            'updates' => [['id' => $meatLoaf->id, 'baseline_price' => 30]],
        ])->assertCreated();
        $this->assertNull(SrpBulletin::where('commodity_key', 'argentina-150g-meat-loaf')->latest('id')->value('image_path'));
    }

    public function test_every_comparison_product_and_scan_candidate_carries_the_image_url(): void
    {
        $store = Store::create([
            'store_name' => 'Compare Mart', 'address' => 'San Jose', 'latitude' => 10.74, 'longitude' => 121.94,
            'is_active' => true, 'is_verified' => true, 'is_public' => true,
        ]);
        $product = $this->bulletin(['commodity_name' => 'Photo Sardines', 'unit' => '155g', 'commodity_key' => 'photo-sardines-155g',
            'image_path' => 'commodity_images/sardines.webp', 'baseline_price' => 21.5]);
        $url = self::ASSETS.'/commodity_images/sardines.webp';

        $this->postJson('/api/public/compare-price', ['store_id' => $store->id, 'srp_bulletin_id' => $product->id, 'displayed_price' => 22])
            ->assertOk()->assertJsonPath('data.product.image_path', $url);

        $scanId = 'scan_'.Str::uuid();
        app(ScanSessionRepository::class)->put($scanId, [
            'scan_id' => $scanId, 'scan_uuid' => (string) Str::uuid(), 'store_id' => $store->id,
            'ocr_status' => 'OCR_PRODUCT_AND_PRICE_DETECTED', 'allowed_candidate_product_ids' => [$product->id],
            'manual_product_ids' => [], 'detected_price_centavos' => 2350, 'detected_price_string' => '23.50',
            'detected_price_source' => 'OCR', 'product_source' => 'OCR', 'consumed_state' => false,
        ]);
        $this->postJson('/api/public/scan-tag/compare', [
            'scan_id' => $scanId, 'store_id' => $store->id, 'product_id' => $product->id,
            'displayed_price' => '23.50', 'product_source' => 'OCR', 'price_source' => 'USER_CONFIRMED',
        ])->assertOk()->assertJsonPath('data.product.image_path', $url);

        $this->post('/api/public/scan-tag', ['store_id' => $store->id, 'manual_query' => 'Photo Sardines', 'image' => UploadedFile::fake()->image('tag.jpg')], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.candidates.0.image_path', $url);
    }
}
