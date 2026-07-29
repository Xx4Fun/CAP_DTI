<?php

namespace Tests\Feature;

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
}
