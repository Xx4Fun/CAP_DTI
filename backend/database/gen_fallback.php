<?php

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\File;

$jsonPath = base_path('../DTI_SRP_Master_List_2026-05-11.json');
$jsonContent = File::get($jsonPath);
$data = json_decode($jsonContent, true);

$items = [];
$index = 1;

foreach ($data['items'] as $item) {
    $itemName = trim($item['item_name'] ?? '');
    $unit = trim($item['unit'] ?? '');
    $category = trim($item['category'] ?? '');
    $classification = trim($item['regulatory_classification'] ?? 'BASIC_NECESSITY');
    $srp = (float) ($item['srp'] ?? 0.00);
    $freezeApplicable = !empty($item['price_freeze_applicable']);
    $freezeTreatment = trim($item['price_freeze_treatment'] ?? '');

    if (empty($itemName)) continue;

    $commodityName = $itemName;
    if (!empty($unit) && !str_contains($itemName, $unit)) {
        $commodityName = "{$itemName} ({$unit})";
    }
    if (!empty($category)) {
        $commodityName = "{$category} - {$commodityName}";
    }

    $items[] = [
        'id' => $index++,
        'commodity_name' => $commodityName,
        'category' => $category,
        'unit' => $unit,
        'regulatory_classification' => $classification,
        'baseline_price' => $srp,
        'effective_date' => '2026-05-11',
        'is_active' => true,
        'price_freeze_applicable' => $freezeApplicable,
        'price_freeze_treatment' => $freezeTreatment,
    ];
}

$tsContent = "import type { Commodity } from '../api/client';\n\nexport const fallbackCommodities: Commodity[] = " . json_encode($items, JSON_PRETTY_PRINT) . ";\n";

File::put(base_path('../customer-pwa/src/data/srpFallback.ts'), $tsContent);
echo "Exported " . count($items) . " items to srpFallback.ts\n";
