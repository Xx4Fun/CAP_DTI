<?php

namespace App\Http\Controllers;

use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PublicPwaController extends Controller
{
    public function config()
    {
        $stateOfCalamity = Cache::get('state_of_calamity', false);
        return response()->json([
            'success' => true,
            'message' => 'Public configuration retrieved successfully.',
            'data' => [
                'app_name' => 'PRICE-Watch',
                'state_of_calamity' => (bool) $stateOfCalamity,
                'privacy_notice_version' => '1.0',
                'max_upload_size_mb' => 10,
                'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
                'last_updated_at' => now()->toIso8601String(),
            ]
        ]);
    }

    public function commodities(Request $request)
    {
        $query = SrpBulletin::where('is_active', true);

        if ($request->filled('query')) {
            $search = $request->input('query');
            $query->where('commodity_name', 'like', "%{$search}%");
        }

        $commodities = $query->orderBy('commodity_name', 'asc')->get();

        return response()->json([
            'success' => true,
            'message' => 'Commodities retrieved successfully.',
            'data' => $commodities
        ]);
    }

    public function establishments(Request $request)
    {
        $query = Store::query();

        if ($request->filled('query')) {
            $search = $request->input('query');
            $query->where(function ($q) use ($search) {
                $q->where('store_name', 'like', "%{$search}%")
                  ->orWhere('owner_name', 'like', "%{$search}%")
                  ->orWhere('dti_sec_number', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%");
            });
        }

        $stores = $query->orderBy('store_name', 'asc')->get();

        return response()->json([
            'success' => true,
            'message' => 'Establishments retrieved successfully.',
            'data' => $stores
        ]);
    }

    public function createCaptureSession(Request $request)
    {
        $request->validate([
            'store_id' => 'nullable|exists:stores,id',
        ]);

        $sessionUuid = 'cs_' . Str::uuid();
        $rawToken = 'ct_sec_' . Str::random(32);
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = now()->addMinutes(15);

        $session = CaptureSession::create([
            'session_uuid' => $sessionUuid,
            'store_id' => $request->store_id,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'is_used' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Capture session initialized.',
            'data' => [
                'capture_session_id' => $session->id,
                'session_uuid' => $sessionUuid,
                'capture_token' => $rawToken,
                'expires_at' => $expiresAt->toIso8601String(),
                'store_id' => $request->store_id,
                'max_file_size' => 10485760,
                'accepted_types' => ['image/jpeg', 'image/png', 'image/webp'],
            ]
        ], 201);
    }

    public function submitReport(Request $request)
    {
        // 1. Check Idempotency UUID first
        if ($request->filled('submission_uuid')) {
            $existing = ConsumerReport::where('submission_uuid', $request->submission_uuid)->first();
            if ($existing) {
                return response()->json([
                    'success' => true,
                    'message' => 'Report submission already received (Idempotent replay).',
                    'data' => [
                        'report_reference' => $existing->report_reference,
                        'status' => $existing->status,
                        'submitted_at' => $existing->created_at->toIso8601String(),
                    ]
                ], 200);
            }
        }

        $request->validate([
            'submission_uuid' => 'required|string',
            'capture_token' => 'required|string',
            'image' => 'required|file|image|mimes:jpeg,png,webp|max:10240',
            'privacy_notice_version' => 'required|string',
            'store_id' => 'nullable|exists:stores,id',
        ]);

        // 2. Validate Capture Session Token
        $tokenHash = hash('sha256', $request->capture_token);
        $session = CaptureSession::where('token_hash', $tokenHash)->first();

        if (!$session || $session->is_used || $session->expires_at < now()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid, expired, or already used capture session token.',
                'errors' => ['capture_token' => ['The capture session token is invalid or expired.']]
            ], 422);
        }

        // 3. Process File & Calculate Server SHA-256
        $file = $request->file('image');
        $serverSha256 = hash_file('sha256', $file->getRealPath());
        $vaultPath = $file->store('receipt_vault', 'local');

        $rawOcr = $request->filled('extracted_text_json')
            ? (is_string($request->extracted_text_json) ? json_decode($request->extracted_text_json, true) : $request->extracted_text_json)
            : ['lines' => ['Sample Receipt Text'], 'ocr_confidence' => 0.95];

        // 4. Generate Identifiers & Secret Tracking Token
        $reportReference = 'REP-' . date('Ymd') . '-' . strtoupper(Str::random(4));
        $rawTrackingToken = 'trk_' . Str::random(32);
        $trackingTokenHash = hash('sha256', $rawTrackingToken);

        $report = DB::transaction(function () use (
            $request,
            $session,
            $reportReference,
            $trackingTokenHash,
            $serverSha256,
            $vaultPath,
            $rawOcr
        ) {
            $rep = ConsumerReport::create([
                'report_reference' => $reportReference,
                'tracking_token_hash' => $trackingTokenHash,
                'store_id' => $request->store_id ?? $session->store_id,
                'submission_uuid' => $request->submission_uuid,
                'capture_session_id' => $session->id,
                'image_hash' => $serverSha256,
                'image_vault_path' => $vaultPath,
                'raw_ocr_json' => $rawOcr,
                'status' => 'Submitted',
                'privacy_notice_version' => $request->privacy_notice_version,
                'user_ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // Create initial status history entry
            ReportStatusHistory::create([
                'consumer_report_id' => $rep->id,
                'previous_status' => null,
                'new_status' => 'Submitted',
                'public_message' => 'Report received and queued for preliminary DTI evaluation.',
                'actor_type' => 'system',
            ]);

            // Sync with existing citizen_tips queue so DTI Evaluator dashboard sees it instantly
            CitizenTip::create([
                'store_id' => $rep->store_id,
                'extracted_text_json' => $rawOcr,
                'image_hash_path' => $vaultPath,
                'status' => 'pending',
            ]);

            // Mark capture session as used
            $session->update(['is_used' => true]);

            return $rep;
        });

        return response()->json([
            'success' => true,
            'message' => 'Formal receipt report successfully submitted to DTI for evaluation.',
            'data' => [
                'report_reference' => $report->report_reference,
                'secret_tracking_token' => $rawTrackingToken,
                'status' => $report->status,
                'submitted_at' => $report->created_at->toIso8601String(),
            ]
        ], 201);
    }

    public function confirmOcr(Request $request, $reference)
    {
        $request->validate([
            'tracking_token' => 'required|string',
            'confirmed_items' => 'required',
        ]);

        $tokenHash = hash('sha256', $request->tracking_token);
        $report = ConsumerReport::where('report_reference', $reference)
            ->where('tracking_token_hash', $tokenHash)
            ->first();

        if (!$report) {
            return response()->json([
                'success' => false,
                'message' => 'Action Forbidden (403): Invalid report reference or tracking token.',
            ], 403);
        }

        $confirmed = is_string($request->confirmed_items)
            ? json_decode($request->confirmed_items, true)
            : $request->confirmed_items;

        $report->update([
            'consumer_confirmed_json' => $confirmed,
            'status' => 'Under initial evaluation',
        ]);

        ReportStatusHistory::create([
            'consumer_report_id' => $report->id,
            'previous_status' => 'Submitted',
            'new_status' => 'Under initial evaluation',
            'public_message' => 'Consumer confirmed receipt product details. Assigned for initial evaluation.',
            'actor_type' => 'system',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'OCR field corrections stored successfully.',
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
            ]
        ]);
    }

    public function trackReport(Request $request)
    {
        $request->validate([
            'reference' => 'required|string',
            'token' => 'required|string',
        ]);

        $tokenHash = hash('sha256', $request->token);
        $report = ConsumerReport::where('report_reference', $request->reference)
            ->where('tracking_token_hash', $tokenHash)
            ->with(['store', 'statusHistories'])
            ->first();

        if (!$report) {
            return response()->json([
                'success' => false,
                'message' => 'Report not found or tracking token is invalid.',
            ], 404);
        }

        $sanitizedHistory = $report->statusHistories->map(function ($h) {
            return [
                'status' => $h->new_status,
                'public_message' => $h->public_message,
                'timestamp' => $h->created_at->toIso8601String(),
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Report status retrieved.',
            'data' => [
                'report_reference' => $report->report_reference,
                'store_name' => $report->store->store_name ?? 'Unspecified Store',
                'current_status' => $report->status,
                'submitted_at' => $report->created_at->toIso8601String(),
                'status_history' => $sanitizedHistory,
            ]
        ]);
    }
}
