<?php

namespace App\Http\Controllers;

use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Models\WebPushSubscription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReceiptReportController extends Controller
{
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
        $latestHistory = $report->statusHistories()->latest('id')->first();

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
        $rules = [
            'confirmed_items' => 'required|array|min:1|max:250',
            'confirmed_items.*.sequence' => 'required|integer|min:0|max:249',
            'confirmed_items.*.item_name' => 'required|string|max:255',
            'confirmed_items.*.quantity' => 'nullable|numeric|min:0|max:999999',
            'confirmed_items.*.unit' => 'nullable|string|max:50',
            'confirmed_items.*.observed_price' => 'required|numeric|min:0|max:9999999.99',
        ];
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

        DB::transaction(function () use ($report, $validated) {
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'Submitted') {
                return;
            }

            foreach ($validated['confirmed_items'] as $confirmedItem) {
                $locked->items()->updateOrCreate(
                    ['sequence' => $confirmedItem['sequence']],
                    [
                        'item_name' => trim($confirmedItem['item_name']),
                        'quantity' => $confirmedItem['quantity'] ?? null,
                        'unit' => isset($confirmedItem['unit']) ? trim((string) $confirmedItem['unit']) : null,
                        'observed_price' => $confirmedItem['observed_price'],
                        'consumer_correction_json' => $confirmedItem,
                        'consumer_confirmed' => true,
                    ],
                );
            }

            $locked->update([
                'consumer_confirmed_json' => $validated['confirmed_items'],
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
                    'confirmed_items' => $validated['confirmed_items'],
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
}
