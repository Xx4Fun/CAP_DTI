<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\ConsumerReport;
use App\Models\FieldVerificationRequest;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\ReportReviewService;
use App\Services\FieldNotificationService;
use App\Services\FieldReferenceResolver;
use App\Services\Receipt\ReceiptPriceComparison;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ReportReviewController extends Controller
{
    public function __construct(private readonly FieldReferenceResolver $references)
    {
    }

    /**
     * Where a report sits in the evaluator's workflow, as stored statuses.
     *
     * The panel previously guessed buckets from substrings of the status text, which matched only
     * two of the six statuses the system actually writes — "Submitted" (the default for every new
     * report) and "Referred for field verification" (written by this very controller) fell into no
     * bucket at all, leaving two filter pills permanently empty.
     */
    private const FILTERS = [
        'to_review' => ['Submitted', 'Under initial evaluation'],
        'with_officer' => ['Referred for field verification'],
        // Written only when an item decision is confirmed_violation.
        'violations' => ['Under regulatory review'],
        // Covers both a recorded no-violation finding and a report resolved without one; the two
        // are distinguishable only by the presence of regulatory_findings rows.
        'no_violation' => ['Resolved'],
        'rejected' => ['Closed'],
    ];

    /** Reports still with the consumer or the OCR pipeline; they never enter the review queue. */
    private const UNREVIEWABLE_STATUSES = ['Processing receipt', 'Ready for confirmation', 'Needs recapture', 'Processing failed'];

    public function index(Request $request, AdminAuthorizationService $auth, ReceiptPriceComparison $comparison)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'page' => 'sometimes|integer|min:1',
            'per_page' => 'sometimes|integer|min:1|max:50',
            'filter' => ['sometimes', 'string', Rule::in(array_merge(['all'], array_keys(self::FILTERS)))],
            'store_id' => 'sometimes|nullable|integer|exists:stores,id',
            'date_from' => 'sometimes|nullable|date',
            // Only when a start exists: otherwise Laravel reads "date_from" as a literal date and
            // rejects a range that has an end alone.
            'date_to' => array_filter(['sometimes', 'nullable', 'date', $request->filled('date_from') ? 'after_or_equal:date_from' : null]),
        ]);
        $filter = $filters['filter'] ?? 'all';
        $scope = $this->scope($filters);

        $query = $scope($this->reviewQuery());
        if (isset(self::FILTERS[$filter])) {
            $query->whereIn('status', self::FILTERS[$filter]);
        }

        $paginator = $query->latest()->paginate($filters['per_page'] ?? 20);
        $reports = $paginator->getCollection()->map(fn ($report) => $this->reportRow($report, $comparison, verifyFiles: false));
        return response()->json([
            'data' => $reports,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
                'filter' => $filter,
                // Queue-wide, so a pill shows how much work exists rather than how much of it
                // happens to be on the page being viewed.
                'filter_counts' => $this->filterCounts($scope),
            ],
        ]);
    }

    /**
     * Narrows the queue to one establishment and a receipt-date range.
     *
     * The range is on the receipt date the table shows, which observedAtFor() takes from the OCR
     * JSON when present. It is resolved here rather than in SQL: JSON date extraction differs between
     * pgsql and sqlite, and a second definition of "receipt date" would drift from the column.
     */
    private function scope(array $filters): \Closure
    {
        $storeId = $filters['store_id'] ?? null;
        $from = isset($filters['date_from']) ? \Illuminate\Support\Carbon::parse($filters['date_from'])->toDateString() : null;
        $to = isset($filters['date_to']) ? \Illuminate\Support\Carbon::parse($filters['date_to'])->toDateString() : null;

        $ids = null;
        if ($from || $to) {
            // ponytail: O(n) scan of queue receipt dates; store an observed_on column if the queue reaches thousands.
            $ids = ConsumerReport::query()->whereNotIn('status', self::UNREVIEWABLE_STATUSES)
                ->when($storeId, fn ($query) => $query->where('store_id', $storeId))
                ->get(['id', 'raw_ocr_json', 'submitted_at', 'created_at'])
                ->filter(function (ConsumerReport $report) use ($from, $to) {
                    $date = $this->observedAtFor($report);

                    return $date !== null && (! $from || $date >= $from) && (! $to || $date <= $to);
                })
                ->pluck('id');
        }

        return fn ($query) => $query
            ->when($storeId, fn ($nested) => $nested->where('store_id', $storeId))
            ->when($ids !== null, fn ($nested) => $nested->whereIn('id', $ids));
    }

    /**
     * How many reports sit in each workflow state across the whole queue.
     *
     * A status outside the map is a bug, but it must not fail the request: consumer_reports.status
     * is an unconstrained string and cancelling a referral restores a value captured in immutable
     * context_json. Unrecognised rows stay reachable under "all" and are logged instead.
     */
    private function filterCounts(\Closure $scope): array
    {
        $byStatus = $scope($this->reviewQuery())->getQuery()
            ->select('status')->selectRaw('count(*) as aggregate')
            ->groupBy('status')->pluck('aggregate', 'status');

        $counts = ['all' => (int) $byStatus->sum()];
        foreach (self::FILTERS as $name => $statuses) {
            $counts[$name] = (int) collect($statuses)->sum(fn ($status) => $byStatus[$status] ?? 0);
        }

        $unmapped = $byStatus->keys()->diff(collect(self::FILTERS)->flatten());
        if ($unmapped->isNotEmpty()) {
            Log::warning('Consumer report statuses outside the workflow filter map.', ['statuses' => $unmapped->values()->all()]);
        }

        return $counts;
    }

    /** Relations every review payload needs, loaded once so a row never triggers per-item queries. */
    private function reviewQuery()
    {
        return ConsumerReport::with([
            'store', 'items.srp', 'evidenceBundle.assets', 'evidenceAttempts.assets', 'activeVerificationRequest', 'latestVerificationRequest',
        ])->whereNotIn('status', self::UNREVIEWABLE_STATUSES);
    }

    /**
     * The single shape every consumer-report response uses.
     *
     * Decisions previously returned the raw Eloquent model, which carried none of the fields built
     * here — so saving a decision blanked the store name and the evidence viewer in the panel, and
     * leaked the consumer's tracking token hashes. Routing every report-scoped response through this
     * allow-list fixes both.
     */
    /**
     * @param bool $verifyFiles Queue pages skip the per-asset Storage round trip (an HTTP request on the
     *                          s3 disk) and report DB-recorded assets as `evidence_verified: false`; detail
     *                          and decision responses verify every file. Downloads always verify.
     */
    private function reportRow(ConsumerReport $report, ReceiptPriceComparison $comparison, bool $verifyFiles = true): array
    {
        $assetAvailable = fn ($asset) => ! $verifyFiles || Storage::disk($asset->disk)->exists($asset->path);
        $request = $report->relationLoaded('activeVerificationRequest')
            ? ($report->activeVerificationRequest ?? $report->latestVerificationRequest)
            : $report->latestVerificationRequest;
        $observedAt = $this->observedAtFor($report);
        $items = $report->items->map(function ($item) use ($comparison, $observedAt) {
            return [
                'id' => $item->id,
                'sequence' => $item->sequence,
                'raw_text' => $item->raw_text,
                'item_name' => $item->item_name,
                'quantity' => $item->quantity,
                'unit' => $item->unit,
                'observed_price' => $item->observed_price,
                'unit_price' => $item->unit_price,
                'line_total' => $item->line_total,
                'uncertain_fields' => $item->uncertain_fields ?? [],
                'section' => $item->section,
                'possible_duplicate_of' => $item->possible_duplicate_of,
                'ocr_confidence' => $item->ocr_confidence,
                'srp_id' => $item->srp_id,
                'commodity_key' => $item->srp?->commodity_key,
                'commodity_name' => $item->srp?->commodity_name ?? $item->item_name,
                'evaluator_decision_json' => $item->evaluator_decision_json,
                // The applicable reference and the price comparison against it, per item.
                'reference' => $comparison->forItem($item, $observedAt),
            ];
        })->values();

        return [
            'id' => $report->id, 'report_reference' => $report->report_reference, 'status' => $report->status,
            'store_name' => $report->store?->store_name, 'submitted_at' => $report->submitted_at ?? $report->created_at,
            'raw_ocr_json' => $report->raw_ocr_json,
            'evaluator_confirmed_json' => $report->evaluator_confirmed_json,
            // The purchase date governs which reference applies; the submission date does not.
            'observed_at' => $observedAt,
            'protocol' => $this->references->protocolAt($observedAt),
            'above_reference_count' => $items->filter(fn ($item) => ($item['reference']['is_above_reference'] ?? null) === true)->count(),
            'verification_request' => $request ? [
                'id' => $request->id,
                'status' => $request->status,
                'reason' => $request->reason,
                'store_id' => $request->store_id,
                'claimed_by' => $request->claimed_by,
                'requested_at' => $request->requested_at,
                'claimed_at' => $request->claimed_at,
                'completed_at' => $request->completed_at,
                'cancelled_at' => $request->cancelled_at,
            ] : null,
            'evidence_available' => ($report->image_vault_path && Storage::disk('local')->exists($report->image_vault_path))
                || (bool) $report->evidenceBundle?->assets->contains($assetAvailable)
                || $report->evidenceAttempts->flatMap->assets->contains($assetAvailable),
            'evidence_verified' => $verifyFiles,
            'evidence_summary' => $report->evidenceBundle ? [
                'capture_mode' => $report->evidenceBundle->capture_mode,
                'processing_status' => $report->evidenceBundle->processing_status,
                'asset_count' => $report->evidenceBundle->assets->count(),
                'continuity' => data_get($report->evidenceBundle->processing_result_json, 'continuity.status'),
                'merchant' => data_get($report->evidenceBundle->processing_result_json, 'merchant.status'),
            ] : null,
            'items' => $items,
        ];
    }

    /**
     * The date the receipt records, falling back to submission only when extraction found none.
     * A receipt bought before an SRP revision but submitted after it must resolve to the older one.
     */
    private function observedAtFor(ConsumerReport $report): ?string
    {
        $detected = data_get($report->raw_ocr_json, 'transaction_date');

        if (is_string($detected) && trim($detected) !== '') {
            try {
                return \Illuminate\Support\Carbon::parse($detected)->toDateString();
            } catch (\Throwable) {
                // An unparseable extracted date is no better than none; fall through.
            }
        }

        return ($report->submitted_at ?? $report->created_at)?->toDateString();
    }

    /** One report in the shared shape, reloaded so a freshly written decision reads back complete. */
    private function freshRow(ConsumerReport $report, ReceiptPriceComparison $comparison): array
    {
        return $this->reportRow(
            ConsumerReport::with([
                'store', 'items.srp', 'evidenceBundle.assets', 'evidenceAttempts.assets', 'activeVerificationRequest', 'latestVerificationRequest',
            ])->findOrFail($report->id),
            $comparison,
        );
    }

    public function requestVerification(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, AuditTrailService $audit, FieldNotificationService $notifications)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'reason' => 'required|string|max:2000',
            'field_officer_id' => ['required', Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', 'field_officer')->where('is_active', true))],
        ]);

        $verification = DB::transaction(function () use ($request, $report, $data, $audit, $notifications) {
            // Store before report: field sync, report decisions and legal notices lock the store first too.
            $store = $report->store_id ? Store::query()->whereKey($report->store_id)->lockForUpdate()->first() : null;
            $report = ConsumerReport::query()->lockForUpdate()->findOrFail($report->id);
            abort_unless((int) $store?->id === (int) $report->store_id, 409, 'This report changed. Reload it and try again.');
            abort_if($report->verificationRequest()->exists(), 409, 'This report already has a field verification request.');
            // Re-checked on the locked row: a report still capturing or extracting its receipt cannot be referred.
            abort_unless(in_array($report->status, ReportReviewService::DECIDABLE_STATUSES, true), 409, 'This report is still being processed and cannot be referred yet.');
            abort_unless($store?->is_active, 422, 'An active linked store is required for field verification.');
            $officer = User::findOrFail($data['field_officer_id']);

            $previous = $report->status;
            $verification = FieldVerificationRequest::create([
                'consumer_report_id' => $report->id,
                'source_type' => 'complaint',
                'store_id' => $store->id,
                'requested_by' => $request->user()->id,
                'claimed_by' => $officer->id,
                'status' => 'claimed',
                'reason' => $data['reason'],
                'context_json' => [
                    'report_reference' => $report->report_reference,
                    'return_status' => $previous,
                    'submitted_at' => ($report->submitted_at ?? $report->created_at)?->toIso8601String(),
                    'reported_items' => $report->items()->get(['item_name', 'observed_price', 'unit'])->toArray(),
                ],
                'requested_at' => now(),
                'claimed_at' => now(),
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
            $notifications->send($officer, 'verification_assigned', [
                'verification_request_id' => $verification->id, 'store_id' => $store->id, 'store_name' => $store->store_name,
            ]);

            return $verification;
        });

        return response()->json(['data' => $verification], 201);
    }

    public function cancelVerification(Request $request, FieldVerificationRequest $verificationRequest, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        DB::transaction(function () use ($request, $verificationRequest, $audit) {
            // Store, then verification, then report: the order field sync uses.
            Store::query()->whereKey($verificationRequest->store_id)->lockForUpdate()->first();
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'open', 422, 'Only an open verification request can be cancelled.');
            $verificationRequest->update(['status' => 'cancelled', 'cancelled_at' => now()]);
            if ($report = ConsumerReport::query()->lockForUpdate()->find($verificationRequest->consumer_report_id)) {
                $previous = $report->status;
                $returnStatus = $verificationRequest->context_json['return_status'] ?? $previous;
                if ($previous !== $returnStatus) {
                    $report->update(['status' => $returnStatus]);
                    ReportStatusHistory::create([
                        'consumer_report_id' => $report->id, 'previous_status' => $previous, 'new_status' => $returnStatus,
                        'public_message' => 'DTI cancelled the field verification request.', 'internal_notes' => $verificationRequest->reason,
                        'actor_type' => 'dti_evaluator', 'actor_id' => $request->user()->id,
                    ]);
                }
            }
            $audit->recordOrFail($request, 'field_verification.cancelled', $verificationRequest);
        });

        return response()->json(['data' => $verificationRequest->fresh()]);
    }

    public function reopenVerification(Request $request, FieldVerificationRequest $verificationRequest, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        DB::transaction(function () use ($request, $verificationRequest, $audit) {
            // Store, then verification, then report: the order field sync uses.
            Store::query()->whereKey($verificationRequest->store_id)->lockForUpdate()->first();
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'cancelled', 422, 'Only a cancelled verification request can be reopened. Claimed work must be released by the assigned officer.');
            $verificationRequest->update([
                'status' => 'open', 'claimed_by' => null,
                'released_at' => $verificationRequest->released_at,
            ]);
            if ($report = ConsumerReport::query()->lockForUpdate()->find($verificationRequest->consumer_report_id)) {
                $previous = $report->status;
                if ($previous !== 'Referred for field verification') {
                    $report->update(['status' => 'Referred for field verification']);
                    ReportStatusHistory::create([
                        'consumer_report_id' => $report->id, 'previous_status' => $previous, 'new_status' => 'Referred for field verification',
                        'public_message' => 'DTI reopened the field verification request.', 'internal_notes' => $verificationRequest->reason,
                        'actor_type' => 'dti_evaluator', 'actor_id' => $request->user()->id,
                    ]);
                }
            }
            $audit->recordOrFail($request, 'field_verification.reopened', $verificationRequest);
        });

        return response()->json(['data' => $verificationRequest->fresh()]);
    }
    private const DECIDABLE_STATUSES = ReportReviewService::DECIDABLE_STATUSES;

    public function decision(Request $request, ConsumerReport $report, AdminAuthorizationService $auth, ReportReviewService $service, ReceiptPriceComparison $comparison)
    {
        $auth->requireManager($request->user());
        // The queue hides in-progress reports, but that is a filter, not a guard: without this an
        // evaluator reaching the route directly could decide a report the consumer has not confirmed.
        abort_unless(
            in_array($report->status, self::DECIDABLE_STATUSES, true),
            422,
            'This report is still being processed and cannot be decided yet.',
        );
        abort_if($report->activeVerificationRequest()->exists(), 409, 'An open field verification request must be resolved first.');
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
                // A line that is not an SRP commodity has no key; only a violation needs one to cite.
                '*.commodity_key' => 'nullable|string|max:255|required_if:*.regulatory_finding,confirmed_violation',
                '*.commodity_name' => 'nullable|string|max:255',
                '*.receipt_price' => 'required|numeric|min:0',
                '*.observed_at' => 'required|date',
                '*.regulatory_finding' => 'required|in:confirmed_violation,no_violation,insufficient_evidence',
            ])->validate();
            $reportItemIds = $report->items()->pluck('id')->sort()->values()->all();
            $decisionItemIds = collect($data['item_decisions'])->pluck('item_id')->unique()->sort()->values()->all();
            abort_unless($decisionItemIds === $reportItemIds, 422, 'A decision is required for every item in this report.');

            $service->decideItems(
                $report,
                $data['action'],
                $data['item_decisions'],
                $data['reason'],
                $request->user(),
                $request,
            );

            return response()->json(['data' => $this->freshRow($report, $comparison)]);
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
        $service->decide($report, $data['action'], $data['corrected'] ?? [], $data['reason'], $request->user(), $request);

        return response()->json(['data' => $this->freshRow($report, $comparison)]);
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
