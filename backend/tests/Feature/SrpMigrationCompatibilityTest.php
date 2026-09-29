<?php

namespace Tests\Feature;

use App\Models\ItemAlias;
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

    public function test_uniqueness_migration_stops_without_changing_existing_collisions(): void
    {
        $migration = require database_path('migrations/2026_09_27_000001_prevent_duplicate_srp_versions.php');
        $migration->down();
        $row = [
            'commodity_name' => 'Rice', 'commodity_key' => 'rice-1kg',
            'baseline_price' => 40, 'effective_date' => '2026-09-27', 'is_active' => true,
        ];
        SrpBulletin::create($row);
        SrpBulletin::create($row);

        try {
            $migration->up();
            $this->fail('Migration should stop before applying the index.');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('Review them', $exception->getMessage());
            $this->assertSame(2, SrpBulletin::where('commodity_key', 'rice-1kg')->count());
        }
    }

    public function test_rekey_migration_separates_categories_sharing_a_key_so_the_unique_index_applies(): void
    {
        $unique = require database_path('migrations/2026_09_27_000001_prevent_duplicate_srp_versions.php');
        $unique->down();
        $row = fn (string $category, float $price, string $date = '2026-05-11') => SrpBulletin::create([
            'commodity_name' => 'Argentina (150g)', 'unit' => '150g', 'category' => $category, 'commodity_key' => 'argentina-150g',
            'baseline_price' => $price, 'effective_date' => $date, 'is_active' => true,
        ]);
        $meatLoaf = $row('Meat Loaf', 23.75);
        $cornedBeef = $row('Corned Beef', 36.75);
        $beefLoaf = $row('Beef Loaf', 22.00);
        $laterMeatLoaf = $row('Meat Loaf', 24.00, '2026-06-01');
        ItemAlias::create(['alias_name' => 'ARGENTINA BEEF LOAF', 'srp_bulletin_id' => $beefLoaf->id]);

        (require database_path('migrations/2026_09_26_000001_rekey_srp_commodities_sharing_a_key.php'))->up();

        $this->assertSame('argentina-150g', $beefLoaf->fresh()->commodity_key);
        $this->assertSame('argentina-150g-meat-loaf', $meatLoaf->fresh()->commodity_key);
        $this->assertSame('argentina-150g-meat-loaf', $laterMeatLoaf->fresh()->commodity_key);
        $this->assertSame('argentina-150g-corned-beef', $cornedBeef->fresh()->commodity_key);
        $unique->up();
        $this->assertSame(4, SrpBulletin::count());
    }
}
