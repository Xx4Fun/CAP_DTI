<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/*
 * DTI lists some brand + size pairs in several categories (Argentina 150g corned beef, meat loaf and
 * beef loaf). Their name + unit keys collided, which blocks the unique version index that follows.
 * The category with the most linked records keeps the plain key; every other category gets the key
 * SrpCatalogService::commodityKey() now assigns: "<key>-<category slug>".
 * regulatory_price_records/candidates store the key as text and stay with the keeper. Checked in
 * production 2026-09-30: the only such row (candidate 217, refresh-500ml) is sourced from the keeper.
 */
return new class extends Migration
{
    private const REFERENCES = [
        'item_aliases' => 'srp_bulletin_id',
        'temporal_inspections' => 'srp_id',
        'regulatory_findings' => 'srp_bulletin_id',
        'consumer_report_items' => 'srp_id',
        'monitoring_record_items' => 'srp_id',
    ];

    public function up(): void
    {
        $norm = fn (?string $value) => strtolower(trim((string) $value));
        $keys = DB::table('srp_bulletins')->whereNotNull('commodity_key')->whereNotNull('category')->where('category', '!=', '')
            ->select('commodity_key')->groupBy('commodity_key')
            ->havingRaw('COUNT(DISTINCT LOWER(TRIM(category))) > 1')->pluck('commodity_key');

        DB::transaction(function () use ($keys, $norm) {
            foreach ($keys as $key) {
                $rows = DB::table('srp_bulletins')->where('commodity_key', $key)->orderBy('id')->get(['id', 'category']);
                $byCategory = $rows->filter(fn ($row) => $norm($row->category) !== '')->groupBy(fn ($row) => $norm($row->category));
                $keeper = $byCategory->sortByDesc(fn ($group) => $this->references($group->pluck('id')->all()))->keys()->first();

                foreach ($byCategory->except($keeper) as $group) {
                    $newKey = $key.'-'.Str::slug($group->first()->category);
                    if (DB::table('srp_bulletins')->where('commodity_key', $newKey)->exists()) {
                        throw new RuntimeException("SRP commodity key {$newKey} already exists; resolve it before re-keying {$key}.");
                    }
                    DB::table('srp_bulletins')->whereIn('id', $group->pluck('id'))->update(['commodity_key' => $newKey]);
                }
            }
        });
    }

    public function down(): void
    {
        // Irreversible: merging the keys again would recreate the collisions.
    }

    private function references(array $ids): int
    {
        $count = 0;
        foreach (self::REFERENCES as $table => $column) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, $column)) {
                $count += DB::table($table)->whereIn($column, $ids)->count();
            }
        }

        return $count;
    }
};
