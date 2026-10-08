<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessReceiptEvidence;
use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceAsset;
use App\Models\ReceiptEvidenceBundle;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Models\WebPushSubscription;
use App\Services\Receipt\Extraction\ReceiptExtractionBudget;
use App\Services\Receipt\Extraction\ReceiptFailureCodes;
use App\Services\Receipt\ConsumerReportAssessment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReceiptReportController extends Controller
{
    public function startRecapture(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $restartOnly = $this->restartOnlyFailure($report);
        if (! $restartOnly && ! in_array($report->status, ['Ready for confirmation', 'Needs recapture'], true)) {
            return response()->json(['success' => false, 'message' => 'This report is not eligible for receipt recapture.'], 409);
        }
        $validated = $request->validate([
            'replace_sequence' => 'nullable|integer|min:0|max:11',
            'append' => 'nullable|boolean',
            'restart' => 'nullable|boolean',
        ]);
        $replaceSequence = array_key_exists('replace_sequence', $validated) ? (int) $validated['replace_sequence'] : null;
        $append = (bool) ($validated['append'] ?? false);
        $restart = (bool) ($validated['restart'] ?? false);
        abort_if((int) ($replaceSequence !== null) + (int) $append + (int) $restart > 1, 422, 'Choose one receipt recapture action.');
        // Retaking or adding a section would carry the compromised originals forward.
        abort_if($restartOnly && ! $restart, 422, 'This receipt must be captured again from the start.');

        $report->load('evidenceBundle.assets');
        $sourceAssets = $report->evidenceBundle?->assets->where('kind', 'source_frame')->sortBy('sequence')->values() ?? collect();
        if ($report->status === 'Ready for confirmation') {
            abort_unless($replaceSequence !== null || $append || $restart, 422, 'Choose a receipt section to retake, add, or restart.');
        }
        if ($replaceSequence !== null) {
            abort_unless($sourceAssets->contains('sequence', $replaceSequence), 422, 'That original receipt section is unavailable.');
        }
        $uploadSequence = $append ? ((int) ($sourceAssets->max('sequence') ?? -1) + 1) : ($replaceSequence ?? 0);
        abort_if($uploadSequence > 11, 422, 'This receipt already has the maximum number of sections.');

        $rawToken = 'ct_sec_'.Str::random(32);
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $report->store_id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'open',
            'token_hash' => hash('sha256', $rawToken),
            'expires_at' => now()->addMinutes(15),
            'is_used' => false,
        ]);
        $bundle = ReceiptEvidenceBundle::create([
            'evidence_uuid' => (string) Str::uuid(),
            'capture_session_id' => $session->id,
            'store_id' => $report->store_id,
            'capture_mode' => 'guided_photos_v1',
            'processing_status' => 'collecting',
            'processing_result_json' => ['required_upload_sequence' => $uploadSequence],
        ]);
        $carriedSequences = [];
        if (! $restart && ($append || $replaceSequence !== null)) {
            foreach ($sourceAssets as $asset) {
                if ($asset->sequence === $replaceSequence) {
                    continue;
                }
                abort_unless($asset->hasValidContent(), 422, 'An original receipt section is unavailable or failed its integrity check.');
                $extension = pathinfo($asset->path, PATHINFO_EXTENSION) ?: 'jpg';
                $path = "receipt-evidence/{$bundle->evidence_uuid}/source_frame-{$asset->sequence}-{$asset->sha256}.{$extension}";
                $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
                abort_unless(
                    Storage::disk($disk)->put($path, Storage::disk($asset->disk)->get($asset->path), ['visibility' => 'private']),
                    503,
                    'Receipt evidence storage is unavailable. Try again later.',
                );
                ReceiptEvidenceAsset::create([
                    'receipt_evidence_bundle_id' => $bundle->id,
                    'kind' => 'source_frame',
                    'sequence' => $asset->sequence,
                    'disk' => $disk,
                    'path' => $path,
                    'original_filename' => $asset->original_filename,
                    'mime_type' => $asset->mime_type,
                    'size_bytes' => $asset->size_bytes,
                    'sha256' => $asset->sha256,
                    'metadata_json' => array_merge($asset->metadata_json ?? [], [
                        'carried_from_asset_id' => $asset->id,
                        'carried_from_bundle_id' => $asset->receipt_evidence_bundle_id,
                    ]),
                ]);
                $carriedSequences[] = (int) $asset->sequence;
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Recapture session initialized.',
            'data' => [
                'report_reference' => $report->report_reference,
                'capture_session_id' => $session->id,
                'session_uuid' => $session->session_uuid,
                'capture_token' => $rawToken,
                'expires_at' => $session->expires_at->toIso8601String(),
                'capture_mode' => $session->capture_mode,
                'store_id' => $report->store_id,
                'max_file_size' => 2 * 1024 * 1024,
                'accepted_types' => ['image/jpeg', 'image/png', 'image/webp'],
                'capture_action' => $append ? 'append' : ($replaceSequence !== null ? 'replace' : 'full'),
                'upload_sequence' => $uploadSequence,
                'carried_sequences' => $carriedSequences,
                'limits' => [
                    'max_frame_bytes' => 2 * 1024 * 1024,
                    'min_frames' => 1,
                    'max_frames' => 12,
                ],
            ],
        ], 201);
    }

    public function finalizeRecapture(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $validated = $request->validate(['capture_token' => 'required|string']);
        $session = CaptureSession::where('token_hash', hash('sha256', $validated['capture_token']))
            ->with('evidenceBundle.assets')
            ->first();
        if ($session?->is_used && $report->capture_session_id === $session->id) {
            return response()->json([
                'success' => true,
                'message' => 'New receipt evidence was already queued under the same report reference.',
                'data' => ['report_reference' => $report->report_reference, 'status' => $report->status],
            ]);
        }
        if (! $session || $session->is_used || $session->expires_at->isPast()) {
            return response()->json(['success' => false, 'message' => 'The recapture session is invalid or expired.'], 422);
        }
        if ($session->store_id !== $report->store_id || $session->capture_mode !== 'guided_photos_v1') {
            abort(403, 'The recapture session does not belong to this report.');
        }
        $bundle = $session->evidenceBundle;
        $requiredSequence = (int) data_get($bundle?->processing_result_json, 'required_upload_sequence', 0);
        $requiredAsset = $bundle?->assets->first(fn ($asset) => $asset->kind === 'source_frame' && $asset->sequence === $requiredSequence);
        if (! $bundle || ! $requiredAsset || data_get($requiredAsset->metadata_json, 'carried_from_asset_id')) {
            return response()->json(['success' => false, 'message' => 'Capture the required original receipt section before retrying processing.'], 422);
        }

        DB::transaction(function () use ($report, $session, $bundle) {
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            if (! $this->restartOnlyFailure($locked) && ! in_array($locked->status, ['Ready for confirmation', 'Needs recapture'], true)) {
                abort(409, 'This report is no longer eligible for receipt recapture.');
            }
            $previousStatus = $locked->status;

            if ($locked->receipt_evidence_bundle_id) {
                ReceiptEvidenceBundle::whereKey($locked->receipt_evidence_bundle_id)
                    ->whereNull('consumer_report_id')
                    ->update(['consumer_report_id' => $locked->id, 'attempt_number' => 1]);
            }
            $attemptNumber = (int) ReceiptEvidenceBundle::where('consumer_report_id', $locked->id)->max('attempt_number') + 1;
            $bundle->update([
                'consumer_report_id' => $locked->id,
                'attempt_number' => max(2, $attemptNumber),
                'processing_status' => 'queued',
                'processing_result_json' => null,
                'failure_code' => null,
            ]);
            $locked->items()->delete();
            $locked->update([
                'capture_session_id' => $session->id,
                'receipt_evidence_bundle_id' => $bundle->id,
                'capture_mode' => 'guided_photos_v1',
                'processing_status' => 'queued',
                'status' => 'Processing receipt',
                'raw_ocr_json' => null,
                'consumer_confirmed_json' => null,
                'consumer_confirmed_at' => null,
                'submitted_at' => null,
            ]);
            $session->update(['is_used' => true, 'processing_status' => 'finalized']);
            ReportStatusHistory::create([
                'consumer_report_id' => $locked->id,
                'previous_status' => $previousStatus,
                'new_status' => 'Processing receipt',
                'public_message' => 'New receipt evidence received and queued for processing.',
                'actor_type' => 'system',
            ]);
        });

        ProcessReceiptEvidence::dispatch($report->report_reference)->afterCommit();

        return response()->json([
            'success' => true,
            'message' => 'New receipt evidence queued for processing under the same report reference.',
            'data' => ['report_reference' => $report->report_reference, 'status' => 'Processing receipt'],
        ]);
    }

    public function retryProcessing(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);

        return DB::transaction(function () use ($report) {
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            $bundle = ReceiptEvidenceBundle::whereKey($locked->receipt_evidence_bundle_id)->lockForUpdate()->first();
            $locked->setRelation('evidenceBundle', $bundle);
            if ($locked->status !== 'Processing failed' || ! $bundle) {
                return response()->json(['success' => false, 'message' => 'Only a failed receipt process can be retried.'], 409);
            }
            $blocked = $this->retryBlockCode($locked);
            if ($blocked !== null) {
                return response()->json(['success' => false, 'message' => ReceiptFailureCodes::publicReason($blocked) ?? 'This receipt cannot be processed again.'], 409);
            }
            $locked->update(['status' => 'Processing receipt', 'processing_status' => 'queued']);
            // A paid extraction stored before the failure is kept so the retry reuses it instead of buying another.
            $state = array_intersect_key((array) $bundle->processing_result_json, array_flip(['pending_extraction', 'gemini_retry']));
            // Older failed bundles predate fallback metadata; seed their first manual retry from the saved failure.
            $fallback = trim((string) config('services.gemini.fallback_model'));
            if (! isset($state['gemini_retry']) && $fallback !== '' && $fallback !== (string) config('services.gemini.model')
                && ReceiptFailureCodes::canUseGeminiFallback($bundle->failure_code)) {
                $state['gemini_retry'] = ['model' => $fallback, 'reason_code' => $bundle->failure_code];
            }
            $bundle->update([
                'processing_status' => 'queued',
                'processing_result_json' => $state ?: null,
                'processing_started_at' => null,
                'processing_completed_at' => null,
                'failure_code' => null,
            ]);
            ReportStatusHistory::create([
                'consumer_report_id' => $locked->id,
                'previous_status' => 'Processing failed',
                'new_status' => 'Processing receipt',
                'public_message' => 'Receipt processing retry queued using the original evidence.',
                'actor_type' => 'system',
            ]);
            ProcessReceiptEvidence::dispatch($locked->report_reference)->afterCommit();

            return response()->json([
                'success' => true,
                'message' => 'Receipt processing retry queued.',
                'data' => ['report_reference' => $locked->report_reference, 'status' => 'Processing receipt'],
            ]);
        });
    }

    public function subscribe(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $validated = $request->validate([
            'subscription' => 'required|array',
            'subscription.endpoint' => 'required|url:https|max:2048',
            'subscription.expirationTime' => 'nullable|numeric',
            'subscription.keys' => 'required|array',
            'subscription.keys.p256dh' => 'required|string|max:1024',
            'subscription.keys.auth' => 'required|string|max:1024',
        ]);
        $subscriptionData = $validated['subscription'];

        $subscription = WebPushSubscription::updateOrCreate(
            ['endpoint_hash' => hash('sha256', $subscriptionData['endpoint'])],
            [
                'subscription_json' => $subscriptionData,
                'user_agent' => $request->userAgent(),
                'permission_granted_at' => now(),
                'revoked_at' => null,
            ],
        );
        $report->pushSubscriptions()->syncWithoutDetaching([$subscription->id]);

        return response()->json([
            'success' => true,
            'message' => 'Receipt-ready notifications enabled.',
            'data' => ['notifications_enabled' => true],
        ], 201);
    }

    public function unsubscribe(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $validated = $request->validate([
            'endpoint' => 'required|url:https|max:2048',
        ]);
        $subscription = WebPushSubscription::where('endpoint_hash', hash('sha256', $validated['endpoint']))->first();
        if ($subscription) {
            $report->pushSubscriptions()->detach($subscription->id);
            if (! $subscription->reports()->exists()) {
                $subscription->delete();
            }
        }

        return response()->json(['success' => true, 'data' => ['notifications_enabled' => false]]);
    }

    public function processing(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $report->loadMissing(['evidenceBundle.assets', 'store']);
        $latestHistory = $report->statusHistories()->reorder()->latest('id')->first();
        $reasonCode = $report->evidenceBundle?->failure_code
            ?? data_get($report->evidenceBundle?->processing_result_json, 'reason_code');
        $failed = $report->status === 'Processing failed';
        $blocked = $failed ? $this->retryBlockCode($report) : null;
        $failureCode = $failed ? ($blocked ?? $report->evidenceBundle?->failure_code) : null;
        $failureMessage = $failed ? ReceiptFailureCodes::publicReason($failureCode) : null;

        return response()->json([
            'success' => true,
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
                'processing_status' => $report->processing_status,
                'message' => $latestHistory?->public_message,
                'created_at' => $report->created_at->toIso8601String(),
                'submitted_at' => $report->submitted_at?->toIso8601String(),
                'ready_for_review' => $report->status === 'Ready for confirmation',
                'can_recapture' => $report->status === 'Needs recapture' || ($failed && ReceiptFailureCodes::isRestartOnly($failureCode)),
                'can_retry_processing' => $failed && $blocked === null && $report->evidenceBundle !== null,
                'failure_reason' => $failureMessage !== null ? ['code' => $failureCode, 'message' => $failureMessage] : null,
                'attempt_number' => (int) ($report->evidenceBundle?->attempt_number ?? 1),
                'store' => $report->store ? [
                    'id' => $report->store->id,
                    'store_name' => $report->store->store_name,
                ] : null,
                'recapture_reason' => $report->status === 'Needs recapture' && $reasonCode
                    ? ['code' => $reasonCode, 'message' => $this->safeReasonMessage($reasonCode)]
                    : null,
                'evidence' => $this->sourceEvidence($report),
            ],
        ]);
    }

    public function review(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        if (! in_array($report->status, ['Ready for confirmation', 'Submitted'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Receipt results are not ready for review.',
            ], 409);
        }

        $report->load(['store', 'items', 'evidenceBundle.assets']);
        $processingResult = $report->evidenceBundle?->processing_result_json ?? [];

        return response()->json([
            'success' => true,
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
                'attempt_number' => (int) ($report->evidenceBundle?->attempt_number ?? 1),
                'store' => $report->store ? [
                    'id' => $report->store->id,
                    'store_name' => $report->store->store_name,
                    'address' => $report->store->address,
                ] : null,
                'lines' => $report->raw_ocr_json['lines'] ?? [],
                'items' => $report->items->map(fn ($item) => [
                    'sequence' => $item->sequence,
                    'raw_text' => $item->raw_text,
                    'item_name' => $item->item_name,
                    'quantity' => $item->quantity !== null ? (float) $item->quantity : null,
                    'unit' => $item->unit,
                    'observed_price' => $item->observed_price !== null ? (float) $item->observed_price : null,
                    'unit_price' => $item->unit_price !== null ? (float) $item->unit_price : null,
                    'line_total' => $item->line_total !== null ? (float) $item->line_total : null,
                    'uncertain_fields' => $item->uncertain_fields ?? [],
                    'section' => $item->section,
                    'possible_duplicate_of' => $item->possible_duplicate_of,
                    'ocr_confidence' => $item->ocr_confidence,
                ])->values(),
                'receipt_number' => $processingResult['receipt_number'] ?? ($report->raw_ocr_json['receipt_number'] ?? null),
                'subtotal' => $processingResult['subtotal'] ?? ($report->raw_ocr_json['subtotal'] ?? null),
                'subtotal_uncertain' => (bool) ($processingResult['subtotal_uncertain'] ?? ($report->raw_ocr_json['subtotal_uncertain'] ?? false)),
                'total' => $processingResult['total'] ?? ($report->raw_ocr_json['total'] ?? null),
                'total_uncertain' => (bool) ($processingResult['total_uncertain'] ?? ($report->raw_ocr_json['total_uncertain'] ?? false)),
                'discounts' => $this->publicAmountLines($processingResult['discounts'] ?? ($report->raw_ocr_json['discounts'] ?? [])),
                'adjustments' => $this->publicAmountLines($processingResult['adjustments'] ?? ($report->raw_ocr_json['adjustments'] ?? [])),
                'reconciliation' => $this->publicReconciliation($processingResult['reconciliation'] ?? ($report->raw_ocr_json['reconciliation'] ?? null)),
                'extraction_provider' => data_get($report->raw_ocr_json, 'engine.provider'),
                'continuity' => $processingResult['continuity'] ?? ($report->raw_ocr_json['continuity'] ?? null),
                'merchant' => $processingResult['merchant'] ?? ($report->raw_ocr_json['merchant'] ?? null),
                'transaction_date' => data_get($processingResult, 'transaction_date')
                    ?? data_get($report->raw_ocr_json, 'transaction_date')
                    ?? data_get($report->raw_ocr_json, 'metadata.transactionDate'),
                'detected_total' => $processingResult['detected_total'] ?? ($report->raw_ocr_json['detected_total'] ?? null),
                'warnings' => $processingResult['warnings'] ?? ($report->raw_ocr_json['warnings'] ?? []),
                'manual_review_required' => (bool) ($processingResult['manual_review_required'] ?? false),
                'evidence' => $this->sourceEvidence($report),
            ],
        ]);
    }

    public function evidenceAsset(Request $request, string $reference, ReceiptEvidenceAsset $asset)
    {
        $report = $this->authorizedReport($request, $reference);
        abort_unless(
            $report->receipt_evidence_bundle_id
                && $asset->receipt_evidence_bundle_id === $report->receipt_evidence_bundle_id
                && $asset->kind === 'source_frame',
            404,
        );
        abort_unless(Storage::disk($asset->disk)->exists($asset->path), 404);
        abort_unless($asset->hasValidContent(), 409, 'Receipt evidence failed its integrity check.');

        return response(Storage::disk($asset->disk)->get($asset->path), 200, [
            'Content-Type' => $asset->mime_type,
            'Cache-Control' => 'no-store, private',
            'Content-Disposition' => 'inline',
        ]);
    }

    public function confirm(Request $request, string $reference, ConsumerReportAssessment $assessment)
    {
        $report = $this->authorizedReport($request, $reference);
        $rules = [
            'consumer_confirmed' => 'required|accepted',
            'tracking_token' => 'sometimes|string',
        ];
        foreach (array_keys($request->except(['consumer_confirmed', 'tracking_token'])) as $field) {
            $rules[$field] = 'prohibited';
        }
        $request->validate($rules);

        if ($report->consumer_confirmed_at !== null || $report->status === 'Submitted') {
            return response()->json([
                'success' => true,
                'message' => 'Receipt items were already confirmed.',
                'data' => ['report_reference' => $report->report_reference, 'status' => $report->status],
            ]);
        }
        if ($report->status !== 'Ready for confirmation') {
            return response()->json([
                'success' => false,
                'message' => 'Only a receipt that is ready for confirmation can be submitted.',
            ], 409);
        }
        $report->loadMissing('evidenceBundle.assets');
        $originals = $report->capture_mode === 'continuous_video_v1'
            ? $report->evidenceBundle?->assets->where('kind', 'original_video') ?? collect()
            : $report->evidenceBundle?->assets->where('kind', 'source_frame') ?? collect();
        if ($originals->isEmpty() || $originals->contains(fn ($asset) => ! $asset->hasValidContent())) {
            return response()->json([
                'success' => false,
                'message' => 'The original receipt evidence is unavailable. This report cannot be submitted.',
            ], 409);
        }
        DB::transaction(function () use ($report, $request, $assessment) {
            if ($report->store_id) Store::whereKey($report->store_id)->lockForUpdate()->first();
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $locked->store_id === (int) $report->store_id, 409, 'This report changed. Reload it and try again.');
            if ($locked->consumer_confirmed_at !== null || $locked->status === 'Submitted') {
                return;
            }
            abort_unless($locked->status === 'Ready for confirmation', 409, 'Only a receipt that is ready for confirmation can be submitted.');

            $systemItems = $locked->items()->orderBy('sequence')->get()->map(fn ($item) => [
                'sequence' => $item->sequence,
                'item_name' => $item->item_name,
                'quantity' => $item->quantity !== null ? (float) $item->quantity : null,
                'unit' => $item->unit,
                'observed_price' => $item->observed_price !== null ? (float) $item->observed_price : null,
                'unit_price' => $item->unit_price !== null ? (float) $item->unit_price : null,
                'line_total' => $item->line_total !== null ? (float) $item->line_total : null,
                'uncertain_fields' => $item->uncertain_fields ?? [],
            ])->values()->all();
            $locked->update([
                'consumer_confirmed_json' => null,
                'consumer_confirmed_at' => now(),
                'submitted_at' => now(),
                'resume_token_hash' => null,
                'processing_status' => 'confirmed',
                'status' => 'Submitted',
            ]);

            ReportStatusHistory::create([
                'consumer_report_id' => $locked->id,
                'previous_status' => 'Ready for confirmation',
                'new_status' => 'Submitted',
                'public_message' => 'Consumer reviewed the captured receipt and system extraction. Report submitted for DTI evaluation.',
                'actor_type' => 'system',
            ]);

            $evidencePath = $locked->evidenceBundle?->assets()->where('kind', 'source_frame')->orderBy('sequence')->value('path')
                ?? $locked->evidenceBundle?->assets()->where('kind', 'original_video')->value('path')
                ?? $locked->image_vault_path
                ?? 'receipt-evidence/'.($locked->evidenceBundle?->evidence_uuid ?? $locked->report_reference);
            CitizenTip::create([
                'store_id' => $locked->store_id,
                'extracted_text_json' => [
                    'lines' => $locked->raw_ocr_json['lines'] ?? [],
                    'system_extracted_items' => $systemItems,
                    'report_reference' => $locked->report_reference,
                ],
                'image_hash_path' => $evidencePath,
                'status' => 'pending',
            ]);
            $locked->pushSubscriptions()->detach();
            $assessment->assess($locked, $request);
        });

        $report->refresh();

        return response()->json([
            'success' => true,
            'message' => 'Receipt evidence reviewed and submitted to DTI for evaluation.',
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
                'submitted_at' => $report->submitted_at?->toIso8601String(),
            ],
        ]);
    }

    private function authorizedReport(Request $request, string $reference): ConsumerReport
    {
        $report = ConsumerReport::where('report_reference', $reference)->firstOrFail();
        $resumeToken = (string) $request->header('X-Report-Resume-Token');
        $trackingToken = (string) ($request->input('tracking_token') ?: $request->header('X-Tracking-Token'));

        $resumeMatches = $resumeToken !== ''
            && $report->resume_token_hash !== null
            && hash_equals($report->resume_token_hash, hash('sha256', $resumeToken));
        $trackingMatches = $trackingToken !== ''
            && hash_equals($report->tracking_token_hash, hash('sha256', $trackingToken));

        abort_unless($resumeMatches || $trackingMatches, 403, 'Invalid report credential.');

        return $report;
    }

    /** Failures that only a fresh capture can recover (integrity, attempt cap, oversized request). */
    private function restartOnlyFailure(ConsumerReport $report): bool
    {
        return $report->status === 'Processing failed'
            && ReceiptFailureCodes::isRestartOnly($this->retryBlockCode($report));
    }

    /** Same eligibility for status and the locked retry write; completed extractions need no new allowance. */
    private function retryBlockCode(ConsumerReport $report): ?string
    {
        $bundle = $report->evidenceBundle;
        if (! $bundle) {
            return ReceiptFailureCodes::PROCESSING_FAILED;
        }
        if (! ReceiptFailureCodes::isRetryable($bundle->failure_code)) {
            if ($bundle->failure_code === ReceiptFailureCodes::EXTRACTION_ATTEMPT_CAP
                && app(ReceiptExtractionBudget::class)->blockingCode($report, $bundle, 0) === ReceiptFailureCodes::EXTRACTION_REPORT_CAP) {
                return ReceiptFailureCodes::EXTRACTION_REPORT_CAP;
            }

            return $bundle->failure_code;
        }
        $pending = $bundle->processing_result_json['pending_extraction'] ?? null;
        if (is_array($pending) && is_array($pending['payload'] ?? null) && $bundle->extraction_attempted_at !== null) {
            return null;
        }
        if (data_get($bundle->processing_result_json, 'engine.provider') !== 'gemini'
            && ! ReceiptFailureCodes::canUseGeminiFallback($bundle->failure_code)) {
            return null;
        }

        return app(ReceiptExtractionBudget::class)->blockingCode($report, $bundle, $bundle->assets()->where('kind', 'source_frame')->count());
    }

    /** Customer-facing amount lines: description, amount, and uncertainty only. */
    private function publicAmountLines(mixed $lines): array
    {
        return array_values(array_map(fn (array $line) => array_intersect_key($line, array_flip(['description', 'kind', 'direction', 'amount', 'uncertain'])),
            array_filter((array) $lines, 'is_array')));
    }

    private function publicReconciliation(mixed $reconciliation): ?array
    {
        return is_array($reconciliation)
            ? ['status' => $reconciliation['status'] ?? null, 'checks' => $reconciliation['checks'] ?? []]
            : null;
    }

    private function safeReasonMessage(string $reasonCode): string
    {
        return match ($reasonCode) {
            'INSUFFICIENT_FRAMES' => 'No usable receipt image was captured.',
            'TEXT_UNREADABLE' => 'The receipt text was not clear enough to read. Keep it flat, well lit, and in focus.',
            'RECEIPT_INCOMPLETE' => 'The bottom of the receipt, including the total, is missing. Add a section that shows it.',
            'INCOMPLETE_SCAN' => 'Adjacent receipt sections do not overlap enough to verify that the receipt is complete.',
            'STORE_NOT_CONFIRMED' => 'The store name on the receipt could not be matched to the selected establishment.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines could be verified.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not visible or readable.',
            'TOTAL_MISMATCH' => 'The detected item amounts did not match the receipt total.',
            default => 'The receipt could not be verified. Please capture it again.',
        };
    }

    private function sourceEvidence(ConsumerReport $report): array
    {
        return $report->evidenceBundle?->assets
            ->where('kind', 'source_frame')
            ->sortBy('sequence')
            ->map(fn ($asset) => [
                'id' => $asset->id,
                'sequence' => (int) $asset->sequence,
                'mime_type' => $asset->mime_type,
                'size_bytes' => (int) $asset->size_bytes,
            ])->values()->all() ?? [];
    }
}
