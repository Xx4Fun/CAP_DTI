<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Vendor\ResolvesVendor;
use App\Models\LegalNotice;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LegalNoticeController extends Controller
{
    use ResolvesVendor;

    public const REASON_CATEGORIES = ['WHOLESALE_HIKE', 'FREIGHT_SURCHARGE', 'ENCODING_ERROR', 'PACKAGING_DISCREPANCY', 'FORCE_MAJEURE'];
    public const ATTACHMENT_CATEGORIES = ['DELIVERY_RECEIPT', 'WHOLESALER_INVOICE', 'FREIGHT_BILL', 'SHELF_TAG', 'OTHER'];
    private const VISIBLE_STATUSES = ['issued', 'response_received', 'closed'];

    public function index(Request $request)
    {
        $user = $this->vendorUser($request);
        return response()->json(LegalNotice::query()
            ->whereIn('store_id', $this->storeIds($user))
            ->whereIn('status', self::VISIBLE_STATUSES)
            // A record that was never issued (no official document) is never shown to the vendor.
            ->whereNotNull('issued_at')
            ->with(['store:id,store_name,address', 'attachments' => fn ($query) => $query->where('kind', 'vendor_response')])
            ->latest('issued_at')->get()->map(fn ($notice) => $this->vendorData($notice)));
    }

    public function show(Request $request, int $id)
    {
        $user = $this->vendorUser($request);
        $notice = LegalNotice::with(['store:id,store_name,address', 'attachments' => fn ($query) => $query->where('kind', 'vendor_response')])->findOrFail($id);
        $this->authorizeNotice($user, $notice);
        abort_unless(in_array($notice->status, self::VISIBLE_STATUSES, true) && $notice->issued_at, 404);
        return response()->json($this->vendorData($notice));
    }

    public function document(Request $request, int $id, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $notice = LegalNotice::findOrFail($id);
        $this->authorizeNotice($user, $notice);
        abort_unless(in_array($notice->status, self::VISIBLE_STATUSES, true) && $notice->issued_at && $notice->pdf_file_path && Storage::disk($notice->pdf_disk)->exists($notice->pdf_file_path), 404);
        $audit->recordOrFail($request, 'vendor.notice_document_accessed', $notice);
        return Storage::disk($notice->pdf_disk)->response($notice->pdf_file_path, ($notice->control_number ?? 'notice').'.pdf', ['Content-Type' => 'application/pdf']);
    }

    public function response(Request $request, int $id, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $data = $request->validate([
            'reason_category' => ['required', Rule::in(self::REASON_CATEGORIES)],
            'response_text' => ['required', 'string', 'min:20', 'max:10000'],
            'certified_under_oath' => ['accepted'],
            // Both must be plain lists so each file pairs with the category at the same position.
            'attachments' => ['nullable', 'array', 'list', 'max:5'],
            'attachments.*' => ['file', 'mimes:pdf,jpeg,png', 'max:5120'],
            'attachment_categories' => ['nullable', 'array', 'list', 'max:5'],
            'attachment_categories.*' => [Rule::in(self::ATTACHMENT_CATEGORIES)],
        ]);
        $files = $request->file('attachments', []);
        if (count($files) !== count($data['attachment_categories'] ?? [])) {
            throw ValidationException::withMessages(['attachment_categories' => ['Choose a category for every attachment.']]);
        }

        $storeId = LegalNotice::whereKey($id)->value('store_id');
        abort_unless($storeId, 404);
        $stored = [];
        try {
            $notice = DB::transaction(function () use ($request, $id, $storeId, $user, $data, $files, $audit, &$stored) {
                // Lock order: store, then notice. Unlinking and invitations lock the store first too.
                $store = Store::whereKey($storeId)->lockForUpdate()->first();
                $notice = LegalNotice::whereKey($id)->lockForUpdate()->firstOrFail();
                if (! $store || (int) $store->vendor_user_id !== (int) $user->id || (int) $notice->store_id !== (int) $store->id) {
                    $this->vendorError(403, 'NOTICE_ACCESS_DENIED', 'You do not have access to this notice.');
                }
                if ($notice->status !== 'issued') {
                    $this->vendorError(409, 'NOTICE_NOT_RESPONDABLE', 'A response has already been submitted or the notice is closed.');
                }
                if (! in_array($notice->delivery_state, ['received', 'refused'], true) || ! $notice->due_date_timestamp) {
                    $this->vendorError(409, 'NOTICE_NOT_RESPONDABLE', 'Delivery must be recorded before a response can be submitted.');
                }
                if (now()->isAfter($notice->due_date_timestamp)) {
                    $this->vendorError(403, 'RESPONSE_PERIOD_EXPIRED', 'The response period has expired.');
                }

                foreach (array_values($files) as $index => $file) {
                    $path = $file->store("legal-notices/{$notice->id}/responses", LegalNotice::DOCUMENT_DISK);
                    abort_unless($path, 503, 'Private response storage is unavailable.');
                    $stored[] = $path;
                    $notice->attachments()->create([
                        'uploaded_by' => $user->id, 'kind' => 'vendor_response', 'category' => $data['attachment_categories'][$index],
                        'disk' => LegalNotice::DOCUMENT_DISK, 'path' => $path, 'original_name' => $file->getClientOriginalName(),
                        'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath()),
                    ]);
                }
                $notice->update([
                    'response_text' => $data['response_text'], 'response_reason_category' => $data['reason_category'],
                    'response_certified_at' => now(), 'response_received_at' => now(), 'status' => 'response_received',
                ]);
                $audit->recordOrFail($request, 'vendor.response_submitted', $notice, ['attachment_count' => count($files), 'reason_category' => $data['reason_category']]);
                return $notice;
            });
        } catch (\Throwable $error) {
            foreach ($stored as $path) Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($path);
            throw $error;
        }

        $notice->load(['store:id,store_name,address', 'attachments' => fn ($query) => $query->where('kind', 'vendor_response')]);
        return response()->json(['message' => 'Response submitted.', 'notice' => $this->vendorData($notice)]);
    }

    private function authorizeNotice(User $user, LegalNotice $notice): void
    {
        if (! in_array((int) $notice->store_id, $this->storeIds($user)->map(fn ($id) => (int) $id)->all(), true)) {
            $this->vendorError(403, 'NOTICE_ACCESS_DENIED', 'You do not have access to this notice.');
        }
    }

    private function storeIds(User $user)
    {
        return Store::query()->where('vendor_user_id', $user->id)->pluck('id');
    }

    private function vendorData(LegalNotice $notice): array
    {
        $snapshot = $notice->source_snapshot ?? [];

        return $notice->only([
            'id', 'store_id', 'control_number', 'notice_type', 'status', 'issued_at', 'delivery_state', 'delivered_at', 'due_date_timestamp',
            'response_text', 'response_reason_category', 'response_certified_at', 'response_received_at', 'closed_at',
        ]) + [
            'store' => $notice->store,
            'monitoring_date' => $snapshot['monitoring_date'] ?? null,
            'flagged_items' => collect($snapshot['items'] ?? [])
                ->map(fn ($item) => Arr::only($item, ['commodity_name', 'unit', 'observed_price', 'reference_value', 'reference_label', 'variance_percent']))
                ->values()->all(),
            'attachments' => $notice->relationLoaded('attachments')
                ? $notice->attachments->map(fn ($attachment) => $attachment->only(['id', 'original_name', 'mime_type', 'size_bytes', 'category', 'created_at']))->values()->all()
                : [],
        ];
    }
}
