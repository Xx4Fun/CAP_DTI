<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\TemporalAnalyticsService;
use Illuminate\Http\Request;

class TemporalAnalyticsController extends Controller
{
    public function show(Request $request, Store $store, AdminAuthorizationService $auth, TemporalAnalyticsService $service)
    {
        abort_unless($auth->canViewAnalytics($request->user()), 403);
        return response()->json(['data' => $service->forStore($store, $request->query('commodity_key'), now())]);
    }
}
