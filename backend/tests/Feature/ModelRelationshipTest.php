<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\ItemAlias;
use App\Models\TemporalInspection;
use App\Models\CitizenTip;
use App\Models\LegalNotice;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ModelRelationshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_relationships_work_with_database(): void
    {
        // 1. Create Store
        $store = Store::create([
            'dti_sec_number' => 'SEC-123',
            'store_name' => 'Test Store',
            'owner_name' => 'Owner Name',
            'latitude' => 10.1234,
            'longitude' => 121.1234,
            'address' => 'Test Address',
            'recidivism_index' => 3,
        ]);

        // 2. Create Bulletin
        $bulletin = SrpBulletin::create([
            'commodity_name' => 'Sardines',
            'baseline_price' => 25.50,
            'effective_date' => '2026-07-17',
            'is_active' => true,
        ]);

        // 3. Create Alias
        $alias = ItemAlias::create([
            'alias_name' => 'NESC CLSSIC',
            'srp_bulletin_id' => $bulletin->id,
        ]);

        // 4. Create Inspection
        $inspection = TemporalInspection::create([
            'store_id' => $store->id,
            'srp_id' => $bulletin->id,
            'recorded_price' => 28.00,
            'is_flagged' => true,
            'inspection_timestamp' => now(),
        ]);

        // 5. Create Tip
        $tip = CitizenTip::create([
            'store_id' => $store->id,
            'extracted_text_json' => ['total' => 150.00],
            'image_hash_path' => 'vault/path.png',
            'status' => 'pending',
        ]);

        // 6. Create Notice
        $notice = LegalNotice::create([
            'store_id' => $store->id,
            'notice_type' => 'LOI',
            'pdf_file_path' => 'vault/notices/1.pdf',
            'status' => 'issued',
            'due_date_timestamp' => now()->addDays(2),
        ]);

        // 7. Create User with role
        $user = \App\Models\User::create([
            'name' => 'Test User',
            'email' => 'user@example.com',
            'password' => bcrypt('password'),
            'role' => 'dti_evaluator',
        ]);

        // Assert relationships and properties
        $this->assertEquals(3, $store->recidivism_index);
        $this->assertEquals('dti_evaluator', $user->role);

        $this->assertCount(1, $store->inspections);
        $this->assertEquals(28.00, $store->inspections->first()->recorded_price);
        $this->assertEquals($store->id, $inspection->store->id);
        $this->assertEquals($bulletin->id, $inspection->bulletin->id);

        $this->assertCount(1, $store->legalNotices);
        $this->assertEquals('LOI', $store->legalNotices->first()->notice_type);
        $this->assertEquals($store->id, $notice->store->id);

        $this->assertCount(1, $store->citizenTips);
        $this->assertEquals('pending', $store->citizenTips->first()->status);
        $this->assertEquals($store->id, $tip->store->id);

        $this->assertCount(1, $bulletin->aliases);
        $this->assertEquals('NESC CLSSIC', $bulletin->aliases->first()->alias_name);
        $this->assertEquals($bulletin->id, $alias->bulletin->id);
    }
}
