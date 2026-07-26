<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\LegalNotice;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\LegalPolicyService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;
use Barryvdh\DomPDF\Facade\Pdf;

class LegalNoticeController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $authorization)
    {
        $user = $request->user();
        if ($user->role === 'vendor') {
            $storeIds = Store::query()
                ->where('vendor_user_id', $user->id)
                ->orWhere(fn ($query) => $query->whereNull('vendor_user_id')->where('owner_name', $user->name))
                ->pluck('id');
            $notices = LegalNotice::whereIn('store_id', $storeIds)->with('store')->get();
        } else {
            $authorization->requireManager($user);
            $notices = LegalNotice::with('store')->get();
        }
        return response()->json($notices);
    }

    public function show(Request $request, $id, AdminAuthorizationService $authorization)
    {
        $notice = LegalNotice::with('store')->findOrFail($id);
        $this->authorizeNoticeAccess($request, $notice, $authorization);
        return response()->json($notice);
    }

    public function dispatchNotice(Request $request, AdminAuthorizationService $authorization, LegalPolicyService $policy)
    {
        $authorization->requireManager($request->user());
        $availability = $policy->availability();
        if ($availability['status'] !== 'LEGAL_POLICY_AVAILABLE') {
            return response()->json($availability, 422);
        }

        $request->validate([
            'store_id' => 'required|exists:stores,id',
            'srp_id' => 'required|exists:srp_bulletins,id',
            'recorded_price' => 'required|numeric',
            'recorded_date' => 'required|date',
        ]);

        $store = Store::findOrFail($request->store_id);
        $commodity = SrpBulletin::findOrFail($request->srp_id);
        $recordedPrice = $request->recorded_price;
        $recordedDate = $request->recorded_date;

        // Bifurcated Routing Logic
        $stateOfCalamity = Cache::get('state_of_calamity', false);
        $noticeType = $policy->noticeType($stateOfCalamity, $store->recidivism_index);
        $dueDate = $policy->responseDeadline(now());

        // Generate PDF view variables
        $data = [
            'store' => $store,
            'commodity' => $commodity,
            'recorded_price' => $recordedPrice,
            'recorded_date' => $recordedDate,
        ];

        // Load correct blade template
        $viewName = $policy->templateFor($noticeType);
        $pdf = Pdf::loadView($viewName, $data);

        // Save PDF to public notices storage
        $filename = 'notice_' . $store->id . '_' . time() . '.pdf';
        $filePath = 'notices/' . $filename;
        Storage::disk('public')->put($filePath, $pdf->output());

        // Create the notice record
        $notice = LegalNotice::create([
            'store_id' => $store->id,
            'notice_type' => $noticeType,
            'pdf_file_path' => $filePath,
            'status' => 'issued',
            'due_date_timestamp' => $dueDate,
        ]);

        return response()->json([
            'message' => 'Legal notice generated and dispatched successfully.',
            'notice' => $notice
        ], 201);
    }

    public function uploadRebuttal(Request $request, $id, AdminAuthorizationService $authorization, AuditTrailService $audit)
    {
        $notice = LegalNotice::findOrFail($id);
        $this->authorizeVendorNotice($request, $notice, $authorization);

        // 1. Strict configured response-period deadline check
        if (now() > $notice->due_date_timestamp) {
            return response()->json([
                'message' => 'Action Forbidden (403): Response period has expired.'
            ], 403);
        }

        // 2. File and MIME type validation
        $request->validate([
            'rebuttal' => 'required|file|mimes:pdf,jpeg,png|max:5120',
        ]);

        if ($request->file('rebuttal')->isValid()) {
            $file = $request->file('rebuttal');
            // Store in private vault
            $path = $file->store('rebuttals', 'local');

            $notice->update([
                'status' => 'rebutted',
            ]);
            $audit->record($request, 'vendor.rebuttal_submitted', $notice);

            return response()->json([
                'message' => 'Rebuttal evidence successfully submitted.',
                'notice' => $notice
            ]);
        }

        return response()->json(['message' => 'Invalid file upload.'], 400);
    }

    private function authorizeNoticeAccess(Request $request, LegalNotice $notice, AdminAuthorizationService $authorization): void
    {
        if ($request->user()->role === 'vendor') {
            $this->authorizeVendorNotice($request, $notice, $authorization);
            return;
        }

        $authorization->requireManager($request->user());
    }

    private function authorizeVendorNotice(Request $request, LegalNotice $notice, AdminAuthorizationService $authorization): void
    {
        abort_unless($request->user()->role === 'vendor', 403);

        $ownsStore = Store::query()
            ->whereKey($notice->store_id)
            ->where(function ($query) use ($request) {
                $query->where('vendor_user_id', $request->user()->id)
                    ->orWhere(function ($legacy) use ($request) {
                        $legacy->whereNull('vendor_user_id')->where('owner_name', $request->user()->name);
                    });
            })
            ->exists();

        abort_unless($ownsStore, 403);
    }
}
