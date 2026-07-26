<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;
use Illuminate\Support\Facades\Cache;

class RegulatoryPriceResolver
{
    /**
     * Resolve the authoritative regulatory price for a given SRP bulletin product.
     *
     * @param SrpBulletin|null $product
     * @param bool|null $stateOfCalamity Explicit override for emergency state toggle (defaults to Cache::get('state_of_calamity', false))
     * @return array
     */
    public function resolve(?SrpBulletin $product = null, ?bool $stateOfCalamity = null): array
    {
        $isEmergency = $stateOfCalamity ?? (bool) Cache::get('state_of_calamity', false);

        if ($isEmergency) {
            return [
                'status' => 'REGULATORY_PRICE_UNAVAILABLE',
                'label' => null,
                'value_string' => null,
                'value_centavos' => null,
                'regulatory_mode' => 'EMERGENCY_PRICE_FREEZE',
                'message' => 'No authoritative frozen prevailing price or APC ceiling is on record for this commodity.',
            ];
        }

        if (!$product || $product->baseline_price === null) {
            return [
                'status' => 'REGULATORY_PRICE_UNAVAILABLE',
                'label' => null,
                'value_string' => null,
                'value_centavos' => null,
                'regulatory_mode' => 'NORMAL_SRP',
                'message' => 'No baseline SRP available for this commodity.',
            ];
        }

        $effectiveDateStr = null;
        if ($product->effective_date) {
            $effectiveDateStr = is_string($product->effective_date)
                ? $product->effective_date
                : $product->effective_date->format('Y-m-d');
        }

        $baselinePrice = (float) $product->baseline_price;
        $valueString = number_format($baselinePrice, 2, '.', '');
        $valueCentavos = (int) round($baselinePrice * 100);

        return [
            'status' => 'REGULATORY_PRICE_FOUND',
            'label' => 'Current SRP',
            'value_string' => $valueString,
            'value_centavos' => $valueCentavos,
            'regulatory_mode' => 'NORMAL_SRP',
            'effective_date' => $effectiveDateStr,
        ];
    }
}
