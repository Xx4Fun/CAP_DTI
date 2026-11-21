<?php

namespace App\Http\Controllers;

use App\Models\SrpBulletin;
use App\Models\TemporalInspection;
use App\Services\Admin\SrpCatalogService;
use App\Services\CommodityImageStorage;
use App\Services\FieldReferenceResolver;
use Illuminate\Http\Request;

class PublicCommodityController extends Controller
{
    public function index(
        Request $request,
        SrpCatalogService $catalog,
        CommodityImageStorage $imageStorage,
        FieldReferenceResolver $references
    ) {
        $search = trim((string) $request->input('query', ''));
        $identityMode = $request->input('match_mode') === 'identity';
        $currentRecords = $identityMode
            ? $catalog->currentIdentityMatches($search, (int) $request->input('limit', 5))
            : $catalog->currentRecords($search);

        $imageFor = $catalog->imageResolver();

        $observedAt = now('Asia/Manila');
        $commodities = $currentRecords->map(function (SrpBulletin $record) use ($imageFor, $imageStorage, $identityMode, $references, $observedAt) {
            return [
                'id' => (int) $record->id,
                'commodity_name' => (string) $record->commodity_name,
                'image_path' => $imageStorage->publicUrl($imageFor($record)),
                'category' => $record->category,
                'unit' => $record->unit,
                'regulatory_classification' => $record->regulatory_classification,
                'baseline_price' => (float) $record->baseline_price,
                'reference' => $references->resolve($record, $observedAt),
                'effective_date' => $record->effective_date?->toDateString(),
                'source_reference' => $record->source_reference,
                'is_active' => (bool) $record->is_active,
                'price_freeze_applicable' => (bool) $record->price_freeze_applicable,
                'price_freeze_treatment' => $record->price_freeze_treatment,
                ...($identityMode ? ['match_quality' => $record->match_quality] : []),
            ];
        })->values();

        return response()->json([
            'success' => true,
            'message' => 'Commodities retrieved successfully.',
            'data' => $commodities,
        ]);
    }

    public function history(SrpBulletin $commodity)
    {
        $query = SrpBulletin::query()
            ->where('is_active', true)
            ->whereDate('effective_date', '<=', now('Asia/Manila')->toDateString());

        if (filled($commodity->commodity_key)) {
            $query->where('commodity_key', $commodity->commodity_key);
        } else {
            $query->where('commodity_name', $commodity->commodity_name);

            if ($commodity->unit === null) {
                $query->whereNull('unit');
            } else {
                $query->where('unit', $commodity->unit);
            }
        }

        $history = $query
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->get()
            ->unique(fn (SrpBulletin $record) => $record->effective_date?->toDateString() ?? "missing-{$record->id}")
            ->values()
            ->map(fn (SrpBulletin $record) => [
                'id' => (int) $record->id,
                'baseline_price' => (float) $record->baseline_price,
                'effective_date' => $record->effective_date?->toDateString(),
                'source_reference' => $record->source_reference,
            ]);

        return response()->json([
            'success' => true,
            'message' => 'Commodity price history retrieved successfully.',
            'data' => [
                'commodity_id' => (int) $commodity->id,
                'history' => $history,
            ],
        ]);
    }

    public function storePrices(SrpBulletin $commodity)
    {
        $comparableIds = SrpBulletin::comparableIds($commodity);

        $inspections = TemporalInspection::query()
            ->with(['store:id,store_name,address,image_path,is_active'])
            ->whereIn('srp_id', $comparableIds)
            ->where('validation_status', 'verified')
            ->whereNotNull('officer_signature')
            ->where('officer_signature', '!=', '')
            ->whereHas('store', fn ($q) => $q->where('is_active', true))
            ->orderByDesc('inspection_timestamp')
            ->orderByDesc('id')
            ->get();

        $baselinePrice = (float) $commodity->baseline_price;

        $stores = $inspections->groupBy('store_id')->map(function ($storeInspections) use ($baselinePrice) {
            $latest = $storeInspections->first();
            $previous = $storeInspections->skip(1)->first();

            $recordedPrice = (float) $latest->recorded_price;
            $previousPrice = $previous ? (float) $previous->recorded_price : null;

            $priceChange = null;
            $changeDirection = 'first_observation';

            if ($previousPrice !== null) {
                $diff = round($recordedPrice - $previousPrice, 2);
                $priceChange = $diff;
                if ($diff > 0.005) {
                    $changeDirection = 'increase';
                } elseif ($diff < -0.005) {
                    $changeDirection = 'decrease';
                } else {
                    $changeDirection = 'unchanged';
                }
            }

            $complianceStatus = 'at_srp';
            if ($baselinePrice > 0) {
                if ($recordedPrice < $baselinePrice - 0.005) {
                    $complianceStatus = 'below_srp';
                } elseif ($recordedPrice > $baselinePrice + 0.005) {
                    $complianceStatus = 'above_srp';
                }
            }

            return [
                'store_id' => (int) $latest->store_id,
                'store_name' => (string) ($latest->store?->store_name ?? 'Unknown Store'),
                'address' => $latest->store?->address,
                'recorded_price' => $recordedPrice,
                'observed_at' => $latest->inspection_timestamp?->toDateString(),
                'previous_price' => $previousPrice,
                'price_change' => $priceChange,
                'change_direction' => $changeDirection,
                'compliance_status' => $complianceStatus,
            ];
        })->sortBy('recorded_price')->values();

        return response()->json([
            'success' => true,
            'message' => 'Commodity store prices retrieved successfully.',
            'data' => [
                'commodity_id' => (int) $commodity->id,
                'commodity_name' => (string) $commodity->commodity_name,
                'baseline_price' => $baselinePrice,
                'stores' => $stores,
            ],
        ]);
    }
}
