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
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use App\Support\MonitoringWeek;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FieldDataController extends Controller
{
    public function bootstrap(Request $request, FieldReferenceResolver $references)
    {
        $user = $this->fieldUser($request);
        $filters = $request->validate(['since' => ['nullable', 'string', 'max:128']]);
        $today = now('Asia/Manila')->toDateString();
        $week = MonitoringWeek::current();
        $period = MonitoringPeriod::current();
        $effectiveEmergency = MonitoringPeriod::effectiveEmergency(now('Asia/Manila'));
        $referenceVersion = hash('sha256', implode('|', [
            $today,
            SrpBulletin::max('updated_at') ?? 'none',
            RegulatoryEmergency::max('updated_at') ?? 'none',
            RegulatoryPriceRecord::max('updated_at') ?? 'none',
        ]));
        $version = hash('sha256', implode('|', [
            'bootstrap-schema-2', // bump when the response shape changes so old caches download a full payload
            Store::max('updated_at') ?? 'none',
            $referenceVersion,
            TemporalInspection::where('validation_status', 'verified')->max('updated_at') ?? 'none',
            MonitoringRecord::where('status', 'accepted')->max('updated_at') ?? 'none',
        ]));
        // ponytail: always full payload; the version comes from second-precision max(updated_at) and can collide across
        // writes in the same second, so a delta could hide changes. Re-enable deltas with a monotonic revision bumped by every writer.
        $isCurrent = false;

        $bulletins = $isCurrent ? collect() : SrpBulletin::query()->where('is_active', true)
            ->whereDate('effective_date', '<=', $today)
            ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
            ->unique(fn ($bulletin) => $bulletin->commodity_key ?: 'id:'.$bulletin->id)
            ->sortBy('commodity_name')->values();

        $latestPerPair = TemporalInspection::query()
            ->select('store_id', 'srp_id')->selectRaw('max(inspection_timestamp) as latest_at')
            ->where('validation_status', 'verified')
            ->where('inspection_timestamp', '>=', now()->subWeeks(3))
            ->groupBy('store_id', 'srp_id');
        $recentPrices = $isCurrent ? collect() : TemporalInspection::query()
            ->joinSub($latestPerPair, 'latest', fn ($join) => $join
                ->on('temporal_inspections.store_id', '=', 'latest.store_id')
                ->on('temporal_inspections.srp_id', '=', 'latest.srp_id')
                ->on('temporal_inspections.inspection_timestamp', '=', 'latest.latest_at'))
            ->where('temporal_inspections.validation_status', 'verified')
            ->orderByDesc('temporal_inspections.inspection_timestamp')->orderByDesc('temporal_inspections.id')
            ->get(['temporal_inspections.store_id', 'temporal_inspections.srp_id', 'temporal_inspections.recorded_price', 'temporal_inspections.inspection_timestamp'])
            // Only rows sharing a pair's exact latest timestamp reach here; keep the newest id.
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
                'monitoring_week' => [
                    'timezone' => $week['timezone'], 'starts_at' => $week['starts_at']->toIso8601String(), 'ends_at' => $week['ends_at']->toIso8601String(),
                ],
                'monitoring_period' => $this->periodPayload($period),
                'stores' => $isCurrent ? [] : Store::query()->where('is_active', true)
                    ->withExists([
                        'routineMonitoringRecords as has_prior_routine_monitoring',
                        'routineMonitoringRecords as monitored_this_week' => fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at']),
                        'routineMonitoringRecords as routine_completed' => fn ($records) => $this->routinePeriod($records, $period),
                    ])
                    ->with(['latestRoutineMonitoringRecord' => fn ($record) => $record->select('monitoring_records.id', 'monitoring_records.store_id', 'monitoring_records.finalized_at')])
                    ->orderBy('store_name')->get()->map(fn (Store $store) => [
                        ...$store->only(['id', 'store_name', 'address', 'latitude', 'longitude', 'is_active', 'image_path']),
                        'routine_status' => $store->routine_completed ? 'completed' : 'due',
                        'weekly_routine_status' => $store->monitored_this_week ? 'monitored_this_week' : 'not_yet_monitored',
                        'has_prior_routine_monitoring' => (bool) $store->has_prior_routine_monitoring,
                        'latest_routine_monitoring_at' => $store->latestRoutineMonitoringRecord?->finalized_at,
                    ]),
                'srp_bulletins' => $bulletins,
                'monitoring_references' => $bulletins->map(function (SrpBulletin $bulletin) use ($references) {
                    $reference = $references->resolve($bulletin, now('Asia/Manila'));

                    return [
                        'srp_id' => $bulletin->id,
                        'commodity_key' => $bulletin->commodity_key,
                        'covered_by_price_freeze' => (bool) $bulletin->price_freeze_applicable,
                        ...$reference,
                        'reference_version' => $references->version($reference),
                    ];
                })->values(),
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
            ->where('status', 'claimed')->where('claimed_by', $user->id)
            ->with('store:id,store_name,address,latitude,longitude')
            ->latest('requested_at')->get()
            ->map(fn ($item) => [
                'id' => $item->id, 'status' => $item->status, 'source_type' => $item->source_type,
                'reason' => $item->reason,
                'requested_at' => $item->requested_at, 'claimed_at' => $item->claimed_at,
                'claimed_by' => $item->claimed_by, 'store' => $item->store,
            ]);

        return response()->json(['data' => $requests]);
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
            'source_type' => $verification->source_type, 'store_id' => $verification->store_id, 'reason' => $verification->reason,
            'claimed_by' => $verification->claimed_by, 'requested_at' => $verification->requested_at,
            'claimed_at' => $verification->claimed_at, 'released_at' => $verification->released_at,
        ];
    }

    private function routinePeriod($query, array $period)
    {
        MonitoringPeriod::constrainProtocol($query, $period['protocol_mode'])
            ->where('finalized_at', '>=', $period['starts_at'])->where('finalized_at', '<', $period['ends_at']);

        return $query;
    }

    private function periodPayload(array $period): array
    {
        return [
            'cadence' => $period['cadence'], 'timezone' => $period['timezone'],
            'starts_at' => $period['starts_at']->toIso8601String(), 'ends_at' => $period['ends_at']->toIso8601String(),
            'protocol_mode' => $period['protocol_mode'], 'declaration_reference' => $period['declaration_reference'],
        ];
    }
}
