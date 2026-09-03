<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldOfflineLease;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\ReportStatusHistory;
use App\Services\Admin\AuditTrailService;
use App\Services\FieldReferenceResolver;
use App\Services\FieldNotificationService;
use Illuminate\Http\Request;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
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

    public function show(Request $request, MonitoringRecord $monitoringRecord)
    {
        $user = $this->fieldUser($request);
        abort_unless($monitoringRecord->officer_user_id === $user->id, 404);
        $monitoringRecord->load(['store:id,store_name,address,latitude,longitude', 'items.bulletin:id,commodity_name,unit']);

        return response()->json(['data' => [
            'id' => $monitoringRecord->id,
            'client_uuid' => $monitoringRecord->client_uuid,
            'status' => $monitoringRecord->status,
            'started_at' => $monitoringRecord->started_at,
            'finalized_at' => $monitoringRecord->finalized_at,
            'received_at' => $monitoringRecord->received_at,
            'sync_source' => $monitoringRecord->sync_source,
            'field_verification_request_id' => $monitoringRecord->field_verification_request_id,
            'store' => $monitoringRecord->store,
            'location' => [
                'latitude' => $monitoringRecord->latitude,
                'longitude' => $monitoringRecord->longitude,
                'accuracy_meters' => $monitoringRecord->location_accuracy_meters,
                'captured_at' => $monitoringRecord->location_captured_at,
            ],
            'representative' => ['name' => $monitoringRecord->representative_name, 'title' => $monitoringRecord->representative_title],
            'signatures' => [
                'officer_present' => (bool) $monitoringRecord->officer_signature_sha256,
                'representative_present' => (bool) $monitoringRecord->representative_signature_sha256,
            ],
            'items' => $monitoringRecord->items->map(fn ($item) => [
                'id' => $item->id, 'srp_id' => $item->srp_id,
                'commodity_name' => $item->bulletin?->commodity_name, 'unit' => $item->bulletin?->unit,
                'recorded_price' => $item->recorded_price, 'previous_price' => $item->previous_price,
                'variance_percent' => $item->variance_percent, 'is_anomaly' => $item->is_anomaly,
                'reference_status' => $item->reference_status, 'reference_type' => $item->reference_type,
                'reference_label' => $item->reference_label, 'reference_value' => $item->reference_value,
                'reference_source' => $item->reference_source,
                'reference_effective_date' => $item->reference_effective_date?->toDateString(),
            ])->values(),
        ]]);
    }

    public function sync(Request $request, AuditTrailService $audit, FieldReferenceResolver $references, FieldNotificationService $notifications)
    {
        $user = $this->fieldUser($request);
        $validator = Validator::make($request->all(), $this->rules());
        $validator->after(function ($validator) use ($request) {
            foreach ($request->input('records', []) as $recordIndex => $record) {
                $seen = [];
                foreach ($record['items'] ?? [] as $itemIndex => $item) {
                    $srpId = $item['srp_id'] ?? null;
                    if ($srpId !== null && isset($seen[$srpId])) {
                        $validator->errors()->add("records.{$recordIndex}.items.{$itemIndex}.srp_id", 'Each commodity may appear only once in a visit.');
                    }
                    $seen[$srpId] = true;
                }
            }
        });
        $data = $validator->validate();
        $results = [];
        foreach ($data['records'] as $index => $payload) {
            $existing = MonitoringRecord::where('client_uuid', $payload['client_uuid'])->first();
            if ($existing) {
                $duplicate = $this->duplicatePayload($payload);
                abort_unless($existing->officer_user_id === $user->id, 409, 'The client record identifier is already in use.');
                abort_unless($this->matchesDuplicatePayload($existing, $payload, $duplicate), 409, 'The client record identifier conflicts with different visit evidence.');
                $results[] = $this->result($existing, 'duplicate');
                continue;
            }
            $canonical = $this->canonicalPayload($payload, $index);
            try {
                $results[] = DB::transaction(fn () => $this->accept($request, $user, $payload, $canonical, $audit, $references, $notifications, $index));
            } catch (UniqueConstraintViolationException $exception) {
                $existing = MonitoringRecord::where('client_uuid', $payload['client_uuid'])->first();
                if (! $existing) throw $exception;
                $duplicate = $this->duplicatePayload($payload);
                abort_unless($existing->officer_user_id === $user->id, 409, 'The client record identifier is already in use.');
                abort_unless($this->matchesDuplicatePayload($existing, $payload, $duplicate), 409, 'The client record identifier conflicts with different visit evidence.');
                $results[] = $this->result($existing, 'duplicate');
            }
        }

        $onlyDuplicates = collect($results)->every(fn ($result) => $result['status'] === 'duplicate');
        return response()->json(['data' => ['results' => $results]], $onlyDuplicates ? 200 : 201);
    }

    private function accept(Request $request, $user, array $payload, array $canonical, AuditTrailService $audit, FieldReferenceResolver $references, FieldNotificationService $notifications, int $index): array
    {
        $userId = $user->id;
        $lease = FieldOfflineLease::whereKey($payload['offline_lease_id'])->where('user_id', $userId)->firstOrFail();
        abort_if($lease->revoked_at || $lease->expires_at->lt($payload['finalized_at']), 422, 'The offline authorization lease did not cover this finalized visit.');
        Store::query()->whereKey($payload['store_id'])->where('is_active', true)->firstOrFail();
        $verification = null;
        if (isset($payload['verification_request_id'])) {
            $verification = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($payload['verification_request_id']);
            if ($verification->status !== 'claimed' || $verification->claimed_by !== $userId || $verification->store_id !== $payload['store_id']) {
                throw ValidationException::withMessages([
                    "records.{$index}.verification_request_id" => ['The request must be claimed by this officer for the selected store.'],
                ]);
            }
        }

        $bulletins = SrpBulletin::query()->whereIn('id', collect($canonical['items'])->pluck('srp_id'))->get()->keyBy('id');
        [$officerBytes, $officerHash] = $canonical['officer_signature'];
        [$representativeBytes, $representativeHash] = $canonical['representative_signature'];
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');

        $officerPath = null;
        $representativePath = null;
        try {
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
            'field_verification_request_id' => $verification?->id,
        ]);

        $officerPath = "field-monitoring/{$record->id}/officer-{$officerHash}.png";
        $representativePath = "field-monitoring/{$record->id}/representative-{$representativeHash}.png";
        if (! Storage::disk($disk)->put($officerPath, $officerBytes, ['visibility' => 'private'])
            || ! Storage::disk($disk)->put($representativePath, $representativeBytes, ['visibility' => 'private'])) {
            throw new \RuntimeException('Unable to persist private visit signatures.');
        }
        $record->update(['officer_signature_path' => $officerPath, 'representative_signature_path' => $representativePath]);

        foreach ($canonical['items'] as $itemPayload) {
            $bulletin = $bulletins->get($itemPayload['srp_id']);
            $previous = TemporalInspection::query()->where('store_id', $record->store_id)
                ->where('srp_id', $bulletin->id)->where('validation_status', 'verified')
                ->where('inspection_timestamp', '<', $record->finalized_at)->latest('inspection_timestamp')->value('recorded_price');
            $baseline = (float) $bulletin->baseline_price;
            $recorded = (float) $itemPayload['recorded_price'];
            $reference = $references->resolve($bulletin, $record->finalized_at);
            $comparisonValue = $reference['value'];
            $variance = $comparisonValue > 0 ? (($recorded - $comparisonValue) / $comparisonValue) * 100 : null;
            $isAnomaly = $comparisonValue !== null && ($reference['type'] === 'emergency_ceiling'
                ? $recorded > $comparisonValue
                : $comparisonValue > 0 && $recorded > $comparisonValue * 1.10);
            $item = MonitoringRecordItem::create([
                'monitoring_record_id' => $record->id, 'srp_id' => $bulletin->id,
                'recorded_price' => $recorded, 'baseline_price' => $baseline,
                'previous_price' => $previous, 'variance_percent' => $variance,
                'is_anomaly' => $isAnomaly,
                'reference_status' => $reference['status'], 'reference_type' => $reference['type'],
                'reference_label' => $reference['label'], 'reference_value' => $reference['value'],
                'reference_source' => $reference['source'], 'reference_effective_date' => $reference['effective_date'],
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

        if ($verification) {
            $verification->update(['status' => 'completed', 'completed_at' => now()]);
            $report = $verification->report()->lockForUpdate()->firstOrFail();
            $previousStatus = $report->status;
            $report->update(['status' => 'Under regulatory review']);
            ReportStatusHistory::create([
                'consumer_report_id' => $report->id, 'previous_status' => $previousStatus,
                'new_status' => 'Under regulatory review',
                'public_message' => 'Field verification was completed. The report is under regulatory review.',
                'internal_notes' => 'Linked field monitoring record '.$record->id,
                'actor_type' => 'field_officer', 'actor_id' => $userId,
            ]);
            $audit->recordOrFail($request, 'field_verification.completed', $verification, ['monitoring_record_id' => $record->id]);
        }

        $record->load('items');
        $audit->recordOrFail($request, 'monitoring_record.accepted', $record, [
            'item_count' => $record->items->count(),
            'anomaly_count' => $record->items->where('is_anomaly', true)->count(),
            'sync_source' => $record->sync_source,
        ]);
        $notifications->send($user, 'monitoring_record_accepted', ['monitoring_record_id' => $record->id]);
        return $this->result($record, 'accepted');
        } catch (\Throwable $exception) {
            foreach (array_filter([$officerPath, $representativePath]) as $path) Storage::disk($disk)->delete($path);
            throw $exception;
        }
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

    private function canonicalPayload(array $payload, int $index): array
    {
        $submitted = SrpBulletin::query()->whereIn('id', collect($payload['items'])->pluck('srp_id'))
            ->where('is_active', true)->get()->keyBy('id');
        if ($submitted->count() !== count($payload['items'])) {
            throw ValidationException::withMessages([
                "records.{$index}.items" => ['Every commodity must belong to an active SRP bulletin. Refresh field data and try again.'],
            ]);
        }

        $finalizedDate = Carbon::parse($payload['finalized_at'])->setTimezone('Asia/Manila')->toDateString();
        $items = collect($payload['items'])->map(function ($item) use ($submitted, $finalizedDate, $index) {
            $source = $submitted->get($item['srp_id']);
            // ponytail: unkeyed rows are current-only identities; add lineage resolution when historical SRP keys exist.
            $effective = $source->commodity_key
                ? SrpBulletin::query()->where('commodity_key', $source->commodity_key)
                    ->where('is_active', true)->whereDate('effective_date', '<=', $finalizedDate)
                    ->latest('effective_date')->latest('id')->first()
                : ($source->effective_date?->toDateString() <= $finalizedDate ? $source : null);
            if (! $effective) {
                throw ValidationException::withMessages([
                    "records.{$index}.items" => ['Every commodity must have an effective SRP bulletin for the finalized visit. Refresh field data and try again.'],
                ]);
            }

            return ['srp_id' => $effective->id, 'recorded_price' => (float) $item['recorded_price']];
        })->sortBy('srp_id')->values()->all();

        if (collect($items)->pluck('srp_id')->unique()->count() !== count($items)) {
            throw ValidationException::withMessages([
                "records.{$index}.items" => ['Each commodity may appear only once in a visit.'],
            ]);
        }

        return [
            'items' => $items,
            'officer_signature' => $this->signature($payload['signatures']['officer_png_base64'], "records.{$index}.signatures.officer_png_base64"),
            'representative_signature' => $this->signature($payload['signatures']['representative_png_base64'], "records.{$index}.signatures.representative_png_base64"),
        ];
    }

    private function duplicatePayload(array $payload): array
    {
        $bulletins = SrpBulletin::query()->whereIn('id', collect($payload['items'])->pluck('srp_id'))->get()->keyBy('id');
        return [
            'items' => collect($payload['items'])->map(fn ($item) => [
                'commodity_key' => $bulletins->get($item['srp_id'])?->commodity_key ?? 'id:'.$item['srp_id'],
                'recorded_price' => (float) $item['recorded_price'],
            ])->sortBy('commodity_key')->values()->all(),
            'officer_signature' => $this->signature($payload['signatures']['officer_png_base64'], 'signatures.officer_png_base64'),
            'representative_signature' => $this->signature($payload['signatures']['representative_png_base64'], 'signatures.representative_png_base64'),
        ];
    }

    private function matchesDuplicatePayload(MonitoringRecord $record, array $payload, array $duplicate): bool
    {
        $record->loadMissing('items.bulletin');
        $items = $record->items->map(fn ($item) => [
            'commodity_key' => $item->bulletin?->commodity_key ?? 'id:'.$item->srp_id,
            'recorded_price' => (float) $item->recorded_price,
        ])->sortBy('commodity_key')->values()->all();

        return $record->store_id === (int) $payload['store_id']
            && $record->offline_lease_id === $payload['offline_lease_id']
            && $record->started_at->equalTo(Carbon::parse($payload['started_at']))
            && $record->finalized_at->equalTo(Carbon::parse($payload['finalized_at']))
            && (float) $record->latitude === (float) $payload['location']['latitude']
            && (float) $record->longitude === (float) $payload['location']['longitude']
            && (float) $record->location_accuracy_meters === (float) $payload['location']['accuracy_meters']
            && $record->location_captured_at->equalTo(Carbon::parse($payload['location']['captured_at']))
            && $record->representative_name === $payload['representative']['name']
            && ($record->representative_title ?? '') === ($payload['representative']['title'] ?? '')
            && $record->officer_signature_sha256 === $duplicate['officer_signature'][1]
            && $record->representative_signature_sha256 === $duplicate['representative_signature'][1]
            && $record->field_verification_request_id === ($payload['verification_request_id'] ?? null)
            && $items === $duplicate['items'];
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
            'records.*.client_uuid' => ['required', 'uuid', 'distinct'],
            'records.*.store_id' => ['required', 'integer', 'exists:stores,id'],
            'records.*.verification_request_id' => ['nullable', 'integer', 'exists:field_verification_requests,id'],
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
            'records.*.items.*.srp_id' => ['required', 'integer', 'exists:srp_bulletins,id'],
            'records.*.items.*.recorded_price' => ['required', 'numeric', 'min:0', 'max:99999999.99'],
        ];
    }
}
