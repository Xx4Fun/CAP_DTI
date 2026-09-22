<?php

namespace App\Services\Ocr;

use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\TemporalInspection;

class HistoricalPriceResolver
{
    /**
     * Resolve the latest official DTI verified field monitoring price for a store and product.
     *
     * @param Store|int|null $store
     * @param SrpBulletin|int|null $product
     * @return array
     */
    public function resolve(Store|int|null $store = null, SrpBulletin|int|null $product = null): array
    {
        $storeId = $store instanceof Store ? $store->id : (is_numeric($store) ? (int) $store : null);
        $srpId = $product instanceof SrpBulletin ? $product->id : (is_numeric($product) ? (int) $product : null);

        if (!$storeId || !$srpId) {
            return $this->noHistoryPayload();
        }

        $record = TemporalInspection::query()
            ->where('store_id', $storeId)
            ->where('srp_id', $srpId)
            ->where('validation_status', 'verified')
            ->whereNotNull('inspection_timestamp')
            ->whereNotNull('officer_signature')
            ->where('officer_signature', '!=', '')
            ->orderBy('inspection_timestamp', 'desc')
            ->orderBy('id', 'desc')
            ->first();

        if (!$record || $record->recorded_price === null) {
            return $this->noHistoryPayload();
        }

        $recordedPriceFloat = (float) $record->recorded_price;
        $priceString = ShelfTagTextNormalizer::normalizePrice((string) $recordedPriceFloat)
            ?? number_format($recordedPriceFloat, 2, '.', '');
        $priceCentavos = ShelfTagTextNormalizer::toCentavos($priceString)
            ?? (int) round($recordedPriceFloat * 100);

        $verificationDate = null;
        if ($record->inspection_timestamp) {
            $verificationDate = $record->inspection_timestamp instanceof \DateTimeInterface
                ? $record->inspection_timestamp->format('Y-m-d')
                : date('Y-m-d', strtotime((string) $record->inspection_timestamp));
        }

        return [
            'has_history' => true,
            'status' => 'VERIFIED_HISTORY_FOUND',
            'previous_verified_price' => $priceString,
            'previous_verified_centavos' => $priceCentavos,
            'verification_date' => $verificationDate,
            'inspection_id' => (int) $record->id,
            'source_type' => 'OFFICIAL_DTI_INSPECTION',
        ];
    }

    /**
     * Payload structure when no verified history record is available.
     *
     * @return array
     */
    protected function noHistoryPayload(): array
    {
        return [
            'has_history' => false,
            'status' => 'NO_VERIFIED_HISTORY',
            'previous_verified_price' => null,
            'previous_verified_centavos' => null,
            'verification_date' => null,
            'inspection_id' => null,
            'source_type' => null,
        ];
    }
}
