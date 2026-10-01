<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\LegalNoticeAvailableMail;
use App\Models\LegalNotice;
use App\Models\LegalNoticeAttachment;
use App\Models\MonitoringRecord;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\CalendarNotCoveredException;
use App\Services\Admin\LegalPolicyService;
use App\Services\Admin\LegalSignatoryService;
use App\Services\Admin\SensitiveActionGuard;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class LegalNoticeController extends Controller
{
    /** Longest values the printed LOI/SCO fields can hold (see notices/_form-page.blade.php). */
    public const FORM_LIMITS = ['recipient_name' => 70, 'recipient_title' => 40, 'recipient_email' => 60, 'address' => 140];
    private const STORE_NAME_LIMIT = 75;
    /** The reason each kind of captured reference supports; a notice covers one kind only. */
    private const REASON_FOR_REFERENCE = ['standard_srp' => 'Prices above SRP', 'emergency_ceiling' => 'Prices above price ceiling'];

    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate(['search' => ['nullable', 'string', 'max:120'], 'status' => ['nullable', Rule::in(['draft', 'issued', 'response_received', 'closed', 'cancelled'])], 'page' => ['nullable', 'integer', 'min:1'], 'store_id' => ['nullable', 'integer', 'min:1']]);
        $query = LegalNotice::with(['store:id,store_name,address', 'preparer:id,name'])->latest('updated_at');
        if ($filters['status'] ?? null) $query->where('status', $filters['status']);
        if (isset($filters['store_id'])) $query->where('store_id', $filters['store_id']);
        if ($search = trim($filters['search'] ?? '')) $query->where(fn ($q) => $q->where('control_number', 'like', "%$search%")->orWhereHas('store', fn ($store) => $store->where('store_name', 'like', "%$search%")));
        return response()->json(['data' => $query->paginate(20)]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        // preceding_notice_id is not accepted here: an SCO is linked to an LOI only through escalate().
        $data = $request->validate(['monitoring_record_id' => ['required', 'integer'], 'notice_type' => ['required', Rule::in(['LOI', 'SCO'])], 'item_ids' => ['required', 'array', 'min:1'], 'item_ids.*' => ['integer', 'distinct'], 'preceding_notice_id' => ['prohibited']]);
        $notice = DB::transaction(fn () => $this->createDraft($request, $audit, (int) $data['monitoring_record_id'], $data['notice_type'], $data['item_ids'], null));
        return response()->json(['data' => $this->detail($notice)], 201);
    }

    /** Must run inside a transaction. */
    private function createDraft(Request $request, AuditTrailService $audit, int $recordId, string $type, array $itemIds, ?int $precedingId): LegalNotice
    {
        $record = MonitoringRecord::with(['store', 'store.vendor', 'officer:id,name,email', 'items.bulletin:id,commodity_name,unit'])
            ->whereKey($recordId)->where('status', 'accepted')->lockForUpdate()->firstOrFail();
        abort_if(LegalNotice::where('monitoring_record_id', $record->id)->whereIn('status', ['draft', 'issued', 'response_received'])->exists(), 409, 'An open notice already exists for this monitoring visit.');
        $items = $record->items->whereIn('id', $itemIds);
        abort_if($items->count() !== count($itemIds) || $items->contains(fn ($item) => ! $item->is_anomaly || $item->reference_status !== 'available' || $item->reference_value === null), 422, 'Every selected item must be an eligible captured observation.');
        $types = $items->pluck('reference_type')->unique()->values();
        abort_if($types->count() > 1, 422, 'SRP items and price-ceiling items need separate notices: select items of one kind.');

        $snapshot = [
            'monitoring_record_id' => $record->id, 'monitoring_record_number' => $record->client_uuid,
            'monitoring_date' => $record->finalized_at?->toIso8601String(), 'representative_name' => $record->representative_name,
            'representative_title' => $record->representative_title, 'officer' => $record->officer?->only(['id', 'name', 'email']),
            'store' => $record->store->only(['id', 'store_name', 'address', 'dti_sec_number']),
            'evidence' => ['officer_signature_sha256' => $record->officer_signature_sha256, 'representative_signature_sha256' => $record->representative_signature_sha256, 'latitude' => $record->latitude, 'longitude' => $record->longitude, 'location_accuracy_meters' => $record->location_accuracy_meters],
            'items' => $items->values()->map(fn ($item) => [
                'id' => $item->id, 'commodity_name' => $item->bulletin?->commodity_name, 'unit' => $item->bulletin?->unit,
                'observed_price' => $item->recorded_price, 'reference_value' => $item->reference_value,
                'reference_type' => $item->reference_type, 'reference_label' => $item->reference_label, 'reference_source' => $item->reference_source,
                'reference_effective_date' => $item->reference_effective_date?->toDateString(), 'variance_percent' => $item->variance_percent,
            ])->all(),
        ];
        $notice = LegalNotice::create([
            'store_id' => $record->store_id, 'monitoring_record_id' => $record->id, 'preceding_notice_id' => $precedingId,
            'notice_type' => $type, 'prepared_by' => $request->user()->id, 'status' => 'draft', 'source_snapshot' => $snapshot,
            // linked_vendor_user_id records who the store was linked to when drafted; issue() refuses if that changed unreviewed.
            'draft_payload' => ['recipient_name' => $record->representative_name, 'recipient_title' => $record->representative_title, 'recipient_email' => $record->store->vendor?->email, 'address' => $record->store->address, 'reason' => self::REASON_FOR_REFERENCE[$types->first()] ?? null, 'legal_bases' => [], 'linked_vendor_user_id' => $record->store->vendor_user_id],
            'delivery_state' => 'not_recorded',
        ]);
        $audit->recordOrFail($request, 'legal.draft_created', $notice, ['monitoring_record_id' => $record->id, 'item_count' => $items->count()]);
        return $notice;
    }

    public function show(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => $this->detail($legalNotice)]);
    }

    public function update(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->status === 'draft', 409, 'Only drafts can be changed.');
        $data = $request->validate([
            'recipient_name' => ['sometimes', 'nullable', 'string', 'max:'.self::FORM_LIMITS['recipient_name']], 'recipient_title' => ['sometimes', 'nullable', 'string', 'max:'.self::FORM_LIMITS['recipient_title']],
            'recipient_email' => ['sometimes', 'nullable', 'email', 'max:'.self::FORM_LIMITS['recipient_email']], 'address' => ['sometimes', 'nullable', 'string', 'max:'.self::FORM_LIMITS['address']],
            'reason' => ['sometimes', 'nullable', Rule::in(config("legal_policy.rules.{$legalNotice->notice_type}.reasons", []))],
            'legal_bases' => ['sometimes', 'array', 'max:4'], 'legal_bases.*' => ['distinct', Rule::in(config("legal_policy.rules.{$legalNotice->notice_type}.legal_bases", []))],
            'confirm_linked_vendor' => ['sometimes', 'accepted'],
            'intended_delivery_method' => ['sometimes', 'nullable', Rule::in(['portal', 'email_and_hand_copy', 'hand_copy'])],
            'internal_justification' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit) {
            // Recheck under the lock issue() takes, so a save cannot change a notice issued meanwhile.
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($notice->status === 'draft', 409, 'Only drafts can be changed.');
            $payload = array_merge($notice->draft_payload ?? [], collect($data)->except(['intended_delivery_method', 'internal_justification', 'confirm_linked_vendor'])->all());
            // The evaluator has reviewed the recipient against the store's current vendor link.
            if (isset($data['confirm_linked_vendor'])) $payload['linked_vendor_user_id'] = Store::whereKey($notice->store_id)->value('vendor_user_id');
            $notice->update(['draft_payload' => $payload] + collect($data)->only(['intended_delivery_method', 'internal_justification'])->all());
            $audit->recordOrFail($request, 'legal.draft_saved', $notice);
        });
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    public function preview(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->status === 'draft', 409, 'Only drafts can be previewed.');
        $audit->recordOrFail($request, 'legal.draft_previewed', $legalNotice);
        $policy = app(LegalPolicyService::class);
        $rules = $policy->availability($legalNotice->notice_type)['status'] === 'LEGAL_POLICY_AVAILABLE' ? $policy->rulesFor($legalNotice->notice_type) : [];
        return response()->view($legalNotice->notice_type === 'SCO' ? 'notices.official-sco' : 'notices.official-loi', ['notice' => $legalNotice, 'draft' => true, 'policy' => $rules]);
    }

    public function issue(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, SensitiveActionGuard $guard, LegalPolicyService $policy, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);
        $request->validate(['confirmed' => ['accepted'], 'apply_signature' => ['sometimes', 'boolean']]);
        $applySignature = $request->boolean('apply_signature');
        $availability = $policy->availability($legalNotice->notice_type);
        if ($availability['status'] !== 'LEGAL_POLICY_AVAILABLE') return response()->json($availability, 422);

        $storedPath = null;
        try {
            $issued = DB::transaction(function () use ($request, $legalNotice, $policy, $audit, $applySignature, &$storedPath) {
                // Lock order: store, linked vendor account, notice. Unlink locks the store and deactivation locks the
                // account, so neither can slip between the audience check below and the status change.
                $store = Store::whereKey($legalNotice->store_id)->lockForUpdate()->firstOrFail();
                $vendor = $store->vendor_user_id ? User::whereKey($store->vendor_user_id)->lockForUpdate()->first() : null;
                $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
                abort_unless($notice->status === 'draft', 409, 'Notice has already left draft state.');
                $rules = $policy->rulesFor($notice->notice_type);
                foreach ($rules['required_fields'] as $field) abort_if(blank(data_get($notice->draft_payload, $field)), 422, "Required field is missing: $field");
                abort_if(empty($notice->source_snapshot['items']), 422, 'At least one eligible item is required.');
                foreach (self::FORM_LIMITS as $field => $limit) {
                    abort_if(mb_strlen((string) data_get($notice->draft_payload, $field)) > $limit, 422, "Shorten $field to $limit characters so it fits the printed form.");
                }
                abort_if(mb_strlen((string) data_get($notice->source_snapshot, 'store.store_name')) > self::STORE_NAME_LIMIT, 422, 'The store name is too long for the printed form; shorten it in Store records and prepare a new draft.');
                abort_unless(in_array($notice->draft_payload['reason'] ?? null, $rules['reasons'], true), 422, 'Reason is not permitted by policy.');
                $types = collect($notice->source_snapshot['items'])->pluck('reference_type')->unique()->values();
                abort_if($types->count() !== 1 || $types->first() === null, 422, 'This draft does not record one kind of price reference; prepare a new draft.');
                $expected = self::REASON_FOR_REFERENCE[$types->first()] ?? null;
                abort_if($expected && in_array($expected, $rules['reasons'], true) && $notice->draft_payload['reason'] !== $expected, 422, "The evidence supports the reason \"$expected\"; the notice cannot state a different one.");
                $bases = $notice->draft_payload['legal_bases'] ?? [];
                abort_if(array_diff($bases, $rules['legal_bases']) || count($bases) !== count(array_unique($bases)) || count($bases) > 4, 422, 'Legal basis is not permitted by policy.');
                $payload = $notice->draft_payload ?? [];
                if (! array_key_exists('linked_vendor_user_id', $payload) || (int) $payload['linked_vendor_user_id'] !== (int) $store->vendor_user_id) {
                    abort(response()->json(['status' => 'RECIPIENT_REVIEW_REQUIRED', 'message' => "The store's vendor account changed after this draft was prepared. Review the recipient and confirm it before issuing."], 409));
                }
                $activeVendor = $vendor && $vendor->role === 'vendor' && $vendor->is_active ? $vendor : null;
                abort_if($notice->intended_delivery_method === 'portal' && ! $activeVendor, 422, 'Portal delivery needs an active vendor account linked to this store.');
                $control = $policy->controlNumber($notice->id, $notice->notice_type, now(config('legal_policy.timezone'))->year);
                // issued_at is set before rendering: the document prints its issue date.
                $notice->fill(['control_number' => $control, 'policy_version' => config('legal_policy.policy_version'), 'issued_at' => now()]);
                // The e-signature is stamped only when the issuing evaluator explicitly applies it.
                $signatories = app(LegalSignatoryService::class);
                $signatory = $signatories->forType($notice->notice_type);
                abort_if($applySignature && ! $signatory['image_path'], 422, 'No e-signature image is set for this notice type. Upload it in Settings › Legal Signatories, or issue without it.');
                $signatureImage = $applySignature ? $signatories->imageDataUri($signatory) : null;
                $notice->signatory_snapshot = ['name' => $rules['signatory']['name'], 'office' => $rules['signatory']['office'], 'signature_applied' => (bool) $signatureImage, 'signature_sha256' => $signatureImage ? $signatory['image_sha256'] : null];
                $bytes = Pdf::loadView($policy->templateFor($notice->notice_type), ['notice' => $notice, 'draft' => false, 'policy' => $rules, 'signatureImage' => $signatureImage])->setPaper('a4')->output();
                $storedPath = "legal-notices/{$notice->id}/$control.pdf";
                abort_unless(Storage::disk(LegalNotice::DOCUMENT_DISK)->put($storedPath, $bytes), 503, 'Private document storage is unavailable.');
                $notice->update([
                    'issued_by' => $request->user()->id, 'pdf_disk' => LegalNotice::DOCUMENT_DISK, 'pdf_file_path' => $storedPath, 'pdf_sha256' => hash('sha256', $bytes),
                    'status' => 'issued', 'vendor_user_id' => $activeVendor?->id, 'deadline_rules' => $policy->deadlineRules($notice->notice_type),
                ]);
                $audit->recordOrFail($request, 'legal.notice_issued', $notice, ['control_number' => $control, 'policy_version' => $notice->policy_version, 'vendor_user_id' => $activeVendor?->id, 'signature_applied' => (bool) $signatureImage]);
                return $notice;
            });
        } catch (\Throwable $error) {
            if ($storedPath) Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($storedPath);
            throw $error;
        }
        // Notify the notice's own audience, and only while that account is still the store's active vendor.
        $recipient = $issued->audience;
        if ($issued->intended_delivery_method === 'email_and_hand_copy' && $recipient?->email_verified_at && $recipient->is_active
            && (int) Store::whereKey($issued->store_id)->value('vendor_user_id') === (int) $recipient->id) {
            try {
                Mail::to($recipient->email)->queue(new LegalNoticeAvailableMail($issued->id, $issued->notice_type, $issued->store->store_name));
                $notification = 'queued';
            } catch (\Throwable $error) {
                Log::warning('Legal notice email could not be queued.', ['legal_notice_id' => $issued->id, 'error_type' => $error::class]);
                $notification = 'failed';
            }
        }
        return response()->json(['data' => $this->detail($issued) + ['notification' => $notification ?? 'not_applicable']]);
    }

    public function delivery(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit, LegalPolicyService $policy)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['state' => ['required', Rule::in(['received', 'refused', 'failed'])], 'recorded_at' => ['required', 'date'], 'details' => ['nullable', 'array']]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit, $policy) {
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($notice->status === 'issued', 409, 'Delivery can only be recorded for an issued notice.');
            $recordedAt = Carbon::parse($data['recorded_at']);
            abort_if($recordedAt->lt($notice->issued_at) || $recordedAt->gt(now()->addMinute()), 422, 'The delivery time must be between the issue time and now.');
            if (! $notice->deadline_rules) {
                abort(response()->json(['status' => 'LEGACY_POLICY_REVIEW_REQUIRED', 'message' => 'This notice was issued before deadline rules were recorded. Handle delivery and the response period offline, then close or cancel it here.'], 409));
            }
            // A recorded receipt or refusal started a legal deadline; it is never overwritten here.
            if (! in_array($notice->delivery_state, ['not_recorded', 'failed'], true)) {
                abort(response()->json(['status' => 'DELIVERY_ALREADY_RECORDED', 'message' => 'Delivery was already recorded for this notice.'], 409));
            }
            try {
                $deadline = $data['state'] === $notice->deadline_rules['deadline_anchor'] ? $policy->deadlineFrom($recordedAt, $notice->deadline_rules) : null;
            } catch (CalendarNotCoveredException) {
                abort(response()->json(['status' => 'CALENDAR_REVIEW_REQUIRED', 'message' => 'The holiday calendar does not cover this response period. Extend legal_policy.non_working_dates and calendar_valid_until, then record the delivery.'], 409));
            }
            $notice->update(['delivery_state' => $data['state'], 'delivery_details' => $data['details'] ?? null, 'delivered_at' => $recordedAt, 'due_date_timestamp' => $deadline]);
            $audit->recordOrFail($request, 'legal.delivery_recorded', $notice, ['state' => $data['state']]);
        });
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    public function document(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->pdf_file_path && Storage::disk($legalNotice->pdf_disk)->exists($legalNotice->pdf_file_path), 404);
        $audit->recordOrFail($request, 'legal.document_accessed', $legalNotice);
        return Storage::disk($legalNotice->pdf_disk)->response($legalNotice->pdf_file_path, ($legalNotice->control_number ?? 'notice').'.pdf', ['Content-Type' => 'application/pdf']);
    }

    public function attach(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->status === 'draft', 409);
        $request->validate(['file' => ['required', 'file', 'mimes:pdf,jpeg,png', 'max:5120']]);
        $file = $request->file('file'); $path = $file->store("legal-notices/{$legalNotice->id}/supplemental", LegalNotice::DOCUMENT_DISK);
        abort_unless($path, 503, 'Private attachment storage is unavailable.');
        try {
            $attachment = DB::transaction(function () use ($request, $legalNotice, $audit, $file, $path) {
                // Recheck under the same row lock issue() takes, so evidence cannot be added to a notice issued meanwhile.
                $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
                abort_unless($notice->status === 'draft', 409, 'Only drafts can receive supplemental evidence.');
                $attachment = $notice->attachments()->create(['uploaded_by' => $request->user()->id, 'kind' => 'supplemental', 'disk' => LegalNotice::DOCUMENT_DISK, 'path' => $path, 'original_name' => $file->getClientOriginalName(), 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath())]);
                $audit->recordOrFail($request, 'legal.attachment_added', $notice, ['attachment_id' => $attachment->id]); return $attachment;
            });
        } catch (\Throwable $error) { Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($path); throw $error; }
        return response()->json(['data' => $attachment], 201);
    }

    public function downloadAttachment(Request $request, LegalNotice $legalNotice, LegalNoticeAttachment $attachment, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless((int) $attachment->legal_notice_id === (int) $legalNotice->id && Storage::disk($attachment->disk)->exists($attachment->path), 404);
        $audit->recordOrFail($request, 'legal.attachment_accessed', $legalNotice, ['attachment_id' => $attachment->id]);
        return Storage::disk($attachment->disk)->response($attachment->path, $attachment->original_name, ['Content-Type' => $attachment->mime_type]);
    }

    public function destroyAttachment(Request $request, LegalNotice $legalNotice, LegalNoticeAttachment $attachment, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless((int) $attachment->legal_notice_id === (int) $legalNotice->id && $attachment->kind === 'supplemental', 409);
        DB::transaction(function () use ($request, $legalNotice, $attachment, $audit) {
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($notice->status === 'draft', 409, 'Evidence on an issued notice cannot be removed.');
            $audit->recordOrFail($request, 'legal.attachment_deleted', $notice, ['attachment_id' => $attachment->id]);
            $attachment->delete();
        });
        Storage::disk($attachment->disk)->delete($attachment->path);
        return response()->noContent();
    }

    public function close(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit) { return $this->terminal($request, $legalNotice, $auth, $audit, 'closed'); }
    public function cancel(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit) { return $this->terminal($request, $legalNotice, $auth, $audit, 'cancelled'); }

    /** Records a response the vendor sent by email or on paper, as the printed forms instruct. */
    public function offlineResponse(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'channel' => ['required', Rule::in(['email', 'paper'])], 'received_at' => ['required', 'date'],
            'response_text' => ['required', 'string', 'min:20', 'max:10000'],
            'evidence' => ['required', 'file', 'mimes:pdf,jpeg,png', 'max:5120'],
        ]);
        $file = $request->file('evidence');
        $path = $file->store("legal-notices/{$legalNotice->id}/offline-response", LegalNotice::DOCUMENT_DISK);
        abort_unless($path, 503, 'Private attachment storage is unavailable.');
        try {
            DB::transaction(function () use ($request, $legalNotice, $data, $audit, $file, $path) {
                $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
                abort_unless($notice->status === 'issued', 409, 'A response can only be recorded for an issued notice that has none yet.');
                abort_unless(in_array($notice->delivery_state, ['received', 'refused'], true), 409, 'Record the notice delivery before recording a response to it.');
                $receivedAt = Carbon::parse($data['received_at']);
                abort_if($receivedAt->lt($notice->delivered_at ?? $notice->issued_at) || $receivedAt->gt(now()->addMinute()), 422, 'The response time must be between delivery and now.');
                $attachment = $notice->attachments()->create([
                    'uploaded_by' => $request->user()->id, 'kind' => 'offline_response', 'category' => strtoupper($data['channel']), 'disk' => LegalNotice::DOCUMENT_DISK,
                    'path' => $path, 'original_name' => $file->getClientOriginalName(), 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(),
                    'sha256' => hash_file('sha256', $file->getRealPath()),
                ]);
                $notice->update(['response_text' => $data['response_text'], 'response_received_at' => $receivedAt, 'response_channel' => $data['channel'], 'status' => 'response_received']);
                $audit->recordOrFail($request, 'legal.offline_response_recorded', $notice, ['channel' => $data['channel'], 'attachment_id' => $attachment->id]);
            });
        } catch (\Throwable $error) { Storage::disk(LegalNotice::DOCUMENT_DISK)->delete($path); throw $error; }
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    /** Closes an LOI and opens its SCO draft (same visit, same items) in one step. */
    public function escalate(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $sco = DB::transaction(function () use ($request, $legalNotice, $audit) {
            // Same lock order as issue(): store, vendor account, notice. The audience never changes after issue.
            $store = Store::whereKey($legalNotice->store_id)->lockForUpdate()->firstOrFail();
            $vendor = $legalNotice->vendor_user_id ? User::whereKey($legalNotice->vendor_user_id)->lockForUpdate()->first() : null;
            $loi = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($loi->notice_type === 'LOI' && $loi->monitoring_record_id, 409, 'Only an LOI from a monitoring visit can be escalated.');
            abort_unless($this->escalationAllowed($loi, $store, $vendor), 409, 'Escalate after the vendor responds, or once the response period has passed while the vendor could respond in the portal.');
            $loi->update(['status' => 'closed', 'closed_at' => now()]);
            $audit->recordOrFail($request, 'legal.notice_closed', $loi, ['reason' => 'escalated_to_sco']);
            $itemIds = collect($loi->source_snapshot['items'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all();
            $sco = $this->createDraft($request, $audit, (int) $loi->monitoring_record_id, 'SCO', $itemIds, $loi->id);
            $audit->recordOrFail($request, 'legal.notice_escalated', $loi, ['sco_id' => $sco->id]);
            return $sco;
        });
        return response()->json(['data' => $this->detail($sco)], 201);
    }

    /**
     * A response always allows escalation. An unanswered LOI only once its deadline passed while its audience
     * vendor stayed linked and active (unlink and deactivation are blocked while it is open), so the portal
     * response path was available for the whole period.
     */
    private function escalationAllowed(LegalNotice $loi, Store $store, ?User $vendor): bool
    {
        if ($loi->notice_type !== 'LOI') return false;
        if ($loi->status === 'response_received') return true;
        return $loi->status === 'issued' && $loi->due_date_timestamp?->isPast()
            && $vendor && $vendor->is_active && (int) $store->vendor_user_id === (int) $vendor->id;
    }

    private function terminal(Request $request, LegalNotice $notice, AdminAuthorizationService $auth, AuditTrailService $audit, string $status)
    {
        $auth->requireManager($request->user());
        DB::transaction(function () use ($request, $notice, $audit, $status) {
            $locked = LegalNotice::whereKey($notice->id)->lockForUpdate()->firstOrFail();
            // Close only a notice that was issued; cancel may also withdraw a draft. Nothing leaves a terminal state.
            $allowed = $status === 'closed' ? ['issued', 'response_received'] : ['draft', 'issued', 'response_received'];
            abort_unless(in_array($locked->status, $allowed, true), 409);
            $locked->update(['status' => $status, $status.'_at' => now()]);
            $audit->recordOrFail($request, "legal.notice_$status", $locked);
        });
        return response()->json(['data' => $this->detail($notice->fresh())]);
    }

    private function detail(LegalNotice $notice): array
    {
        $notice->loadMissing(['store:id,store_name,address', 'preparer:id,name', 'issuer:id,name', 'attachments']);
        $data = $notice->toArray();
        $payload = $notice->draft_payload ?? [];
        $data['readiness'] = ['case_reference' => (bool) $notice->monitoring_record_id, 'notice_type_and_basis' => filled($payload['reason'] ?? null) && (! empty($payload['legal_bases']) || ! in_array('legal_bases', config("legal_policy.rules.{$notice->notice_type}.required_fields", []), true)), 'recipient_and_delivery' => filled($payload['recipient_name'] ?? null) && filled($payload['address'] ?? null) && filled($notice->intended_delivery_method), 'evidence_and_attachments' => ! empty($notice->source_snapshot['items']), 'internal_justification' => filled($notice->internal_justification)];
        $data['policy'] = app(LegalPolicyService::class)->availability($notice->notice_type) + [
            'reasons' => config("legal_policy.rules.{$notice->notice_type}.reasons", []),
            'legal_bases' => config("legal_policy.rules.{$notice->notice_type}.legal_bases", []),
            // Lets the draft form tick its checklist as the evaluator types, using the same rule as issue().
            'required_fields' => config("legal_policy.rules.{$notice->notice_type}.required_fields", []),
        ];
        $store = Store::find($notice->store_id);
        $data['linked_vendor_user_id'] = $store?->vendor_user_id;
        $data['recipient_review_required'] = $notice->status === 'draft'
            && (! array_key_exists('linked_vendor_user_id', $payload) || (int) $payload['linked_vendor_user_id'] !== (int) $store?->vendor_user_id);
        $data['legacy'] = $notice->status !== 'draft' && $notice->issued_at && ! $notice->deadline_rules;
        $signatory = app(LegalSignatoryService::class)->forType($notice->notice_type);
        $data['signatory'] = ['name' => $signatory['name'], 'office' => $signatory['office'], 'has_signature' => (bool) $signatory['image_path']];
        $data['can_escalate'] = $store && $this->escalationAllowed($notice, $store, $notice->vendor_user_id ? User::find($notice->vendor_user_id) : null);
        $data['overdue'] = $notice->due_date_timestamp?->isPast() && ! in_array($notice->status, ['response_received', 'closed', 'cancelled'], true);
        return $data;
    }
}
