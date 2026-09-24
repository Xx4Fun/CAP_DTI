<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SrpCatalogService;
use App\Services\FieldNotificationService;
use App\Support\MonitoringPeriod;
use App\Support\MonitoringWeek;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class MonitoringRecordController extends Controller
{
    public function additionalVisit(Request $request, Store $store, AdminAuthorizationService $auth, AuditTrailService $audit, FieldNotificationService $notifications)
    {
        $auth->requireManager($request->user());
        abort_unless($store->is_active, 422, 'An active establishment is required.');
        $data = $this->assignmentData($request);
        $officer = User::findOrFail($data['field_officer_id']);

        $verification = DB::transaction(function () use ($request, $store, $data, $officer, $audit, $notifications) {
            $verification = FieldVerificationRequest::create([
                'consumer_report_id' => null, 'source_type' => 'supervisor_directive',
                'store_id' => $store->id, 'requested_by' => $request->user()->id,
                'claimed_by' => $officer->id, 'status' => 'claimed', 'reason' => $data['reason'],
                'context_json' => [], 'requested_at' => now(), 'claimed_at' => now(),
            ]);
            $audit->recordOrFail($request, 'field_verification.requested', $verification, [
                'source_type' => 'supervisor_directive', 'store_id' => $store->id, 'field_officer_id' => $officer->id,
            ]);
            $notifications->send($officer, 'verification_assigned', [
                'verification_request_id' => $verification->id, 'store_id' => $store->id, 'store_name' => $store->store_name,
            ]);

            return $verification;
        });

        return response()->json(['data' => $verification], 201);
    }

    public function assignVerification(Request $request, FieldVerificationRequest $verificationRequest, AdminAuthorizationService $auth, AuditTrailService $audit, FieldNotificationService $notifications)
    {
        $auth->requireManager($request->user());
        $data = $request->validate([
            'field_officer_id' => ['required', Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', 'field_officer')->where('is_active', true))],
        ]);
        $officer = User::findOrFail($data['field_officer_id']);

        DB::transaction(function () use ($request, $verificationRequest, $officer, $audit, $notifications) {
            $verificationRequest = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($verificationRequest->id);
            abort_unless($verificationRequest->status === 'open', 422, 'Only a returned request can be assigned.');
            $verificationRequest->update([
                'status' => 'claimed', 'claimed_by' => $officer->id, 'claimed_at' => now(),
            ]);
            $audit->recordOrFail($request, 'field_verification.assigned', $verificationRequest, ['field_officer_id' => $officer->id]);
            $notifications->send($officer, 'verification_assigned', [
                'verification_request_id' => $verificationRequest->id, 'store_id' => $verificationRequest->store_id,
                'store_name' => $verificationRequest->store()->value('store_name'),
            ]);
        });

        return response()->json(['data' => $verificationRequest->fresh()]);
    }

    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'anomaly' => ['nullable', Rule::in(['all', 'yes', 'no'])],
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'period' => ['nullable', Rule::in(['this_week', 'last_4_weeks', 'this_month', 'last_month', 'all_time', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $query = MonitoringRecord::query()->where('status', 'accepted')
            ->with(['officer:id,name,email', 'store:id,store_name,address'])
            ->withCount(['items', 'items as anomaly_count' => fn ($items) => $items->where('is_anomaly', true)]);
        if ($search = trim($filters['search'] ?? '')) {
            $query->where(fn ($nested) => $nested
                ->whereHas('officer', fn ($officer) => $officer->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
                ->orWhereHas('store', fn ($store) => $store->where('store_name', 'like', "%{$search}%")));
        }
        if (($filters['anomaly'] ?? 'all') !== 'all') {
            $query->{($filters['anomaly'] === 'yes' ? 'whereHas' : 'whereDoesntHave')}('items', fn ($items) => $items->where('is_anomaly', true));
        }
        if (isset($filters['store_id'])) {
            $query->where('store_id', $filters['store_id']);
        }
        $dates = $this->parsePeriodDates($request);
        $this->applyPeriodConstraint($query, $dates, 'finalized_at');

        return response()->json(['data' => $query->latest('finalized_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function matrix(Request $request, AdminAuthorizationService $auth, SrpCatalogService $catalog)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'period' => ['nullable', Rule::in(['this_week', 'last_4_weeks', 'this_month', 'last_month', 'all_time', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
        ]);

        // One row per commodity lineage and unit: every SRP revision folds into the current record, or, for a
        // unit the lineage no longer uses, into that unit's latest effective revision. Prices in different
        // units never share a row, so the weekly MIN/MAX/AVERAGE only compares like with like.
        $groupOf = fn (SrpBulletin $srp) => $catalog->lineageKey($srp).'|'.strtolower(trim((string) $srp->unit));
        $current = $catalog->currentRecords();
        $currentByGroup = $current->keyBy($groupOf);
        $currentIds = $current->pluck('id')->flip();
        $today = now()->toDateString();
        $canonical = [];
        SrpBulletin::query()->get()->groupBy($groupOf)->each(function ($members, $group) use ($currentByGroup, $today, &$canonical) {
            $pick = $currentByGroup->get($group)
                ?? $members->filter(fn ($srp) => $srp->effective_date?->toDateString() <= $today)
                    ->sortBy([['effective_date', 'desc'], ['id', 'desc']])->first()
                ?? $members->sortBy([['effective_date', 'asc'], ['id', 'asc']])->first();
            foreach ($members as $member) {
                $canonical[$member->id] = $pick;
            }
        });

        $query = MonitoringRecord::query()
            ->where('status', 'accepted')
            ->with([
                'store:id,store_name,address',
                'items:id,monitoring_record_id,srp_id,recorded_price,baseline_price,is_anomaly',
            ]);

        $dates = $this->parsePeriodDates($request);
        $this->applyPeriodConstraint($query, $dates, 'finalized_at');

        $records = $query->orderBy('finalized_at')->get();

        // Group records chronologically by calendar week (Monday to Sunday)
        $groupedWeeks = $records->groupBy(function ($record) {
            $date = Carbon::parse($record->finalized_at);

            return $date->copy()->startOfWeek()->toDateString().'_'.$date->copy()->endOfWeek()->toDateString();
        });

        $weeksData = [];
        $pricedRows = [];
        $weekIndex = 1;
        foreach ($groupedWeeks as $weekKey => $weekRecords) {
            [$startsAt, $endsAt] = explode('_', $weekKey);
            $startFormatted = Carbon::parse($startsAt)->format('M d');
            $endFormatted = Carbon::parse($endsAt)->format('M d, Y');

            $storesData = [];
            $byStore = $weekRecords->groupBy('store_id');
            foreach ($byStore as $storeId => $storeRecords) {
                $primaryRecord = $storeRecords->sortByDesc(fn ($r) => count($r->items))->first();
                $prices = [];
                foreach ($storeRecords as $record) {
                    foreach ($record->items as $item) {
                        $row = $canonical[$item->srp_id] ?? null;
                        if ($row && ! isset($currentIds[$row->id])) {
                            $pricedRows[$row->id] = $row;
                        }
                        $prices[$row?->id ?? $item->srp_id] = [
                            'recorded_price' => (float) $item->recorded_price,
                            'is_anomaly' => (bool) $item->is_anomaly,
                        ];
                    }
                }
                $storesData[] = [
                    'store_id' => $primaryRecord->store->id,
                    'store_name' => $primaryRecord->store->store_name,
                    'monitoring_date' => Carbon::parse($primaryRecord->finalized_at)->toDateString(),
                    'monitoring_date_formatted' => Carbon::parse($primaryRecord->finalized_at)->format('M d, Y'),
                    'prices' => $prices,
                ];
            }

            $currentNum = $weekIndex++;
            $weeksData[] = [
                'week_number' => $currentNum,
                'week_key' => $weekKey,
                'week_label' => "WEEK {$currentNum} ({$startFormatted} - {$endFormatted})",
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'establishments' => $storesData,
            ];
        }

        $commodities = $current->concat(array_values($pricedRows))
            ->map(fn (SrpBulletin $srp) => [
                'id' => $srp->id,
                'commodity_name' => $srp->commodity_name,
                'unit' => $srp->unit,
                'category' => $srp->category ?? 'General',
                'regulatory_classification' => str_contains(strtoupper(trim((string) $srp->regulatory_classification)), 'PRIME')
                    ? 'Prime Commodities'
                    : 'Basic Necessities',
                'srp' => (float) $srp->baseline_price,
            ])
            ->sortBy([['category', 'asc'], ['commodity_name', 'asc']])
            ->values();

        return response()->json(['data' => [
            'period' => $filters['period'] ?? 'all_time',
            'date_range' => [
                'from' => isset($dates['from']) && $dates['from'] ? $dates['from']->toDateString() : null,
                'to' => isset($dates['to']) && $dates['to'] ? $dates['to']->toDateString() : null,
            ],
            'commodities' => $commodities,
            'weeks' => $weeksData,
            'generated_at' => now()->toIso8601String(),
        ]]);
    }

    public function establishments(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'routine_status' => ['nullable', Rule::in(['all', 'due', 'completed'])],
            'weekly_status' => ['nullable', Rule::in(['all', 'not_yet_monitored', 'monitored_this_week'])],
            'additional_task' => ['nullable', Rule::in(['all', 'verification_required'])],
            'observation' => ['nullable', Rule::in(['all', 'with_observations', 'reference_unavailable', 'no_observations'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $week = MonitoringWeek::current();
        $period = MonitoringPeriod::current();
        $query = Store::query()->where('is_active', true)
            ->withCount([
                'monitoringRecords as completed_records_count' => fn ($records) => $records->where('status', 'accepted'),
                'monitoringRecords as records_with_observations_count' => fn ($records) => $records->where('status', 'accepted')->whereHas('items', fn ($items) => $items->where('is_anomaly', true)),
                'verificationRequests as open_verification_requests_count' => fn ($requests) => $requests->whereIn('status', ['open', 'claimed']),
            ])
            ->withExists([
                'routineMonitoringRecords as has_prior_routine_monitoring',
                'routineMonitoringRecords as monitored_this_week' => fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at']),
                'routineMonitoringRecords as routine_completed' => fn ($records) => $this->routinePeriod($records, $period),
            ])
            ->with(['latestMonitoringRecord' => fn ($record) => $record
                ->select('monitoring_records.id', 'monitoring_records.store_id', 'monitoring_records.officer_user_id', 'monitoring_records.finalized_at', 'monitoring_records.protocol_mode', 'monitoring_records.protocol_reference')
                ->with('officer:id,name,email')
                ->withCount([
                    'items as anomaly_count' => fn ($items) => $items->where('is_anomaly', true),
                    'items as unavailable_reference_count' => fn ($items) => $items->where('reference_status', 'unavailable'),
                ]),
                'latestRoutineMonitoringRecord' => fn ($record) => $record->select('monitoring_records.id', 'monitoring_records.store_id', 'monitoring_records.finalized_at'),
                'activeVerificationRequest.claimant:id,name,email',
            ]);
        if ($search = trim($filters['search'] ?? '')) {
            $query->where(fn ($nested) => $nested->where('store_name', 'like', "%{$search}%")
                ->orWhere('address', 'like', "%{$search}%")
                ->orWhere('dti_sec_number', 'like', "%{$search}%"));
        }
        match ($filters['weekly_status'] ?? 'all') {
            'monitored_this_week' => $query->whereHas('routineMonitoringRecords', fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at'])),
            'not_yet_monitored' => $query->whereDoesntHave('routineMonitoringRecords', fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at'])),
            default => null,
        };
        match ($filters['routine_status'] ?? 'all') {
            'completed' => $query->whereHas('routineMonitoringRecords', fn ($records) => $this->routinePeriod($records, $period)),
            'due' => $query->whereDoesntHave('routineMonitoringRecords', fn ($records) => $this->routinePeriod($records, $period)),
            default => null,
        };
        if (($filters['additional_task'] ?? 'all') === 'verification_required') {
            $query->whereHas('verificationRequests', fn ($requests) => $requests->whereIn('status', ['open', 'claimed']));
        }
        match ($filters['observation'] ?? 'all') {
            'with_observations' => $query->whereHas('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true)),
            'reference_unavailable' => $query
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true))
                ->whereHas('latestMonitoringRecord.items', fn ($items) => $items->where('reference_status', 'unavailable')),
            'no_observations' => $query->whereHas('latestMonitoringRecord')
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true))
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('reference_status', 'unavailable')),
            default => null,
        };
        $establishments = $query->orderBy('store_name')->paginate($filters['per_page'] ?? 10);
        $establishments->setCollection($establishments->getCollection()->map(fn (Store $store) => $this->establishmentSummary($store)));

        return response()->json(['data' => [
            'monitoring_week' => [
                'timezone' => $week['timezone'],
                'starts_at' => $week['starts_at']->toIso8601String(),
                'ends_at' => $week['ends_at']->toIso8601String(),
            ],
            'monitoring_period' => $this->periodPayload($period),
            'routine_summary' => [
                'total_establishments' => Store::where('is_active', true)->count(),
                'due' => Store::where('is_active', true)->whereDoesntHave('routineMonitoringRecords', fn ($records) => $this->routinePeriod($records, $period))->count(),
                'completed' => Store::where('is_active', true)->whereHas('routineMonitoringRecords', fn ($records) => $this->routinePeriod($records, $period))->count(),
                'additional_visits' => FieldVerificationRequest::whereIn('status', ['open', 'claimed'])->count(),
            ],
            'weekly_summary' => [
                'total_establishments' => Store::count(),
                'not_yet_monitored' => Store::whereDoesntHave('routineMonitoringRecords', fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at']))->count(),
                'monitored_this_week' => Store::whereHas('routineMonitoringRecords', fn ($records) => MonitoringPeriod::constrainProtocol($records, 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at']))->count(),
                'verification_required' => Store::whereHas('verificationRequests', fn ($requests) => $requests->whereIn('status', ['open', 'claimed']))->count(),
            ],
            'establishments' => $establishments,
        ]]);
    }

    public function establishment(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $week = MonitoringWeek::current();
        $period = MonitoringPeriod::current();
        $dates = $this->parsePeriodDates($request);

        $periodRecordsQuery = fn ($records) => $this->applyPeriodConstraint($records->where('status', 'accepted'), $dates, 'finalized_at');
        $periodObservationsQuery = fn ($records) => $this->applyPeriodConstraint($records->where('status', 'accepted'), $dates, 'finalized_at')
            ->whereHas('items', fn ($items) => $items->where('is_anomaly', true));

        $store->loadCount([
            'monitoringRecords as completed_records_count' => fn ($records) => $records->where('status', 'accepted'),
            'monitoringRecords as records_with_observations_count' => fn ($records) => $records->where('status', 'accepted')->whereHas('items', fn ($items) => $items->where('is_anomaly', true)),
            'monitoringRecords as period_completed_records_count' => $periodRecordsQuery,
            'monitoringRecords as period_records_with_observations_count' => $periodObservationsQuery,
            'verificationRequests as open_verification_requests_count' => fn ($requests) => $requests->whereIn('status', ['open', 'claimed']),
        ])->load(['latestMonitoringRecord' => fn ($record) => $record
            ->with(['officer:id,name,email', 'store:id,store_name,address'])
            ->withCount([
                'items',
                'items as anomaly_count' => fn ($items) => $items->where('is_anomaly', true),
                'items as unavailable_reference_count' => fn ($items) => $items->where('reference_status', 'unavailable'),
            ]), 'latestRoutineMonitoringRecord.officer:id,name,email', 'activeVerificationRequest.claimant:id,name,email']);

        $commoditiesQuery = MonitoringRecordItem::query()
            ->whereHas('record', fn ($record) => $this->applyPeriodConstraint($record->where('store_id', $store->id)->where('status', 'accepted'), $dates, 'finalized_at'))
            ->with('bulletin:id,commodity_name,unit,commodity_key')
            ->join('monitoring_records', 'monitoring_records.id', '=', 'monitoring_record_items.monitoring_record_id')
            ->select('monitoring_record_items.*');

        $commodities = $commoditiesQuery->latest('monitoring_records.finalized_at')->get()
            ->map(fn (MonitoringRecordItem $item) => [
                'selector' => $item->bulletin?->commodity_key ? 'key:'.$item->bulletin->commodity_key : 'srp:'.$item->srp_id,
                'commodity_name' => $item->bulletin?->commodity_name ?? 'SRP #'.$item->srp_id,
                'unit' => $item->bulletin?->unit,
            ])->unique('selector')->values();

        return response()->json(['data' => [
            'store' => $store->only(['id', 'dti_sec_number', 'store_name', 'owner_name', 'address', 'latitude', 'longitude', 'is_active', 'is_verified', 'is_public']),
            'completed_records_count' => $store->completed_records_count,
            'records_with_observations_count' => $store->records_with_observations_count,
            'period_completed_records_count' => $store->period_completed_records_count ?? $store->completed_records_count,
            'period_records_with_observations_count' => $store->period_records_with_observations_count ?? $store->records_with_observations_count,
            'period_commodities_count' => $commodities->count(),
            'open_verification_requests_count' => $store->open_verification_requests_count,
            'latest_record' => $store->latestMonitoringRecord,
            'latest_routine_record' => $store->latestRoutineMonitoringRecord,
            'monitoring_week' => [
                'timezone' => $week['timezone'], 'starts_at' => $week['starts_at']->toIso8601String(), 'ends_at' => $week['ends_at']->toIso8601String(),
            ],
            'monitoring_period' => $this->periodPayload($period),
            'routine_status' => $this->routinePeriod($store->routineMonitoringRecords(), $period)->exists() ? 'completed' : 'due',
            'weekly_routine_status' => MonitoringPeriod::constrainProtocol($store->routineMonitoringRecords(), 'standard')->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at'])->exists()
                ? 'monitored_this_week' : 'not_yet_monitored',
            'has_prior_routine_monitoring' => $store->routineMonitoringRecords()->exists(),
            'latest_routine_monitoring_at' => $store->latestRoutineMonitoringRecord?->finalized_at,
            'verification_task_status' => $store->activeVerificationRequest?->status ?? 'none',
            'verification_claimant' => $store->activeVerificationRequest?->claimant,
            'monitored_commodities' => $commodities,
        ]]);
    }

    public function priceHistory(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'commodity' => ['nullable', 'string', 'regex:/^(key:[A-Za-z0-9._-]+|srp:[1-9][0-9]*)$/'],
            'period' => ['nullable', Rule::in(['this_week', 'last_4_weeks', 'this_month', 'last_month', 'all_time', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $history = MonitoringRecordItem::query()
            ->whereHas('record', fn ($record) => $record->where('store_id', $store->id)->where('status', 'accepted'))
            ->with(['record:id,store_id,finalized_at,protocol_mode,protocol_reference', 'bulletin:id,commodity_name,unit'])
            ->join('monitoring_records', 'monitoring_records.id', '=', 'monitoring_record_items.monitoring_record_id')
            ->select('monitoring_record_items.*');
        if ($commodity = $filters['commodity'] ?? null) {
            [$kind, $value] = explode(':', $commodity, 2);
            $kind === 'key'
                ? $history->whereHas('bulletin', fn ($bulletin) => $bulletin->where('commodity_key', $value))
                : $history->where('monitoring_record_items.srp_id', (int) $value);
        }
        $dates = $this->parsePeriodDates($request);
        $this->applyPeriodConstraint($history, $dates, 'monitoring_records.finalized_at');

        $history = $history->latest('monitoring_records.finalized_at')
            ->paginate($filters['per_page'] ?? 10);
        $history->setCollection($history->getCollection()->map(fn (MonitoringRecordItem $item) => [
            'id' => $item->id,
            'monitoring_record_id' => $item->monitoring_record_id,
            'monitoring_date' => $item->record->finalized_at,
            'protocol_mode' => $item->record->protocol_mode,
            'protocol_reference' => $item->record->protocol_reference,
            'commodity_name' => $item->bulletin?->commodity_name,
            'unit' => $item->bulletin?->unit,
            'reference_status' => $item->reference_status,
            'reference_type' => $item->reference_type,
            'reference_label' => $item->reference_label,
            'reference_value' => $item->reference_value,
            'reference_source_id' => $item->reference_source_id,
            'reference_source' => $item->reference_source,
            'reference_effective_date' => $item->reference_effective_date?->toDateString(),
            'reference_version' => $item->reference_version,
            'recorded_price' => $item->recorded_price,
            'difference' => $item->reference_value === null ? null : round($item->recorded_price - $item->reference_value, 2),
            'variance_percent' => $item->variance_percent,
            'is_anomaly' => $item->is_anomaly,
        ]));

        return response()->json(['data' => $history]);
    }

    public function verificationRequests(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(['all', 'open', 'claimed', 'completed', 'cancelled'])],
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $query = FieldVerificationRequest::query()->with([
            'store:id,store_name,address', 'report:id,report_reference,status',
            'claimant:id,name,email', 'monitoringRecord:id,field_verification_request_id',
        ]);
        if (($filters['status'] ?? 'all') !== 'all') {
            $query->where('status', $filters['status']);
        }
        if (isset($filters['store_id'])) {
            $query->where('store_id', $filters['store_id']);
        }
        if ($search = trim($filters['search'] ?? '')) {
            $query->where(fn ($nested) => $nested
                ->whereHas('store', fn ($store) => $store->where('store_name', 'like', "%{$search}%"))
                ->orWhereHas('report', fn ($report) => $report->where('report_reference', 'like', "%{$search}%")));
        }

        return response()->json(['data' => $query->latest('requested_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function show(Request $request, MonitoringRecord $monitoringRecord, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());

        return response()->json(['data' => $monitoringRecord->load([
            'officer:id,name,email', 'store', 'items.bulletin',
            'verificationRequest.report:id,report_reference,status',
        ])]);
    }

    public function signature(
        Request $request,
        MonitoringRecord $monitoringRecord,
        string $kind,
        AdminAuthorizationService $auth,
        AuditTrailService $audit,
    ) {
        $auth->requireManager($request->user());
        abort_unless(in_array($kind, ['officer', 'representative'], true), 404);
        $disk = $kind === 'officer' ? $monitoringRecord->officer_signature_disk : $monitoringRecord->representative_signature_disk;
        $path = $kind === 'officer' ? $monitoringRecord->officer_signature_path : $monitoringRecord->representative_signature_path;
        abort_unless(Storage::disk($disk)->exists($path), 404, 'Signature evidence is unavailable.');
        $audit->recordOrFail(
            $request,
            'monitoring_record.signature_viewed',
            $monitoringRecord,
            ['kind' => $kind],
            'Audit trail is unavailable. Private signature evidence cannot be accessed safely.'
        );

        return response(Storage::disk($disk)->get($path), 200, [
            'Content-Type' => 'image/png', 'Cache-Control' => 'private, no-store',
            'Content-Disposition' => 'inline; filename="signature.png"',
        ]);
    }

    private function establishmentSummary(Store $store): array
    {
        $latest = $store->latestMonitoringRecord;

        return [
            ...$store->only(['id', 'dti_sec_number', 'store_name', 'owner_name', 'address', 'is_active', 'is_verified', 'image_path']),
            'completed_records_count' => $store->completed_records_count,
            'records_with_observations_count' => $store->records_with_observations_count,
            'open_verification_requests_count' => $store->open_verification_requests_count,
            'routine_status' => $store->routine_completed ? 'completed' : 'due',
            'weekly_routine_status' => $store->monitored_this_week ? 'monitored_this_week' : 'not_yet_monitored',
            'has_prior_routine_monitoring' => (bool) $store->has_prior_routine_monitoring,
            'latest_routine_monitoring_at' => $store->latestRoutineMonitoringRecord?->finalized_at,
            'verification_task_status' => $store->activeVerificationRequest?->status ?? 'none',
            'verification_claimant' => $store->activeVerificationRequest?->claimant,
            'latest_monitoring_at' => $latest?->finalized_at,
            'latest_record_id' => $latest?->id,
            'latest_protocol_mode' => $latest?->protocol_mode,
            'latest_officer' => $latest?->officer,
            'latest_result' => $latest
                ? ($latest->anomaly_count ? 'with_observations' : ($latest->unavailable_reference_count ? 'reference_unavailable' : 'no_observations'))
                : 'never_monitored',
        ];
    }

    private function assignmentData(Request $request): array
    {
        return $request->validate([
            'reason' => ['required', 'string', 'max:2000'],
            'field_officer_id' => ['required', Rule::exists('users', 'id')->where(fn ($query) => $query->where('role', 'field_officer')->where('is_active', true))],
        ]);
    }

    private function routinePeriod($query, array $period)
    {
        MonitoringPeriod::constrainProtocol($query, $period['protocol_mode'])
            ->where('finalized_at', '>=', $period['starts_at'])->where('finalized_at', '<', $period['ends_at']);

        return $query;
    }

    public function findings(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'period' => ['nullable', Rule::in(['this_week', 'last_4_weeks', 'this_month', 'last_month', 'all_time', 'custom'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);

        $query = MonitoringRecordItem::query()
            ->whereHas('record', fn ($record) => $record->where('store_id', $store->id)->where('status', 'accepted'))
            ->where('is_anomaly', true)
            ->with([
                'record:id,store_id,officer_user_id,finalized_at,protocol_mode,protocol_reference',
                'record.officer:id,name,email',
                'bulletin:id,commodity_name,unit,commodity_key,baseline_price',
            ])
            ->join('monitoring_records', 'monitoring_records.id', '=', 'monitoring_record_items.monitoring_record_id')
            ->select('monitoring_record_items.*');

        $dates = $this->parsePeriodDates($request);
        $this->applyPeriodConstraint($query, $dates, 'monitoring_records.finalized_at');

        $findings = $query->latest('monitoring_records.finalized_at')->paginate($filters['per_page'] ?? 10);

        $findings->setCollection($findings->getCollection()->map(fn (MonitoringRecordItem $item) => [
            'id' => $item->id,
            'monitoring_record_id' => $item->monitoring_record_id,
            'finalized_at' => $item->record->finalized_at,
            'officer_name' => $item->record->officer?->name ?? 'Officer unavailable',
            'commodity_name' => $item->bulletin?->commodity_name ?? 'Commodity #'.$item->srp_id,
            'unit' => $item->bulletin?->unit,
            'recorded_price' => $item->recorded_price,
            'reference_value' => $item->reference_value,
            'difference' => $item->reference_value === null ? null : round($item->recorded_price - $item->reference_value, 2),
            'variance_percent' => $item->variance_percent,
            'is_anomaly' => (bool) $item->is_anomaly,
            'protocol_mode' => $item->record->protocol_mode,
            'reference_label' => $item->reference_label,
            'reference_source' => $item->reference_source,
        ]));

        return response()->json(['data' => $findings]);
    }

    private function parsePeriodDates(Request $request, string $defaultPreset = 'all_time'): ?array
    {
        $period = $request->query('period', $defaultPreset);
        $dateFrom = $request->query('date_from');
        $dateTo = $request->query('date_to');

        if ($period === 'custom' && ($dateFrom || $dateTo)) {
            $from = $dateFrom ? Carbon::parse($dateFrom)->startOfDay() : null;
            $to = $dateTo ? Carbon::parse($dateTo)->endOfDay() : null;

            return ['from' => $from, 'to' => $to];
        }

        $now = now();

        return match ($period) {
            'this_week' => [
                'from' => $now->copy()->startOfWeek(),
                'to' => $now->copy()->endOfWeek(),
            ],
            'last_4_weeks' => [
                'from' => $now->copy()->subWeeks(4)->startOfDay(),
                'to' => $now->copy()->endOfDay(),
            ],
            'this_month' => [
                'from' => $now->copy()->startOfMonth(),
                'to' => $now->copy()->endOfMonth(),
            ],
            'last_month' => [
                'from' => $now->copy()->subMonth()->startOfMonth(),
                'to' => $now->copy()->subMonth()->endOfMonth(),
            ],
            default => null,
        };
    }

    private function applyPeriodConstraint($query, ?array $dates, string $column = 'finalized_at')
    {
        if (! $dates) {
            return $query;
        }
        if ($dates['from']) {
            $query->where($column, '>=', $dates['from']);
        }
        if ($dates['to']) {
            $query->where($column, '<=', $dates['to']);
        }

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
