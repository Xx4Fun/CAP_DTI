<?php

require __DIR__ . '/../vendor/autoload.php';

$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Illuminate\Support\Facades\File;

$jsonPath = base_path('../DTI_SRP_Master_List_2026-05-11.json');
$jsonContent = File::get($jsonPath);
$data = json_decode($jsonContent, true);

$effectiveDate = $data['metadata']['effective_date'] ?? '2026-05-11';
$rows = [];

foreach ($data['items'] as $item) {
    $itemName = trim($item['item_name'] ?? '');
    $unit = trim($item['unit'] ?? '');
    $category = trim($item['category'] ?? '');
    $classification = trim($item['regulatory_classification'] ?? 'BASIC_NECESSITY');
    $srp = (float) ($item['srp'] ?? 0.00);
    $freezeApplicable = !empty($item['price_freeze_applicable']) ? 'true' : 'false';
    $freezeTreatment = trim($item['price_freeze_treatment'] ?? '');

    if (empty($itemName)) continue;

    $commodityName = $itemName;
    if (!empty($unit) && !str_contains($itemName, $unit)) {
        $commodityName = "{$itemName} ({$unit})";
    }
    if (!empty($category)) {
        $commodityName = "{$category} - {$commodityName}";
    }

    $cNameEsc = addslashes($commodityName);
    $catEsc = addslashes($category);
    $unitEsc = addslashes($unit);
    $classEsc = addslashes($classification);
    $treatEsc = addslashes($freezeTreatment);

    $rows[] = "('{$cNameEsc}', '{$catEsc}', '{$unitEsc}', '{$classEsc}', {$srp}, '{$effectiveDate}', true, {$freezeApplicable}, '{$treatEsc}', NOW(), NOW())";
}

$sql = "TRUNCATE public.srp_bulletins RESTART IDENTITY CASCADE;\n\nINSERT INTO public.srp_bulletins (commodity_name, category, unit, regulatory_classification, baseline_price, effective_date, is_active, price_freeze_applicable, price_freeze_treatment, created_at, updated_at) VALUES\n" . implode(",\n", $rows) . ";";

File::put(__DIR__ . '/seed_statement.sql', $sql);
echo "SQL generated with " . count($rows) . " distinct items.\n";
