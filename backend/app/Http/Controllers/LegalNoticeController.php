<?php

namespace App\Http\Controllers;

use App\Models\LegalNotice;
use App\Models\Store;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class LegalNoticeController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->role === 'vendor', 403);
        return response()->json(LegalNotice::query()
            ->whereIn('store_id', $this->storeIds($request))
            ->whereIn('status', ['issued', 'response_received', 'closed'])
            ->with('store:id,store_name,address')->latest('issued_at')->get()->map(fn ($notice) => $this->vendorData($notice)));
    }

    public function show(Request $request, int $id)
    {
        $notice = LegalNotice::with(['store:id,store_name,address', 'attachments' => fn ($query) => $query->where('kind', 'vendor_response')])->findOrFail($id);
        $this->authorizeVendor($request, $notice);
        abort_unless(in_array($notice->status, ['issued', 'response_received', 'closed'], true), 404);
        return response()->json($this->vendorData($notice));
    }

    public function document(Request $request, int $id, AuditTrailService $audit)
    {
        $notice = LegalNotice::findOrFail($id); $this->authorizeVendor($request, $notice);
        abort_unless(in_array($notice->status, ['issued', 'response_received', 'closed'], true) && $notice->pdf_file_path && Storage::disk($notice->pdf_disk)->exists($notice->pdf_file_path), 404);
        $audit->recordOrFail($request, 'vendor.notice_document_accessed', $notice);
        return Storage::disk($notice->pdf_disk)->response($notice->pdf_file_path, ($notice->control_number ?? 'notice').'.pdf', ['Content-Type' => 'application/pdf']);
    }

    public function response(Request $request, int $id, AuditTrailService $audit)
    {
        $notice = LegalNotice::findOrFail($id); $this->authorizeVendor($request, $notice);
        abort_unless($notice->status === 'issued', 409, 'A response has already been submitted or the notice is closed.');
        abort_unless(in_array($notice->delivery_state, ['received', 'refused'], true) && $notice->due_date_timestamp, 409, 'Delivery must be recorded before a response can be submitted.');
        abort_if(now()->isAfter($notice->due_date_timestamp), 403, 'The response period has expired.');
        $data = $request->validate(['response_text' => ['nullable', 'string', 'max:10000'], 'attachments' => ['nullable', 'array', 'max:5'], 'attachments.*' => ['file', 'mimes:pdf,jpeg,png', 'max:5120'], 'rebuttal' => ['nullable', 'file', 'mimes:pdf,jpeg,png', 'max:5120']]);
        abort_if(blank($data['response_text'] ?? null) && ! $request->hasFile('attachments') && ! $request->hasFile('rebuttal'), 422, 'Response text or an attachment is required.');
        $files = $request->file('attachments', []);
        if ($legacy = $request->file('rebuttal')) $files = [$legacy];
        $stored = [];
        try {
            DB::transaction(function () use ($request, $notice, $data, $files, $audit, &$stored) {
                foreach ($files as $file) {
                    $path = $file->store("legal-notices/{$notice->id}/responses", 'local');
                    abort_unless($path, 503, 'Private response storage is unavailable.'); $stored[] = $path;
                    $notice->attachments()->create(['uploaded_by' => $request->user()->id, 'kind' => 'vendor_response', 'disk' => 'local', 'path' => $path, 'original_name' => $file->getClientOriginalName(), 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath())]);
                }
                $notice->update(['response_text' => $data['response_text'] ?? null, 'response_received_at' => now(), 'status' => 'response_received']);
                $audit->recordOrFail($request, 'vendor.response_submitted', $notice, ['attachment_count' => count($files)]);
            });
        } catch (\Throwable $error) { foreach ($stored as $path) Storage::disk('local')->delete($path); throw $error; }
        return response()->json(['message' => 'Response submitted.', 'notice' => $notice->fresh()]);
    }

    private function authorizeVendor(Request $request, LegalNotice $notice): void
    {
        abort_unless($request->user()->role === 'vendor' && in_array($notice->store_id, $this->storeIds($request)->all(), true), 403);
    }

    private function storeIds(Request $request)
    {
        return Store::query()->where('vendor_user_id', $request->user()->id)
            ->orWhere(fn ($query) => $query->whereNull('vendor_user_id')->where('owner_name', $request->user()->name))->pluck('id');
    }

    private function vendorData(LegalNotice $notice): array
    {
        return $notice->only(['id', 'control_number', 'notice_type', 'status', 'issued_at', 'delivery_state', 'delivered_at', 'due_date_timestamp', 'response_received_at', 'closed_at']) + ['store' => $notice->store, 'attachments' => $notice->relationLoaded('attachments') ? $notice->attachments : []];
    }
}
