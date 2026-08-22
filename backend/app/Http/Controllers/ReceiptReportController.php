<?php

namespace App\Http\Controllers;

use App\Models\CitizenTip;
use App\Jobs\ProcessReceiptEvidence;
use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceBundle;
use App\Models\ReportStatusHistory;
use App\Models\WebPushSubscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReceiptReportController extends Controller
{
    public function startRecapture(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        if ($report->status !== 'Needs recapture' || $report->capture_mode !== 'continuous_video_v1') {
            return response()->json(['success' => false, 'message' => 'This report is not eligible for receipt recapture.'], 409);
        }

        $rawToken = 'ct_sec_'.Str::random(32);
        $session = CaptureSession::create([
            'session_uuid' => 'cs_'.Str::uuid(),
            'store_id' => $report->store_id,
            'capture_mode' => 'continuous_video_v1',
            'processing_status' => 'open',
            'token_hash' => hash('sha256', $rawToken),
            'expires_at' => now()->addMinutes(15),
            'is_used' => false,
        ]);

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
                'max_file_size' => 25 * 1024 * 1024,
                'accepted_types' => ['video/webm', 'video/mp4'],
                'limits' => [
                    'max_duration_seconds' => 30,
                    'max_video_bytes' => 25 * 1024 * 1024,
                    'max_frame_bytes' => 2 * 1024 * 1024,
                    'min_frames' => 2,
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
        if ($session->store_id !== $report->store_id || $session->capture_mode !== 'continuous_video_v1') {
            abort(403, 'The recapture session does not belong to this report.');
        }
        $bundle = $session->evidenceBundle;
        if (! $bundle || ! $bundle->assets->contains(fn ($asset) => $asset->kind === 'original_video' && $asset->sequence === 0)) {
            return response()->json(['success' => false, 'message' => 'Upload the continuous receipt video before retrying processing.'], 422);
        }

        DB::transaction(function () use ($report, $session, $bundle) {
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            if ($locked->status !== 'Needs recapture') {
                abort(409, 'Only a report that needs recapture can be retried.');
            }

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
                'previous_status' => 'Needs recapture',
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
        $report->loadMissing(['evidenceBundle', 'store']);
        $latestHistory = $report->statusHistories()->latest('id')->first();
        $reasonCode = $report->evidenceBundle?->failure_code
            ?? data_get($report->evidenceBundle?->processing_result_json, 'reason_code');

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
                'can_recapture' => $report->status === 'Needs recapture',
                'attempt_number' => (int) ($report->evidenceBundle?->attempt_number ?? 1),
                'store' => $report->store ? [
                    'id' => $report->store->id,
                    'store_name' => $report->store->store_name,
                ] : null,
                'recapture_reason' => $report->status === 'Needs recapture' && $reasonCode
                    ? ['code' => $reasonCode, 'message' => $this->safeReasonMessage($reasonCode)]
                    : null,
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

        $report->load(['store', 'items', 'evidenceBundle']);
        $processingResult = $report->evidenceBundle?->processing_result_json ?? [];

        return response()->json([
            'success' => true,
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
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
                    'ocr_confidence' => $item->ocr_confidence,
                ])->values(),
                'continuity' => $processingResult['continuity'] ?? ($report->raw_ocr_json['continuity'] ?? null),
                'merchant' => $processingResult['merchant'] ?? ($report->raw_ocr_json['merchant'] ?? null),
                'manual_review_required' => $report->processing_status === 'ready_manual_review',
            ],
        ]);
    }

    public function confirm(Request $request, string $reference)
    {
        $report = $this->authorizedReport($request, $reference);
        $rules = ['confirmed_items' => 'prohibited'];
        if ($report->capture_mode !== 'single_image_v1') {
            $rules['consumer_confirmed'] = 'accepted';
        }
        $validated = $request->validate($rules);

        if ($report->status === 'Submitted') {
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
        if (! $report->items()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'No verified OCR items are available to confirm.',
            ], 409);
        }

        DB::transaction(function () use ($report) {
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'Submitted') {
                return;
            }

            $confirmedItems = $locked->items()->orderBy('sequence')->get()->map(fn ($item) => [
                'sequence' => $item->sequence,
                'item_name' => $item->item_name,
                'quantity' => $item->quantity !== null ? (float) $item->quantity : null,
                'unit' => $item->unit,
                'observed_price' => $item->observed_price !== null ? (float) $item->observed_price : null,
            ])->values()->all();
            $locked->items()->update([
                'consumer_correction_json' => null,
                'consumer_confirmed' => true,
            ]);

            $locked->update([
                'consumer_confirmed_json' => $confirmedItems,
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
                'public_message' => 'Consumer confirmed the receipt details. Report submitted for DTI evaluation.',
                'actor_type' => 'system',
            ]);

            $evidencePath = $locked->evidenceBundle?->assets()->where('kind', 'original_video')->value('path')
                ?? $locked->image_vault_path
                ?? 'receipt-evidence/'.($locked->evidenceBundle?->evidence_uuid ?? $locked->report_reference);
            CitizenTip::create([
                'store_id' => $locked->store_id,
                'extracted_text_json' => [
                    'lines' => $locked->raw_ocr_json['lines'] ?? [],
                    'confirmed_items' => $confirmedItems,
                    'report_reference' => $locked->report_reference,
                ],
                'image_hash_path' => $evidencePath,
                'status' => 'pending',
            ]);
            $locked->pushSubscriptions()->detach();
        });

        $report->refresh();

        return response()->json([
            'success' => true,
            'message' => 'Receipt details confirmed and submitted to DTI for evaluation.',
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

    private function safeReasonMessage(string $reasonCode): string
    {
        return match ($reasonCode) {
            'INSUFFICIENT_FRAMES' => 'The recording was too short or did not contain enough usable receipt views.',
            'TEXT_UNREADABLE' => 'The receipt text was not clear enough to read. Keep it flat, well lit, and in focus.',
            'INCOMPLETE_SCAN' => 'The recording did not show one continuous receipt from top to bottom.',
            'STORE_NOT_CONFIRMED' => 'The store name on the receipt could not be matched to the selected establishment.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines could be verified.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not visible or readable.',
            'TOTAL_MISMATCH' => 'The detected item amounts did not match the receipt total.',
            default => 'The receipt could not be verified. Please capture it again.',
        };
    }
}
