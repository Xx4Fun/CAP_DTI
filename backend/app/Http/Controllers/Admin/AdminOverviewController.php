<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Models\RegulatoryEmergency;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use Illuminate\Http\Request;

class AdminOverviewController extends Controller
{
    public function show(Request $request, AdminAuthorizationService $authorization)
    {
        abort_unless($authorization->canViewAnalytics($request->user()), 403);

        return response()->json(['data' => [
            'stores' => Store::count(),
            'pending_reports' => ConsumerReport::whereNotIn('status', ['Resolved', 'Closed'])->count(),
            'active_emergencies' => RegulatoryEmergency::where('status', 'active')->count(),
        ]]);
    }
}
