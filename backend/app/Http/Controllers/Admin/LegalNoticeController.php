<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\LegalNoticeAvailableMail;
use App\Models\LegalNotice;
use App\Models\LegalNoticeAttachment;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Models\User;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\CalendarNotCoveredException;
use App\Services\Admin\LegalPolicyService;
use App\Services\Admin\LegalSignatoryService;
use App\Services\Admin\ReportReviewService;
use App\Services\Admin\SensitiveActionGuard;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
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
    private const OPEN_STATUSES = ['draft', 'issued', 'response_received'];
    /** Closure outcomes and the per-item decisions each one requires (D5: an accepted explanation is not a confirmed finding). */
    public const CLOSE_OUTCOMES = [
        'explanation_accepted' => ['not_confirmed'], 'no_violation' => ['not_confirmed'],
        'violation_confirmed' => ['confirmed'], 'partially_confirmed' => ['confirmed', 'not_confirmed'],
    ];

    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate(['search' => ['nullable', 'string', 'max:120'], 'status' => ['nullable', Rule::in(['draft', 'issued', 'response_received', 'closed', 'cancelled'])], 'page' => ['nullable', 'integer', 'min:1'], 'store_id' => ['nullable', 'integer', 'min:1'], 'exclude_drafts' => ['nullable', 'boolean']]);
        $query = LegalNotice::with(['store:id,store_name,address', 'preparer:id,name'])->latest('updated_at');
        if ($filters['status'] ?? null) $query->where('status', $filters['status']);
        // Issued & Responses pages over every non-draft notice, so no page is filled with drafts it then hides.
        if ($request->boolean('exclude_drafts')) $query->where('status', '!=', 'draft');
        if (isset($filters['store_id'])) $query->where('store_id', $filters['store_id']);
        if ($search = trim($filters['search'] ?? '')) $query->where(fn ($q) => $q->where('control_number', 'like', "%$search%")->orWhereHas('store', fn ($store) => $store->where('store_name', 'like', "%$search%")));
        return response()->json(['data' => $query->paginate(20)]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        // preceding_notice_id is not accepted here: an SCO is linked to an LOI only through escalate().
        $data = $request->validate(['monitoring_record_id' => ['required', 'integer'], 'notice_type' => ['required', Rule::in(['LOI', 'SCO'])], 'item_ids' => ['required', 'array', 'min:1'], 'item_ids.*' => ['integer', 'distinct'], 'preceding_notice_id' => ['prohibited']]);
        $notice = DB::transaction(fn () => $this->createDraft($request, $audit, (int) $data['monitoring_record_id'], $data['notice_type'], $data['item_ids']));
        return response()->json(['data' => $this->detail($notice)], 201);
    }

    /** Must run inside a transaction. Lock order: store, then visit (no-action and close use the same order). */
    private function createDraft(Request $request, AuditTrailService $audit, int $recordId, string $type, array $itemIds): LegalNotice
    {
        $storeId = MonitoringRecord::whereKey($recordId)->value('store_id');
        abort_unless($storeId, 404);
        Store::whereKey($storeId)->lockForUpdate()->first();
        $record = MonitoringRecord::with(['store', 'store.vendor', 'officer:id,name,email', 'items.bulletin:id,commodity_name,unit', 'items.finding'])
            ->whereKey($recordId)->where('status', 'accepted')->lockForUpdate()->firstOrFail();
        $existing = LegalNotice::where('monitoring_record_id', $record->id)->whereIn('status', self::OPEN_STATUSES)->value('id');
        if ($existing) abort(response()->json(['message' => 'An open notice already exists for this monitoring visit.', 'existing_notice_id' => $existing], 409));
        $items = $record->items->whereIn('id', $itemIds);
        abort_if($items->count() !== count($itemIds) || $items->contains(fn ($item) => ! $item->is_anomaly || $item->reference_status !== 'available' || $item->reference_value === null), 422, 'Every selected item must be an eligible captured observation.');
        // A notice closure already decided these items; a later notice must not overwrite that decision.
        $decided = $items->filter(fn ($item) => in_array($item->finding?->decision, ['confirmed', 'not_confirmed'], true));
        if ($decided->isNotEmpty()) {
            abort(response()->json(['status' => 'ITEM_ALREADY_DECIDED', 'message' => 'DTI already recorded a final decision on: '.$decided->map(fn ($item) => $item->bulletin?->commodity_name ?? 'item #'.$item->id)->implode(', ').'.'], 409));
        }
        $types = $items->pluck('reference_type')->unique()->values();
        abort_if($types->count() > 1, 422, 'SRP items and price-ceiling items need separate notices: select items of one kind.');
        if ($type === 'SCO') $this->assertDirectScoAllowed($record->protocol_mode, $types->all());

        // A no-action triage on a cited item is replaced when this notice closes; its history is frozen here.
        $triaged = $items->filter(fn ($item) => $item->finding?->decision === 'no_action')->values();
        $deciders = User::whereIn('id', $triaged->map(fn ($item) => $item->finding->decided_by)->unique()->all())->pluck('name', 'id');
        $snapshot = [
            'monitoring_record_id' => $record->id, 'monitoring_record_number' => $record->client_uuid,
            'monitoring_date' => $record->finalized_at?->toIso8601String(), 'representative_name' => $record->representative_name,
            'representative_title' => $record->representative_title, 'officer' => $record->officer?->only(['id', 'name', 'email']),
            'store' => $record->store->only(['id', 'store_name', 'address', 'dti_sec_number', 'owner_name']),
            'evidence' => ['officer_signature_sha256' => $record->officer_signature_sha256, 'representative_signature_sha256' => $record->representative_signature_sha256, 'latitude' => $record->latitude, 'longitude' => $record->longitude, 'location_accuracy_meters' => $record->location_accuracy_meters],
            'items' => $items->values()->map(fn ($item) => [
                'id' => $item->id, 'srp_id' => $item->srp_id, 'commodity_name' => $item->bulletin?->commodity_name, 'unit' => $item->bulletin?->unit,
                'observed_price' => $item->recorded_price, 'previous_price' => $item->previous_price, 'reference_value' => $item->reference_value,
                'reference_type' => $item->reference_type, 'reference_label' => $item->reference_label, 'reference_source' => $item->reference_source,
                'reference_source_id' => $item->reference_source_id, 'reference_version' => $item->reference_version,
                'reference_effective_date' => $item->reference_effective_date?->toDateString(), 'variance_percent' => $item->variance_percent,
            ])->all(),
            'prior_triage' => $triaged->map(fn ($item) => [
                'item_id' => $item->id, 'reason' => $item->finding->reason, 'decided_by' => $item->finding->decided_by,
                'decided_by_name' => $deciders[$item->finding->decided_by] ?? null, 'decided_at' => $item->finding->decided_at?->toIso8601String(),
            ])->all(),
        ];
        $owner = $record->store->owner_name;
        $notice = LegalNotice::create([
            'store_id' => $record->store_id, 'monitoring_record_id' => $record->id, 'preceding_notice_id' => null,
            'notice_type' => $type, 'prepared_by' => $request->user()->id, 'status' => 'draft', 'source_snapshot' => $snapshot,
            // The addressee is the registered owner (owner decision D4). linked_vendor_user_id and registered_owner_name record what the
            // store held when drafted; issue() refuses if either changed unreviewed.
            'draft_payload' => ['recipient_name' => $owner, 'recipient_title' => null, 'recipient_email' => $record->store->vendor?->email, 'address' => $record->store->address, 'reason' => self::REASON_FOR_REFERENCE[$types->first()] ?? null, 'legal_bases' => [], 'linked_vendor_user_id' => $record->store->vendor_user_id, 'registered_owner_name' => $owner],
            'delivery_state' => 'not_recorded',
        ]);
        $audit->recordOrFail($request, 'legal.draft_created', $notice, ['monitoring_record_id' => $record->id, 'item_count' => $items->count()]);
        return $notice;
    }

    /** An SCO without a preceding LOI is allowed only for a price-freeze visit citing price ceilings (owner decision D1). */
    private function assertDirectScoAllowed(?string $protocolMode, array $referenceTypes): void
    {
        if ($protocolMode === 'emergency' && $referenceTypes === ['emergency_ceiling']) return;
        abort(response()->json(['status' => 'SCO_REQUIRES_ESCALATION', 'message' => 'An SCO is issued by escalating an LOI, or directly only for a price-freeze visit citing price ceilings.'], 422));
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
            // confirm_recipient is the current name; confirm_linked_vendor is kept for older clients.
            'confirm_linked_vendor' => ['sometimes', 'accepted'], 'confirm_recipient' => ['sometimes', 'accepted'],
            // New notices are delivered through the vendor portal only (owner decision D9); legacy rows keep their stored method.
            'intended_delivery_method' => ['sometimes', 'nullable', Rule::in(['portal'])],
            'internal_justification' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit) {
            // Recheck under the lock issue() takes, so a save cannot change a notice issued meanwhile.
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($notice->status === 'draft', 409, 'Only drafts can be changed.');
            $payload = array_merge($notice->draft_payload ?? [], collect($data)->except(['intended_delivery_method', 'internal_justification', 'confirm_linked_vendor', 'confirm_recipient'])->all());
            // The evaluator has reviewed the recipient against the store's current vendor link and registered owner. A recipient
            // name the evaluator corrected is kept; only the markers and the vendor's email follow the store.
            if (isset($data['confirm_linked_vendor']) || isset($data['confirm_recipient'])) {
                $store = Store::with('vendor:id,email')->find($notice->store_id);
                $payload['linked_vendor_user_id'] = $store?->vendor_user_id;
                // An addressee still printing the former registered owner follows the store; an evaluator's form representation
                // of a name (entered by an audited save) is kept for them to review.
                if (array_key_exists('registered_owner_name', $payload) && (string) ($payload['recipient_name'] ?? '') === (string) $payload['registered_owner_name']) {
                    $payload['recipient_name'] = $store?->owner_name;
                }
                $payload['registered_owner_name'] = $store?->owner_name;
                $payload['recipient_email'] = $store?->vendor?->email;
            }
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
                // drafts created before the registered-owner addressee have no marker and are not checked.
                if (array_key_exists('registered_owner_name', $payload) && (string) $payload['registered_owner_name'] !== (string) $store->owner_name) {
                    abort(response()->json(['status' => 'RECIPIENT_REVIEW_REQUIRED', 'message' => 'The registered owner changed after this draft was prepared. Review the recipient and confirm it before issuing.'], 409));
                }
                if ($notice->notice_type === 'SCO' && ! $notice->preceding_notice_id) {
                    // Re-applied here so a direct SCO drafted before the rule existed cannot be issued around it.
                    $this->assertDirectScoAllowed(MonitoringRecord::whereKey($notice->monitoring_record_id)->value('protocol_mode'), $types->all());
                }
                abort_unless($notice->intended_delivery_method === 'portal', 422, 'Notices are issued through the vendor portal only. Choose "Vendor portal" as the delivery method.');
                $activeVendor = $vendor && $vendor->role === 'vendor' && $vendor->is_active ? $vendor : null;
                abort_unless($activeVendor, 422, 'Portal delivery needs an active vendor account linked to this store. Invite a vendor account in User Management before issuing.');
                // The printed email is always the audience's own, so a copied or stale address can never print.
                $payload['recipient_email'] = $activeVendor->email;
                if (mb_strlen((string) $payload['recipient_email']) > self::FORM_LIMITS['recipient_email']) {
                    abort(response()->json(['status' => 'RECIPIENT_EMAIL_TOO_LONG', 'message' => 'The vendor account email is too long for the printed form. Update it in User Management, then issue.'], 422));
                }
                foreach (self::FORM_LIMITS as $field => $limit) {
                    abort_if(mb_strlen((string) data_get($payload, $field)) > $limit, 422, "Shorten $field to $limit characters so it fits the printed form.");
                }
                $notice->draft_payload = $payload;
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
        // Delivery is through the portal only (owner decision D9), so issuing sends no email.
        return response()->json(['data' => $this->detail($issued) + ['notification' => 'not_applicable']]);
    }

    public function delivery(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit, LegalPolicyService $policy)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['state' => ['required', Rule::in(['received', 'refused', 'failed'])], 'recorded_at' => ['required', 'date'], 'details' => ['nullable', 'array']]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit, $policy) {
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($notice->status === 'issued', 409, 'Delivery can only be recorded for an issued notice.');
            // Only the vendor's own first open of a portal notice is its receipt (owner decision D2); staff cannot start that clock.
            if ($notice->intended_delivery_method === 'portal') {
                abort(response()->json(['status' => 'PORTAL_RECEIPT_ONLY', 'message' => 'A portal notice is received when the vendor first opens it in the portal. Its delivery cannot be recorded by hand.'], 409));
            }
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

    /**
     * Closes an issued notice with DTI's outcome and a decision per cited item. The per-item decision is the record of truth
     * (one notice may cite several commodities); the outcome must agree with it. Each decision becomes a regulatory finding.
     */
    public function close(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit, ReportReviewService $reviews)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'outcome' => ['required', Rule::in(array_keys(self::CLOSE_OUTCOMES))], 'outcome_reason' => ['required', 'string', 'min:10', 'max:2000'],
            'item_decisions' => ['nullable', 'array'], 'item_decisions.*.item_id' => ['required', 'integer'],
            'item_decisions.*.decision' => ['required', Rule::in(['confirmed', 'not_confirmed'])],
        ]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit, $reviews) {
            // Lock order: store, then notice, as issue() and every finding writer use.
            $store = Store::whereKey($legalNotice->store_id)->lockForUpdate()->firstOrFail();
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($notice->status, ['issued', 'response_received'], true), 409, 'Only an issued notice can be closed.');
            $cited = collect($notice->source_snapshot['items'] ?? []);
            $decisions = collect($data['item_decisions'] ?? [])->mapWithKeys(fn ($entry) => [(int) $entry['item_id'] => $entry['decision']]);
            $findings = [];
            if ($notice->monitoring_record_id && $cited->isNotEmpty()) {
                $citedIds = $cited->pluck('id')->map(fn ($id) => (int) $id)->sort()->values()->all();
                abort_unless(count($data['item_decisions'] ?? []) === count($citedIds) && $decisions->keys()->sort()->values()->all() === $citedIds, 422, 'Record one decision for every product cited in the notice.');
                $required = collect(self::CLOSE_OUTCOMES[$data['outcome']]);
                $given = $decisions->values()->unique();
                abort_unless($given->diff($required)->isEmpty() && $required->diff($given)->isEmpty(), 422, 'The outcome does not match the decisions on the cited products.');
                $items = MonitoringRecordItem::with('finding')->where('monitoring_record_id', $notice->monitoring_record_id)->whereIn('id', $citedIds)->get()->keyBy('id');
                foreach ($cited as $snapshot) {
                    $item = $items[(int) $snapshot['id']] ?? null;
                    abort_unless($item, 409, 'A cited product is missing from its monitoring visit; this notice needs review before it can be closed.');
                    // Only a no-action triage may be replaced; createDraft already refuses items with a final decision.
                    abort_if(in_array($item->finding?->decision, ['confirmed', 'not_confirmed'], true), 409, 'A cited product already has a final DTI decision.');
                    $findings[] = $this->findingFor($notice, $snapshot, $item) + ['decision' => $decisions[$item->id]];
                }
            } else {
                // A notice with no captured products to map (legacy rows) records no finding, so it may not claim a confirmed one.
                abort_if(in_array('confirmed', self::CLOSE_OUTCOMES[$data['outcome']], true), 422, 'This notice has no captured products to record a confirmed finding against. Close it as "Explanation accepted" or "No violation found", and pursue any violation through a new notice.');
            }
            foreach ($findings as $finding) {
                RegulatoryFinding::updateOrCreate(
                    ['source_type' => MonitoringRecordItem::FINDING_SOURCE, 'source_id' => $finding['item_id']],
                    Arr::except($finding, ['item_id']) + ['reason' => $data['outcome_reason'], 'decided_by' => $request->user()->id, 'decided_at' => now()],
                );
            }
            $notice->update(['status' => 'closed', 'closed_at' => now(), 'outcome' => $data['outcome'], 'outcome_reason' => $data['outcome_reason']]);
            if ($findings) $reviews->recalculateRecidivism($store);
            $audit->recordOrFail($request, 'legal.notice_closed', $notice, ['outcome' => $data['outcome'], 'item_decisions' => $decisions->all()]);
        });
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    /**
     * The finding columns for one cited item. A snapshot drafted before snapshots carried the full reference falls back to the
     * immutable visit item, but only when every value the snapshot does hold agrees with it.
     */
    private function findingFor(LegalNotice $notice, array $snapshot, MonitoringRecordItem $item): array
    {
        $same = fn ($a, $b) => $a === null && $b === null || $a !== null && $b !== null && round((float) $a, 2) === round((float) $b, 2);
        $agrees = $same($snapshot['observed_price'] ?? null, $item->recorded_price) && $same($snapshot['reference_value'] ?? null, $item->reference_value)
            && ($snapshot['reference_type'] ?? null) === $item->reference_type
            && (! array_key_exists('srp_id', $snapshot) || (int) $snapshot['srp_id'] === (int) $item->srp_id);
        if (! $agrees) {
            abort(response()->json(['status' => 'SNAPSHOT_REVIEW_REQUIRED', 'message' => 'The notice record does not match its monitoring visit. It needs review before it can be closed.'], 409));
        }
        $observedAt = $notice->source_snapshot['monitoring_date'] ?? MonitoringRecord::whereKey($notice->monitoring_record_id)->value('finalized_at');
        return [
            'item_id' => $item->id, 'store_id' => $notice->store_id, 'srp_bulletin_id' => $item->srp_id,
            'observed_price' => $snapshot['observed_price'], 'observed_at' => $observedAt,
            'reference_type' => $snapshot['reference_type'], 'reference_value' => $snapshot['reference_value'],
            'reference_source_id' => array_key_exists('reference_source_id', $snapshot) ? $snapshot['reference_source_id'] : $item->reference_source_id,
            'reference_version' => array_key_exists('reference_version', $snapshot) ? $snapshot['reference_version'] : $item->reference_version,
            'reference_effective_date' => $snapshot['reference_effective_date'] ?? $item->reference_effective_date?->toDateString(),
            'reference_label' => $snapshot['reference_label'] ?? $item->reference_label, 'reference_source' => $snapshot['reference_source'] ?? $item->reference_source,
        ];
    }

    /** Withdraws a notice. A notice that left DTI needs a stated reason, which the vendor sees; a never-issued draft does not. */
    public function cancel(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['outcome_reason' => ['nullable', 'string', 'min:10', 'max:2000']]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit) {
            Store::whereKey($legalNotice->store_id)->lockForUpdate()->first();
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless(in_array($notice->status, self::OPEN_STATUSES, true), 409, 'Only an open notice can be cancelled.');
            $issued = $notice->status !== 'draft';
            abort_if($issued && blank($data['outcome_reason'] ?? null), 422, 'State why this issued notice is being withdrawn.');
            $notice->update(['status' => 'cancelled', 'cancelled_at' => now(), 'outcome' => $issued ? 'withdrawn' : null, 'outcome_reason' => $data['outcome_reason'] ?? null]);
            $audit->recordOrFail($request, 'legal.notice_cancelled', $notice, ['outcome' => $notice->outcome]);
        });
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    /**
     * Posts a templated follow-up to the notice's own vendor (owner decision D6). It never issues a document or changes a deadline.
     * Allowed for a portal notice still awaiting a response that is either unopened or past its deadline.
     */
    public function reminder(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $message = DB::transaction(function () use ($request, $legalNotice, $audit) {
            // Lock order: store, vendor account, notice, as issue() and escalate().
            $store = Store::whereKey($legalNotice->store_id)->lockForUpdate()->firstOrFail();
            $vendor = $legalNotice->vendor_user_id ? User::whereKey($legalNotice->vendor_user_id)->lockForUpdate()->first() : null;
            $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
            abort_unless($this->reminderAllowed($notice), 409, 'A reminder can be sent for an unanswered portal notice that is unopened or past its deadline.');
            abort_unless($vendor && $vendor->is_active && (int) $store->vendor_user_id === (int) $vendor->id, 409, "The notice's vendor is no longer this store's active linked account, so a reminder cannot reach them.");
            $label = $notice->notice_type === 'SCO' ? 'Show Cause Order' : 'Letter of Inquiry';
            $issued = $notice->issued_at->timezone(config('legal_policy.timezone'))->format('M j, Y');
            $body = $notice->due_date_timestamp
                ? "Reminder from DTI: the response period for {$label} {$notice->control_number}, issued {$issued}, ended on ".$notice->due_date_timestamp->timezone(config('legal_policy.timezone'))->format('M j, Y g:i A').'. Please contact DTI Antique about this notice.'
                : "Reminder from DTI: {$label} {$notice->control_number} was issued to you on {$issued}. Open it in Notices; your response period starts when you first open the official document.";
            $message = StoreMessage::create(['store_id' => $store->id, 'vendor_user_id' => $vendor->id, 'sender_id' => $request->user()->id, 'sender_side' => 'dti', 'body' => $body]);
            $audit->recordOrFail($request, 'legal.reminder_sent', $notice, ['message_id' => $message->id]);
            return $message;
        });
        return response()->json(['data' => $message->load('sender:id,name')->toThreadArray()], 201);
    }

    private function reminderAllowed(LegalNotice $notice): bool
    {
        return $notice->status === 'issued' && $notice->deadline_rules && $notice->intended_delivery_method === 'portal' && $notice->vendor_user_id
            && (! in_array($notice->delivery_state, ['received', 'refused'], true) || (bool) $notice->due_date_timestamp?->isPast());
    }

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
            $loi->update(['status' => 'closed', 'closed_at' => now(), 'outcome' => 'escalated_to_sco']);
            $audit->recordOrFail($request, 'legal.notice_closed', $loi, ['reason' => 'escalated_to_sco']);
            // The SCO cites exactly what the LOI cited: its snapshot is copied, never rebuilt from live store or visit data.
            $itemIds = collect($loi->source_snapshot['items'] ?? [])->pluck('id')->map(fn ($id) => (int) $id)->all();
            $present = MonitoringRecordItem::where('monitoring_record_id', $loi->monitoring_record_id)->whereIn('id', $itemIds)->where('is_anomaly', true)->count();
            abort_unless($itemIds && $present === count($itemIds), 409, 'The products this LOI cited are no longer on its monitoring visit; the escalation needs review.');
            $sco = LegalNotice::create([
                'store_id' => $loi->store_id, 'monitoring_record_id' => $loi->monitoring_record_id, 'preceding_notice_id' => $loi->id,
                'notice_type' => 'SCO', 'prepared_by' => $request->user()->id, 'status' => 'draft', 'source_snapshot' => $loi->source_snapshot,
                'draft_payload' => Arr::only($loi->draft_payload ?? [], ['recipient_name', 'recipient_title', 'address', 'reason', 'registered_owner_name'])
                    + ['recipient_email' => $store->vendor?->email, 'legal_bases' => [], 'linked_vendor_user_id' => $store->vendor_user_id],
                'delivery_state' => 'not_recorded',
            ]);
            $audit->recordOrFail($request, 'legal.draft_created', $sco, ['monitoring_record_id' => $loi->monitoring_record_id, 'item_count' => count($itemIds), 'preceding_notice_id' => $loi->id]);
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
            && (! array_key_exists('linked_vendor_user_id', $payload) || (int) $payload['linked_vendor_user_id'] !== (int) $store?->vendor_user_id
                || array_key_exists('registered_owner_name', $payload) && (string) $payload['registered_owner_name'] !== (string) $store?->owner_name);
        $data['legacy'] = $notice->status !== 'draft' && $notice->issued_at && ! $notice->deadline_rules;
        $signatory = app(LegalSignatoryService::class)->forType($notice->notice_type);
        $data['signatory'] = ['name' => $signatory['name'], 'office' => $signatory['office'], 'has_signature' => (bool) $signatory['image_path']];
        $data['can_escalate'] = $store && $this->escalationAllowed($notice, $store, $notice->vendor_user_id ? User::find($notice->vendor_user_id) : null);
        $data['overdue'] = $notice->due_date_timestamp?->isPast() && ! in_array($notice->status, ['response_received', 'closed', 'cancelled'], true);
        $data['can_remind'] = $this->reminderAllowed($notice);
        $data['registered_owner_name'] = $store?->owner_name;
        return $data;
    }
}
