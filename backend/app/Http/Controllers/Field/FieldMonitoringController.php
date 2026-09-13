<?php

namespace App\Http\Controllers\Field;

use App\Http\Controllers\Controller;
use App\Models\FieldOfflineLease;
use App\Models\FieldVerificationRequest;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Services\Admin\AuditTrailService;
use App\Services\FieldNotificationService;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
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
            ->where('status', 'accepted')
            ->with(['store:id,store_name,address', 'items.bulletin:id,commodity_name,unit'])
            ->withCount(['items', 'items as anomaly_count' => fn ($query) => $query->where('is_anomaly', true)])
            ->latest('finalized_at')->paginate($filters['per_page'] ?? 10)]);
    }

    public function show(Request $request, MonitoringRecord $monitoringRecord)
    {
        $user = $this->fieldUser($request);
        abort_unless($monitoringRecord->officer_user_id === $user->id && $monitoringRecord->status === 'accepted', 404);
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
                'reference_source_id' => $item->reference_source_id,
                'reference_version' => $item->reference_version,
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
                if (! $existing) {
                    throw $exception;
                }
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
        Store::query()->whereKey($payload['store_id'])->where('is_active', true)->lockForUpdate()->firstOrFail();
        $verification = null;
        if (isset($payload['verification_request_id'])) {
            $verification = FieldVerificationRequest::query()->lockForUpdate()->findOrFail($payload['verification_request_id']);
            if ($verification->status !== 'claimed' || $verification->claimed_by !== $userId || $verification->store_id !== $payload['store_id']) {
                throw ValidationException::withMessages([
                    "records.{$index}.verification_request_id" => ['The request must be claimed by this officer for the selected store.'],
                ]);
            }
        }
        if (! $verification) {
            $period = MonitoringPeriod::for(Carbon::parse($payload['finalized_at']));
            $existingRoutine = MonitoringRecord::query()
                ->where('store_id', $payload['store_id'])->where('status', 'accepted')
                ->whereNull('field_verification_request_id')
                ->where('finalized_at', '>=', $period['starts_at'])->where('finalized_at', '<', $period['ends_at']);
            MonitoringPeriod::constrainProtocol($existingRoutine, $period['protocol_mode']);
            if ($existingRoutine->exists()) {
                throw ValidationException::withMessages([
                    "records.{$index}.store_id" => ['This establishment already has an accepted routine visit for the current monitoring period.'],
                ]);
            }
        }

        $bulletins = SrpBulletin::query()->whereIn('id', collect($canonical['items'])->pluck('srp_id'))->get()->keyBy('id');
        $canonical['items'] = collect($canonical['items'])->map(function (array $item) use ($bulletins, $payload, $references, $lease) {
            $authoritative = $references->resolve($bulletins->get($item['srp_id']), $payload['finalized_at']);
            $authoritative['reference_version'] = $references->version($authoritative);
            if ($lease->requires_reference_snapshot && ! $item['reference_snapshot']) {
                throw new HttpResponseException(response()->json([
                    'status' => 'REFERENCE_SNAPSHOT_REQUIRED',
                    'message' => 'This visit is missing its issued monitoring reference. Refresh and review the visit before syncing.',
                ], 422));
            }
            $item['reference'] = $this->validatedReference($item['reference_snapshot'] ?? null, $authoritative);

            return $item;
        })->all();
        [$officerBytes, $officerHash] = $canonical['officer_signature'];
        [$representativeBytes, $representativeHash] = $canonical['representative_signature'];
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');

        $officerPath = null;
        $representativePath = null;
        try {
            $protocol = $references->protocolAt($payload['finalized_at']);
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
                'protocol_mode' => $protocol['mode'],
                'protocol_reference' => $protocol['reference'],
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
                $reference = $itemPayload['reference'];
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
                    'reference_source_id' => $reference['source_id'] ?? null,
                    'reference_version' => $reference['reference_version'] ?? null,
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
                if ($report = $verification->report()->lockForUpdate()->first()) {
                    $previousStatus = $report->status;
                    $report->update(['status' => 'Under regulatory review']);
                    ReportStatusHistory::create([
                        'consumer_report_id' => $report->id, 'previous_status' => $previousStatus,
                        'new_status' => 'Under regulatory review',
                        'public_message' => 'Field verification was completed. The report is under regulatory review.',
                        'internal_notes' => 'Linked field monitoring record '.$record->id,
                        'actor_type' => 'field_officer', 'actor_id' => $userId,
                    ]);
                }
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
            foreach (array_filter([$officerPath, $representativePath]) as $path) {
                Storage::disk($disk)->delete($path);
            }
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
            ->get()->keyBy('id');
        if ($submitted->count() !== count($payload['items'])) {
            throw ValidationException::withMessages([
                "records.{$index}.items" => ['Every commodity must belong to a known SRP bulletin. Refresh field data and try again.'],
            ]);
        }

        $finalizedDate = Carbon::parse($payload['finalized_at'])->setTimezone('Asia/Manila')->toDateString();
        $items = collect($payload['items'])->map(function ($item) use ($submitted, $finalizedDate, $index) {
            $source = $submitted->get($item['srp_id']);
            $hasSuccessor = $source->commodity_key && SrpBulletin::query()
                ->where('commodity_key', $source->commodity_key)
                ->where(fn ($query) => $query
                    ->whereDate('effective_date', '>', $source->effective_date)
                    ->orWhere(fn ($sameDate) => $sameDate
                        ->whereDate('effective_date', $source->effective_date)
                        ->where('id', '>', $source->id)))
                ->exists();
            // ponytail: unkeyed rows are current-only identities; add lineage resolution when historical SRP keys exist.
            $effective = $source->commodity_key && ($source->is_active || $hasSuccessor)
                ? SrpBulletin::query()->where('commodity_key', $source->commodity_key)
                    ->whereDate('effective_date', '<=', $finalizedDate)
                    ->latest('effective_date')->latest('id')->first()
                : ($source->is_active && $source->effective_date?->toDateString() <= $finalizedDate ? $source : null);
            if (! $effective) {
                throw ValidationException::withMessages([
                    "records.{$index}.items" => ['Every commodity must have an effective SRP bulletin for the finalized visit. Refresh field data and try again.'],
                ]);
            }

            return [
                'srp_id' => $effective->id,
                'recorded_price' => (float) $item['recorded_price'],
                'reference_snapshot' => $item['reference_snapshot'] ?? null,
            ];
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
                'recorded_price' => round((float) $item['recorded_price'], 2),
                'reference' => $this->submittedReferenceEvidence($item['reference_snapshot'] ?? null),
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
            'recorded_price' => round((float) $item->recorded_price, 2),
            'reference' => $this->storedReferenceEvidence($item),
        ])->sortBy('commodity_key')->values()->all();
        // A resend after a lost response must match what the columns kept: whole seconds, decimal(10,7) coordinates, decimal(8,2) accuracy.
        $sameSecond = fn ($stored, $submitted) => $stored->copy()->startOfSecond()->equalTo(Carbon::parse($submitted)->startOfSecond());

        return $record->store_id === (int) $payload['store_id']
            && $record->offline_lease_id === $payload['offline_lease_id']
            && $sameSecond($record->started_at, $payload['started_at'])
            && $sameSecond($record->finalized_at, $payload['finalized_at'])
            && round((float) $record->latitude, 7) === round((float) $payload['location']['latitude'], 7)
            && round((float) $record->longitude, 7) === round((float) $payload['location']['longitude'], 7)
            && round((float) $record->location_accuracy_meters, 2) === round((float) $payload['location']['accuracy_meters'], 2)
            && $sameSecond($record->location_captured_at, $payload['location']['captured_at'])
            && $record->representative_name === $payload['representative']['name']
            && ($record->representative_title ?? '') === ($payload['representative']['title'] ?? '')
            && $record->officer_signature_sha256 === $duplicate['officer_signature'][1]
            && $record->representative_signature_sha256 === $duplicate['representative_signature'][1]
            && $record->field_verification_request_id === ($payload['verification_request_id'] ?? null)
            && $items === $duplicate['items'];
    }

    // A resend is only "the same visit" if its pinned regulatory evidence matches what was accepted, compared at column precision.
    private function submittedReferenceEvidence(?array $snapshot): ?array
    {
        if (! $snapshot) {
            return null;
        }

        return [
            'status' => $snapshot['status'] ?? null, 'type' => $snapshot['type'] ?? null,
            'source_id' => isset($snapshot['source_id']) ? (int) $snapshot['source_id'] : null,
            'value' => isset($snapshot['value']) ? round((float) $snapshot['value'], 2) : null,
            'label' => $snapshot['label'] ?? null, 'source' => $snapshot['source_reference'] ?? null,
            'effective_date' => isset($snapshot['effective_date']) ? Carbon::parse($snapshot['effective_date'])->toDateString() : null,
            'version' => $snapshot['reference_version'] ?? null,
        ];
    }

    private function storedReferenceEvidence(MonitoringRecordItem $item): ?array
    {
        // Items accepted without a snapshot store a null version; they only match a resend that also has no snapshot.
        if ($item->reference_version === null) {
            return null;
        }

        return [
            'status' => $item->reference_status, 'type' => $item->reference_type,
            'source_id' => $item->reference_source_id !== null ? (int) $item->reference_source_id : null,
            'value' => $item->reference_value !== null ? round((float) $item->reference_value, 2) : null,
            'label' => $item->reference_label, 'source' => $item->reference_source,
            'effective_date' => $item->reference_effective_date?->toDateString(),
            'version' => $item->reference_version,
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

    private function validatedReference(?array $snapshot, array $authoritative): array
    {
        if (! $snapshot) {
            return [...$authoritative, 'reference_version' => null];
        }

        $sameValue = $snapshot['value'] === null && $authoritative['value'] === null
            || $snapshot['value'] !== null && $authoritative['value'] !== null
                && abs((float) $snapshot['value'] - (float) $authoritative['value']) < 0.005;
        $matches = $snapshot['status'] === $authoritative['status']
            && $snapshot['type'] === $authoritative['type']
            && ($snapshot['source_id'] ?? null) === ($authoritative['source_id'] ?? null)
            && $sameValue
            && ($snapshot['label'] ?? null) === ($authoritative['label'] ?? null)
            && ($snapshot['source_reference'] ?? null) === ($authoritative['source'] ?? null)
            && ($snapshot['effective_date'] ?? null) === ($authoritative['effective_date'] ?? null)
            && ($snapshot['reference_version'] ?? null) === $authoritative['reference_version'];
        if (! $matches) {
            throw new HttpResponseException(response()->json([
                'status' => 'REFERENCE_PACKAGE_MISMATCH',
                'message' => 'The monitoring reference changed before this visit was finalized. Refresh and review the visit before syncing.',
            ], 409));
        }

        return [
            'status' => $snapshot['status'], 'type' => $snapshot['type'],
            'source_id' => $snapshot['source_id'] ?? null, 'value' => $snapshot['value'],
            'label' => $snapshot['label'] ?? null, 'source' => $snapshot['source_reference'] ?? null,
            'effective_date' => $snapshot['effective_date'] ?? null,
            'reference_version' => $snapshot['reference_version'] ?? null,
        ];
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
            'records.*.items.*.reference_snapshot' => ['nullable', 'array'],
            'records.*.items.*.reference_snapshot.status' => ['required_with:records.*.items.*.reference_snapshot', 'in:available,unavailable'],
            'records.*.items.*.reference_snapshot.type' => ['required_with:records.*.items.*.reference_snapshot', 'in:standard_srp,emergency_ceiling'],
            'records.*.items.*.reference_snapshot.source_id' => ['nullable', 'integer', 'min:1'],
            'records.*.items.*.reference_snapshot.value' => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            'records.*.items.*.reference_snapshot.label' => ['nullable', 'string', 'max:255'],
            'records.*.items.*.reference_snapshot.source_reference' => ['nullable', 'string', 'max:255'],
            'records.*.items.*.reference_snapshot.effective_date' => ['nullable', 'date'],
            'records.*.items.*.reference_snapshot.reference_version' => ['required_with:records.*.items.*.reference_snapshot', 'string', 'size:64'],
        ];
    }
}
