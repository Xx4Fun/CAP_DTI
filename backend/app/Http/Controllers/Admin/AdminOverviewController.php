<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Support\MonitoringPeriod;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AdminOverviewController extends Controller
{
    public function show(Request $request, AdminAuthorizationService $authorization)
    {
        abort_unless($authorization->canViewAnalytics($request->user()), 403);

        $emergencyRecordsAvailable = Schema::hasTable('regulatory_emergencies');

        return response()->json(['data' => [
            'stores' => Store::count(),
            'recent_stores' => Store::orderBy('store_name')->limit(4)->get(['id', 'store_name', 'dti_sec_number', 'address', 'is_active']),
            'pending_reports' => ConsumerReport::whereNotIn('status', ['Resolved', 'Closed'])->count(),
            'active_emergencies' => $emergencyRecordsAvailable
                ? (MonitoringPeriod::effectiveEmergency(now('Asia/Manila')) ? 1 : 0)
                : null,
            'availability' => [
                'regulatory_emergencies' => $emergencyRecordsAvailable,
            ],
        ]]);
    }
}
