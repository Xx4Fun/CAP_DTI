<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Vendor\ResolvesVendor;
use App\Models\LegalNotice;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\CalendarNotCoveredException;
use App\Services\Admin\LegalPolicyService;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class LegalNoticeController extends Controller
{
    use ResolvesVendor;

    public const REASON_CATEGORIES = ['WHOLESALE_HIKE', 'FREIGHT_SURCHARGE', 'ENCODING_ERROR', 'PACKAGING_DISCREPANCY', 'FORCE_MAJEURE'];
    public const ATTACHMENT_CATEGORIES = ['DELIVERY_RECEIPT', 'WHOLESALER_INVOICE', 'FREIGHT_BILL', 'SHELF_TAG', 'OTHER'];
    private const VISIBLE_STATUSES = ['issued', 'response_received', 'closed', 'cancelled'];

    public function index(Request $request)
    {
        $user = $this->vendorUser($request);
        // Only notices issued to this vendor, on a store still linked to them; never-issued records are excluded.
        return response()->json(LegalNotice::query()->visibleToVendor($user)
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

    public function document(Request $request, int $id, AuditTrailService $audit, LegalPolicyService $policy)
    {
        $user = $this->vendorUser($request);
        $notice = LegalNotice::findOrFail($id);
        $this->authorizeNotice($user, $notice);
        abort_unless(in_array($notice->status, self::VISIBLE_STATUSES, true) && $notice->issued_at && $notice->pdf_file_path && Storage::disk($notice->pdf_disk)->exists($notice->pdf_file_path), 404);
        if ($this->awaitsPortalReceipt($notice)) {
            DB::transaction(function () use ($request, $notice, $user, $audit, $policy) {
                // Lock order: store, then notice, as in response(). Recheck the link so an unlink racing this
                // request cannot let a former vendor start the response period.
                $store = Store::whereKey($notice->store_id)->lockForUpdate()->first();
                $locked = LegalNotice::whereKey($notice->id)->lockForUpdate()->firstOrFail();
                if (! $store || (int) $store->vendor_user_id !== (int) $user->id || (int) $locked->vendor_user_id !== (int) $user->id) {
                    $this->vendorError(403, 'NOTICE_ACCESS_DENIED', 'You do not have access to this notice.');
                }
                if (! $this->awaitsPortalReceipt($locked)) return;
                $now = now();
                try { $due = $policy->deadlineFrom($now, $locked->deadline_rules); }
                catch (CalendarNotCoveredException) {
                    // Serving it unreceived would leave a notice nobody can answer (staff cannot record portal receipt).
                    Log::warning('Portal receipt deferred: holiday calendar does not cover the response period.', ['legal_notice_id' => $locked->id]);
                    $this->vendorError(409, 'CALENDAR_REVIEW_REQUIRED', 'This notice cannot be opened yet because DTI must update its holiday calendar first. Please contact DTI Antique.');
                }
                $locked->update(['delivery_state' => 'received', 'delivered_at' => $now, 'due_date_timestamp' => $due]);
                $audit->recordOrFail($request, 'legal.delivery_recorded', $locked, ['state' => 'received', 'via' => 'portal_open']);
            });
        }
        $audit->recordOrFail($request, 'vendor.notice_document_accessed', $notice);
        return Storage::disk($notice->pdf_disk)->response($notice->pdf_file_path, ($notice->control_number ?? 'notice').'.pdf', ['Content-Type' => 'application/pdf']);
    }

    /** First portal open of a portal-delivered notice counts as receipt (also after a failed delivery attempt). */
    private function awaitsPortalReceipt(LegalNotice $notice): bool
    {
        return $notice->status === 'issued' && $notice->intended_delivery_method === 'portal' && $notice->deadline_rules
            && $notice->deadline_rules['deadline_anchor'] === 'received' && in_array($notice->delivery_state, ['not_recorded', 'failed'], true);
    }

    public function response(Request $request, int $id, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $data = $request->validate([
            'client_uuid' => ['nullable', 'uuid'],
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
        $hash = \App\Services\VendorSubmissionReceipt::fingerprint([
            'reason_category' => $data['reason_category'], 'response_text' => $data['response_text'], 'certified_under_oath' => true,
        ], $files, $data['attachment_categories'] ?? []);
        try {
            $notice = DB::transaction(function () use ($request, $id, $storeId, $user, $data, $files, $audit, &$stored, $hash) {
                // Lock order: store, then notice. Unlinking and invitations lock the store first too.
                $store = Store::whereKey($storeId)->lockForUpdate()->first();
                $notice = LegalNotice::whereKey($id)->lockForUpdate()->firstOrFail();
                if (! $store || (int) $store->vendor_user_id !== (int) $user->id || (int) $notice->store_id !== (int) $store->id || (int) $notice->vendor_user_id !== (int) $user->id || ! $notice->deadline_rules) {
                    $this->vendorError(403, 'NOTICE_ACCESS_DENIED', 'You do not have access to this notice.');
                }
                $accepted = \App\Services\VendorSubmissionReceipt::reserve($user->id, $data['client_uuid'] ?? null, 'response', $id, $hash);
                if ($accepted) return $notice;
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
                    'response_certified_at' => now(), 'response_received_at' => now(), 'response_channel' => 'portal', 'status' => 'response_received',
                ]);
                $audit->recordOrFail($request, 'vendor.response_submitted', $notice, ['attachment_count' => count($files), 'reason_category' => $data['reason_category']]);
                \App\Services\VendorSubmissionReceipt::accept($user->id, $data['client_uuid'] ?? null, $notice->id);
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
        // The notice must be addressed to this vendor and sit on a store still linked to them.
        if (! $notice->deadline_rules || (int) $notice->vendor_user_id !== (int) $user->id || ! in_array((int) $notice->store_id, $this->storeIds($user)->map(fn ($id) => (int) $id)->all(), true)) {
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
        $decisions = $notice->status === 'closed' && $notice->outcome && $notice->outcome !== 'escalated_to_sco'
            ? RegulatoryFinding::where('source_type', MonitoringRecordItem::FINDING_SOURCE)
                ->whereIn('source_id', collect($snapshot['items'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all())
                ->whereIn('decision', ['confirmed', 'not_confirmed'])->pluck('decision', 'source_id')
            : collect();

        return $notice->only([
            'id', 'store_id', 'control_number', 'notice_type', 'status', 'issued_at', 'intended_delivery_method', 'delivery_state', 'delivered_at', 'due_date_timestamp',
            'response_text', 'response_reason_category', 'response_channel', 'response_certified_at', 'response_received_at', 'closed_at', 'cancelled_at',
            'outcome', 'outcome_reason',
        ]) + [
            // An SCO escalated from an LOI names it; both are issued to this same vendor.
            'preceding_control_number' => $notice->preceding_notice_id ? LegalNotice::whereKey($notice->preceding_notice_id)->value('control_number') : null,
            'store' => $notice->store,
            'monitoring_date' => $snapshot['monitoring_date'] ?? null,
            'reason' => $notice->draft_payload['reason'] ?? null,
            'legal_bases' => array_values($notice->draft_payload['legal_bases'] ?? []),
            'flagged_items' => collect($snapshot['items'] ?? [])
                ->map(fn ($item) => Arr::only($item, ['id', 'commodity_name', 'unit', 'observed_price', 'reference_value', 'reference_label', 'variance_percent'])
                    // DTI's decision on each product is shown only once the notice is closed with it.
                    + ['decision' => $notice->status === 'closed' ? ($decisions[(int) ($item['id'] ?? 0)] ?? null) : null])
                ->values()->all(),
            'attachments' => $notice->relationLoaded('attachments')
                ? $notice->attachments->map(fn ($attachment) => $attachment->only(['id', 'original_name', 'mime_type', 'size_bytes', 'category', 'created_at']))->values()->all()
                : [],
        ];
    }
}
