<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceRecord;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\EmergencyApcPreparationService;
use App\Services\Admin\EmergencyPriceResolver;
use App\Services\Admin\SensitiveActionGuard;
use App\Services\FieldNotificationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class EmergencyAdminController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());

        return response()->json(['data' => RegulatoryEmergency::with(['candidates', 'priceRecords'])->latest()->get()
            ->map(fn (RegulatoryEmergency $emergency) => $this->detailPayload($emergency))->values()]);
    }

    public function store(Request $request, AdminAuthorizationService $auth, AuditTrailService $audit, EmergencyApcPreparationService $preparations)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'location' => ['required', Rule::in(['San Jose de Buenavista, Antique'])], 'starts_on' => 'required|date', 'ends_on' => 'nullable|date|after_or_equal:starts_on',
            'declaration_reference' => 'required|string',
        ]);
        $emergency = DB::transaction(function () use ($data, $request, $audit, $preparations) {
            $emergency = RegulatoryEmergency::create([
                'location' => $data['location'], 'starts_on' => $data['starts_on'], 'ends_on' => $data['ends_on'] ?? null,
                'declaration_reference' => $data['declaration_reference'], 'status' => 'draft',
                'responsible_admin_id' => $request->user()->id,
            ]);
            $emergency = $preparations->prepare($emergency, $request->user());
            $audit->recordOrFail($request, 'emergency.prepared', $emergency, ['declaration_reference' => $emergency->declaration_reference]);

            return $emergency;
        });

        return response()->json(['data' => $this->detailPayload($emergency)], 201);
    }

    private function detailPayload(RegulatoryEmergency $emergency): array
    {
        $emergency->loadMissing(['candidates', 'priceRecords']);
        $coveredCommodityKeys = app(EmergencyApcPreparationService::class)->coveredCommodityKeys($emergency);
        $sourceItems = MonitoringRecordItem::query()
            ->whereIn('id', $emergency->candidates->flatMap->source_item_ids)
            ->with('record.store:id,store_name')
            ->get()->keyBy('id');

        return [
            ...$emergency->toArray(),
            'effective_state' => $this->effectiveState($emergency),
            'covered_commodity_keys' => $coveredCommodityKeys,
            'missing_commodity_keys' => $coveredCommodityKeys->diff($emergency->candidates->pluck('commodity_key'))->values(),
            'source_week' => [
                'timezone' => 'Asia/Manila',
                'starts_at' => $emergency->source_week_starts_at?->toIso8601String(),
                'ends_at' => $emergency->source_week_ends_at?->toIso8601String(),
                'starts_on' => $emergency->source_week_starts_at?->copy()->setTimezone('Asia/Manila')->toDateString(),
                'ends_on' => $emergency->source_week_ends_at?->copy()->setTimezone('Asia/Manila')->subDay()->toDateString(),
            ],
            'candidates' => $emergency->candidates->map(fn ($candidate) => [
                ...$candidate->only([
                    'id', 'commodity_key', 'minimum_price', 'maximum_price', 'observed_average_price',
                    'computed_apc_price', 'observation_count', 'establishment_count', 'source_item_ids', 'dataset_hash',
                ]),
                'source_observations' => collect($candidate->source_item_ids)->map(function ($id) use ($sourceItems) {
                    $item = $sourceItems->get($id);

                    return $item ? [
                        'item_id' => $item->id,
                        'monitoring_record_id' => $item->monitoring_record_id,
                        'store_name' => $item->record?->store?->store_name,
                        'finalized_at' => $item->record?->finalized_at?->toIso8601String(),
                        'recorded_price' => (float) $item->recorded_price,
                    ] : null;
                })->filter()->values(),
            ])->values(),
            'official_prices' => $emergency->priceRecords->map(fn (RegulatoryPriceRecord $price) => [
                ...$price->toArray(),
                'effective_from' => $price->effective_from?->toDateString(),
                'effective_until' => $price->effective_until?->toDateString(),
            ])->values(),
        ];
    }

    private function effectiveState(RegulatoryEmergency $emergency): string
    {
        if ($emergency->status === 'cancelled' || ! $emergency->confirmed_at) {
            return $emergency->status;
        }
        $today = now('Asia/Manila')->toDateString();
        if ($emergency->starts_on->toDateString() > $today) {
            return 'scheduled';
        }
        if ($emergency->ends_on && $emergency->ends_on->toDateString() < $today) {
            return $emergency->status === 'active' ? 'expired' : $emergency->status;
        }

        return 'in_effect';
    }

    public function show(Request $request, RegulatoryEmergency $emergency, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());

        return response()->json(['data' => $this->detailPayload($emergency)]);
    }

    public function prepare(Request $request, RegulatoryEmergency $emergency, AdminAuthorizationService $auth, EmergencyApcPreparationService $preparations)
    {
        $auth->requireManager($request->user());
        abort_unless($emergency->status === 'draft', 422, 'Only a draft declaration can be prepared.');

        return response()->json(['data' => $this->detailPayload($preparations->prepare($emergency, $request->user()))]);
    }

    public function activate(Request $request, RegulatoryEmergency $emergency, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard, FieldNotificationService $notifications, EmergencyApcPreparationService $preparations)
    {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);
        $data = $request->validate([
            'confirmed' => ['required', 'accepted'],
            'preparation_hash' => ['required', 'string', 'size:64'],
        ]);

        try {
            $emergency = DB::transaction(function () use ($emergency, $data, $request, $audit, $notifications, $preparations) {
                $emergency = RegulatoryEmergency::query()->lockForUpdate()->findOrFail($emergency->id);
                abort_unless($emergency->status === 'draft', 422, 'Only a draft declaration can be activated.');
                if (! hash_equals($data['preparation_hash'], $emergency->preparation_hash ?? '')
                    || ! hash_equals($emergency->preparation_hash ?? '', $preparations->currentHash($emergency))) {
                    throw new HttpResponseException(response()->json([
                        'status' => 'APC_PREPARATION_STALE',
                        'message' => 'Monitoring data changed. Refresh and review the APC preparation before activation.',
                    ], 409));
                }

                $covered = $preparations->coveredCommodityKeys($emergency);
                $candidates = $emergency->candidates()->orderBy('commodity_key')->get();
                $missing = $covered->diff($candidates->pluck('commodity_key'))->values();
                if ($covered->isEmpty() || $missing->isNotEmpty()) {
                    throw new HttpResponseException(response()->json([
                        'status' => $covered->isEmpty() ? 'APC_SOURCE_WEEK_EMPTY' : 'APC_COVERAGE_INCOMPLETE',
                        'message' => 'Every Price Freeze-covered product needs monitoring data from the selected completed week.',
                        'missing_commodity_keys' => $missing,
                    ], 422));
                }

                foreach ($candidates as $candidate) {
                    RegulatoryPriceRecord::create([
                        'regulatory_emergency_id' => $emergency->id,
                        'source_candidate_id' => $candidate->id,
                        'commodity_key' => $candidate->commodity_key,
                        'price_type' => 'APC',
                        'authoritative_price' => $candidate->computed_apc_price,
                        'effective_from' => $emergency->starts_on,
                        'effective_until' => $emergency->ends_on,
                        'location' => $emergency->location,
                        'declaration_reference' => $emergency->declaration_reference,
                        'source_reference' => $emergency->declaration_reference.' | Monitoring week '.$emergency->source_week_starts_at->copy()->setTimezone('Asia/Manila')->toDateString().' to '.$emergency->source_week_ends_at->copy()->setTimezone('Asia/Manila')->subDay()->toDateString(),
                        'created_by' => $request->user()->id,
                    ]);
                }
                $emergency->update(['status' => 'active', 'active_scope_key' => 'systemwide', 'confirmed_at' => now(), 'responsible_admin_id' => $request->user()->id]);
                $audit->recordOrFail($request, 'emergency.confirmed', $emergency, [
                    'declaration_reference' => $emergency->declaration_reference,
                    'preparation_hash' => $emergency->preparation_hash,
                    'official_price_count' => $candidates->count(),
                ]);
                $notifications->broadcast('emergency_activated', ['emergency_id' => $emergency->id, 'starts_on' => $emergency->starts_on?->toDateString()]);

                return $emergency->fresh(['candidates', 'priceRecords']);
            });
        } catch (QueryException) {
            throw ValidationException::withMessages(['emergency' => ['End or cancel the active emergency before activating another.']]);
        }

        return response()->json(['data' => $this->detailPayload($emergency)]);
    }

    public function update(Request $request, RegulatoryEmergency $emergency, AdminAuthorizationService $auth, AuditTrailService $audit, SensitiveActionGuard $guard, FieldNotificationService $notifications)
    {
        $auth->requireManager($request->user());
        $guard->requireRecentReauthentication($request);
        abort_unless($emergency->status === 'active', 422, 'Only an active emergency can be ended or cancelled.');
        $data = $request->validate([
            'status' => 'required|in:ended,cancelled',
            'ends_on' => 'nullable|required_if:status,ended|date|after_or_equal:'.$emergency->starts_on->toDateString(),
            'confirmed' => 'required|accepted',
        ]);
        DB::transaction(function () use ($data, $request, $audit, $emergency, $notifications) {
            $previous = $emergency->status;
            $emergency->update([
                'status' => $data['status'],
                'active_scope_key' => null,
                'ends_on' => $data['ends_on'] ?? now('Asia/Manila')->toDateString(),
            ]);
            $emergency->priceRecords()->update(['effective_until' => $emergency->ends_on]);
            $audit->recordOrFail($request, 'emergency.status_changed', $emergency, [
                'previous_status' => $previous,
                'status' => $emergency->status,
                'ends_on' => $emergency->ends_on?->toDateString(),
            ]);
            $notifications->broadcast('emergency_'.$emergency->status, ['emergency_id' => $emergency->id, 'ends_on' => $emergency->ends_on?->toDateString()]);
        });

        return response()->json(['data' => $this->detailPayload($emergency->fresh())]);
    }

    public function resolve(Request $request, AdminAuthorizationService $auth, EmergencyPriceResolver $resolver)
    {
        abort_unless($auth->canViewAnalytics($request->user()), 403);
        $data = $request->validate(['commodity_key' => 'required|string', 'location' => 'required|string', 'observed_at' => 'required|date']);

        return response()->json($resolver->resolve($data['commodity_key'], $data['location'], $data['observed_at']));
    }
}
