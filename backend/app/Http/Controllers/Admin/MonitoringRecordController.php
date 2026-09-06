<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\FieldVerificationRequest;
use App\Models\Store;
use App\Services\Admin\AdminAuthorizationService;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class MonitoringRecordController extends Controller
{
    public function index(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'anomaly' => ['nullable', Rule::in(['all', 'yes', 'no'])],
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
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
        if (isset($filters['store_id'])) $query->where('store_id', $filters['store_id']);
        return response()->json(['data' => $query->latest('finalized_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function establishments(Request $request, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(['all', 'with_observations', 'reference_unavailable', 'no_observations', 'awaiting_verification', 'recently_monitored', 'never_monitored'])],
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $query = Store::query()
            ->withCount([
                'monitoringRecords as completed_records_count' => fn ($records) => $records->where('status', 'accepted'),
                'monitoringRecords as records_with_observations_count' => fn ($records) => $records->where('status', 'accepted')->whereHas('items', fn ($items) => $items->where('is_anomaly', true)),
                'verificationRequests as open_verification_requests_count' => fn ($requests) => $requests->whereIn('status', ['open', 'claimed']),
            ])
            ->with(['latestMonitoringRecord' => fn ($record) => $record
                ->select('monitoring_records.id', 'monitoring_records.store_id', 'monitoring_records.officer_user_id', 'monitoring_records.finalized_at', 'monitoring_records.protocol_mode', 'monitoring_records.protocol_reference')
                ->with('officer:id,name,email')
                ->withCount([
                    'items as anomaly_count' => fn ($items) => $items->where('is_anomaly', true),
                    'items as unavailable_reference_count' => fn ($items) => $items->where('reference_status', 'unavailable'),
                ])]);
        if ($search = trim($filters['search'] ?? '')) {
            $query->where(fn ($nested) => $nested->where('store_name', 'like', "%{$search}%")
                ->orWhere('address', 'like', "%{$search}%")
                ->orWhere('dti_sec_number', 'like', "%{$search}%"));
        }
        match ($filters['status'] ?? 'all') {
            'with_observations' => $query->whereHas('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true)),
            'reference_unavailable' => $query
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true))
                ->whereHas('latestMonitoringRecord.items', fn ($items) => $items->where('reference_status', 'unavailable')),
            'no_observations' => $query->whereHas('latestMonitoringRecord')
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('is_anomaly', true))
                ->whereDoesntHave('latestMonitoringRecord.items', fn ($items) => $items->where('reference_status', 'unavailable')),
            'awaiting_verification' => $query->whereHas('verificationRequests', fn ($requests) => $requests->whereIn('status', ['open', 'claimed'])),
            'recently_monitored' => $query->whereHas('latestMonitoringRecord', fn ($record) => $record->where('finalized_at', '>=', now()->subDays(30))),
            'never_monitored' => $query->whereDoesntHave('monitoringRecords', fn ($records) => $records->where('status', 'accepted')),
            default => null,
        };
        $establishments = $query->orderBy('store_name')->paginate($filters['per_page'] ?? 10);
        $establishments->setCollection($establishments->getCollection()->map(fn (Store $store) => $this->establishmentSummary($store)));

        return response()->json(['data' => [
            'summary' => [
                'monitored_establishments' => MonitoringRecord::where('status', 'accepted')->distinct('store_id')->count('store_id'),
                'recent_activity' => MonitoringRecord::where('status', 'accepted')->where('finalized_at', '>=', now()->subDays(30))->count(),
                'records_with_observations' => MonitoringRecord::where('status', 'accepted')->whereHas('items', fn ($items) => $items->where('is_anomaly', true))->count(),
                'open_verification_requests' => FieldVerificationRequest::whereIn('status', ['open', 'claimed'])->count(),
                'latest_completed_at' => MonitoringRecord::where('status', 'accepted')->max('finalized_at'),
            ],
            'establishments' => $establishments,
        ]]);
    }

    public function establishment(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $store->loadCount([
            'monitoringRecords as completed_records_count' => fn ($records) => $records->where('status', 'accepted'),
            'monitoringRecords as records_with_observations_count' => fn ($records) => $records->where('status', 'accepted')->whereHas('items', fn ($items) => $items->where('is_anomaly', true)),
            'verificationRequests as open_verification_requests_count' => fn ($requests) => $requests->whereIn('status', ['open', 'claimed']),
        ])->load(['latestMonitoringRecord' => fn ($record) => $record
            ->with(['officer:id,name,email', 'store:id,store_name,address'])
            ->withCount([
                'items',
                'items as anomaly_count' => fn ($items) => $items->where('is_anomaly', true),
                'items as unavailable_reference_count' => fn ($items) => $items->where('reference_status', 'unavailable'),
            ])]);

        $commodities = MonitoringRecordItem::query()
            ->whereHas('record', fn ($record) => $record->where('store_id', $store->id)->where('status', 'accepted'))
            ->with('bulletin:id,commodity_name,unit,commodity_key')
            ->join('monitoring_records', 'monitoring_records.id', '=', 'monitoring_record_items.monitoring_record_id')
            ->select('monitoring_record_items.*')->latest('monitoring_records.finalized_at')->get()
            ->map(fn (MonitoringRecordItem $item) => [
                'selector' => $item->bulletin?->commodity_key ? 'key:'.$item->bulletin->commodity_key : 'srp:'.$item->srp_id,
                'commodity_name' => $item->bulletin?->commodity_name ?? 'SRP #'.$item->srp_id,
                'unit' => $item->bulletin?->unit,
            ])->unique('selector')->values();

        return response()->json(['data' => [
            'store' => $store->only(['id', 'dti_sec_number', 'store_name', 'owner_name', 'address', 'latitude', 'longitude', 'is_active', 'is_verified', 'is_public']),
            'completed_records_count' => $store->completed_records_count,
            'records_with_observations_count' => $store->records_with_observations_count,
            'open_verification_requests_count' => $store->open_verification_requests_count,
            'latest_record' => $store->latestMonitoringRecord,
            'monitored_commodities' => $commodities,
        ]]);
    }

    public function priceHistory(Request $request, Store $store, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        $filters = $request->validate([
            'commodity' => ['nullable', 'string', 'regex:/^(key:[A-Za-z0-9._-]+|srp:[1-9][0-9]*)$/'],
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
            'reference_source' => $item->reference_source,
            'reference_effective_date' => $item->reference_effective_date?->toDateString(),
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
        if (($filters['status'] ?? 'all') !== 'all') $query->where('status', $filters['status']);
        if (isset($filters['store_id'])) $query->where('store_id', $filters['store_id']);
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
            ...$store->only(['id', 'dti_sec_number', 'store_name', 'owner_name', 'address', 'is_active', 'is_verified']),
            'completed_records_count' => $store->completed_records_count,
            'records_with_observations_count' => $store->records_with_observations_count,
            'open_verification_requests_count' => $store->open_verification_requests_count,
            'latest_monitoring_at' => $latest?->finalized_at,
            'latest_record_id' => $latest?->id,
            'latest_protocol_mode' => $latest?->protocol_mode,
            'latest_officer' => $latest?->officer,
            'latest_result' => $latest
                ? ($latest->anomaly_count ? 'with_observations' : ($latest->unavailable_reference_count ? 'reference_unavailable' : 'no_observations'))
                : 'never_monitored',
        ];
    }
}
