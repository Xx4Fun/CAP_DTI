<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\MonitoringRecord;
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
            'per_page' => ['nullable', 'integer', Rule::in([10, 25, 50])],
        ]);
        $query = MonitoringRecord::query()
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
        return response()->json(['data' => $query->latest('finalized_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function show(Request $request, MonitoringRecord $monitoringRecord, AdminAuthorizationService $auth)
    {
        $auth->requireManager($request->user());
        return response()->json(['data' => $monitoringRecord->load(['officer:id,name,email', 'store', 'items.bulletin'])]);
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
        $audit->record($request, 'monitoring_record.signature_viewed', $monitoringRecord, ['kind' => $kind]);
        return response(Storage::disk($disk)->get($path), 200, [
            'Content-Type' => 'image/png', 'Cache-Control' => 'private, no-store',
            'Content-Disposition' => 'inline; filename="signature.png"',
        ]);
    }
}
