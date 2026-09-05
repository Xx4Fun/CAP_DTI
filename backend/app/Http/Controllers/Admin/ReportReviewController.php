<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Models\FieldVerificationRequest;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\ReportReviewService;
use App\Services\FieldNotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
        $paginator = ConsumerReport::with(['store', 'items.srp', 'evidenceBundle.assets', 'evidenceAttempts.assets', 'verificationRequest'])
            ->whereNotIn('status', ['Processing receipt', 'Ready for confirmation', 'Needs recapture', 'Processing failed'])
            ->latest()->paginate($filters['per_page'] ?? 20);
        $reports = $paginator->getCollection()->map(fn ($report) => [
            'id' => $report->id, 'report_reference' => $report->report_reference, 'status' => $report->status,
            'store_name' => $report->store?->store_name, 'submitted_at' => $report->submitted_at ?? $report->created_at,
            'raw_ocr_json' => $report->raw_ocr_json,
            'evaluator_confirmed_json' => $report->evaluator_confirmed_json,
            'verification_request' => $report->verificationRequest ? [
                'id' => $report->verificationRequest->id,
                'status' => $report->verificationRequest->status,
                'reason' => $report->verificationRequest->reason,
                'store_id' => $report->verificationRequest->store_id,
                'claimed_by' => $report->verificationRequest->claimed_by,
                'requested_at' => $report->verificationRequest->requested_at,
                'claimed_at' => $report->verificationRequest->claimed_at,
                'completed_at' => $report->verificationRequest->completed_at,
                'cancelled_at' => $report->verificationRequest->cancelled_at,
            ] : null,
            'evidence_available' => ($report->image_vault_path && Storage::disk('local')->exists($report->image_vault_path))
                || (bool) $report->evidenceBundle?->assets->contains(fn ($asset) => Storage::disk($asset->disk)->exists($asset->path))
                || $report->evidenceAttempts->flatMap->assets->contains(fn ($asset) => Storage::disk($asset->disk)->exists($asset->path)),
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

    public function requestVerification(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, AuditTrailService $audit, FieldNotificationService $notifications)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['reason' => 'required|string|max:2000']);

        $verification = DB::transaction(function () use ($request, $report, $data, $audit, $notifications) {
            $report = ConsumerReport::query()->lockForUpdate()->findOrFail($report->id);
            abort_if($report->verificationRequest()->exists(), 409, 'This report already has a field verification request.');
            $store = Store::query()->whereKey($report->store_id)->where('is_active', true)->first();
            abort_unless($store, 422, 'An active linked store is required for field verification.');

            $previous = $report->status;
            $verification = FieldVerificationRequest::create([
                'consumer_report_id' => $report->id,
                'store_id' => $store->id,
                'requested_by' => $request->user()->id,
                'status' => 'open',
                'reason' => $data['reason'],
                'context_json' => [
                    'report_reference' => $report->report_reference,
                    'return_status' => $previous,
                    'submitted_at' => ($report->submitted_at ?? $report->created_at)?->toIso8601String(),
                    'reported_items' => $report->items()->get(['item_name', 'observed_price', 'unit'])->toArray(),
                ],
                'requested_at' => now(),
            ]);
            $report->update(['status' => 'Referred for field verification']);
            ReportStatusHistory::create([
                'consumer_report_id' => $report->id,
                'previous_status' => $previous,
                'new_status' => 'Referred for field verification',
                'public_message' => 'DTI referred this report for field verification.',
                'internal_notes' => $data['reason'],
                'actor_type' => 'dti_evaluator',
                'actor_id' => $request->user()->id,
            ]);
            $audit->recordOrFail($request, 'field_verification.requested', $verification, [
                'consumer_report_id' => $report->id, 'store_id' => $store->id,
            ]);
            $notifications->broadcast('verification_requested', [
                'verification_request_id' => $verification->id, 'store_id' => $store->id,
            ]);

            return $verification;
        });

        return response()->json(['data' => $verification], 201);
    }

    public function cancelVerification(Request $request, FieldVerificationRequest $verificationRequest, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        DB::transaction(function () use ($request, $verificationRequest, $audit) {
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'open', 422, 'Only an open verification request can be cancelled.');
            $report = ConsumerReport::query()->lockForUpdate()->findOrFail($verificationRequest->consumer_report_id);
            $previous = $report->status;
            $returnStatus = $verificationRequest->context_json['return_status'] ?? $previous;
            $verificationRequest->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            if ($previous !== $returnStatus) {
                $report->update(['status' => $returnStatus]);
                ReportStatusHistory::create([
                    'consumer_report_id' => $report->id, 'previous_status' => $previous, 'new_status' => $returnStatus,
                    'public_message' => 'DTI cancelled the field verification request.', 'internal_notes' => $verificationRequest->reason,
                    'actor_type' => 'dti_evaluator', 'actor_id' => $request->user()->id,
                ]);
            }
            $audit->recordOrFail($request, 'field_verification.cancelled', $verificationRequest);
        });

        return response()->json(['data' => $verificationRequest->fresh()]);
    }

    public function reopenVerification(Request $request, FieldVerificationRequest $verificationRequest, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        DB::transaction(function () use ($request, $verificationRequest, $audit) {
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'cancelled', 422, 'Only a cancelled verification request can be reopened. Claimed work must be released by the assigned officer.');
            $report = ConsumerReport::query()->lockForUpdate()->findOrFail($verificationRequest->consumer_report_id);
            $previous = $report->status;
            $verificationRequest->update([
                'status' => 'open', 'claimed_by' => null,
                'released_at' => $verificationRequest->released_at,
            ]);
            if ($previous !== 'Referred for field verification') {
                $report->update(['status' => 'Referred for field verification']);
                ReportStatusHistory::create([
                    'consumer_report_id' => $report->id, 'previous_status' => $previous, 'new_status' => 'Referred for field verification',
                    'public_message' => 'DTI reopened the field verification request.', 'internal_notes' => $verificationRequest->reason,
                    'actor_type' => 'dti_evaluator', 'actor_id' => $request->user()->id,
                ]);
            }
            $audit->recordOrFail($request, 'field_verification.reopened', $verificationRequest);
        });

        return response()->json(['data' => $verificationRequest->fresh()]);
    }
    public function decision(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, ReportReviewService $service)
    {
        $auth->requireManager($request->user());
        abort_if($report->verificationRequest()->whereIn('status', ['open', 'claimed'])->exists(), 409, 'An open field verification request must be resolved first.');
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
        $report->load(['evidenceBundle.assets', 'evidenceAttempts.assets']);
        abort_unless($report->evidenceBundle, 404);
        $bundles = $report->evidenceAttempts;
        if (! $bundles->contains('id', $report->evidenceBundle->id)) {
            $bundles->push($report->evidenceBundle);
        }
        $assets = $bundles->flatMap(fn ($bundle) => $bundle->assets->map(fn ($asset) => [
            'id' => $asset->id,
            'kind' => $asset->kind,
            'sequence' => $asset->sequence,
            'mime_type' => $asset->mime_type,
            'size_bytes' => $asset->size_bytes,
            'sha256' => $asset->sha256,
            'metadata' => $asset->metadata_json,
            'attempt_number' => (int) ($bundle->attempt_number ?? 1),
            'is_current' => $bundle->id === $report->receipt_evidence_bundle_id,
        ]))->sortBy(fn (array $asset) => sprintf('%04d-%02d-%04d', $asset['attempt_number'], match ($asset['kind']) {
            'source_frame' => 0,
            'original_video' => 1,
            'stitched_preview' => 2,
            default => 3,
        }, $asset['sequence']))->values();

        return response()->json(['data' => [
            'capture_mode' => $report->evidenceBundle->capture_mode,
            'processing_status' => $report->evidenceBundle->processing_status,
            'continuity' => data_get($report->evidenceBundle->processing_result_json, 'continuity'),
            'merchant' => data_get($report->evidenceBundle->processing_result_json, 'merchant'),
            'processing_result' => $report->evidenceBundle->processing_result_json,
            'assets' => $assets,
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
        $asset->load('bundle');
        abort_unless(
            $asset->receipt_evidence_bundle_id === $report->receipt_evidence_bundle_id
                || $asset->bundle?->consumer_report_id === $report->id,
            404,
        );
        abort_unless(Storage::disk($asset->disk)->exists($asset->path), 404);
        abort_unless($asset->hasValidContent(), 409, 'Receipt evidence failed its integrity check.');
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
