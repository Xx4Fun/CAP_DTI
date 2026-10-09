<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ImportStorePhotosTest extends TestCase
{
    use RefreshDatabase;

    private const PHOTOS = [
        'CPT Mart- Antique Branch' => 'cptmart.jpg',
        'HARO MART' => 'haromart.jpg',
        'Puregold Price Club Incorporated' => 'puregold.jpg',
        'Unitop General Merchandise' => 'unitop.jpg',
        'Antique City Square' => 'citysquare.jpg',
    ];

    private string $fixtureRoot;
    private array $before;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('filesystems.commodity_images_disk', 'store-photos-test');
        Storage::fake('store-photos-test', ['url' => 'https://assets.example.test']);
        $this->fixtureRoot = storage_path('framework/testing/store-photos-'.bin2hex(random_bytes(8)));
        File::ensureDirectoryExists($this->fixtureRoot.'/seeders/store-source-images');
        foreach (self::PHOTOS as $name => $file) {
            File::copy(database_path('seeders/store-source-images/'.$file), $this->fixtureRoot.'/seeders/store-source-images/'.$file);
            Store::create([
                'store_name' => $name, 'address' => 'Existing address', 'owner_name' => 'Existing owner',
                'latitude' => 10.74, 'longitude' => 121.94, 'recidivism_index' => 3,
                'is_active' => true, 'is_verified' => true, 'is_public' => true,
            ]);
        }
        Store::create([
            'store_name' => 'Unrelated Store', 'address' => 'Other address', 'latitude' => 10.75,
            'longitude' => 121.95, 'image_path' => 'store_images/existing.webp',
        ]);
        $this->before = Store::orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all();
        $this->app->useDatabasePath($this->fixtureRoot);
    }

    protected function tearDown(): void
    {
        if (isset($this->fixtureRoot)) File::deleteDirectory($this->fixtureRoot);
        parent::tearDown();
    }

    public function test_preview_leaves_database_and_storage_unchanged(): void
    {
        $this->artisan('stores:import-photos')->expectsOutputToContain('Preview only')->assertSuccessful();
        $this->assertSame($this->before, Store::orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all());
        $this->assertSame([], Storage::disk('store-photos-test')->allFiles());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_apply_changes_only_photo_fields_and_is_idempotent(): void
    {
        $this->artisan('stores:import-photos', ['--apply' => true])->assertSuccessful();
        foreach ($this->before as $attributes) {
            $store = Store::findOrFail($attributes['id']);
            $file = self::PHOTOS[$store->store_name] ?? null;
            if ($file) {
                $key = 'store_images/'.$file;
                $this->assertSame($key, $store->getRawOriginal('image_path'));
                $this->assertSame(file_get_contents($this->source($file)), Storage::disk('store-photos-test')->get($key));
                $audit = AuditEvent::where('subject_id', $store->id)->where('action', 'store.photo_imported')->sole();
                $this->assertSame($key, $audit->metadata['image_path']);
                $this->assertSame(hash_file('sha256', $this->source($file)), $audit->metadata['sha256']);
            }
            unset($attributes['image_path'], $attributes['updated_at']);
            $actual = $store->getAttributes();
            unset($actual['image_path'], $actual['updated_at']);
            $this->assertSame($attributes, $actual);
        }
        $after = Store::orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all();
        $this->artisan('stores:import-photos', ['--apply' => true])->assertSuccessful();
        $this->assertSame($after, Store::orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all());
        $this->assertDatabaseCount('audit_events', 5);
        $this->assertCount(5, Storage::disk('store-photos-test')->allFiles());
    }

    #[DataProvider('invalidPreflightCases')]
    public function test_invalid_preflight_writes_nothing(string $condition): void
    {
        $store = Store::where('store_name', 'CPT Mart- Antique Branch')->sole();
        match ($condition) {
            'missing store' => $store->delete(),
            'duplicate store' => $store->replicate()->save(),
            'existing photo' => $store->update(['image_path' => 'store_images/custom.jpg']),
            'missing source' => File::delete($this->source('unitop.jpg')),
            'invalid image' => File::put($this->source('unitop.jpg'), 'not a photo'),
            'oversized image' => File::append($this->source('unitop.jpg'), str_repeat('x', 2 * 1024 * 1024)),
            'conflicting object' => Storage::disk('store-photos-test')->put('store_images/unitop.jpg', 'another image'),
            'relative URL' => Storage::fake('store-photos-test', ['url' => '/storage']),
        };
        $before = Store::orderBy('id')->get()->map(fn ($row) => $row->getAttributes())->all();
        $files = Storage::disk('store-photos-test')->allFiles();
        $this->artisan('stores:import-photos', ['--apply' => true])->assertFailed();
        $this->assertSame($before, Store::orderBy('id')->get()->map(fn ($row) => $row->getAttributes())->all());
        $this->assertSame($files, Storage::disk('store-photos-test')->allFiles());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public static function invalidPreflightCases(): array
    {
        return array_map(fn ($case) => [$case], [
            'missing store', 'duplicate store', 'existing photo', 'missing source',
            'invalid image', 'oversized image', 'conflicting object', 'relative URL',
        ]);
    }

    public function test_storage_failure_attaches_no_photos(): void
    {
        $disk = \Mockery::mock(Storage::disk('store-photos-test'))->makePartial();
        $disk->shouldReceive('put')->andReturn(false);
        Storage::shouldReceive('disk')->with('store-photos-test')->andReturn($disk);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertFailed();
        $this->assertSame(5, Store::whereIn('store_name', array_keys(self::PHOTOS))->whereNull('image_path')->count());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_object_created_after_preflight_is_never_overwritten(): void
    {
        $realDisk = Storage::disk('store-photos-test');
        $disk = \Mockery::mock($realDisk)->makePartial();
        $checks = 0;
        $disk->shouldReceive('exists')->with('store_images/cptmart.jpg')->andReturnUsing(function () use ($realDisk, &$checks) {
            if (++$checks === 2) $realDisk->put('store_images/cptmart.jpg', 'new conflicting object');
            return $realDisk->exists('store_images/cptmart.jpg');
        });
        Storage::shouldReceive('disk')->with('store-photos-test')->andReturn($disk);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertFailed();
        $this->assertSame('new conflicting object', $realDisk->get('store_images/cptmart.jpg'));
        $this->assertSame(5, Store::whereIn('store_name', array_keys(self::PHOTOS))->whereNull('image_path')->count());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_failed_readback_attaches_no_photos(): void
    {
        $disk = \Mockery::mock(Storage::disk('store-photos-test'))->makePartial();
        $disk->shouldReceive('get')->andReturn('corrupted upload');
        Storage::shouldReceive('disk')->with('store-photos-test')->andReturn($disk);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertFailed();
        $this->assertSame(5, Store::whereIn('store_name', array_keys(self::PHOTOS))->whereNull('image_path')->count());
        $this->assertDatabaseCount('audit_events', 0);
    }

    public function test_audit_failure_rolls_back_all_photo_assignments_and_can_be_retried(): void
    {
        $events = 0;
        $listener = function () use (&$events) {
            if (++$events === 2) throw new \RuntimeException('Simulated audit failure');
        };
        Event::listen('eloquent.creating: '.AuditEvent::class, $listener);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertFailed();
        $this->assertSame($this->before, Store::orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all());
        $this->assertDatabaseCount('audit_events', 0);
        $this->assertCount(5, Storage::disk('store-photos-test')->allFiles());
        Event::forget('eloquent.creating: '.AuditEvent::class);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertSuccessful();
        $this->assertDatabaseCount('audit_events', 5);
    }

    public function test_city_square_is_added_without_changing_the_previous_four_assignments(): void
    {
        foreach (self::PHOTOS as $name => $file) {
            if ($file === 'citysquare.jpg') continue;
            Store::where('store_name', $name)->update(['image_path' => 'store_images/'.$file]);
            Storage::disk('store-photos-test')->put('store_images/'.$file, file_get_contents($this->source($file)));
        }
        $previous = Store::where('store_name', '!=', 'Antique City Square')->orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all();
        $this->artisan('stores:import-photos', ['--apply' => true])->expectsOutputToContain('1 establishment photos attached')->assertSuccessful();
        $this->assertSame($previous, Store::where('store_name', '!=', 'Antique City Square')->orderBy('id')->get()->map(fn ($store) => $store->getAttributes())->all());
        $this->assertDatabaseHas('stores', ['store_name' => 'Antique City Square', 'image_path' => 'store_images/citysquare.jpg']);
        $this->assertDatabaseCount('audit_events', 1);
        $this->artisan('stores:import-photos', ['--apply' => true])->assertSuccessful();
        $this->assertDatabaseCount('audit_events', 1);
    }

    public function test_imported_photos_reach_all_roles_without_exposing_unlinked_vendor_stores(): void
    {
        $this->artisan('stores:import-photos', ['--apply' => true])->assertSuccessful();
        $expected = collect(self::PHOTOS)->map(fn ($file) => 'https://assets.example.test/store_images/'.$file)->sortKeys()->all();
        $paths = fn ($stores) => collect($stores)->mapWithKeys(fn ($store) => [$store['store_name'] => $store['image_path']])->only(array_keys(self::PHOTOS))->sortKeys()->all();
        $this->assertSame($expected, $paths($this->getJson('/api/public/establishments')->assertOk()->json('data')));
        $officer = User::create(['name' => 'Officer', 'email' => 'photos-field@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $token = $this->postJson('/api/field/login', ['email' => $officer->email, 'password' => 'password'])->assertOk()->json('token');
        $this->assertSame($expected, $paths($this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.stores')));
        Sanctum::actingAs(User::create(['name' => 'Manager', 'email' => 'photos-admin@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']), ['dti-admin']);
        $this->assertSame($expected, $paths($this->getJson('/api/admin/stores')->assertOk()->json('data')));
        $vendor = User::create(['name' => 'Vendor', 'email' => 'photos-vendor@dti.test', 'password' => 'password', 'role' => 'vendor']);
        Store::where('store_name', 'CPT Mart- Antique Branch')->update(['vendor_user_id' => $vendor->id]);
        $this->app['auth']->forgetGuards();
        $vendorToken = $vendor->createToken(\App\Http\Controllers\Vendor\VendorAuthController::TOKEN_NAME, ['vendor-portal'])->plainTextToken;
        $this->withToken($vendorToken)->getJson('/api/vendor/overview')->assertOk()->assertJsonCount(1, 'data.stores')
            ->assertJsonPath('data.stores.0.image_path', 'https://assets.example.test/store_images/cptmart.jpg');
    }

    private function source(string $file): string
    {
        return $this->fixtureRoot.'/seeders/store-source-images/'.$file;
    }
}
