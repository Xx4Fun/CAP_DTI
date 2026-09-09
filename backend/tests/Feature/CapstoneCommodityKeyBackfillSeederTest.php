<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\SrpBulletin;
use Database\Seeders\CapstoneCommodityKeyBackfillSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class CapstoneCommodityKeyBackfillSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_derives_stable_keys_without_duplicating_the_display_unit_and_preserves_lineage(): void
    {
        $derived = $this->bulletin('Absolute (1L)', '1L');
        $existing = $this->bulletin('Rice Premium (1 kg)', '1 kg', 'official-rice-key', '2026-01-01');
        $revision = $this->bulletin('Rice Premium (1 kg)', '1 kg', null, '2026-05-11');

        $this->seed(CapstoneCommodityKeyBackfillSeeder::class);

        $this->assertSame('absolute-1l', $derived->fresh()->commodity_key);
        $this->assertSame('official-rice-key', $existing->fresh()->commodity_key);
        $this->assertSame('official-rice-key', $revision->fresh()->commodity_key);
        $this->assertSame(2, AuditEvent::query()->where('action', 'srp.capstone_commodity_key_backfilled')->count());

        $this->seed(CapstoneCommodityKeyBackfillSeeder::class);
        $this->assertSame(2, AuditEvent::query()->where('action', 'srp.capstone_commodity_key_backfilled')->count());
    }

    public function test_a_derived_collision_aborts_without_partial_updates(): void
    {
        $first = $this->bulletin('A-B (box)', 'box');
        $second = $this->bulletin('A B (box)', 'box');

        try {
            $this->seed(CapstoneCommodityKeyBackfillSeeder::class);
            $this->fail('Expected the commodity identity collision to abort.');
        } catch (RuntimeException $exception) {
            $this->assertStringContainsString('collision', $exception->getMessage());
        }

        $this->assertNull($first->fresh()->commodity_key);
        $this->assertNull($second->fresh()->commodity_key);
        $this->assertDatabaseCount('audit_events', 0);
    }

    private function bulletin(string $name, string $unit, ?string $key = null, string $effectiveDate = '2026-05-11'): SrpBulletin
    {
        return SrpBulletin::create([
            'commodity_name' => $name,
            'unit' => $unit,
            'commodity_key' => $key,
            'baseline_price' => 25,
            'effective_date' => $effectiveDate,
            'is_active' => true,
            'price_freeze_applicable' => true,
            'source_reference' => 'DTI SRP 2026-05-11',
        ]);
    }
}
