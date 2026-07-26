<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\ReportReviewService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ReportReviewController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $reports = ConsumerReport::with('store')->latest()->get()->map(fn ($report) => [
            'id' => $report->id, 'report_reference' => $report->report_reference, 'status' => $report->status,
            'store_name' => $report->store?->store_name, 'submitted_at' => $report->created_at,
            'raw_ocr_json' => $report->raw_ocr_json, 'consumer_confirmed_json' => $report->consumer_confirmed_json,
            'evaluator_confirmed_json' => $report->evaluator_confirmed_json, 'evidence_available' => (bool) $report->image_vault_path,
        ]);
        return response()->json(['data' => $reports]);
    }
    public function decision(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, ReportReviewService $service)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['action' => 'required|in:validate,correct,reject,dismiss', 'reason' => 'required|string', 'corrected' => 'array']);
        if (in_array($data['action'], ['validate', 'correct'], true)) {
            $data['corrected'] = validator($data['corrected'] ?? [], [
                'commodity_key' => 'required|string|max:255',
                'commodity_name' => 'required|string|max:255',
                'receipt_price' => 'required|numeric|min:0',
                'observed_at' => 'required|date',
                'regulatory_finding' => 'required|in:confirmed_violation,no_violation,insufficient_evidence',
                'store_name' => 'nullable|string|max:255',
            ])->validate();
        }
        return response()->json(['data' => $service->decide($report, $data['action'], $data['corrected'] ?? [], $data['reason'], $request->user(), $request)]);
    }
    public function evidence(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($report->image_vault_path && Storage::disk('local')->exists($report->image_vault_path), 404);
        $audit->record($request, 'report.evidence_accessed', $report);
        return Storage::disk('local')->download($report->image_vault_path, $report->report_reference.'.jpg');
    }
}
