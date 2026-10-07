<?php

namespace App\Http\Controllers;

use App\Support\MonitoringPeriod;
use Illuminate\Http\Request;

class CalamityController extends Controller
{
    public function show()
    {
        $status = MonitoringPeriod::effectiveEmergency(now('Asia/Manila')) !== null;
        return response()->json([
            'state_of_calamity' => $status
        ]);
    }

    public function toggle(Request $request)
    {
        $request->validate([
            'state' => 'required|boolean',
        ]);

        return response()->json([
            'status' => 'REGULATORY_EMERGENCY_RECORD_REQUIRED',
            'message' => 'Use the formal emergency declaration workflow with location, dates, and declaration reference.',
            'state_of_calamity' => MonitoringPeriod::effectiveEmergency(now('Asia/Manila')) !== null,
        ], 422);
    }
}
