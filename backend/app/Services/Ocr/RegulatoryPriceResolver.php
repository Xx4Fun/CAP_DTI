<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;
use App\Services\FieldReferenceResolver;

class RegulatoryPriceResolver
{
    public function resolve(?SrpBulletin $product = null): array
    {
        $reference = $product ? app(FieldReferenceResolver::class)->resolve($product, now('Asia/Manila')) : null;
        $available = $reference && $reference['status'] === 'available';
        $emergency = ($reference['type'] ?? null) === 'emergency_ceiling';

        return [
            'status' => $available ? 'REGULATORY_PRICE_FOUND' : 'REGULATORY_PRICE_UNAVAILABLE',
            'label' => $available ? ($emergency ? $reference['label'] : 'Current SRP') : null,
            'value_string' => $available ? number_format($reference['value'], 2, '.', '') : null,
            'value_centavos' => $available ? (int) round($reference['value'] * 100) : null,
            'regulatory_mode' => $emergency ? 'EMERGENCY_PRICE_FREEZE' : 'NORMAL_SRP',
            'effective_date' => $reference['effective_date'] ?? null,
            'message' => $available ? null : 'No authoritative reference price is on record for this commodity.',
        ];
    }
}
