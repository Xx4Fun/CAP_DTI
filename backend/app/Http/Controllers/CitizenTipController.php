<?php

namespace App\Http\Controllers;

use App\Models\CitizenTip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CitizenTipController extends Controller
{
    public function index()
    {
        $tips = CitizenTip::with('store')->get();
        return response()->json($tips);
    }

    public function store(Request $request)
    {
        $request->validate([
            'store_id' => 'nullable|exists:stores,id',
            'image' => 'required|file|image|max:10240',
            'image_hash' => 'required|string',
            'extracted_text_json' => 'required',
        ]);

        if ($request->file('image')->isValid()) {
            $file = $request->file('image');
            
            // Secure Private vault storage
            $path = $file->store('receipt_vault', 'local');

            $extracted = is_string($request->extracted_text_json) 
                ? json_decode($request->extracted_text_json, true) 
                : $request->extracted_text_json;

            $tip = CitizenTip::create([
                'store_id' => $request->store_id,
                'extracted_text_json' => $extracted,
                'image_hash_path' => $path,
                'status' => 'pending',
            ]);

            return response()->json([
                'message' => 'Citizen tip successfully submitted to secure vault.',
                'tip' => $tip
            ], 201);
        }

        return response()->json(['message' => 'Invalid file upload.'], 400);
    }

    public function updateStatus(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:pending,validated,dismissed',
        ]);

        $tip = CitizenTip::findOrFail($id);
        $tip->update([
            'status' => $request->status,
        ]);

        return response()->json([
            'message' => 'Tip status updated successfully.',
            'tip' => $tip
        ]);
    }
}
