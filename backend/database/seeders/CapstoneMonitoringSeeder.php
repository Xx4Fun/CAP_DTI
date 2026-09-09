<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class CapstoneMonitoringSeeder extends Seeder
{
    private const CLIENT_VERSION = 'capstone-seed-2026-09-01';

    private const DATASET_VERSION = '2026-09-01-v1';

    private const TARGET_DATE = '2026-09-01';

    private const VISIT_TIMES = ['08:15', '08:30', '09:00', '10:15', '11:00', '12:00', '13:15', '14:00', '15:00', '15:30'];

    private const ANOMALY_STORES = ['HARO MART', 'Unitop General Merchandise'];

    public function run(): void
    {
        $references = app(FieldReferenceResolver::class);
        $stores = Store::query()->where('is_active', true)->where('is_verified', true)->where('is_public', true)
            ->orderBy('store_name')->orderBy('id')->get();
        $period = MonitoringPeriod::for(CarbonImmutable::parse(self::TARGET_DATE.' 12:00', 'Asia/Manila'));

        $this->preflight($stores, $period, $references);
        $covered = $this->effectiveBulletins(true);
        $other = $this->effectiveBulletins(false);
        $expected = $this->expectedItems($stores, $covered, $other, $references);
        [$officerPng, $representativePng] = $this->signatureImages();
        $itemCount = collect($expected)->sum(fn ($items) => count($items));
        $summary = json_encode([
            'dataset_version' => self::DATASET_VERSION,
            'target_date' => self::TARGET_DATE,
            'source_week' => ['starts_at' => '2026-08-30T16:00:00Z', 'ends_at' => '2026-09-06T16:00:00Z'],
            'record_count' => $stores->count(),
            'item_count' => $itemCount,
            'temporal_count' => $itemCount,
            'audit_count' => $stores->count(),
            'anomalies' => ['HARO MART' => 6, 'Unitop General Merchandise' => 6],
            'evidence_file_count' => $stores->count() * 2,
            'evidence_hashes' => ['officer' => hash('sha256', $officerPng), 'representative' => hash('sha256', $representativePng)],
        ], JSON_UNESCAPED_SLASHES);

        if ($this->existingDatasetIsComplete($stores, $expected, hash('sha256', $officerPng), hash('sha256', $representativePng))) {
            $this->command?->info("Capstone monitoring dataset verified; no changes made. {$summary}");

            return;
        }

        $writtenPaths = [];
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        try {
            DB::transaction(function () use ($stores, $expected, $officerPng, $representativePng, $disk, &$writtenPaths): void {
                $officers = $this->officers();
                foreach ($stores as $storeIndex => $store) {
                    $finalizedAt = $this->visitAt($storeIndex);
                    $receivedAt = $finalizedAt->addMinutes(2);
                    $officer = $officers[$storeIndex % $officers->count()];
                    $record = MonitoringRecord::create([
                        'client_uuid' => $this->clientUuid($store->id),
                        'officer_user_id' => $officer->id,
                        'store_id' => $store->id,
                        'offline_lease_id' => null,
                        'status' => 'accepted',
                        'started_at' => $finalizedAt->subMinutes(35),
                        'finalized_at' => $finalizedAt,
                        'received_at' => $receivedAt,
                        'latitude' => $store->latitude + $this->coordinateOffset($store->id, 'lat'),
                        'longitude' => $store->longitude + $this->coordinateOffset($store->id, 'lng'),
                        'location_accuracy_meters' => 5 + (hexdec(substr(hash('sha256', "accuracy|{$store->id}"), 0, 2)) % 8),
                        'location_captured_at' => $finalizedAt->subMinutes(2),
                        'representative_name' => 'CAPSTONE DEMO Representative',
                        'representative_title' => 'Store Representative',
                        'officer_signature_disk' => $disk,
                        'officer_signature_path' => '',
                        'officer_signature_sha256' => hash('sha256', $officerPng),
                        'representative_signature_disk' => $disk,
                        'representative_signature_path' => '',
                        'representative_signature_sha256' => hash('sha256', $representativePng),
                        'sync_source' => 'online',
                        'client_version' => self::CLIENT_VERSION,
                        'protocol_mode' => 'standard',
                        'protocol_reference' => null,
                        'field_verification_request_id' => null,
                    ]);
                    $officerPath = "field-monitoring/{$record->id}/officer-{$record->officer_signature_sha256}.png";
                    $representativePath = "field-monitoring/{$record->id}/representative-{$record->representative_signature_sha256}.png";
                    foreach ([[$officerPath, $officerPng], [$representativePath, $representativePng]] as [$path, $bytes]) {
                        if (! Storage::disk($disk)->put($path, $bytes, ['visibility' => 'private'])) {
                            throw new RuntimeException('Unable to persist private capstone signature evidence.');
                        }
                        $writtenPaths[] = $path;
                    }
                    $record->update(['officer_signature_path' => $officerPath, 'representative_signature_path' => $representativePath]);

                    foreach ($expected[$store->id] as $row) {
                        $item = MonitoringRecordItem::create([
                            'monitoring_record_id' => $record->id,
                            'srp_id' => $row['bulletin']->id,
                            'recorded_price' => $row['price'],
                            'baseline_price' => $row['bulletin']->baseline_price,
                            'previous_price' => $row['previous'],
                            'variance_percent' => $row['variance'],
                            'is_anomaly' => $row['anomaly'],
                            'reference_status' => $row['reference']['status'],
                            'reference_type' => $row['reference']['type'],
                            'reference_label' => $row['reference']['label'],
                            'reference_value' => $row['reference']['value'],
                            'reference_source' => $row['reference']['source'],
                            'reference_effective_date' => $row['reference']['effective_date'],
                            'reference_source_id' => $row['reference']['source_id'],
                            'reference_version' => $row['reference']['reference_version'],
                        ]);
                        TemporalInspection::create([
                            'store_id' => $store->id,
                            'srp_id' => $row['bulletin']->id,
                            'recorded_price' => $row['price'],
                            'is_flagged' => $row['anomaly'],
                            'inspection_timestamp' => $finalizedAt,
                            'sync_timestamp' => $receivedAt,
                            'officer_signature' => $officerPath,
                            'vendor_signature' => $representativePath,
                            'validation_status' => 'verified',
                            'validated_at' => $receivedAt,
                            'monitoring_record_id' => $record->id,
                            'monitoring_record_item_id' => $item->id,
                            'officer_user_id' => $officer->id,
                        ]);
                    }
                    AuditEvent::create([
                        'actor_id' => $officer->id,
                        'action' => 'monitoring.capstone_demo_seeded',
                        'subject_type' => MonitoringRecord::class,
                        'subject_id' => $record->id,
                        'metadata' => [
                            'synthetic' => true,
                            'dataset_version' => self::DATASET_VERSION,
                            'target_date' => self::TARGET_DATE,
                            'source_week' => ['starts_at' => '2026-08-30T16:00:00Z', 'ends_at' => '2026-09-06T16:00:00Z'],
                            'store_name' => $store->store_name,
                            'item_count' => count($expected[$store->id]),
                            'anomaly_count' => collect($expected[$store->id])->where('anomaly', true)->count(),
                        ],
                    ]);
                }
            });
        } catch (Throwable $exception) {
            Storage::disk($disk)->delete($writtenPaths);
            throw $exception;
        }

        $this->command?->info("Capstone monitoring dataset created. {$summary}");
    }

    private function preflight(Collection $stores, array $period, FieldReferenceResolver $references): void
    {
        if ($period['protocol_mode'] !== 'standard'
            || $period['starts_at']->toIso8601String() !== '2026-08-30T16:00:00+00:00'
            || $period['ends_at']->toIso8601String() !== '2026-09-06T16:00:00+00:00') {
            throw new RuntimeException('September 1, 2026 is not an eligible standard monitoring week.');
        }
        if ($stores->count() < 3 || $stores->count() > count(self::VISIT_TIMES)) {
            throw new RuntimeException('Capstone monitoring requires between 3 and 10 eligible establishments.');
        }
        if ($stores->contains(fn ($store) => ! is_numeric($store->latitude) || ! is_numeric($store->longitude)
            || abs((float) $store->latitude) > 90 || abs((float) $store->longitude) > 180)) {
            throw new RuntimeException('Every eligible establishment must have valid coordinates.');
        }
        foreach (self::ANOMALY_STORES as $name) {
            if (! $stores->contains('store_name', $name)) {
                throw new RuntimeException("Required anomaly establishment is missing: {$name}.");
            }
        }
        foreach ($this->demoOfficerAttributes() as $attributes) {
            $existing = User::query()->where('email', $attributes['email'])->first();
            if ($existing && ($existing->name !== $attributes['name'] || $existing->role !== 'field_officer' || $existing->is_active)) {
                throw new RuntimeException("Demo officer identity conflicts with {$attributes['email']}.");
            }
        }
        if (! function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('PHP GD is required to generate capstone demo signature evidence.');
        }

        $coveredRows = SrpBulletin::query()->where('price_freeze_applicable', true)
            ->whereDate('effective_date', '<=', self::TARGET_DATE)->get();
        $missing = $coveredRows->filter(fn ($row) => blank($row->commodity_key) || $row->baseline_price <= 0 || ! $row->effective_date);
        $collisions = $coveredRows->whereNotNull('commodity_key')->groupBy('commodity_key')
            ->filter(fn ($rows) => $rows->map(fn ($row) => [$row->commodity_name, $row->unit])->unique()->count() > 1);
        if ($missing->isNotEmpty() || $collisions->isNotEmpty()) {
            $ids = $missing->pluck('id')->merge($collisions->flatten()->pluck('id'))->unique()->implode(', ');
            throw new RuntimeException("Covered SRP identities or references are incomplete or duplicated (bulletin IDs: {$ids}).");
        }

        $covered = $this->effectiveBulletins(true);
        $other = $this->effectiveBulletins(false);
        if ($covered->isEmpty() || $other->count() < 8) {
            throw new RuntimeException('Capstone monitoring requires covered products and at least eight non-covered products.');
        }
        foreach ($covered->concat($other) as $bulletin) {
            $reference = $references->resolve($bulletin, self::TARGET_DATE.' 12:00:00');
            if ($reference['status'] !== 'available' || $reference['type'] !== 'standard_srp' || $reference['value'] <= 0
                || blank($reference['effective_date']) || blank($reference['source_id'])) {
                throw new RuntimeException("Historical SRP reference is unavailable for bulletin {$bulletin->id}.");
            }
        }

        $foreignRoutine = MonitoringRecord::query()->where('status', 'accepted')->whereNull('field_verification_request_id')
            ->where(fn ($query) => $query->where('protocol_mode', 'standard')->orWhereNull('protocol_mode'))
            ->where('finalized_at', '>=', $period['starts_at'])->where('finalized_at', '<', $period['ends_at'])
            ->where(fn ($query) => $query->whereNull('client_version')->orWhere('client_version', '!=', self::CLIENT_VERSION));
        if ($foreignRoutine->exists()) {
            throw new RuntimeException('A non-demo accepted standard routine record already exists in the source week.');
        }
    }

    private function effectiveBulletins(bool $covered): Collection
    {
        return SrpBulletin::query()->whereNotNull('commodity_key')
            ->whereDate('effective_date', '<=', self::TARGET_DATE)
            ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
            ->unique('commodity_key')->where('price_freeze_applicable', $covered)->sortBy('commodity_key')->values();
    }

    private function expectedItems(Collection $stores, Collection $covered, Collection $other, FieldReferenceResolver $references): array
    {
        $assigned = $stores->mapWithKeys(fn ($store) => [$store->id => collect()]);
        foreach ($covered as $commodityIndex => $bulletin) {
            $indexes = collect([$commodityIndex % $stores->count(), ($commodityIndex + 3) % $stores->count(), ($commodityIndex + 7) % $stores->count()])->unique();
            for ($candidate = 0; $indexes->count() < 3; $candidate++) {
                $indexes = $indexes->push(($commodityIndex + $candidate) % $stores->count())->unique()->values();
            }
            foreach ($indexes as $storeIndex) {
                $assigned[$stores[$storeIndex]->id]->push(['bulletin' => $bulletin, 'commodity_index' => $commodityIndex]);
            }
        }
        foreach (self::ANOMALY_STORES as $name) {
            $store = $stores->firstWhere('store_name', $name);
            if ($assigned[$store->id]->count() < 6) {
                throw new RuntimeException("{$name} has fewer than six assigned covered products.");
            }
        }

        $expected = $stores->mapWithKeys(function ($store, $storeIndex) use ($assigned, $other, $references) {
            $anomalyIds = in_array($store->store_name, self::ANOMALY_STORES, true)
                ? $assigned[$store->id]->sortBy(fn ($row) => hash('sha256', $store->store_name.'|'.$row['bulletin']->commodity_key))->take(6)
                    ->pluck('bulletin.id')->all()
                : [];
            $rows = $assigned[$store->id]->values();
            for ($index = 0; $index < 8; $index++) {
                $rows->push(['bulletin' => $other[($storeIndex * 8 + $index) % $other->count()], 'commodity_index' => 100000 + $storeIndex * 8 + $index]);
            }

            return [$store->id => $rows->map(function ($row, $itemIndex) use ($store, $storeIndex, $anomalyIds, $references) {
                $reference = $references->resolve($row['bulletin'], $this->visitAt($storeIndex));
                $reference['reference_version'] = $references->version($reference);
                $anomaly = in_array($row['bulletin']->id, $anomalyIds, true);
                $factor = $anomaly ? [1.12, 1.15, 1.18][$itemIndex % 3] : [0.96, 0.98, 1.00][($row['commodity_index'] + $storeIndex) % 3];
                $price = $this->shelfPrice($reference['value'] * $factor);
                if ($anomaly && $price <= $reference['value'] * 1.10) {
                    $price = round($price + $this->priceTick($price), 2);
                } elseif (! $anomaly && $price > $reference['value']) {
                    $tick = $this->priceTick($reference['value']);
                    $price = round(floor($reference['value'] / $tick) * $tick, 2);
                }
                $variance = (($price - $reference['value']) / $reference['value']) * 100;
                $previous = TemporalInspection::query()->where('store_id', $store->id)->where('srp_id', $row['bulletin']->id)
                    ->where('validation_status', 'verified')->where('inspection_timestamp', '<', $this->visitAt($storeIndex))
                    ->latest('inspection_timestamp')->value('recorded_price');

                return [
                    'bulletin' => $row['bulletin'],
                    'price' => $price,
                    'previous' => $previous === null ? null : (float) $previous,
                    'variance' => $variance,
                    'anomaly' => $reference['type'] === 'emergency_ceiling' ? $price > $reference['value'] : $price > $reference['value'] * 1.10,
                    'reference' => $reference,
                ];
            })->all()];
        })->all();

        foreach ($covered as $bulletin) {
            $positions = [];
            foreach ($expected as $storeId => $rows) {
                foreach ($rows as $rowIndex => $row) {
                    if ($row['bulletin']->id === $bulletin->id) {
                        $positions[] = [$storeId, $rowIndex];
                    }
                }
            }
            if (collect($positions)->map(fn ($position) => $expected[$position[0]][$position[1]]['price'])->unique()->count() === 1) {
                foreach ($positions as [$storeId, $rowIndex]) {
                    $row = &$expected[$storeId][$rowIndex];
                    $lower = round($row['price'] - $this->priceTick($row['price']), 2);
                    if (! $row['anomaly'] && $lower > 0) {
                        $row['price'] = $lower;
                        $row['variance'] = (($lower - $row['reference']['value']) / $row['reference']['value']) * 100;
                        unset($row);
                        break;
                    }
                    unset($row);
                }
            }
        }

        return $expected;
    }

    private function existingDatasetIsComplete(Collection $stores, array $expected, string $officerHash, string $representativeHash): bool
    {
        $records = MonitoringRecord::query()->where('client_version', self::CLIENT_VERSION)->with(['officer', 'items'])->get();
        if ($records->isEmpty()) {
            return false;
        }
        if ($records->count() !== $stores->count()) {
            throw new RuntimeException('A partial capstone monitoring dataset already exists.');
        }
        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        foreach ($stores as $storeIndex => $store) {
            $record = $records->firstWhere('client_uuid', $this->clientUuid($store->id));
            $expectedRows = collect($expected[$store->id]);
            $matches = $record
                && $record->store_id === $store->id
                && $record->officer?->email === $this->demoOfficerAttributes()[$storeIndex % 3]['email']
                && $record->status === 'accepted' && $record->protocol_mode === 'standard'
                && $record->finalized_at->equalTo($this->visitAt($storeIndex))
                && $record->started_at->equalTo($this->visitAt($storeIndex)->subMinutes(35))
                && $record->received_at->equalTo($this->visitAt($storeIndex)->addMinutes(2))
                && $record->officer_signature_sha256 === $officerHash
                && $record->representative_signature_sha256 === $representativeHash
                && $record->items->count() === $expectedRows->count()
                && $record->items->every(function ($item) use ($expectedRows) {
                    $row = $expectedRows->first(fn ($expected) => $expected['bulletin']->id === $item->srp_id);

                    return $row && abs($item->recorded_price - $row['price']) < 0.001
                        && abs($item->baseline_price - $row['bulletin']->baseline_price) < 0.001
                        && $item->previous_price === $row['previous']
                        && abs($item->variance_percent - $row['variance']) < 0.011
                        && $item->reference_status === $row['reference']['status']
                        && $item->reference_type === $row['reference']['type']
                        && $item->reference_label === $row['reference']['label']
                        && $item->reference_source === $row['reference']['source']
                        && $item->reference_version === $row['reference']['reference_version']
                        && $item->reference_source_id === $row['reference']['source_id']
                        && abs($item->reference_value - $row['reference']['value']) < 0.001
                        && $item->reference_effective_date?->toDateString() === $row['reference']['effective_date']
                        && $item->is_anomaly === $row['anomaly']
                        && TemporalInspection::query()->where('monitoring_record_item_id', $item->id)
                            ->where('monitoring_record_id', $item->monitoring_record_id)->where('validation_status', 'verified')
                            ->where('store_id', $item->record->store_id)->where('srp_id', $item->srp_id)
                            ->where('officer_user_id', $item->record->officer_user_id)
                            ->where('inspection_timestamp', $item->record->finalized_at)
                            ->where('recorded_price', $item->recorded_price)->where('is_flagged', $item->is_anomaly)->exists();
                })
                && AuditEvent::query()->where('action', 'monitoring.capstone_demo_seeded')->where('subject_id', $record->id)
                    ->where('metadata->synthetic', true)->where('metadata->dataset_version', self::DATASET_VERSION)->count() === 1;
            foreach ([[$record?->officer_signature_path, $record?->officer_signature_sha256], [$record?->representative_signature_path, $record?->representative_signature_sha256]] as [$path, $hash]) {
                $matches = $matches && $path && Storage::disk($disk)->exists($path)
                    && hash('sha256', Storage::disk($disk)->get($path)) === $hash;
            }
            if (! $matches) {
                throw new RuntimeException("Existing capstone dataset differs for store {$store->store_name}.");
            }
        }

        return true;
    }

    private function officers(): Collection
    {
        return collect($this->demoOfficerAttributes())->map(fn ($attributes) => User::firstOrCreate(
            ['email' => $attributes['email']],
            $attributes + ['password' => Str::random(80), 'is_active' => false, 'must_change_password' => false]
        ));
    }

    private function demoOfficerAttributes(): array
    {
        return collect(range(1, 3))->map(fn ($number) => [
            'name' => "CAPSTONE Demo Field Officer {$number}",
            'email' => "capstone-demo-field-officer-{$number}@price-watch.invalid",
            'role' => 'field_officer',
        ])->all();
    }

    private function visitAt(int $storeIndex): CarbonImmutable
    {
        return CarbonImmutable::parse(self::TARGET_DATE.' '.self::VISIT_TIMES[$storeIndex], 'Asia/Manila')->utc();
    }

    private function clientUuid(int $storeId): string
    {
        return sprintf('20260901-0000-5000-8000-%012d', $storeId);
    }

    private function coordinateOffset(int $storeId, string $axis): float
    {
        return (hexdec(substr(hash('sha256', "{$axis}|{$storeId}"), 0, 2)) % 9 - 4) / 100000;
    }

    private function shelfPrice(float $price): float
    {
        $tick = $this->priceTick($price);

        return round(round($price / $tick) * $tick, 2);
    }

    private function priceTick(float $price): float
    {
        return $price < 10 ? 0.05 : ($price < 100 ? 0.25 : 0.50);
    }

    private function signatureImages(): array
    {
        return [$this->signatureImage('CAPSTONE DEMO OFFICER'), $this->signatureImage('CAPSTONE DEMO REPRESENTATIVE')];
    }

    private function signatureImage(string $label): string
    {
        $image = imagecreatetruecolor(640, 120);
        $white = imagecolorallocate($image, 255, 255, 255);
        $red = imagecolorallocate($image, 160, 0, 0);
        imagefill($image, 0, 0, $white);
        imagestring($image, 5, 160, 35, 'CAPSTONE DEMO - NOT A REAL SIGNATURE', $red);
        imagestring($image, 4, 210, 65, $label, $red);
        ob_start();
        imagepng($image);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }
}
