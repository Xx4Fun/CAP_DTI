<?php

namespace Tests\Feature;

use App\Models\SrpBulletin;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SrpMigrationCompatibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_srp_enhancement_migration_tolerates_columns_already_present_from_schema_drift(): void
    {
        $migration = require database_path(
            'migrations/2026_07_24_000001_enhance_srp_bulletins_table.php'
        );

        $migration->up();

        $this->assertTrue(Schema::hasColumns('srp_bulletins', [
            'category',
            'unit',
            'regulatory_classification',
            'price_freeze_applicable',
            'price_freeze_treatment',
        ]));
    }

    public function test_new_srp_versions_cannot_share_a_key_and_date_but_legacy_null_keys_remain_valid(): void
    {
        $row = [
            'commodity_name' => 'Rice', 'commodity_key' => null,
            'baseline_price' => 40, 'effective_date' => '2026-09-27', 'is_active' => true,
        ];
        SrpBulletin::create($row);
        SrpBulletin::create($row);
        SrpBulletin::create([...$row, 'commodity_key' => 'rice-1kg']);

        $this->expectException(QueryException::class);
        SrpBulletin::create([...$row, 'commodity_key' => 'rice-1kg']);
    }
}
