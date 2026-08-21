<?php

namespace Database\Seeders;

use App\Models\SrpBulletin;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

class CommodityImageSeeder extends Seeder
{
    public function run(): void
    {
        $jsonPath = database_path('seeders/commodity_db_mappings.json');

        if (!File::exists($jsonPath)) {
            $this->command->error("commodity_db_mappings.json not found at {$jsonPath}");
            return;
        }

        $mappings = json_decode(File::get($jsonPath), true);

        if (!$mappings || !is_array($mappings)) {
            $this->command->error("Invalid JSON structure in commodity_db_mappings.json");
            return;
        }

        $updatedCount = 0;
        $unmatched = [];

        foreach ($mappings as $map) {
            $dbPath = $map['dbPath'] ?? null;
            $commodityName = $map['commodityName'] ?? null;
            $matchedItemName = $map['matchedItemName'] ?? null;
            $category = $map['category'] ?? null;
            $unit = $map['unit'] ?? null;

            if (!$dbPath) {
                continue;
            }

            // 1. Direct match by exact commodity_name
            $bulletin = SrpBulletin::where('commodity_name', $commodityName)->first();

            // 2. Try matching by category + unit + brand
            if (!$bulletin && $category && $matchedItemName) {
                $bulletin = SrpBulletin::where('category', $category)
                    ->where('commodity_name', 'ILIKE', "%{$matchedItemName}%")
                    ->first();
            }

            // 3. Try matching by unit + category
            if (!$bulletin && $category && $unit) {
                $bulletin = SrpBulletin::where('category', $category)
                    ->where(function ($q) use ($matchedItemName, $unit) {
                        $q->where('unit', $unit)
                          ->orWhere('unit', strtolower($unit))
                          ->orWhere('unit', strtoupper($unit))
                          ->orWhere('unit', str_ireplace('ml', 'mL', $unit));
                    })
                    ->where(function ($q) use ($matchedItemName) {
                        $firstWord = explode(' ', trim($matchedItemName))[0];
                        $q->where('commodity_name', 'ILIKE', "%{$firstWord}%");
                    })
                    ->first();
            }

            // 4. Try matching just by item_name + unit
            if (!$bulletin && $matchedItemName) {
                $bulletin = SrpBulletin::where('commodity_name', 'ILIKE', "%{$matchedItemName}%")
                    ->when($unit, function ($q) use ($unit) {
                        $q->where(function ($sub) use ($unit) {
                            $sub->where('unit', $unit)
                                ->orWhere('unit', strtolower($unit))
                                ->orWhere('unit', strtoupper($unit))
                                ->orWhere('unit', str_ireplace('ml', 'mL', $unit));
                        });
                    })
                    ->first();
            }

            if ($bulletin) {
                $bulletin->update(['image_path' => $dbPath]);
                $updatedCount++;
            } else {
                $unmatched[] = $map['originalImage'] . " (Name: {$commodityName}, Cat: {$category}, Unit: {$unit})";
            }
        }

        $this->command->info("Successfully linked {$updatedCount} commodity images in srp_bulletins.");
        if (!empty($unmatched)) {
            $this->command->warn("Unmatched items (" . count($unmatched) . "): \n" . implode("\n", $unmatched));
        }
    }
}
