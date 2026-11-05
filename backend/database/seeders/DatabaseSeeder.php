<?php

namespace Database\Seeders;

use App\Models\User;
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
        if (app()->environment('local', 'testing')) {
            $demoPassword = (string) env('SEED_DEMO_PASSWORD', 'password123');

            // 1. Seed DTI Officer
            User::updateOrCreate(
                ['email' => 'officer@dti.gov.ph'],
                [
                    'name' => 'DTI Officer',
                    'password' => Hash::make($demoPassword),
                    'role' => 'field_officer',
                ]
            );

            // 2. Seed DTI Evaluator
            User::updateOrCreate(
                ['email' => 'evaluator@dti.gov.ph'],
                [
                    'name' => 'DTI Evaluator',
                    'password' => Hash::make($demoPassword),
                    'role' => 'dti_evaluator',
                ]
            );

            // 3. Seed Vendor
            User::updateOrCreate(
                ['email' => 'vendor@grocery.com'],
                [
                    'name' => 'Maria Clara',
                    'password' => Hash::make($demoPassword),
                    'role' => 'vendor',
                ]
            );

            // 4. Seed Consumer
            User::updateOrCreate(
                ['email' => 'consumer@price.gov.ph'],
                [
                    'name' => 'Juan Dela Cruz',
                    'password' => Hash::make($demoPassword),
                    'role' => 'consumer',
                ]
            );
        }

        // 5. Reconcile the official San Jose de Buenavista establishment list.
        $this->call(OfficialEstablishmentSeeder::class);
        // Vendor store links are created only by accepted invitations (or the local-only VendorPwaVerificationSeeder fixture).

        // 6. Seed official DTI SRP Master List & Image Mappings
        $this->call(SrpMasterListSeeder::class);
        $this->call(CommodityImageSeeder::class);
    }
}
