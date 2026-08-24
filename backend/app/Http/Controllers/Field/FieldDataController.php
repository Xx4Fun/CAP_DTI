<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use Illuminate\Http\Request;

class FieldDataController extends Controller
{
    public function bootstrap(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->role === 'field_officer' && $user->is_active && $user->currentAccessToken()?->can('field-monitoring'), 403, 'Forbidden');
        abort_if($user->must_change_password, 403, 'Replace the temporary password before downloading field data.');

        $filters = $request->validate(['since' => ['nullable', 'string', 'max:128']]);
        $version = hash('sha256', implode('|', [
            Store::max('updated_at') ?? 'none',
            SrpBulletin::max('updated_at') ?? 'none',
            TemporalInspection::where('validation_status', 'verified')->max('updated_at') ?? 'none',
        ]));
        $isCurrent = isset($filters['since']) && hash_equals($version, $filters['since']);

        $recentPrices = $isCurrent ? collect() : TemporalInspection::query()
            ->where('validation_status', 'verified')
            ->where('inspection_timestamp', '>=', now()->subWeeks(3))
            ->latest('inspection_timestamp')
            ->get(['store_id', 'srp_id', 'recorded_price', 'inspection_timestamp'])
            ->unique(fn ($inspection) => $inspection->store_id.':'.$inspection->srp_id)
            ->values();

        return response()->json([
            'data' => [
                'version' => $version,
                'is_delta' => $isCurrent,
                'stores' => $isCurrent ? [] : Store::query()->where('is_active', true)->orderBy('store_name')->get(),
                'srp_bulletins' => $isCurrent ? [] : SrpBulletin::query()->where('is_active', true)->orderBy('commodity_name')->get(),
                'recent_prices' => $recentPrices,
            ],
        ]);
    }
}
