<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** DTI side of the per-store conversation with the store's vendor. */
class StoreConversationController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate(['search' => ['nullable', 'string', 'max:120'], 'page' => ['nullable', 'integer', 'min:1']]);

        // Linked stores, plus unlinked stores that still have a history to review.
        $query = Store::query()
            ->where(fn ($q) => $q->whereNotNull('vendor_user_id')->orWhereHas('messages')->orWhereHas('legalNotices', fn ($n) => $n->whereNotNull('issued_at')))
            ->with('vendor:id,name,email,is_active')
            ->withCount(['messages as unread_count' => fn ($m) => $m->where('sender_side', 'vendor')->whereNull('read_at')])
            ->withCount(['legalNotices as open_notice_count' => fn ($n) => $n->whereIn('status', ['issued', 'response_received'])])
            ->addSelect(['last_message_id' => StoreMessage::select('id')->whereColumn('store_id', 'stores.id')->latest('id')->limit(1)])
            ->orderByDesc('last_message_id')->orderBy('store_name');
        if ($search = trim($filters['search'] ?? '')) {
            $query->where(fn ($q) => $q->where('store_name', 'like', "%$search%")->orWhere('owner_name', 'like', "%$search%"));
        }
        $page = $query->paginate(30, ['stores.id', 'stores.store_name', 'stores.address', 'stores.vendor_user_id']);
        $last = StoreMessage::whereIn('id', $page->getCollection()->pluck('last_message_id')->filter())->get()->keyBy('store_id');

        $page->setCollection($page->getCollection()->map(fn (Store $store) => [
            'id' => $store->id, 'store_name' => $store->store_name, 'address' => $store->address,
            'linked' => (bool) $store->vendor_user_id, 'vendor' => $store->vendor?->only(['id', 'name', 'email', 'is_active']),
            'unread_count' => (int) $store->unread_count, 'open_notice_count' => (int) $store->open_notice_count,
            'last_message' => ($message = $last->get($store->id)) ? [
                'sender_side' => $message->sender_side, 'created_at' => $message->created_at?->toIso8601String(),
                'preview' => $message->deleted_at ? 'Message deleted' : ($message->body !== null ? mb_substr($message->body, 0, 120) : $message->attachment_name),
            ] : null,
        ]));

        return response()->json(['data' => $page]);
    }

    public function show(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['before_id' => ['nullable', 'integer', 'min:1']]);
        // The latest page is returned whole on every poll, so read receipts on older messages stay current.
        [$messages, $hasMore] = StoreMessage::page($store->messages()->with(['sender:id,name', 'vendor:id,name']), $data['before_id'] ?? null, 'vendor');
        $store->load('vendor:id,name,email,is_active');

        return response()->json(['data' => [
            'store' => ['id' => $store->id, 'store_name' => $store->store_name, 'address' => $store->address, 'linked' => (bool) $store->vendor_user_id, 'vendor' => $store->vendor?->only(['id', 'name', 'email', 'is_active'])],
            'messages' => $messages->map(fn (StoreMessage $m) => $this->threadRow($m, $request) + ['vendor_name' => $m->vendor?->name])->values(),
            'has_more' => $hasMore,
            // Everything except drafts that were cancelled before issue.
            'notices' => $store->legalNotices()->where(fn ($q) => $q->where('status', '!=', 'cancelled')->orWhereNotNull('issued_at'))
                ->orderBy('id')->get()->map(fn (LegalNotice $notice) => [
                    ...$notice->only(['id', 'notice_type', 'control_number', 'status', 'delivery_state', 'intended_delivery_method', 'preceding_notice_id', 'vendor_user_id', 'monitoring_record_id']),
                    'created_at' => $notice->created_at?->toIso8601String(), 'issued_at' => $notice->issued_at?->toIso8601String(),
                    'delivered_at' => $notice->delivered_at?->toIso8601String(), 'due_date_timestamp' => $notice->due_date_timestamp?->toIso8601String(),
                    'response_received_at' => $notice->response_received_at?->toIso8601String(), 'closed_at' => $notice->closed_at?->toIso8601String(),
                    'cancelled_at' => $notice->cancelled_at?->toIso8601String(),
                ])->values(),
            'eligible_records' => $this->eligibleRecords($store),
        ]]);
    }

    public function send(Request $request, Store $store, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(StoreMessage::rules());
        $file = StoreMessage::storeUpload($request->file('attachment'), $store->id);
        try {
            $message = DB::transaction(function () use ($request, $store, $data, $file, $audit) {
                // The audience is read under the store lock, so an unlink cannot address this message to a revoked vendor.
                $locked = Store::whereKey($store->id)->lockForUpdate()->firstOrFail();
                abort_unless($locked->vendor_user_id, 422, 'This store has no linked vendor account to message.');
                $message = StoreMessage::create([
                    'store_id' => $locked->id, 'vendor_user_id' => $locked->vendor_user_id, 'sender_id' => $request->user()->id,
                    'sender_side' => 'dti', 'body' => $data['body'] ?? null,
                ] + $file);
                $audit->recordOrFail($request, 'store.message_sent', $message, ['store_id' => $locked->id, 'has_attachment' => (bool) $file]);
                return $message;
            });
        } catch (\Throwable $error) {
            if ($file) Storage::disk($file['attachment_disk'])->delete($file['attachment_path']);
            throw $error;
        }

        return response()->json(['data' => $this->threadRow($message->load('sender:id,name'), $request)], 201);
    }

    public function update(Request $request, Store $store, int $message, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $data = $request->validate(['body' => ['required', 'string', 'max:'.StoreMessage::BODY_MAX]]);
        $message = DB::transaction(function () use ($request, $store, $message, $data, $audit) {
            $message = $this->ownMessage($request, $store, $message);
            // The replaced text survives only here.
            $audit->recordOrFail($request, 'store.message_edited', $message, ['store_id' => $store->id, 'previous_body' => $message->body]);
            $message->update(['body' => $data['body'], 'edited_at' => now()]);
            return $message;
        });

        return response()->json(['data' => $this->threadRow($message->load('sender:id,name'), $request)]);
    }

    public function destroy(Request $request, Store $store, int $message, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $message = DB::transaction(function () use ($request, $store, $message, $audit) {
            $message = $this->ownMessage($request, $store, $message);
            $audit->recordOrFail($request, 'store.message_deleted', $message, ['store_id' => $store->id]);
            $message->update(['deleted_at' => now()]);
            return $message;
        });

        return response()->json(['data' => $this->threadRow($message->load('sender:id,name'), $request)]);
    }

    public function attachment(Request $request, Store $store, StoreMessage $message, AdminAuthorizationService $auth, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        abort_unless((int) $message->store_id === (int) $store->id, 404);
        $audit->recordOrFail($request, 'store.message_attachment_accessed', $message, ['store_id' => $store->id]);
        return $message->attachmentResponse();
    }

    /** A DTI message this staff member sent and has not deleted, locked for the change. */
    private function ownMessage(Request $request, Store $store, int $messageId): StoreMessage
    {
        return StoreMessage::whereKey($messageId)->where('store_id', $store->id)->where('sender_side', 'dti')
            ->where('sender_id', $request->user()->id)->whereNull('deleted_at')->lockForUpdate()->firstOrFail();
    }

    /** `can_modify` tells the admin thread which messages this staff member may edit or delete: only their own. */
    private function threadRow(StoreMessage $message, Request $request): array
    {
        return $message->toThreadArray() + [
            'can_modify' => $message->sender_side === 'dti' && ! $message->deleted_at && (int) $message->sender_id === (int) $request->user()->id,
        ];
    }

    /**
     * Accepted visits with flagged products DTI has not decided and no open notice: the starting points for an LOI/SCO.
     * Same rule as Legal Actions › Needs review (MonitoringRecordItem::scopeUndecidedEligible).
     */
    private function eligibleRecords(Store $store): array
    {
        return MonitoringRecord::query()->where('store_id', $store->id)->where('status', 'accepted')
            ->hasUndecidedItems()
            ->whereNotExists(fn ($q) => $q->selectRaw('1')->from('legal_notices')->whereColumn('legal_notices.monitoring_record_id', 'monitoring_records.id')
                ->whereIn('legal_notices.status', ['draft', 'issued', 'response_received']))
            ->withCount(['items as eligible_item_count' => fn ($i) => $i->undecidedEligible()])
            ->latest('finalized_at')->limit(20)->get(['id', 'client_uuid', 'finalized_at', 'store_id'])
            ->map(fn (MonitoringRecord $record) => [
                'id' => $record->id, 'client_uuid' => $record->client_uuid, 'finalized_at' => $record->finalized_at?->toIso8601String(),
                'eligible_item_count' => (int) $record->eligible_item_count,
            ])->all();
    }
}
