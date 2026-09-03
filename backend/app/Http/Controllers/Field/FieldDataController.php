<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FieldDataController extends Controller
{
    public function bootstrap(Request $request)
    {
        $user = $this->fieldUser($request);
        $filters = $request->validate(['since' => ['nullable', 'string', 'max:128']]);
        $today = now('Asia/Manila')->toDateString();
        $effectiveEmergency = RegulatoryEmergency::query()->whereIn('status', ['active', 'ended'])
            ->whereDate('starts_on', '<=', $today)
            ->where(fn ($query) => $query->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today))
            ->latest('starts_on')->latest('id')->first();
        $referenceVersion = hash('sha256', implode('|', [
            $today,
            SrpBulletin::max('updated_at') ?? 'none',
            RegulatoryEmergency::max('updated_at') ?? 'none',
            RegulatoryPriceRecord::max('updated_at') ?? 'none',
        ]));
        $version = hash('sha256', implode('|', [
            Store::max('updated_at') ?? 'none',
            $referenceVersion,
            TemporalInspection::where('validation_status', 'verified')->max('updated_at') ?? 'none',
        ]));
        $isCurrent = isset($filters['since']) && hash_equals($version, $filters['since']);

        $recentPrices = $isCurrent ? collect() : TemporalInspection::query()
            ->where('validation_status', 'verified')
            ->where('inspection_timestamp', '>=', now()->subWeeks(3))
            ->latest('inspection_timestamp')
            ->get(['store_id', 'srp_id', 'recorded_price', 'inspection_timestamp'])
            ->unique(fn ($inspection) => $inspection->store_id.':'.$inspection->srp_id)
            ->values();

        return response()->json([
            'data' => [
                'version' => $version,
                'reference_version' => $referenceVersion,
                'is_delta' => $isCurrent,
                'protocol' => [
                    'labels_are_provisional' => true,
                    'standard_review_threshold_percent' => 10,
                    'emergency_review_rule' => 'recorded_price_above_ceiling',
                    'mode' => $effectiveEmergency ? 'emergency' : 'standard',
                    'declaration_reference' => $effectiveEmergency?->declaration_reference,
                    'starts_on' => $effectiveEmergency?->starts_on?->toDateString(),
                    'ends_on' => $effectiveEmergency?->ends_on?->toDateString(),
                ],
                'stores' => $isCurrent ? [] : Store::query()->where('is_active', true)->orderBy('store_name')->get(),
                'srp_bulletins' => $isCurrent ? [] : SrpBulletin::query()->where('is_active', true)
                    ->whereDate('effective_date', '<=', $today)
                    ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
                    ->unique(fn ($bulletin) => $bulletin->commodity_key ?: 'id:'.$bulletin->id)
                    ->sortBy('commodity_name')->values(),
                'regulatory_prices' => $isCurrent ? [] : RegulatoryPriceRecord::query()
                    ->whereDate('effective_from', '<=', $today)
                    ->where(fn ($query) => $query->whereNull('effective_until')->orWhereDate('effective_until', '>=', $today))
                    ->whereHas('emergency', fn ($query) => $query->whereIn('status', ['active', 'ended'])
                        ->whereDate('starts_on', '<=', $today)
                        ->where(fn ($dates) => $dates->whereNull('ends_on')->orWhereDate('ends_on', '>=', $today)))
                    ->with('emergency:id,location,starts_on,ends_on,declaration_reference,status')
                    ->orderBy('effective_from')->get(),
                'recent_prices' => $recentPrices,
                'accepted_today' => MonitoringRecord::query()->where('officer_user_id', $user->id)
                    ->where('status', 'accepted')->whereBetween('received_at', [
                        now('Asia/Manila')->startOfDay()->utc(), now('Asia/Manila')->endOfDay()->utc(),
                    ])->count(),
            ],
        ]);
    }

    public function verificationRequests(Request $request)
    {
        $user = $this->fieldUser($request);
        $requests = FieldVerificationRequest::query()
            ->where(fn ($query) => $query->where('status', 'open')
                ->orWhere(fn ($claimed) => $claimed->where('status', 'claimed')->where('claimed_by', $user->id)))
            ->with('store:id,store_name,address,latitude,longitude')
            ->latest('requested_at')->get()
            ->map(fn ($item) => [
                'id' => $item->id, 'status' => $item->status, 'reason' => $item->reason,
                'requested_at' => $item->requested_at, 'claimed_at' => $item->claimed_at,
                'claimed_by' => $item->claimed_by, 'store' => $item->store,
            ]);

        return response()->json(['data' => $requests]);
    }

    public function claim(Request $request, FieldVerificationRequest $verificationRequest, AuditTrailService $audit)
    {
        $user = $this->fieldUser($request);
        DB::transaction(function () use ($request, $verificationRequest, $user, $audit) {
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            if ($verificationRequest->status === 'claimed' && $verificationRequest->claimed_by === $user->id) return;
            abort_unless($verificationRequest->status === 'open', 409, 'This request is no longer available.');
            $verificationRequest->update(['status' => 'claimed', 'claimed_by' => $user->id, 'claimed_at' => now()]);
            $audit->recordOrFail($request, 'field_verification.claimed', $verificationRequest);
        });

        return response()->json(['data' => $this->verificationPayload($verificationRequest->fresh())]);
    }

    public function release(Request $request, FieldVerificationRequest $verificationRequest, AuditTrailService $audit)
    {
        $user = $this->fieldUser($request);
        DB::transaction(function () use ($request, $verificationRequest, $user, $audit) {
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'claimed' && $verificationRequest->claimed_by === $user->id, 403, 'Only the claimant can release this request.');
            $verificationRequest->update(['status' => 'open', 'claimed_by' => null, 'released_at' => now()]);
            $audit->recordOrFail($request, 'field_verification.released', $verificationRequest);
        });

        return response()->json(['data' => $this->verificationPayload($verificationRequest->fresh())]);
    }

    public function notifications(Request $request)
    {
        $user = $this->fieldUser($request);
        $filters = $request->validate(['page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $paginator = $user->notifications()->latest()->paginate($filters['per_page'] ?? 20);
        return response()->json(['data' => $paginator->getCollection()->map(fn ($notification) => [
            'id' => $notification->id, 'event' => $notification->data['event'] ?? null,
            'payload' => $notification->data['payload'] ?? [], 'read_at' => $notification->read_at,
            'created_at' => $notification->created_at,
        ])->values(), 'meta' => [
            'current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(), 'total' => $paginator->total(),
        ], 'unread_count' => $user->unreadNotifications()->count()]);
    }

    public function readNotification(Request $request, string $notification)
    {
        $user = $this->fieldUser($request);
        $notification = $user->notifications()->whereKey($notification)->firstOrFail();
        $notification->markAsRead();
        return response()->json(['data' => [
            'id' => $notification->id, 'event' => $notification->data['event'] ?? null,
            'payload' => $notification->data['payload'] ?? [], 'read_at' => $notification->fresh()->read_at,
            'created_at' => $notification->created_at,
        ]]);
    }

    public function readAllNotifications(Request $request)
    {
        $user = $this->fieldUser($request);
        $user->unreadNotifications()->update(['read_at' => now()]);
        return response()->json(['data' => ['unread_count' => 0]]);
    }

    private function fieldUser(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->role === 'field_officer' && $user->is_active && $user->currentAccessToken()?->can('field-monitoring'), 403, 'Forbidden');
        return $user;
    }

    private function verificationPayload(FieldVerificationRequest $verification): array
    {
        return [
            'id' => $verification->id, 'status' => $verification->status,
            'store_id' => $verification->store_id, 'reason' => $verification->reason,
            'claimed_by' => $verification->claimed_by, 'requested_at' => $verification->requested_at,
            'claimed_at' => $verification->claimed_at, 'released_at' => $verification->released_at,
        ];
    }
}
