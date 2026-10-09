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
            // Serialize against FieldMonitoringController::sync, which locks the same store row. Without it a
            // concurrent accepted visit can insert the tuple between the protection check and the write, and the
            // write would then land on signed evidence. Ascending store id so two legacy batches cannot deadlock.
            $storeIds = collect($request->inspections)->pluck('store_id')->map(fn ($id) => (int) $id)->unique()->sort()->values();
            foreach ($storeIds as $storeId) {
                Store::query()->whereKey($storeId)->lockForUpdate()->firstOrFail();
            }

            foreach ($request->inspections as $insData) {
                $existing = TemporalInspection::query()
                    ->where('store_id', $insData['store_id'])
                    ->where('srp_id', $insData['srp_id'])
                    ->where('inspection_timestamp', $insData['inspection_timestamp'])
                    ->lockForUpdate()->first();

                // Accepted field monitoring is signed evidence a later notice may cite. This legacy route may create
                // and amend its own unverified rows; it may never rewrite an observation DTI has accepted.
                if ($existing && ($existing->validation_status === 'verified' || $existing->monitoring_record_id !== null)) {
                    abort(response()->json([
                        'status' => 'OBSERVATION_ALREADY_ACCEPTED',
                        'message' => "An accepted monitoring observation already exists for store {$insData['store_id']}, commodity {$insData['srp_id']} at {$insData['inspection_timestamp']}. Accepted evidence cannot be overwritten.",
                    ], 422));
                }

                $attributes = [
                    'recorded_price' => $insData['recorded_price'],
                    'is_flagged' => $insData['is_flagged'],
                    'officer_signature' => $insData['officer_signature'] ?? null,
                    'vendor_signature' => $insData['vendor_signature'] ?? null,
                    'sync_timestamp' => now(),
                ];

                // Explicit update/insert, never updateOrCreate: that would re-resolve a row appearing after the check.
                if ($existing) {
                    $existing->update($attributes);
                } else {
                    TemporalInspection::create($attributes + [
                        'store_id' => $insData['store_id'],
                        'srp_id' => $insData['srp_id'],
                        'inspection_timestamp' => $insData['inspection_timestamp'],
                    ]);
                }
            }
        });

        return response()->json(['message' => 'Sync completed successfully']);
    }
}
