<?php

namespace App\Http\Controllers;

use App\Models\Store;
use App\Models\SrpBulletin;
use App\Models\LegalNotice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Cache;
use Barryvdh\DomPDF\Facade\Pdf;

class LegalNoticeController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        if ($user->role === 'vendor') {
            // Find store owned by vendor
            $store = Store::where('owner_name', $user->name)->first();
            if (!$store) {
                return response()->json([], 200);
            }
            $notices = LegalNotice::where('store_id', $store->id)->with('store')->get();
        } else {
            $notices = LegalNotice::with('store')->get();
        }
        return response()->json($notices);
    }

    public function show($id)
    {
        $notice = LegalNotice::with('store')->findOrFail($id);
        return response()->json($notice);
    }

    public function dispatchNotice(Request $request)
    {
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
        $isSco = $stateOfCalamity || $store->recidivism_index > 0;
        $noticeType = $isSco ? 'SCO' : 'LOI';
        $dueDate = now()->addHours(48);

        // Generate PDF view variables
        $data = [
            'store' => $store,
            'commodity' => $commodity,
            'recorded_price' => $recordedPrice,
            'recorded_date' => $recordedDate,
        ];

        // Load correct blade template
        $viewName = $isSco ? 'notices.sco' : 'notices.loi';
        $pdf = Pdf::loadView($viewName, $data);

        // Save PDF to public notices storage
        $filename = 'notice_' . $store->id . '_' . time() . '.pdf';
        $filePath = 'notices/' . $filename;
        Storage::disk('public')->put($filePath, $pdf->output());

        // Increment recidivism index for repeat offender or emergency
        if ($isSco) {
            $store->increment('recidivism_index');
        }

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

    public function uploadRebuttal(Request $request, $id)
    {
        $notice = LegalNotice::findOrFail($id);

        // 1. Strict Due Date check (48-hour timestamp check)
        if (now() > $notice->due_date_timestamp) {
            return response()->json([
                'message' => 'Action Forbidden (403): Rebuttal period has expired.'
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

            return response()->json([
                'message' => 'Rebuttal evidence successfully submitted.',
                'notice' => $notice
            ]);
        }

        return response()->json(['message' => 'Invalid file upload.'], 400);
    }
}
