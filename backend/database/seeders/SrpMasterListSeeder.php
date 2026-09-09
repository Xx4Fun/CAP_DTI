<?php

namespace Database\Seeders;

use App\Models\ItemAlias;
use App\Models\SrpBulletin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;

class SrpMasterListSeeder extends Seeder
{
    /**
     * Seed the official DTI SRP Master List into the database.
     */
    public function run(): void
    {
        $jsonPath = base_path('../DTI_SRP_Master_List_2026-05-11.json');

        if (! File::exists($jsonPath)) {
            $jsonPath = base_path('DTI_SRP_Master_List_2026-05-11.json');
        }

        if (! File::exists($jsonPath)) {
            $this->command->error("DTI_SRP_Master_List_2026-05-11.json not found at {$jsonPath}");

            return;
        }

        $jsonContent = File::get($jsonPath);
        $data = json_decode($jsonContent, true);

        if (! $data || ! isset($data['items'])) {
            $this->command->error('Invalid JSON structure in DTI_SRP_Master_List_2026-05-11.json');

            return;
        }

        $effectiveDate = $data['metadata']['effective_date'] ?? '2026-05-11';

        // Non-destructive update: preserve existing images and records
        $count = 0;

        foreach ($data['items'] as $item) {
            $itemName = trim($item['item_name'] ?? '');
            $unit = trim($item['unit'] ?? '');
            $category = trim($item['category'] ?? '');
            $classification = trim($item['regulatory_classification'] ?? 'BASIC_NECESSITY');
            $srp = (float) ($item['srp'] ?? 0.00);
            $freezeApplicable = (bool) ($item['price_freeze_applicable'] ?? false);
            $freezeTreatment = trim($item['price_freeze_treatment'] ?? '');

            if (empty($itemName)) {
                continue;
            }

            // Build clean, concise commodity display name
            $commodityName = $itemName;
            if (! empty($unit) && ! str_contains($itemName, $unit)) {
                $commodityName = "{$itemName} ({$unit})";
            }

            // Check if record exists to preserve any attached image_path
            $existing = SrpBulletin::where('commodity_name', $commodityName)->first();
            $commodityKey = $existing?->commodity_key ?: Str::slug(trim($itemName.' '.$unit));
            if (! $existing?->commodity_key) {
                $collision = SrpBulletin::query()->where('commodity_key', $commodityKey)->get()
                    ->first(fn ($row) => $row->commodity_name !== $commodityName || $row->unit !== $unit);
                if ($collision) {
                    throw new RuntimeException("Derived commodity_key collision '{$commodityKey}' between '{$commodityName}' and '{$collision->commodity_name}'.");
                }
            }

            $attributes = [
                'category' => $category,
                'unit' => $unit,
                'regulatory_classification' => $classification,
                'baseline_price' => $srp,
                'effective_date' => $effectiveDate,
                'is_active' => true,
                'price_freeze_applicable' => $freezeApplicable,
                'price_freeze_treatment' => $freezeTreatment,
                'commodity_key' => $commodityKey,
            ];

            // Preserve existing image_path if no new one is provided in JSON
            if (isset($item['image_path']) && ! empty($item['image_path'])) {
                $attributes['image_path'] = $item['image_path'];
            } elseif ($existing && ! empty($existing->image_path)) {
                $attributes['image_path'] = $existing->image_path;
            }

            // Non-destructively create or update SrpBulletin record
            $bulletin = SrpBulletin::updateOrCreate(
                ['commodity_name' => $commodityName],
                $attributes
            );

            // Map plain item_name and full commodity_name as aliases for receipt OCR lookup
            ItemAlias::updateOrCreate(
                ['alias_name' => strtoupper($commodityName)],
                ['srp_bulletin_id' => $bulletin->id]
            );
            ItemAlias::updateOrCreate(
                ['alias_name' => strtoupper($itemName)],
                ['srp_bulletin_id' => $bulletin->id]
            );

            $count++;
        }

        $this->command->info("Successfully imported {$count} official DTI SRP items into srp_bulletins.");
    }
}
