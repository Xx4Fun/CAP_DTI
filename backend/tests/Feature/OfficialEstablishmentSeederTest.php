<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\OfficialEstablishmentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OfficialEstablishmentSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_reconciles_the_official_list_without_replacing_existing_stores(): void
    {
        $metro = Store::create([
            'dti_sec_number' => 'SEC-CS202612345', 'store_name' => 'Super Metro San Jose',
            'owner_name' => 'Metro Retail Stores Group Inc.', 'address' => 'Tradetown, San Jose de Buenavista',
            'latitude' => 10.7424, 'longitude' => 121.9406, 'image_path' => '/stores/store.webp',
            'is_active' => true, 'is_verified' => true, 'is_public' => true,
        ]);
        $gaisano = Store::create([
            'dti_sec_number' => 'SEC-CS202654321', 'store_name' => 'Gaisano Grand Antique',
            'owner_name' => 'Gaisano Grand Malls Inc.', 'address' => 'San Jose de Buenavista',
            'latitude' => 10.745, 'longitude' => 121.942, 'image_path' => '/stores/gaisano-grand.jpg',
            'is_active' => true, 'is_verified' => true, 'is_public' => true,
        ]);
        $robinsons = Store::create([
            'dti_sec_number' => 'SEC-CS202699999', 'store_name' => 'Robinsons Superstore Antique',
            'owner_name' => 'Robinsons Retail Holdings Inc.', 'address' => 'Atabay, San Jose de Buenavista',
            'latitude' => 10.741, 'longitude' => 121.938, 'image_path' => '/stores/robinsons.jpg',
            'is_active' => true, 'is_verified' => true, 'is_public' => true,
        ]);

        $this->assertTrue(class_exists(OfficialEstablishmentSeeder::class));
        $this->seed(OfficialEstablishmentSeeder::class);

        $this->assertDatabaseCount('stores', 11);
        $this->assertSame(10, Store::query()->where('is_active', true)->where('is_verified', true)->where('is_public', true)->count());
        $this->assertDatabaseHas('stores', [
            'id' => $metro->id, 'store_name' => 'Super Metro San Jose', 'is_active' => false, 'is_public' => false,
        ]);
        $this->assertDatabaseHas('stores', [
            'id' => $gaisano->id, 'store_name' => 'Gaisano Grand Mall', 'dti_sec_number' => null,
            'owner_name' => null, 'address' => 'Bagumbayan Bridge',
        ]);
        $this->assertDatabaseHas('stores', [
            'id' => $robinsons->id, 'store_name' => 'Robinsons Supermarket Corp.', 'dti_sec_number' => null,
            'owner_name' => 'Robinsons Supermarket Corporation', 'address' => 'San Angel',
        ]);
        $this->assertDatabaseHas('stores', [
            'store_name' => 'Puregold Price Club Incorporated', 'image_path' => null,
        ]);
        $this->assertDatabaseHas('stores', ['store_name' => 'Gaisano Grand Mall', 'image_path' => 'store_images/gaisano-grand.webp']);
        $this->assertDatabaseHas('stores', ['store_name' => 'Robinsons Supermarket Corp.', 'image_path' => 'store_images/robinsons.webp']);
        $this->assertDatabaseHas('stores', ['store_name' => 'Merrymart Consumer Corp.', 'image_path' => 'store_images/merrymart.webp']);
        $this->assertDatabaseHas('stores', ['store_name' => "Licanda's Retail Chain Branch 1", 'image_path' => 'store_images/licandas-branch-1.webp']);
        $this->assertDatabaseHas('stores', ['store_name' => "Licanda's Retail Chain Branch 2 (Licandas OPC 1)", 'image_path' => 'store_images/licandas-branch-2.webp']);
        $this->assertSame(11, AuditEvent::query()->where('action', 'store.official_list_seeded')->count());

        $this->seed(OfficialEstablishmentSeeder::class);

        $this->assertDatabaseCount('stores', 11);
        $this->assertSame(11, AuditEvent::query()->where('action', 'store.official_list_seeded')->count());
    }

    public function test_assigned_photos_are_returned_by_public_field_and_admin_establishment_endpoints(): void
    {
        $this->seed(OfficialEstablishmentSeeder::class);
        $expected = [
            'Gaisano Grand Mall' => Storage::disk('public')->url('store_images/gaisano-grand.webp'),
            'Robinsons Supermarket Corp.' => Storage::disk('public')->url('store_images/robinsons.webp'),
            'Merrymart Consumer Corp.' => Storage::disk('public')->url('store_images/merrymart.webp'),
            "Licanda's Retail Chain Branch 1" => Storage::disk('public')->url('store_images/licandas-branch-1.webp'),
            "Licanda's Retail Chain Branch 2 (Licandas OPC 1)" => Storage::disk('public')->url('store_images/licandas-branch-2.webp'),
        ];
        ksort($expected);

        $paths = fn (array $stores) => collect($stores)->mapWithKeys(fn (array $store) => [$store['store_name'] => $store['image_path']])->only(array_keys($expected))->sortKeys()->all();
        $this->assertSame($expected, $paths($this->getJson('/api/public/establishments')->assertOk()->json('data')));

        $officer = User::create(['name' => 'Field Officer', 'email' => 'field-photos@dti.test', 'password' => 'password', 'role' => 'field_officer']);
        $token = $this->postJson('/api/field/login', ['email' => $officer->email, 'password' => 'password'])->assertOk()->json('token');
        $this->assertSame($expected, $paths($this->withToken($token)->getJson('/api/field/bootstrap')->assertOk()->json('data.stores')));

        Sanctum::actingAs(User::create(['name' => 'Manager', 'email' => 'manager-photos@dti.test', 'password' => 'password', 'role' => 'dti_evaluator']), ['dti-admin']);
        $this->assertSame($expected, $paths($this->getJson('/api/admin/monitoring-establishments?per_page=25')->assertOk()->json('data.establishments.data')));
    }
}
