<?php

namespace App\Http\Controllers;

use App\Models\RegulatoryEmergency;
use Illuminate\Http\Request;

class CalamityController extends Controller
{
    public function show()
    {
        $status = RegulatoryEmergency::query()->where('status', 'active')->exists();
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
            'state_of_calamity' => RegulatoryEmergency::query()->where('status', 'active')->exists(),
        ], 422);
    }
}
