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

        // 5. Seed some sample stores
        Store::updateOrCreate(
            ['dti_sec_number' => 'SEC-CS202612345'],
            [
                'store_name' => 'San Jose Public Market - Stall 12',
                'owner_name' => 'Maria Clara',
                'latitude' => 10.742400,
                'longitude' => 121.940600,
                'address' => 'Stall 12, Public Market, San Jose de Buenavista, Antique',
                'recidivism_index' => 0,
            ]
        );

        Store::updateOrCreate(
            ['dti_sec_number' => 'SEC-CS202654321'],
            [
                'store_name' => 'Buenavista Grocery Mart',
                'owner_name' => 'Jose Rizal',
                'latitude' => 10.746500,
                'longitude' => 121.943000,
                'address' => 'Buenavista Street, San Jose de Buenavista, Antique',
                'recidivism_index' => 1,
            ]
        );

        // 6. Seed some SRP bulletins
        SrpBulletin::updateOrCreate(
            ['commodity_name' => 'Regular Milled Rice'],
            [
                'baseline_price' => 38.00,
                'effective_date' => '2026-07-15',
                'is_active' => true,
            ]
        );

        SrpBulletin::updateOrCreate(
            ['commodity_name' => 'Refined White Sugar'],
            [
                'baseline_price' => 85.00,
                'effective_date' => '2026-07-15',
                'is_active' => true,
            ]
        );

        SrpBulletin::updateOrCreate(
            ['commodity_name' => 'Red Onion (Local)'],
            [
                'baseline_price' => 140.00,
                'effective_date' => '2026-07-15',
                'is_active' => true,
            ]
        );
    }
}
