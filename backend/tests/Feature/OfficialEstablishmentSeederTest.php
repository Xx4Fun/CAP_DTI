<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Store;
use Database\Seeders\OfficialEstablishmentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
            'store_name' => 'Puregold Price Club Incorporated', 'image_path' => '/stores/store.webp',
        ]);
        $this->assertSame(11, AuditEvent::query()->where('action', 'store.official_list_seeded')->count());

        $this->seed(OfficialEstablishmentSeeder::class);

        $this->assertDatabaseCount('stores', 11);
        $this->assertSame(11, AuditEvent::query()->where('action', 'store.official_list_seeded')->count());
    }
}
