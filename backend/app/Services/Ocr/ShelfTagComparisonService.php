<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;
use App\Models\Store;
use App\Services\Admin\SrpCatalogService;
use App\Services\CommodityImageStorage;
use Illuminate\Support\Facades\Cache;

class ShelfTagComparisonService
{
    public function __construct(
        private readonly RegulatoryPriceResolver $regulatoryPriceResolver,
        private readonly HistoricalPriceResolver $historicalPriceResolver,
        private readonly SrpCatalogService $catalog,
        private readonly CommodityImageStorage $images,
    ) {
    }

    public function compare(
        Store $store,
        SrpBulletin $product,
        string $displayedPrice,
        string $productSource,
        string $priceSource,
    ): array {
        $regulatoryResult = $this->regulatoryPriceResolver->resolve(
            $product,
            (bool) Cache::get('state_of_calamity', false),
        );
        $historicalResult = $this->historicalPriceResolver->resolve($store, $product);
        $displayedPriceFormatted = number_format((float) $displayedPrice, 2, '.', '');
        $displayedPriceCentavos = (int) round(((float) $displayedPrice) * 100);
        $regulatoryPriceCentavos = $regulatoryResult['value_centavos'] ?? null;
        $differenceCentavos = $regulatoryPriceCentavos === null
            ? null
            : $displayedPriceCentavos - $regulatoryPriceCentavos;
        $pesoDifference = $differenceCentavos === null
            ? null
            : number_format($differenceCentavos / 100, 2, '.', '');
        $percentDifference = null;
        if ($differenceCentavos !== null && $regulatoryPriceCentavos > 0) {
            $percentDifference = number_format(($differenceCentavos / $regulatoryPriceCentavos) * 100, 1, '.', '');
        }

        $packageSize = ShelfTagTextNormalizer::normalizePackageSize($product->unit ?? '')
            ?? ShelfTagTextNormalizer::normalizePackageSize($product->commodity_name)
            ?? (string) ($product->unit ?? '');

        return [
            'product' => [
                'id' => (int) $product->id,
                'commodity_name' => (string) $product->commodity_name,
                'image_path' => $this->images->publicUrl($this->catalog->imageResolver()($product)),
                'category' => (string) ($product->category ?? ''),
                'unit' => (string) ($product->unit ?? ''),
                'regulatory_classification' => (string) ($product->regulatory_classification ?? ''),
                'baseline_price' => $product->baseline_price === null ? null : (float) $product->baseline_price,
                'effective_date' => $product->effective_date?->format('Y-m-d'),
            ],
            'commodity_name' => (string) $product->commodity_name,
            'package_size' => (string) $packageSize,
            'unit' => (string) ($product->unit ?? ''),
            'displayed_price' => $displayedPriceFormatted,
            'reference_price' => $regulatoryResult['value_string'] ?? null,
            'regulatory_label' => $regulatoryResult['label'] ?? 'Current SRP',
            'regulatory_mode' => $regulatoryResult['regulatory_mode'] ?? 'NORMAL_SRP',
            'peso_difference' => $pesoDifference,
            'percent_difference' => $percentDifference,
            'is_above_reference' => $differenceCentavos !== null && $differenceCentavos > 0,
            'product_source' => $productSource,
            'price_source' => $priceSource,
            'historical_pricing' => $historicalResult,
            'disclaimer' => 'This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.',
        ];
    }
}
