<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\TemporalInspection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SyncController extends Controller {
    public function down(Request $request) {
        if (!in_array($request->user()->role, ['field_officer', 'super_admin', 'dti_evaluator'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $inspections = TemporalInspection::where('inspection_timestamp', '>=', now()->subWeeks(3))->get();
        $referencedSrpIds = $inspections->pluck('srp_id')->unique();

        $bulletins = SrpBulletin::where('is_active', true)
            ->orWhereIn('id', $referencedSrpIds)
            ->get();

        return response()->json([
            'stores' => Store::all(),
            'srp_bulletins' => $bulletins,
            'temporal_inspections' => $inspections
        ]);
    }

    public function up(Request $request) {
        if (!in_array($request->user()->role, ['field_officer', 'super_admin', 'dti_evaluator'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $request->validate([
            'inspections' => 'required|array',
            'inspections.*.store_id' => 'required|exists:stores,id',
            'inspections.*.srp_id' => 'required|exists:srp_bulletins,id',
            'inspections.*.recorded_price' => 'required|numeric',
            'inspections.*.is_flagged' => 'required|boolean',
            'inspections.*.inspection_timestamp' => 'required|date',
            'inspections.*.officer_signature' => 'nullable|string',
            'inspections.*.vendor_signature' => 'nullable|string'
        ]);

        DB::transaction(function () use ($request) {
            foreach ($request->inspections as $insData) {
                TemporalInspection::updateOrCreate(
                    [
                        'store_id' => $insData['store_id'],
                        'srp_id' => $insData['srp_id'],
                        'inspection_timestamp' => $insData['inspection_timestamp']
                    ],
                    [
                        'recorded_price' => $insData['recorded_price'],
                        'is_flagged' => $insData['is_flagged'],
                        'officer_signature' => $insData['officer_signature'] ?? null,
                        'vendor_signature' => $insData['vendor_signature'] ?? null,
                        'sync_timestamp' => now()
                    ]
                );
            }
        });

        return response()->json(['message' => 'Sync completed successfully']);
    }
}
