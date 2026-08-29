<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
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
        $filters = $request->validate([
            'page' => 'sometimes|integer|min:1',
            'per_page' => 'sometimes|integer|min:1|max:50',
        ]);
        $paginator = ConsumerReport::with(['store', 'items.srp', 'evidenceBundle.assets'])
            ->whereNotIn('status', ['Processing receipt', 'Ready for confirmation', 'Needs recapture', 'Processing failed'])
            ->latest()->paginate($filters['per_page'] ?? 20);
        $reports = $paginator->getCollection()->map(fn ($report) => [
            'id' => $report->id, 'report_reference' => $report->report_reference, 'status' => $report->status,
            'store_name' => $report->store?->store_name, 'submitted_at' => $report->submitted_at ?? $report->created_at,
            'raw_ocr_json' => $report->raw_ocr_json, 'consumer_confirmed_json' => $report->consumer_confirmed_json,
            'evaluator_confirmed_json' => $report->evaluator_confirmed_json,
            'evidence_available' => (bool) $report->image_vault_path || (bool) $report->evidenceBundle?->assets->isNotEmpty(),
            'evidence_summary' => $report->evidenceBundle ? [
                'capture_mode' => $report->evidenceBundle->capture_mode,
                'processing_status' => $report->evidenceBundle->processing_status,
                'asset_count' => $report->evidenceBundle->assets->count(),
                'continuity' => data_get($report->evidenceBundle->processing_result_json, 'continuity.status'),
                'merchant' => data_get($report->evidenceBundle->processing_result_json, 'merchant.status'),
            ] : null,
            'items' => $report->items->map(fn ($item) => [
                'id' => $item->id,
                'sequence' => $item->sequence,
                'raw_text' => $item->raw_text,
                'item_name' => $item->item_name,
                'quantity' => $item->quantity,
                'unit' => $item->unit,
                'observed_price' => $item->observed_price,
                'ocr_confidence' => $item->ocr_confidence,
                'srp_id' => $item->srp_id,
                'commodity_key' => $item->srp?->commodity_key,
                'commodity_name' => $item->srp?->commodity_name ?? $item->item_name,
                'consumer_correction_json' => $item->consumer_correction_json,
                'consumer_confirmed' => $item->consumer_confirmed,
                'evaluator_decision_json' => $item->evaluator_decision_json,
            ])->values(),
        ]);
        return response()->json([
            'data' => $reports,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
        ]);
    }
    public function decision(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, ReportReviewService $service)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'action' => 'required|in:validate,correct,reject,dismiss',
            'reason' => 'required|string',
            'corrected' => 'array',
            'item_decisions' => 'array',
        ]);
        if (in_array($data['action'], ['validate', 'correct'], true) && $report->items()->exists()) {
            $data['item_decisions'] = validator($data['item_decisions'] ?? [], [
                '*' => 'required|array',
                '*.item_id' => 'required|integer',
                '*.commodity_key' => 'required|string|max:255',
                '*.commodity_name' => 'required|string|max:255',
                '*.receipt_price' => 'required|numeric|min:0',
                '*.observed_at' => 'required|date',
                '*.regulatory_finding' => 'required|in:confirmed_violation,no_violation,insufficient_evidence',
            ])->validate();
            $reportItemIds = $report->items()->pluck('id')->sort()->values()->all();
            $decisionItemIds = collect($data['item_decisions'])->pluck('item_id')->unique()->sort()->values()->all();
            abort_unless($decisionItemIds === $reportItemIds, 422, 'A decision is required for every item in this report.');

            return response()->json(['data' => $service->decideItems(
                $report,
                $data['action'],
                $data['item_decisions'],
                $data['reason'],
                $request->user(),
                $request,
            )]);
        }
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
        $audit->recordOrFail(
            $request,
            'report.evidence_accessed',
            $report,
            [],
            'Audit trail is unavailable. Private evidence cannot be accessed safely.'
        );
        return Storage::disk('local')->download($report->image_vault_path, $report->report_reference.'.jpg');
    }

    public function evidenceManifest(Request $request, ConsumerReport $report, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $report->load('evidenceBundle.assets');
        abort_unless($report->evidenceBundle, 404);

        return response()->json(['data' => [
            'capture_mode' => $report->evidenceBundle->capture_mode,
            'processing_status' => $report->evidenceBundle->processing_status,
            'continuity' => data_get($report->evidenceBundle->processing_result_json, 'continuity'),
            'merchant' => data_get($report->evidenceBundle->processing_result_json, 'merchant'),
            'assets' => $report->evidenceBundle->assets->map(fn ($asset) => [
                'id' => $asset->id,
                'kind' => $asset->kind,
                'sequence' => $asset->sequence,
                'mime_type' => $asset->mime_type,
                'size_bytes' => $asset->size_bytes,
                'sha256' => $asset->sha256,
                'metadata' => $asset->metadata_json,
            ])->values(),
        ]]);
    }

    public function evidenceAsset(
        Request $request,
        ConsumerReport $report,
        ReceiptEvidenceAsset $asset,
        AdminAuthorizationService $auth,
        AuditTrailService $audit
    ) {
        $auth->requireManager($request->user());
        abort_unless($report->receipt_evidence_bundle_id && $asset->receipt_evidence_bundle_id === $report->receipt_evidence_bundle_id, 404);
        abort_unless(Storage::disk($asset->disk)->exists($asset->path), 404);
        $audit->recordOrFail($request, 'report.evidence_asset_accessed', $report, [
            'asset_id' => $asset->id,
            'kind' => $asset->kind,
        ], 'Audit trail is unavailable. Private evidence cannot be accessed safely.');

        return Storage::disk($asset->disk)->download(
            $asset->path,
            $report->report_reference.'-'.$asset->kind.'-'.$asset->sequence,
            ['Content-Type' => $asset->mime_type]
        );
    }
}
