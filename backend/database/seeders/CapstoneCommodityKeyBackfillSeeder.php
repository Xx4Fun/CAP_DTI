<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\SrpBulletin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class CapstoneCommodityKeyBackfillSeeder extends Seeder
{
    private const DATASET_VERSION = '2026-09-01-v1';

    public function run(): void
    {
        $bulletins = SrpBulletin::query()->orderBy('id')->get();
        $lineageKeys = [];

        foreach ($bulletins as $bulletin) {
            [$identity] = $this->identity($bulletin);
            if (filled($bulletin->commodity_key)) {
                if (isset($lineageKeys[$identity]) && $lineageKeys[$identity] !== $bulletin->commodity_key) {
                    throw new RuntimeException("Commodity identity {$identity} already has conflicting lineage keys.");
                }
                $lineageKeys[$identity] = $bulletin->commodity_key;
            }
        }

        $owners = [];
        $updates = [];
        foreach ($bulletins as $bulletin) {
            [$identity, $baseName, $unit] = $this->identity($bulletin);
            $key = filled($bulletin->commodity_key)
                ? $bulletin->commodity_key
                : ($lineageKeys[$identity] ?? Str::slug(trim($baseName.' '.$unit)));
            if (blank($key)) {
                throw new RuntimeException("Unable to derive commodity_key for SRP bulletin {$bulletin->id}.");
            }
            if (isset($owners[$key]) && $owners[$key] !== $identity) {
                throw new RuntimeException("Derived commodity_key collision '{$key}' between '{$owners[$key]}' and '{$identity}'.");
            }
            $owners[$key] = $identity;
            if (blank($bulletin->commodity_key)) {
                $updates[] = [$bulletin, $key];
            }
        }

        if ($updates === []) {
            $this->command?->info('Capstone commodity-key backfill already complete; no changes made.');

            return;
        }

        DB::transaction(function () use ($updates): void {
            foreach ($updates as [$bulletin, $key]) {
                $changed = SrpBulletin::query()->whereKey($bulletin->id)
                    ->where(fn ($query) => $query->whereNull('commodity_key')->orWhere('commodity_key', ''))
                    ->update(['commodity_key' => $key]);
                if ($changed !== 1) {
                    throw new RuntimeException("SRP bulletin {$bulletin->id} changed after backfill preflight.");
                }
                AuditEvent::create([
                    'action' => 'srp.capstone_commodity_key_backfilled',
                    'subject_type' => SrpBulletin::class,
                    'subject_id' => $bulletin->id,
                    'metadata' => [
                        'synthetic' => false,
                        'dataset_version' => self::DATASET_VERSION,
                        'commodity_name' => $bulletin->commodity_name,
                        'unit' => $bulletin->unit,
                        'commodity_key' => $key,
                    ],
                ]);
            }
        });

        $this->command?->info('Capstone commodity-key backfill created. '.json_encode([
            'dataset_version' => self::DATASET_VERSION,
            'updated_count' => count($updates),
            'audit_count' => count($updates),
        ]));
    }

    private function identity(SrpBulletin $bulletin): array
    {
        $name = trim($bulletin->commodity_name);
        $unit = trim((string) $bulletin->unit);
        $suffix = " ({$unit})";
        $baseName = $unit !== '' && str_ends_with($name, $suffix)
            ? substr($name, 0, -strlen($suffix))
            : $name;

        return [strtolower($baseName."\0".$unit), $baseName, $unit];
    }
}
