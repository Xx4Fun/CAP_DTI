<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Mail\LegalNoticeAvailableMail;
use App\Models\LegalNotice;
use App\Models\LegalNoticeAttachment;
use App\Models\MonitoringRecord;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\LegalPolicyService;
use App\Services\Admin\SensitiveActionGuard;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class LegalNoticeController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate(['search' => ['nullable', 'string', 'max:120'], 'status' => ['nullable', Rule::in(['draft', 'issued', 'response_received', 'closed', 'cancelled'])], 'page' => ['nullable', 'integer', 'min:1']]);
        $query = LegalNotice::with(['store:id,store_name,address', 'preparer:id,name'])->latest('updated_at');
        if ($filters['status'] ?? null) $query->where('status', $filters['status']);
        if ($search = trim($filters['search'] ?? '')) $query->where(fn ($q) => $q->where('control_number', 'like', "%$search%")->orWhereHas('store', fn ($store) => $store->where('store_name', 'like', "%$search%")));
        return response()->json(['data' => $query->paginate(20)]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['monitoring_record_id' => ['required', 'integer'], 'notice_type' => ['required', Rule::in(['LOI', 'SCO'])], 'item_ids' => ['required', 'array', 'min:1'], 'item_ids.*' => ['integer', 'distinct'], 'preceding_notice_id' => ['nullable', 'integer']]);

        $notice = DB::transaction(function () use ($request, $data, $audit) {
            $record = MonitoringRecord::with(['store', 'store.vendor', 'officer:id,name,email', 'items.bulletin:id,commodity_name,unit'])
                ->whereKey($data['monitoring_record_id'])->where('status', 'accepted')->lockForUpdate()->firstOrFail();
            abort_if(LegalNotice::where('monitoring_record_id', $record->id)->whereIn('status', ['draft', 'issued', 'response_received'])->exists(), 409, 'An open notice already exists for this monitoring visit.');
            $items = $record->items->whereIn('id', $data['item_ids']);
            abort_if($items->count() !== count($data['item_ids']) || $items->contains(fn ($item) => ! $item->is_anomaly || $item->reference_status !== 'available' || $item->reference_value === null), 422, 'Every selected item must be an eligible captured observation.');
            if ($data['notice_type'] === 'SCO' && ($data['preceding_notice_id'] ?? null)) {
                abort_unless(LegalNotice::whereKey($data['preceding_notice_id'])->where('monitoring_record_id', $record->id)->where('notice_type', 'LOI')->whereIn('status', ['issued', 'response_received', 'closed'])->exists(), 422, 'The preceding LOI is invalid.');
            }

            $snapshot = [
                'monitoring_record_id' => $record->id, 'monitoring_record_number' => $record->client_uuid,
                'monitoring_date' => $record->finalized_at?->toIso8601String(), 'representative_name' => $record->representative_name,
                'representative_title' => $record->representative_title, 'officer' => $record->officer?->only(['id', 'name', 'email']),
                'store' => $record->store->only(['id', 'store_name', 'address', 'dti_sec_number']),
                'evidence' => ['officer_signature_sha256' => $record->officer_signature_sha256, 'representative_signature_sha256' => $record->representative_signature_sha256, 'latitude' => $record->latitude, 'longitude' => $record->longitude, 'location_accuracy_meters' => $record->location_accuracy_meters],
                'items' => $items->values()->map(fn ($item) => [
                    'id' => $item->id, 'commodity_name' => $item->bulletin?->commodity_name, 'unit' => $item->bulletin?->unit,
                    'observed_price' => $item->recorded_price, 'reference_value' => $item->reference_value,
                    'reference_label' => $item->reference_label, 'reference_source' => $item->reference_source,
                    'reference_effective_date' => $item->reference_effective_date?->toDateString(), 'variance_percent' => $item->variance_percent,
                ])->all(),
            ];
            $notice = LegalNotice::create([
                'store_id' => $record->store_id, 'monitoring_record_id' => $record->id, 'preceding_notice_id' => $data['preceding_notice_id'] ?? null,
                'notice_type' => $data['notice_type'], 'prepared_by' => $request->user()->id, 'status' => 'draft', 'source_snapshot' => $snapshot,
                'draft_payload' => ['recipient_name' => $record->representative_name, 'recipient_title' => $record->representative_title, 'recipient_email' => $record->store->vendor?->email, 'address' => $record->store->address, 'reason' => null, 'legal_bases' => []],
                'delivery_state' => 'not_recorded',
            ]);
            $audit->recordOrFail($request, 'legal.draft_created', $notice, ['monitoring_record_id' => $record->id, 'item_count' => $items->count()]);
            return $notice;
        });
        return response()->json(['data' => $this->detail($notice)], 201);
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
            'recipient_name' => ['sometimes', 'nullable', 'string', 'max:160'], 'recipient_title' => ['sometimes', 'nullable', 'string', 'max:160'],
            'recipient_email' => ['sometimes', 'nullable', 'email', 'max:255'], 'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'reason' => ['sometimes', 'nullable', 'string', 'max:500'], 'legal_bases' => ['sometimes', 'array'], 'legal_bases.*' => ['string', 'max:255'],
            'intended_delivery_method' => ['sometimes', 'nullable', Rule::in(['portal', 'email_and_hand_copy', 'hand_copy'])],
            'internal_justification' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit) {
            $payload = array_merge($legalNotice->draft_payload ?? [], collect($data)->except(['intended_delivery_method', 'internal_justification'])->all());
            $legalNotice->update(['draft_payload' => $payload] + collect($data)->only(['intended_delivery_method', 'internal_justification'])->all());
            $audit->recordOrFail($request, 'legal.draft_saved', $legalNotice);
        });
        return response()->json(['data' => $this->detail($legalNotice->fresh())]);
    }

    public function preview(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->status === 'draft', 409, 'Only drafts can be previewed.');
        $audit->recordOrFail($request, 'legal.draft_previewed', $legalNotice);
        return response()->view($legalNotice->notice_type === 'SCO' ? 'notices.official-sco' : 'notices.official-loi', ['notice' => $legalNotice, 'draft' => true]);
    }

    public function issue(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, SensitiveActionGuard $guard, LegalPolicyService $policy, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);
        $request->validate(['confirmed' => ['accepted']]);
        $availability = $policy->availability($legalNotice->notice_type);
        if ($availability['status'] !== 'LEGAL_POLICY_AVAILABLE') return response()->json($availability, 422);

        $storedPath = null;
        try {
            $issued = DB::transaction(function () use ($request, $legalNotice, $policy, $audit, &$storedPath) {
                $notice = LegalNotice::whereKey($legalNotice->id)->lockForUpdate()->firstOrFail();
                abort_unless($notice->status === 'draft', 409, 'Notice has already left draft state.');
                $rules = $policy->rulesFor($notice->notice_type);
                foreach ($rules['required_fields'] as $field) abort_if(blank(data_get($notice->draft_payload, $field)), 422, "Required field is missing: $field");
                abort_if(empty($notice->source_snapshot['items']), 422, 'At least one eligible item is required.');
                abort_unless(in_array($notice->draft_payload['reason'] ?? null, $rules['reasons'], true), 422, 'Reason is not permitted by policy.');
                abort_if(array_diff($notice->draft_payload['legal_bases'] ?? [], $rules['legal_bases']), 422, 'Legal basis is not permitted by policy.');
                $control = $policy->controlNumber($notice->id, $notice->notice_type, now(config('legal_policy.timezone'))->year);
                $notice->fill(['control_number' => $control, 'policy_version' => config('legal_policy.policy_version')]);
                $bytes = Pdf::loadView($policy->templateFor($notice->notice_type), ['notice' => $notice, 'draft' => false, 'policy' => $rules])->setPaper('a4')->output();
                $storedPath = "legal-notices/{$notice->id}/$control.pdf";
                abort_unless(Storage::disk('local')->put($storedPath, $bytes), 503, 'Private document storage is unavailable.');
                $notice->update(['issued_by' => $request->user()->id, 'pdf_disk' => 'local', 'pdf_file_path' => $storedPath, 'pdf_sha256' => hash('sha256', $bytes), 'issued_at' => now(), 'status' => 'issued']);
                $audit->recordOrFail($request, 'legal.notice_issued', $notice, ['control_number' => $control, 'policy_version' => $notice->policy_version]);
                return $notice;
            });
        } catch (\Throwable $error) {
            if ($storedPath) Storage::disk('local')->delete($storedPath);
            throw $error;
        }
        $vendor = $issued->store()->with('vendor')->first()?->vendor;
        if ($issued->intended_delivery_method === 'email_and_hand_copy' && $vendor?->email_verified_at) {
            Mail::to($vendor->email)->queue(new LegalNoticeAvailableMail($issued->id, $issued->notice_type, $issued->store->store_name));
        }
        return response()->json(['data' => $this->detail($issued)]);
    }

    public function delivery(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit, LegalPolicyService $policy)
    {
        $auth->requireManager($request->user());
        abort_unless($legalNotice->status === 'issued', 409, 'Delivery can only be recorded for an issued notice.');
        $data = $request->validate(['state' => ['required', Rule::in(['received', 'refused', 'failed'])], 'recorded_at' => ['required', 'date'], 'details' => ['nullable', 'array']]);
        DB::transaction(function () use ($request, $legalNotice, $data, $audit, $policy) {
            $rules = $policy->rulesFor($legalNotice->notice_type);
            $deadline = $data['state'] === $rules['deadline_anchor'] ? $policy->responseDeadline(Carbon::parse($data['recorded_at']), $legalNotice->notice_type) : null;
            $legalNotice->update(['delivery_state' => $data['state'], 'delivery_details' => $data['details'] ?? null, 'delivered_at' => $data['recorded_at'], 'due_date_timestamp' => $deadline]);
            $audit->recordOrFail($request, 'legal.delivery_recorded', $legalNotice, ['state' => $data['state']]);
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
        $file = $request->file('file'); $path = $file->store("legal-notices/{$legalNotice->id}/supplemental", 'local');
        abort_unless($path, 503, 'Private attachment storage is unavailable.');
        try {
            $attachment = DB::transaction(function () use ($request, $legalNotice, $audit, $file, $path) {
                $attachment = $legalNotice->attachments()->create(['uploaded_by' => $request->user()->id, 'kind' => 'supplemental', 'disk' => 'local', 'path' => $path, 'original_name' => $file->getClientOriginalName(), 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath())]);
                $audit->recordOrFail($request, 'legal.attachment_added', $legalNotice, ['attachment_id' => $attachment->id]); return $attachment;
            });
        } catch (\Throwable $error) { Storage::disk('local')->delete($path); throw $error; }
        return response()->json(['data' => $attachment], 201);
    }

    public function destroyAttachment(Request $request, LegalNotice $legalNotice, LegalNoticeAttachment $attachment, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user()); abort_unless($legalNotice->status === 'draft' && $attachment->legal_notice_id === $legalNotice->id && $attachment->kind === 'supplemental', 409);
        DB::transaction(function () use ($request, $legalNotice, $attachment, $audit) { $audit->recordOrFail($request, 'legal.attachment_deleted', $legalNotice, ['attachment_id' => $attachment->id]); $attachment->delete(); });
        Storage::disk($attachment->disk)->delete($attachment->path);
        return response()->noContent();
    }

    public function close(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit) { return $this->terminal($request, $legalNotice, $auth, $audit, 'closed'); }
    public function cancel(Request $request, LegalNotice $legalNotice, AdminAuthorizationService $auth, AuditTrailService $audit) { return $this->terminal($request, $legalNotice, $auth, $audit, 'cancelled'); }

    private function terminal(Request $request, LegalNotice $notice, AdminAuthorizationService $auth, AuditTrailService $audit, string $status)
    {
        $auth->requireManager($request->user()); abort_if(in_array($notice->status, ['closed', 'cancelled'], true), 409);
        DB::transaction(function () use ($request, $notice, $audit, $status) { $notice->update(['status' => $status, $status.'_at' => now()]); $audit->recordOrFail($request, "legal.notice_$status", $notice); });
        return response()->json(['data' => $this->detail($notice->fresh())]);
    }

    private function detail(LegalNotice $notice): array
    {
        $notice->loadMissing(['store:id,store_name,address', 'preparer:id,name', 'issuer:id,name', 'attachments']);
        $data = $notice->toArray();
        $payload = $notice->draft_payload ?? [];
        $data['readiness'] = ['case_reference' => (bool) $notice->monitoring_record_id, 'notice_type_and_basis' => filled($payload['reason'] ?? null) && ! empty($payload['legal_bases']), 'recipient_and_delivery' => filled($payload['recipient_name'] ?? null) && filled($payload['address'] ?? null) && filled($notice->intended_delivery_method), 'evidence_and_attachments' => ! empty($notice->source_snapshot['items']), 'internal_justification' => filled($notice->internal_justification)];
        $data['policy'] = app(LegalPolicyService::class)->availability($notice->notice_type);
        $data['overdue'] = $notice->due_date_timestamp?->isPast() && ! in_array($notice->status, ['response_received', 'closed', 'cancelled'], true);
        return $data;
    }
}
