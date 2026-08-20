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

        // 5. Seed verified stores for San Jose de Buenavista, Antique
        Store::updateOrCreate(
            ['dti_sec_number' => 'SEC-CS202612345'],
            [
                'store_name' => 'Super Metro San Jose',
                'owner_name' => 'Metro Retail Stores Group Inc.',
                'latitude' => 10.742400,
                'longitude' => 121.940600,
                'address' => 'Tradetown, San Jose de Buenavista',
                'image_path' => '/stores/store.webp',
                'recidivism_index' => 0,
                'is_active' => true,
                'is_verified' => true,
                'is_public' => true,
            ]
        );

        Store::updateOrCreate(
            ['dti_sec_number' => 'SEC-CS202654321'],
            [
                'store_name' => 'Gaisano Grand Antique',
                'owner_name' => 'Gaisano Grand Malls Inc.',
                'latitude' => 10.745000,
                'longitude' => 121.942000,
                'address' => 'San Jose de Buenavista',
                'image_path' => '/stores/gaisano-grand.jpg',
                'recidivism_index' => 0,
                'is_active' => true,
                'is_verified' => true,
                'is_public' => true,
            ]
        );

        Store::updateOrCreate(
            ['dti_sec_number' => 'SEC-CS202699999'],
            [
                'store_name' => 'Robinsons Superstore Antique',
                'owner_name' => 'Robinsons Retail Holdings Inc.',
                'latitude' => 10.741000,
                'longitude' => 121.938000,
                'address' => 'Atabay, San Jose de Buenavista',
                'image_path' => '/stores/robinsons.jpg',
                'recidivism_index' => 0,
                'is_active' => true,
                'is_verified' => true,
                'is_public' => true,
            ]
        );

        // 6. Seed official DTI SRP Master List
        $this->call(SrpMasterListSeeder::class);
    }
}
