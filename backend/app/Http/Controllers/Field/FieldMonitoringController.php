<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldOfflineLease;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class FieldMonitoringController extends Controller
{
    public function index(Request $request)
    {
        $user = $this->fieldUser($request);
        $filters = $request->validate(['per_page' => ['nullable', 'integer', 'in:10,25,50']]);
        return response()->json(['data' => MonitoringRecord::query()
            ->where('officer_user_id', $user->id)
            ->with(['store:id,store_name,address', 'items.bulletin:id,commodity_name,unit'])
            ->withCount(['items', 'items as anomaly_count' => fn ($query) => $query->where('is_anomaly', true)])
            ->latest('finalized_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function sync(Request $request, AuditTrailService $audit)
    {
        $user = $this->fieldUser($request);
        $data = $request->validate($this->rules());
        $results = [];
        foreach ($data['records'] as $index => $payload) {
            $existing = MonitoringRecord::where('client_uuid', $payload['client_uuid'])->first();
            if ($existing) {
                abort_unless($existing->officer_user_id === $user->id, 409, 'The client record identifier is already in use.');
                $results[] = $this->result($existing, 'duplicate');
                continue;
            }
            $results[] = DB::transaction(fn () => $this->accept($request, $user->id, $payload, $audit, $index));
        }

        $onlyDuplicates = collect($results)->every(fn ($result) => $result['status'] === 'duplicate');
        return response()->json(['data' => ['results' => $results]], $onlyDuplicates ? 200 : 201);
    }

    private function accept(Request $request, int $userId, array $payload, AuditTrailService $audit, int $index): array
    {
        $lease = FieldOfflineLease::whereKey($payload['offline_lease_id'])->where('user_id', $userId)->firstOrFail();
        abort_if($lease->revoked_at || $lease->expires_at->lt($payload['finalized_at']), 422, 'The offline authorization lease did not cover this finalized visit.');
        Store::query()->whereKey($payload['store_id'])->where('is_active', true)->firstOrFail();

        $bulletins = SrpBulletin::query()
            ->whereIn('id', collect($payload['items'])->pluck('srp_id'))
            ->where('is_active', true)
            ->get()
            ->keyBy('id');
        if ($bulletins->count() !== count($payload['items'])) {
            throw ValidationException::withMessages([
                "records.{$index}.items" => ['Every commodity must belong to the current active SRP bulletin. Refresh field data and try again.'],
            ]);
        }

        [$officerBytes, $officerHash] = $this->signature($payload['signatures']['officer_png_base64'], "records.{$index}.signatures.officer_png_base64");
        [$representativeBytes, $representativeHash] = $this->signature($payload['signatures']['representative_png_base64'], "records.{$index}.signatures.representative_png_base64");
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');

        $record = MonitoringRecord::create([
            'client_uuid' => $payload['client_uuid'], 'officer_user_id' => $userId,
            'store_id' => $payload['store_id'], 'offline_lease_id' => $lease->id,
            'status' => 'accepted', 'started_at' => $payload['started_at'],
            'finalized_at' => $payload['finalized_at'], 'received_at' => now(),
            'latitude' => $payload['location']['latitude'], 'longitude' => $payload['location']['longitude'],
            'location_accuracy_meters' => $payload['location']['accuracy_meters'],
            'location_captured_at' => $payload['location']['captured_at'],
            'representative_name' => $payload['representative']['name'],
            'representative_title' => $payload['representative']['title'] ?? null,
            'officer_signature_disk' => $disk, 'officer_signature_path' => '',
            'officer_signature_sha256' => $officerHash,
            'representative_signature_disk' => $disk, 'representative_signature_path' => '',
            'representative_signature_sha256' => $representativeHash,
            'sync_source' => $payload['sync_source'] ?? 'online',
            'client_version' => $payload['client_version'] ?? null,
        ]);

        $officerPath = "field-monitoring/{$record->id}/officer-{$officerHash}.png";
        $representativePath = "field-monitoring/{$record->id}/representative-{$representativeHash}.png";
        Storage::disk($disk)->put($officerPath, $officerBytes, ['visibility' => 'private']);
        Storage::disk($disk)->put($representativePath, $representativeBytes, ['visibility' => 'private']);
        $record->update(['officer_signature_path' => $officerPath, 'representative_signature_path' => $representativePath]);

        foreach ($payload['items'] as $itemPayload) {
            $bulletin = $bulletins->get($itemPayload['srp_id']);
            $previous = TemporalInspection::query()->where('store_id', $record->store_id)
                ->where('srp_id', $bulletin->id)->where('validation_status', 'verified')
                ->where('inspection_timestamp', '<', $record->finalized_at)->latest('inspection_timestamp')->value('recorded_price');
            $baseline = (float) $bulletin->baseline_price;
            $recorded = (float) $itemPayload['recorded_price'];
            $variance = $baseline > 0 ? (($recorded - $baseline) / $baseline) * 100 : null;
            $item = MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id,
                'recorded_price' => $recorded, 'baseline_price' => $baseline,
                'previous_price' => $previous, 'variance_percent' => $variance,
                'is_anomaly' => $baseline > 0 && $recorded > $baseline * 1.10,
            ]);
            TemporalInspection::create([
                'store_id' => $record->store_id, 'srp_id' => $bulletin->id,
                'recorded_price' => $recorded, 'is_flagged' => $item->is_anomaly,
                'inspection_timestamp' => $record->finalized_at, 'sync_timestamp' => now(),
                'officer_signature' => $officerPath, 'vendor_signature' => $representativePath,
                'validation_status' => 'verified', 'validated_at' => now(),
                'monitoring_record_id' => $record->id, 'monitoring_record_item_id' => $item->id,
                'officer_user_id' => $userId,
            ]);
        }

        $record->load('items');
        $audit->record($request, 'monitoring_record.accepted', $record, [
            'item_count' => $record->items->count(),
            'anomaly_count' => $record->items->where('is_anomaly', true)->count(),
            'sync_source' => $record->sync_source,
        ]);
        return $this->result($record, 'accepted');
    }

    private function result(MonitoringRecord $record, string $status): array
    {
        $record->loadMissing('items');
        return [
            'client_uuid' => $record->client_uuid, 'record_id' => $record->id, 'status' => $status,
            'item_count' => $record->items->count(),
            'anomaly_count' => $record->items->where('is_anomaly', true)->count(),
            'accepted_at' => $record->received_at?->toIso8601String(),
        ];
    }

    private function signature(string $encoded, string $field): array
    {
        $encoded = Str::after($encoded, 'base64,');
        $bytes = base64_decode($encoded, true);
        if ($bytes === false || strlen($bytes) < 8 || strlen($bytes) > 1_500_000 || ! str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
            throw ValidationException::withMessages([$field => ['Provide a valid PNG signature up to 1.5 MB.']]);
        }
        return [$bytes, hash('sha256', $bytes)];
    }

    private function fieldUser(Request $request)
    {
        $user = $request->user();
        abort_unless($user?->role === 'field_officer' && $user->is_active && $user->currentAccessToken()?->can('field-monitoring'), 403, 'Forbidden');
        return $user;
    }

    private function rules(): array
    {
        return [
            'records' => ['required', 'array', 'min:1', 'max:25'],
            'records.*.client_uuid' => ['required', 'uuid'],
            'records.*.store_id' => ['required', 'integer', 'exists:stores,id'],
            'records.*.offline_lease_id' => ['required', 'uuid', 'exists:field_offline_leases,id'],
            'records.*.started_at' => ['required', 'date'], 'records.*.finalized_at' => ['required', 'date'],
            'records.*.location.latitude' => ['required', 'numeric', 'between:-90,90'],
            'records.*.location.longitude' => ['required', 'numeric', 'between:-180,180'],
            'records.*.location.accuracy_meters' => ['required', 'numeric', 'min:0', 'max:100'],
            'records.*.location.captured_at' => ['required', 'date'],
            'records.*.representative.name' => ['required', 'string', 'max:255'],
            'records.*.representative.title' => ['nullable', 'string', 'max:255'],
            'records.*.signatures.officer_png_base64' => ['required', 'string', 'max:2100000'],
            'records.*.signatures.representative_png_base64' => ['required', 'string', 'max:2100000'],
            'records.*.sync_source' => ['nullable', 'in:online,offline_queue'],
            'records.*.client_version' => ['nullable', 'string', 'max:50'],
            'records.*.items' => ['required', 'array', 'min:1', 'max:100'],
            'records.*.items.*.srp_id' => ['required', 'integer', 'distinct', 'exists:srp_bulletins,id'],
            'records.*.items.*.recorded_price' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
        ];
    }
}
