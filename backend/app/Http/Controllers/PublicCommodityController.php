<?php

namespace App\Http\Controllers;

use App\Models\SrpBulletin;
use App\Services\Admin\SrpCatalogService;
use Illuminate\Http\Request;

class PublicCommodityController extends Controller
{
    public function index(Request $request, SrpCatalogService $catalog)
    {
        $search = trim((string) $request->input('query', ''));
        $commodities = $catalog->currentRecords($search)->map(fn (SrpBulletin $record) => [
            'id' => (int) $record->id,
            'commodity_name' => (string) $record->commodity_name,
            'image_path' => $record->image_path ? (str_starts_with($record->image_path, 'http') ? $record->image_path : asset('storage/' . $record->image_path)) : null,
            'category' => $record->category,
            'unit' => $record->unit,
            'regulatory_classification' => $record->regulatory_classification,
            'baseline_price' => (float) $record->baseline_price,
            'effective_date' => $record->effective_date?->toDateString(),
            'is_active' => (bool) $record->is_active,
            'price_freeze_applicable' => (bool) $record->price_freeze_applicable,
            'price_freeze_treatment' => $record->price_freeze_treatment,
        ])->values();

        return response()->json([
            'success' => true,
            'message' => 'Commodities retrieved successfully.',
            'data' => $commodities,
        ]);
    }
}
