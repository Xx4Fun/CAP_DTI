<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Store;
use App\Models\SrpBulletin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Seed DTI Officer
        User::updateOrCreate(
            ['email' => 'officer@dti.gov.ph'],
            [
                'name' => 'DTI Officer',
                'password' => Hash::make('password123'),
                'role' => 'field_officer',
            ]
        );

        // 2. Seed DTI Evaluator
        User::updateOrCreate(
            ['email' => 'evaluator@dti.gov.ph'],
            [
                'name' => 'DTI Evaluator',
                'password' => Hash::make('password123'),
                'role' => 'dti_evaluator',
            ]
        );

        // 3. Seed Vendor
        User::updateOrCreate(
            ['email' => 'vendor@grocery.com'],
            [
                'name' => 'Maria Clara',
                'password' => Hash::make('password123'),
                'role' => 'vendor',
            ]
        );

        // 4. Seed Consumer
        User::updateOrCreate(
            ['email' => 'consumer@price.gov.ph'],
            [
                'name' => 'Juan Dela Cruz',
                'password' => Hash::make('password123'),
                'role' => 'consumer',
            ]
        );

        // 5. Seed the official San Jose de Buenavista establishment list.
        Store::where('dti_sec_number', 'SEC-CS202654321')->update(['store_name' => 'Gaisano Grand Mall']);
        Store::where('dti_sec_number', 'SEC-CS202699999')->update(['store_name' => 'Robinsons Supermarket Corp.']);

        $stores = [
            ['store_name' => 'Super Metro San Jose', 'dti_sec_number' => 'SEC-CS202612345', 'owner_name' => 'Metro Retail Stores Group Inc.', 'address' => 'Tradetown, San Jose de Buenavista', 'latitude' => 10.74240000, 'longitude' => 121.94060000, 'image_path' => '/stores/store.webp', 'is_active' => false, 'is_public' => false],
            ['store_name' => 'Robinsons Supermarket Corp.', 'dti_sec_number' => null, 'owner_name' => 'Robinsons Supermarket Corporation', 'address' => 'San Angel', 'latitude' => 10.73577800, 'longitude' => 121.95190790, 'image_path' => '/stores/robinsons.jpg'],
            ['store_name' => 'Gaisano Grand Mall', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Bagumbayan Bridge', 'latitude' => 10.74350410, 'longitude' => 121.94868190, 'image_path' => '/stores/gaisano-grand.jpg'],
            ['store_name' => 'Puregold Price Club Incorporated', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'T.A. Fornier Street', 'latitude' => 10.74778260, 'longitude' => 121.94086580, 'image_path' => '/stores/store.webp'],
            ['store_name' => "Licanda's Retail Chain Branch 2 (Licandas OPC 1)", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Gov. Villavert St.', 'latitude' => 10.74420800, 'longitude' => 121.94285040, 'image_path' => '/stores/store.webp'],
            ['store_name' => 'Merrymart Consumer Corp.', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'City Mall', 'latitude' => 10.74450380, 'longitude' => 121.94194850, 'image_path' => '/stores/store.webp'],
            ['store_name' => 'Antique City Square', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier St.', 'latitude' => 10.75116050, 'longitude' => 121.94115710, 'image_path' => '/stores/store.webp'],
            ['store_name' => 'Unitop General Merchandise', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier St.', 'latitude' => 10.75098230, 'longitude' => 121.94072350, 'image_path' => '/stores/store.webp'],
            ['store_name' => 'HARO MART', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe', 'latitude' => 10.75787110, 'longitude' => 121.93553460, 'image_path' => '/stores/store.webp'],
            ['store_name' => 'CPT Mart - Antique Branch', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias Fornier St.', 'latitude' => 10.74536990, 'longitude' => 121.94139040, 'image_path' => '/stores/store.webp'],
            ['store_name' => "Licanda's Retail Chain Branch 1", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe', 'latitude' => 10.75341425, 'longitude' => 121.93786260, 'image_path' => '/stores/store.webp'],
        ];

        foreach ($stores as $store) {
            Store::updateOrCreate(['store_name' => $store['store_name']], array_merge([
                'recidivism_index' => 0,
                'is_active' => true,
                'is_verified' => true,
                'is_public' => true,
            ], $store));
        }

        // 6. Seed official DTI SRP Master List & Image Mappings
        $this->call(SrpMasterListSeeder::class);
        $this->call(CommodityImageSeeder::class);
    }
}
