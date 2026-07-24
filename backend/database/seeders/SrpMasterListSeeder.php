<?php

namespace Database\Seeders;

use App\Models\SrpBulletin;
use App\Models\ItemAlias;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;

class SrpMasterListSeeder extends Seeder
{
    /**
     * Seed the official DTI SRP Master List into the database.
     */
    public function run(): void
    {
        $jsonPath = base_path('../DTI_SRP_Master_List_2026-05-11.json');
        
        if (!File::exists($jsonPath)) {
            $jsonPath = base_path('DTI_SRP_Master_List_2026-05-11.json');
        }

        if (!File::exists($jsonPath)) {
            $this->command->error("DTI_SRP_Master_List_2026-05-11.json not found at {$jsonPath}");
            return;
        }

        $jsonContent = File::get($jsonPath);
        $data = json_decode($jsonContent, true);

        if (!$data || !isset($data['items'])) {
            $this->command->error("Invalid JSON structure in DTI_SRP_Master_List_2026-05-11.json");
            return;
        }

        $effectiveDate = $data['metadata']['effective_date'] ?? '2026-05-11';

        // Clear previous entries to ensure clean, unique dataset
        SrpBulletin::query()->delete();

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

            // Build clean, unique category-prefixed commodity display name
            $commodityName = $itemName;
            if (!empty($unit) && !str_contains($itemName, $unit)) {
                $commodityName = "{$itemName} ({$unit})";
            }
            if (!empty($category)) {
                $commodityName = "{$category} - {$commodityName}";
            }

            // Create SrpBulletin record
            $bulletin = SrpBulletin::create([
                'commodity_name' => $commodityName,
                'category' => $category,
                'unit' => $unit,
                'regulatory_classification' => $classification,
                'baseline_price' => $srp,
                'effective_date' => $effectiveDate,
                'is_active' => true,
                'price_freeze_applicable' => $freezeApplicable,
                'price_freeze_treatment' => $freezeTreatment,
            ]);

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
