<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MonitoringRecord;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use App\Services\Admin\SrpCatalogService;
use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Http\Request;

/** One Manila monitoring week of map data: each store's visits, the prices captured on them, and coverage inputs. */
class GisMonitoringController extends Controller
{
    public function show(Request $request, AdminAuthorizationService $auth, SrpCatalogService $catalog, AuditTrailService $audit)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'week' => ['nullable', 'date_format:Y-m-d'],
            'locations' => ['nullable', 'boolean'],
        ]);
        $withLocations = $request->boolean('locations');

        // A week is identified by its Manila Monday; the UTC instants only bound the query.
        $keyOf = fn (CarbonInterface $at) => MonitoringWeek::for($at)['starts_at']->setTimezone(MonitoringWeek::TIMEZONE)->toDateString();
        $week = MonitoringWeek::for(isset($filters['week'])
            ? CarbonImmutable::parse($filters['week'], MonitoringWeek::TIMEZONE)
            : now(MonitoringWeek::TIMEZONE));
        $key = $keyOf($week['starts_at']);
        $currentKey = $keyOf(now());

        // finalized_at then id is the single definition of "latest": the last visit in this order supplies a commodity's price.
        $records = MonitoringRecord::query()->where('status', 'accepted')
            ->where('finalized_at', '>=', $week['starts_at'])->where('finalized_at', '<', $week['ends_at'])
            ->with(['officer:id,name', 'items.bulletin:id,commodity_name,unit,commodity_key'])
            ->orderBy('finalized_at')->orderBy('id')->get();

        if ($withLocations) {
            // Location evidence is audited; without the trail the coordinates are not released.
            $audit->recordOrFail(
                $request,
                'gis.visit_locations_viewed',
                'gis_monitoring',
                ['week' => $key, 'record_ids' => $records->pluck('id')->all()],
                'Audit trail is unavailable. Visit location evidence cannot be accessed safely.'
            );
        }

        $byStore = $records->groupBy('store_id');
        $stores = Store::query()->orderBy('store_name')
            ->withExists([
                'routineMonitoringRecords as has_prior_routine_visit' => fn ($visits) => $visits->where('finalized_at', '<', $week['starts_at']),
                'verificationRequests as verification_required' => fn ($requests) => $requests->whereIn('status', ['open', 'claimed']),
            ])->get()
            ->map(function (Store $store) use ($byStore, $catalog, $withLocations) {
                $prices = [];
                $visits = [];
                foreach ($byStore->get($store->id, []) as $record) {
                    $visits[] = [
                        'id' => $record->id,
                        'finalized_at' => $record->finalized_at->toIso8601String(),
                        'officer_name' => $record->officer?->name,
                        'is_routine' => $record->field_verification_request_id === null,
                        'protocol_mode' => $record->protocol_mode,
                    ] + ($withLocations ? [
                        'latitude' => $record->latitude,
                        'longitude' => $record->longitude,
                        'accuracy_meters' => $record->location_accuracy_meters,
                    ] : []);
                    foreach ($record->items as $item) {
                        // Lineage and unit, as the monitoring matrix groups them: prices in different units never share a row.
                        $commodity = ($item->bulletin ? $catalog->lineageKey($item->bulletin) : 'srp-'.$item->srp_id)
                            .'|'.strtolower(trim((string) $item->bulletin?->unit));
                        // The reference is the one captured on the visit item, never re-resolved.
                        $prices[$commodity] = [
                            'commodity' => $commodity,
                            'commodity_name' => $item->bulletin?->commodity_name ?? 'SRP #'.$item->srp_id,
                            'unit' => $item->bulletin?->unit,
                            'monitoring_record_id' => $record->id,
                            'recorded_price' => $item->recorded_price,
                            'reference_value' => $item->reference_value,
                            'reference_type' => $item->reference_type,
                            'reference_status' => $item->reference_status,
                            'variance_percent' => $item->variance_percent,
                            'is_anomaly' => $item->is_anomaly,
                        ];
                    }
                }

                return [...$store->toArray(), 'visits' => $visits, 'prices' => array_values($prices)];
            });

        // ponytail: reads every accepted visit's timestamp so SQLite and Postgres agree; group in SQL once visits reach tens of thousands.
        $weeks = MonitoringRecord::query()->where('status', 'accepted')->pluck('finalized_at')
            ->map($keyOf)->push($currentKey, $key)->unique()->sort()->values();

        return response()->json(['data' => [
            'week' => [
                'key' => $key,
                'ends_on' => CarbonImmutable::parse($key, MonitoringWeek::TIMEZONE)->addDays(6)->toDateString(),
                'starts_at' => $week['starts_at']->toIso8601String(),
                'ends_at' => $week['ends_at']->toIso8601String(),
                'timezone' => $week['timezone'],
                'is_current' => $key === $currentKey,
            ],
            'locations' => $withLocations,
            'weeks' => $weeks,
            'stores' => $stores,
        ]])->withHeaders($withLocations ? ['Cache-Control' => 'private, no-store'] : []);
    }
}
