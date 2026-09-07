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
        Store::where('store_name', 'Super Metro San Jose')->delete();

        $stores = [
            ['store_name' => 'Robinsons Supermarket Corp.', 'dti_sec_number' => 'SEC-CS202699999', 'owner_name' => 'Robinsons Supermarket Corporation', 'address' => 'San, Angel, San Jose, Antique', 'latitude' => 10.73578000, 'longitude' => 121.95191000, 'image_path' => '/stores/robinsons.jpg'],
            ['store_name' => 'Gaisano Grand Mall', 'dti_sec_number' => 'SEC-CS202654321', 'owner_name' => 'Gaisano Grand Malls Inc.', 'address' => 'Bagumbayan Bridge, San Jose, Antique', 'latitude' => 10.74329000, 'longitude' => 121.94845000, 'image_path' => '/stores/gaisano-grand.jpg'],
            ['store_name' => 'Puregold Price Club Incorporated', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'T.A. Fornier Street, San Jose de Buenavista, Antique', 'latitude' => 10.74650000, 'longitude' => 121.94250000, 'image_path' => null],
            ['store_name' => "Licanda's Retail Chain Branch 2 (Licandas OPC 1)", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Gov. Villavert St. San Jose, Antique', 'latitude' => 10.74450000, 'longitude' => 121.94150000, 'image_path' => null],
            ['store_name' => 'Merrymart Consumer Corp.', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'City Mall, San Jose Antique', 'latitude' => 10.74350000, 'longitude' => 121.94110000, 'image_path' => null],
            ['store_name' => 'Antique City Square', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier Street, San Jose, Antique', 'latitude' => 10.74550000, 'longitude' => 121.94300000, 'image_path' => null],
            ['store_name' => 'Unitop General Merchandise', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias A. Fornier Street, San Jose, Antique', 'latitude' => 10.74600000, 'longitude' => 121.94280000, 'image_path' => null],
            ['store_name' => 'HARO MART', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe, San Jose Antique', 'latitude' => 10.76350000, 'longitude' => 121.93150000, 'image_path' => null],
            ['store_name' => 'CPT Mart- Antique Branch', 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Tobias Fornier St., San Jose, Antique', 'latitude' => 10.74700000, 'longitude' => 121.94220000, 'image_path' => null],
            ['store_name' => "Licanda's Retail Chain Branch 1", 'dti_sec_number' => null, 'owner_name' => null, 'address' => 'Funda-Dalipe, San Jose Antique', 'latitude' => 10.76420000, 'longitude' => 121.93100000, 'image_path' => null],
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
