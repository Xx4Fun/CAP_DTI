<?php

namespace App\Http\Controllers;

use App\Models\SrpBulletin;
use App\Services\Admin\SrpCatalogService;
use App\Services\CommodityImageStorage;
use Illuminate\Http\Request;

class PublicCommodityController extends Controller
{
    public function index(
        Request $request,
        SrpCatalogService $catalog,
        CommodityImageStorage $imageStorage
    ) {
        $search = trim((string) $request->input('query', ''));
        $currentRecords = $catalog->currentRecords($search);

        // Map existing non-null image_paths across all bulletins by commodity_name & commodity_key
        $imageMapByKey = SrpBulletin::query()
            ->whereNotNull('image_path')
            ->where('image_path', '!=', '')
            ->orderByDesc('id')
            ->get()
            ->pluck('image_path', 'commodity_key')
            ->filter()
            ->toArray();

        $imageMapByName = SrpBulletin::query()
            ->whereNotNull('image_path')
            ->where('image_path', '!=', '')
            ->orderByDesc('id')
            ->get()
            ->pluck('image_path', 'commodity_name')
            ->filter()
            ->toArray();

        $commodities = $currentRecords->map(function (SrpBulletin $record) use ($imageMapByKey, $imageMapByName, $imageStorage) {
            $rawPath = $record->image_path;
            if (! $rawPath && ! empty($record->commodity_key) && isset($imageMapByKey[$record->commodity_key])) {
                $rawPath = $imageMapByKey[$record->commodity_key];
            }
            if (! $rawPath && ! empty($record->commodity_name) && isset($imageMapByName[$record->commodity_name])) {
                $rawPath = $imageMapByName[$record->commodity_name];
            }

            return [
                'id' => (int) $record->id,
                'commodity_name' => (string) $record->commodity_name,
                'image_path' => $this->formatImageUrl($rawPath, $imageStorage),
                'category' => $record->category,
                'unit' => $record->unit,
                'regulatory_classification' => $record->regulatory_classification,
                'baseline_price' => (float) $record->baseline_price,
                'effective_date' => $record->effective_date?->toDateString(),
                'is_active' => (bool) $record->is_active,
                'price_freeze_applicable' => (bool) $record->price_freeze_applicable,
                'price_freeze_treatment' => $record->price_freeze_treatment,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'message' => 'Commodities retrieved successfully.',
            'data' => $commodities,
        ]);
    }

    private function formatImageUrl(?string $path, CommodityImageStorage $imageStorage): ?string
    {
        if (! $path) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            if (str_starts_with($path, 'http://') && (request()->isSecure() || request()->header('X-Forwarded-Proto') === 'https' || app()->environment('production'))) {
                return 'https://'.substr($path, 7);
            }

            return $path;
        }

        $cleanPath = ltrim($path, '/');
        if (str_starts_with($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, 8);
        }

        $url = $imageStorage->url($cleanPath);
        if (str_starts_with($url, 'http://') && (request()->isSecure() || request()->header('X-Forwarded-Proto') === 'https' || app()->environment('production'))) {
            $url = 'https://'.substr($url, 7);
        }

        return $url;
    }
}
