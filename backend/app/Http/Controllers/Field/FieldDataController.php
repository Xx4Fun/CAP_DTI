<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
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
            'bootstrap-schema-3', // current monitoring representative; force old caches to download the new shape
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

        // One comparator per store and comparable commodity: newest first, reduced on the same group identity the
        // field PWA rebuilds, so the officer's live indicator and the server's stored flag cannot disagree. Bounded
        // at both ends against one as-of instant — finalized_at is validated only as a date, so a future-dated
        // verified observation is reachable and must not become the comparator.
        // Bound in UTC: Eloquent binds a Carbon's wall-clock string, so a Manila-local bound would sit 8 hours
        // ahead of the UTC timestamps stored on the rows and let future observations through.
        $asOf = now('Asia/Manila')->utc();
        $comparableSince = MonitoringPeriod::comparableSince($asOf);
        $recentPrices = $isCurrent ? collect() : TemporalInspection::query()
            ->join('srp_bulletins', 'srp_bulletins.id', '=', 'temporal_inspections.srp_id')
            ->where('temporal_inspections.validation_status', 'verified')
            ->where('temporal_inspections.inspection_timestamp', '>=', $comparableSince)
            ->where('temporal_inspections.inspection_timestamp', '<', $asOf)
            ->orderByDesc('temporal_inspections.inspection_timestamp')->orderByDesc('temporal_inspections.id')
            ->get([
                'temporal_inspections.store_id', 'temporal_inspections.srp_id', 'temporal_inspections.recorded_price',
                'temporal_inspections.inspection_timestamp', 'srp_bulletins.commodity_key', 'srp_bulletins.unit',
            ])
            ->unique(fn ($row) => $row->store_id.':'.SrpBulletin::comparabilityKey($row->commodity_key, $row->unit, $row->srp_id))
            // Emit the group key the server computed. PHP trim() and JavaScript trim() disagree on Unicode
            // whitespace, so a unit carrying a non-breaking space would otherwise group differently on each side.
            ->map(fn ($row) => [
                'store_id' => $row->store_id, 'srp_id' => $row->srp_id,
                'recorded_price' => $row->recorded_price, 'inspection_timestamp' => $row->inspection_timestamp,
                'commodity_key' => $row->commodity_key, 'unit' => $row->unit,
                'comparability_key' => SrpBulletin::comparabilityKey($row->commodity_key, $row->unit, $row->srp_id),
            ])
            ->values();

        return response()->json([
            'data' => [
                'version' => $version,
                'reference_version' => $referenceVersion,
                'is_delta' => $isCurrent,
                'protocol' => [
                    'labels_are_provisional' => true,
                    'standard_review_rule' => 'recorded_price_above_srp',
                    'emergency_review_rule' => 'recorded_price_above_ceiling',
                    'previous_price_review_threshold_percent' => MonitoringRecordItem::PREVIOUS_PRICE_THRESHOLD,
                    'mode' => $effectiveEmergency ? 'emergency' : 'standard',
                    'declaration_reference' => $effectiveEmergency?->declaration_reference,
                    'starts_on' => $effectiveEmergency?->starts_on?->toDateString(),
                    'ends_on' => $effectiveEmergency?->ends_on?->toDateString(),
                ],
                // The window a previous observation must fall in to be comparable. A cached payload without it
                // cannot have its observations validated, so the officer's device treats them as unavailable.
                'comparable_since' => $isCurrent ? null : $comparableSince->toIso8601String(),
                'monitoring_week' => [
                    'timezone' => $week['timezone'], 'starts_at' => $week['starts_at']->toIso8601String(), 'ends_at' => $week['ends_at']->toIso8601String(),
                ],
                'monitoring_period' => $this->periodPayload($period),
                'stores' => $isCurrent ? [] : Store::query()->where('is_active', true)
                    ->withExists([
                        'routineMonitoringRecords as has_prior_routine_monitoring',
                        'routineMonitoringRecords as monitored_this_week' => fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at']),
                        'routineMonitoringRecords as routine_completed' => fn ($records) => MonitoringPeriod::constrainPeriod($records, $period),
                    ])
                    ->with(['latestRoutineMonitoringRecord' => fn ($record) => $record->select('monitoring_records.id', 'monitoring_records.store_id', 'monitoring_records.finalized_at')])
                    ->orderBy('store_name')->get()->map(fn (Store $store) => [
                        ...$store->only(['id', 'store_name', 'owner_name', 'address', 'latitude', 'longitude', 'is_active', 'image_path']),
                        'current_representative' => $store->currentRepresentative(),
                        'routine_status' => $store->routine_completed ? 'completed' : 'due',
                        'weekly_routine_status' => $store->monitored_this_week ? 'monitored_this_week' : 'not_yet_monitored',
                        'has_prior_routine_monitoring' => (bool) $store->has_prior_routine_monitoring,
                        'latest_routine_monitoring_at' => $store->latestRoutineMonitoringRecord?->finalized_at,
                    ]),
                'srp_bulletins' => $bulletins->map(fn (SrpBulletin $bulletin) => [
                    ...$bulletin->toArray(),
                    'comparability_key' => SrpBulletin::comparabilityKey($bulletin->commodity_key, $bulletin->unit, $bulletin->id),
                ]),
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
                    ->whereHas('emergency', fn ($query) => $query->effectiveAt(now('Asia/Manila')))
                    ->with('emergency:id,location,starts_on,ends_on,ended_at,declaration_reference,status')
                    ->orderBy('effective_from')->get(),
                'recent_prices' => $recentPrices,
                'accepted_today' => MonitoringRecord::query()->where('officer_user_id', $user->id)
                    ->where('status', 'accepted')->whereBetween('received_at', [
                        now('Asia/Manila')->startOfDay()->utc(), now('Asia/Manila')->endOfDay()->utc(),
                    ])->count(),
            ],
        ]);
    }

    public function representative(Request $request, Store $store)
    {
        $this->fieldUser($request);
        abort_unless($store->is_active, 404);
        return response()->json(['data' => [
            'id' => $store->id, 'owner_name' => $store->owner_name,
            'current_representative' => $store->currentRepresentative(),
        ]]);
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

    private function periodPayload(array $period): array
    {
        return [
            'cadence' => $period['cadence'], 'timezone' => $period['timezone'],
            'starts_at' => $period['starts_at']->toIso8601String(), 'ends_at' => $period['ends_at']->toIso8601String(),
            'protocol_mode' => $period['protocol_mode'], 'declaration_reference' => $period['declaration_reference'],
        ];
    }
}
