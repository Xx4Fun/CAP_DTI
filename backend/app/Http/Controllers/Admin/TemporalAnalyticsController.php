<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Models\SrpBulletin;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\TemporalAnalyticsService;
use Illuminate\Http\Request;

class TemporalAnalyticsController extends Controller
{
    public function options(Request $request, AdminAuthorizationService $auth)
    {
        abort_unless($auth->canViewAnalytics($request->user()), 403);

        return response()->json(['data' => [
            'stores' => Store::query()
                ->orderBy('store_name')
                ->get(['id', 'store_name', 'address']),
            'commodities' => SrpBulletin::query()
                ->whereNotNull('commodity_key')
                ->orderBy('commodity_name')
                ->get(['commodity_key', 'commodity_name'])
                ->unique('commodity_key')
                ->values(),
        ]]);
    }

    public function show(Request $request, Store $store, AdminAuthorizationService $auth, TemporalAnalyticsService $service)
    {
        abort_unless($auth->canViewAnalytics($request->user()), 403);
        return response()->json(['data' => $service->forStore($store, $request->query('commodity_key'), now())]);
    }
}
