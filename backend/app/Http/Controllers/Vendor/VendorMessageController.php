<?php

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\LegalNotice;
use App\Models\Store;
use App\Models\StoreMessage;
use App\Models\User;
use App\Services\Admin\AuditTrailService;
use App\Services\VendorSubmissionReceipt;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/** Vendor side of the per-store conversation. A vendor only ever sees rows addressed to their own account. */
class VendorMessageController extends Controller
{
    use ResolvesVendor;

    public function show(Request $request, int $store)
    {
        $user = $this->vendorUser($request);
        $store = $this->linkedStore($user, $store);

        $own = fn () => StoreMessage::where('store_id', $store->id)->where('vendor_user_id', $user->id);
        $data = $request->validate(['before_id' => ['nullable', 'integer', 'min:1'], 'mark_read' => ['sometimes', 'boolean']]);
        [$messages, $hasMore] = StoreMessage::page($own()->with('sender:id,name'), $data['before_id'] ?? null, 'dti', $request->boolean('mark_read', true));

        return response()->json(['data' => [
            'store' => $store->only(['id', 'store_name', 'address']),
            // DTI staff are shown by side, not by personal name.
            'messages' => $messages->map(fn (StoreMessage $m) => ['sender_name' => $m->sender_side === 'dti' ? 'DTI' : $m->sender?->name] + $m->toThreadArray())->values(),
            'has_more' => $hasMore,
            'notices' => LegalNotice::query()->visibleToVendor($user)->where('store_id', $store->id)->orderBy('issued_at')->get()
                ->map(fn (LegalNotice $notice) => [
                    ...$notice->only(['id', 'notice_type', 'control_number', 'status', 'delivery_state']),
                    'issued_at' => $notice->issued_at?->toIso8601String(), 'delivered_at' => $notice->delivered_at?->toIso8601String(), 'due_date_timestamp' => $notice->due_date_timestamp?->toIso8601String(),
                    'response_received_at' => $notice->response_received_at?->toIso8601String(), 'closed_at' => $notice->closed_at?->toIso8601String(),
                    'cancelled_at' => $notice->cancelled_at?->toIso8601String(), 'outcome' => $notice->outcome, 'outcome_reason' => $notice->outcome_reason,
                ])->values(),
        ]]);
    }

    public function send(Request $request, int $store, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $store = $this->linkedStore($user, $store);
        $data = $request->validate(StoreMessage::rules() + ['client_uuid' => ['nullable', 'uuid']]);
        $hash = VendorSubmissionReceipt::fingerprint(['body' => $data['body'] ?? null], $request->hasFile('attachment') ? [$request->file('attachment')] : []);
        $file = [];
        try {
            $message = DB::transaction(function () use ($request, $store, $user, $data, &$file, $audit, $hash) {
                $locked = Store::whereKey($store->id)->lockForUpdate()->firstOrFail();
                if ((int) $locked->vendor_user_id !== (int) $user->id) $this->denied();
                $accepted = VendorSubmissionReceipt::reserve($user->id, $data['client_uuid'] ?? null, 'message', $store->id, $hash);
                if ($accepted) return StoreMessage::whereKey($accepted)->where('vendor_user_id', $user->id)->where('store_id', $store->id)->firstOrFail();
                $file = StoreMessage::storeUpload($request->file('attachment'), $store->id);
                $message = StoreMessage::create([
                    'store_id' => $locked->id, 'vendor_user_id' => $user->id, 'sender_id' => $user->id,
                    'sender_side' => 'vendor', 'body' => $data['body'] ?? null,
                ] + $file);
                $audit->recordOrFail($request, 'vendor.message_sent', $message, ['store_id' => $locked->id, 'has_attachment' => (bool) $file]);
                VendorSubmissionReceipt::accept($user->id, $data['client_uuid'] ?? null, $message->id);
                return $message;
            });
        } catch (\Throwable $error) {
            if ($file) Storage::disk($file['attachment_disk'])->delete($file['attachment_path']);
            throw $error;
        }

        return response()->json(['data' => $message->load('sender:id,name')->toThreadArray()], 201);
    }

    public function attachment(Request $request, int $store, int $message, AuditTrailService $audit)
    {
        $user = $this->vendorUser($request);
        $store = $this->linkedStore($user, $store);
        $message = StoreMessage::whereKey($message)->where('store_id', $store->id)->where('vendor_user_id', $user->id)->firstOrFail();
        $audit->recordOrFail($request, 'vendor.message_attachment_accessed', $message, ['store_id' => $store->id]);
        return $message->attachmentResponse();
    }

    private function linkedStore(User $user, int $storeId): Store
    {
        return Store::whereKey($storeId)->where('vendor_user_id', $user->id)->first() ?? $this->denied();
    }

    private function denied(): never
    {
        $this->vendorError(403, 'STORE_ACCESS_DENIED', 'You do not have access to this store.');
    }
}
