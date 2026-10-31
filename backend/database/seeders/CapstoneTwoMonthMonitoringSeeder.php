<?php

namespace Database\Seeders;

use App\Models\AuditEvent;
use App\Models\LegalNotice;
use App\Models\MonitoringRecord;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\SrpBulletin;
use App\Models\Store;
use App\Models\TemporalInspection;
use App\Models\User;
use App\Services\FieldReferenceResolver;
use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class CapstoneTwoMonthMonitoringSeeder extends Seeder
{
    public const CLIENT_VERSION = 'capstone-seed-2026-11-01-8w';

    public const DATASET_VERSION = '2026-11-01-8w-v1';

    public const TARGET_DATES = [
        '2026-09-08',
        '2026-09-15',
        '2026-09-22',
        '2026-09-29',
        '2026-10-06',
        '2026-10-13',
        '2026-10-20',
        '2026-10-27',
    ];

    public const OFF_PIN_STORE = 'HARO MART';

    public const OFF_PIN_DATE = '2026-10-27';

    private const VISIT_TIMES = ['08:15', '08:30', '09:00', '10:15', '11:00', '12:00', '13:15', '14:00', '15:00', '15:30'];

    private const ITEM_COUNT_POOL = [62, 66, 70, 72, 75, 78, 80, 84, 88, 92, 96, 100];

    private const ANOMALY_STORES = [
        'HARO MART',
        'Unitop General Merchandise',
        'CPT Mart- Antique Branch',
        'Antique City Square',
    ];

    public function run(): void
    {
        $references = app(FieldReferenceResolver::class);
        $stores = Store::query()
            ->where('is_active', true)
            ->where('is_verified', true)
            ->where('is_public', true)
            ->orderBy('store_name')
            ->orderBy('id')
            ->get();

        $this->preflight($stores);
        $covered = $this->effectiveBulletins(true);
        $other = $this->effectiveBulletins(false);
        $expected = $this->expectedDataset($stores, $covered, $other, $references);
        [$officerPng, $representativePng] = $this->signatureImages();
        $officerHash = hash('sha256', $officerPng);
        $representativeHash = hash('sha256', $representativePng);

        if ($this->existingDatasetIsComplete($stores, $expected, $officerHash, $representativeHash)) {
            $this->command?->info('Capstone 2-month monitoring dataset already verified; no changes made.');

            return;
        }

        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        $officerPath = "field-monitoring/capstone-demo-8w/officer-{$officerHash}.png";
        $representativePath = "field-monitoring/capstone-demo-8w/representative-{$representativeHash}.png";
        $writtenPaths = [];

        try {
            foreach ([[$officerPath, $officerPng], [$representativePath, $representativePng]] as [$path, $bytes]) {
                if (! Storage::disk($disk)->exists($path)) {
                    if (! Storage::disk($disk)->put($path, $bytes, ['visibility' => 'private'])) {
                        throw new RuntimeException('Unable to persist private capstone 8-week signature evidence.');
                    }
                    $writtenPaths[] = $path;
                }
            }

            $totalItems = 0;
            $totalAnomalies = 0;

            DB::transaction(function () use (
                $stores,
                $expected,
                $disk,
                $officerPath,
                $representativePath,
                $officerHash,
                $representativeHash,
                &$totalItems,
                &$totalAnomalies
            ): void {
                $this->lockApcPreparation();
                $this->supersedePriorUnissuedRecords();

                $officers = $this->officers();
                $now = now();

                foreach (self::TARGET_DATES as $weekIndex => $date) {
                    $weekPeriod = MonitoringWeek::for(CarbonImmutable::parse($date.' 12:00', 'Asia/Manila'));

                    foreach ($stores as $storeIndex => $store) {
                        $finalizedAt = $this->visitAt($date, $storeIndex);
                        $receivedAt = $finalizedAt->addMinutes(2);
                        $officer = $officers[($storeIndex + $weekIndex) % $officers->count()];
                        [$lat, $lng, $accuracy] = $this->visitLocation($store, $date);

                        $record = MonitoringRecord::create([
                            'client_uuid' => $this->clientUuid($weekIndex, $store->id),
                            'officer_user_id' => $officer->id,
                            'store_id' => $store->id,
                            'offline_lease_id' => null,
                            'status' => 'accepted',
                            'started_at' => $finalizedAt->subMinutes(35),
                            'finalized_at' => $finalizedAt,
                            'received_at' => $receivedAt,
                            'latitude' => $lat,
                            'longitude' => $lng,
                            'location_accuracy_meters' => $accuracy,
                            'location_captured_at' => $finalizedAt->subMinutes(2),
                            'representative_name' => 'CAPSTONE DEMO Representative',
                            'representative_title' => 'Store Representative',
                            'officer_signature_disk' => $disk,
                            'officer_signature_path' => $officerPath,
                            'officer_signature_sha256' => $officerHash,
                            'representative_signature_disk' => $disk,
                            'representative_signature_path' => $representativePath,
                            'representative_signature_sha256' => $representativeHash,
                            'sync_source' => 'online',
                            'client_version' => self::CLIENT_VERSION,
                            'protocol_mode' => 'standard',
                            'protocol_reference' => null,
                            'field_verification_request_id' => null,
                        ]);

                        $rows = $expected[$weekIndex][$store->id];
                        $itemPayloads = [];
                        foreach ($rows as $row) {
                            $itemPayloads[] = [
                                'monitoring_record_id' => $record->id,
                                'srp_id' => $row['bulletin']->id,
                                'recorded_price' => $row['price'],
                                'baseline_price' => $row['bulletin']->baseline_price,
                                'previous_price' => $row['previous'],
                                'variance_percent' => $row['variance'],
                                'previous_price_variance_percent' => $row['previous_variance'],
                                'is_previous_price_spike' => $row['is_spike'],
                                'finding_basis' => $row['finding_basis'],
                                'is_anomaly' => $row['anomaly'],
                                'reference_status' => $row['reference']['status'],
                                'reference_type' => $row['reference']['type'],
                                'reference_label' => $row['reference']['label'],
                                'reference_value' => $row['reference']['value'],
                                'reference_source' => $row['reference']['source'],
                                'reference_effective_date' => $row['reference']['effective_date'],
                                'reference_source_id' => $row['reference']['source_id'],
                                'reference_version' => $row['reference']['reference_version'],
                                'created_at' => $now,
                                'updated_at' => $now,
                            ];
                        }

                        MonitoringRecordItem::insert($itemPayloads);

                        $insertedItems = MonitoringRecordItem::query()
                            ->where('monitoring_record_id', $record->id)
                            ->orderBy('id')
                            ->get(['id', 'srp_id', 'recorded_price', 'is_anomaly']);

                        $temporalPayloads = [];
                        foreach ($insertedItems as $insertedItem) {
                            $temporalPayloads[] = [
                                'store_id' => $store->id,
                                'srp_id' => $insertedItem->srp_id,
                                'recorded_price' => $insertedItem->recorded_price,
                                'is_flagged' => $insertedItem->is_anomaly,
                                'inspection_timestamp' => $finalizedAt,
                                'sync_timestamp' => $receivedAt,
                                'officer_signature' => $officerPath,
                                'vendor_signature' => $representativePath,
                                'validation_status' => 'verified',
                                'validated_at' => $receivedAt,
                                'monitoring_record_id' => $record->id,
                                'monitoring_record_item_id' => $insertedItem->id,
                                'officer_user_id' => $officer->id,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ];
                        }

                        TemporalInspection::insert($temporalPayloads);

                        $anomalyCount = collect($rows)->where('anomaly', true)->count();
                        $totalItems += count($rows);
                        $totalAnomalies += $anomalyCount;

                        AuditEvent::create([
                            'actor_id' => $officer->id,
                            'action' => 'monitoring.capstone_demo_seeded',
                            'subject_type' => MonitoringRecord::class,
                            'subject_id' => $record->id,
                            'metadata' => [
                                'synthetic' => true,
                                'dataset_version' => self::DATASET_VERSION,
                                'target_date' => $date,
                                'week_index' => $weekIndex + 1,
                                'source_week' => [
                                    'starts_at' => $weekPeriod['starts_at']->toIso8601String(),
                                    'ends_at' => $weekPeriod['ends_at']->toIso8601String(),
                                ],
                                'store_name' => $store->store_name,
                                'item_count' => count($rows),
                                'anomaly_count' => $anomalyCount,
                            ],
                        ]);
                    }
                }
            });

            $this->command?->info('Capstone 2-month monitoring dataset created. '.json_encode([
                'dataset_version' => self::DATASET_VERSION,
                'weeks' => count(self::TARGET_DATES),
                'record_count' => $stores->count() * count(self::TARGET_DATES),
                'item_count' => $totalItems,
                'anomaly_count' => $totalAnomalies,
                'off_pin_store' => self::OFF_PIN_STORE,
                'off_pin_date' => self::OFF_PIN_DATE,
            ], JSON_UNESCAPED_SLASHES));
        } catch (Throwable $exception) {
            if ($writtenPaths !== []) {
                Storage::disk($disk)->delete($writtenPaths);
            }
            throw $exception;
        }
    }

    private function preflight(Collection $stores): void
    {
        if ($stores->count() < 3 || $stores->count() > count(self::VISIT_TIMES)) {
            throw new RuntimeException('Capstone 2-month monitoring requires between 3 and 10 eligible establishments.');
        }
        if ($stores->contains(fn ($store) => ! is_numeric($store->latitude) || ! is_numeric($store->longitude)
            || abs((float) $store->latitude) > 90 || abs((float) $store->longitude) > 180)) {
            throw new RuntimeException('Every eligible establishment must have valid coordinates.');
        }
        if (! $stores->contains('store_name', self::OFF_PIN_STORE)) {
            throw new RuntimeException('Required off-pin establishment is missing: '.self::OFF_PIN_STORE.'.');
        }
        foreach (self::ANOMALY_STORES as $name) {
            if (! $stores->contains('store_name', $name)) {
                throw new RuntimeException("Required anomaly establishment is missing: {$name}.");
            }
        }
        if (! function_exists('imagecreatetruecolor')) {
            throw new RuntimeException('PHP GD is required to generate capstone demo signature evidence.');
        }

        $covered = $this->effectiveBulletins(true);
        $other = $this->effectiveBulletins(false);
        if ($covered->isEmpty() || $other->count() < 8 || ($covered->count() + $other->count()) < 60) {
            throw new RuntimeException('Capstone 2-month monitoring requires at least 60 active SRP bulletins.');
        }
    }

    private function supersedePriorUnissuedRecords(): void
    {
        $windowStart = CarbonImmutable::parse('2026-08-31 00:00:00', 'Asia/Manila')->utc();
        $windowEnd = CarbonImmutable::parse('2026-11-02 00:00:00', 'Asia/Manila')->utc();

        $candidates = MonitoringRecord::query()
            ->where('status', 'accepted')
            ->whereNull('field_verification_request_id')
            ->where('finalized_at', '>=', $windowStart)
            ->where('finalized_at', '<', $windowEnd)
            ->where(fn ($q) => $q->whereNull('client_version')->orWhere('client_version', '!=', self::CLIENT_VERSION))
            ->with('items:id,monitoring_record_id')
            ->lockForUpdate()
            ->get();

        foreach ($candidates as $record) {
            $itemIds = $record->items->pluck('id')->all();
            $hasIssuedNotice = LegalNotice::query()
                ->where('monitoring_record_id', $record->id)
                ->where(fn ($q) => $q->whereNotIn('status', ['draft', 'cancelled'])->orWhereNotNull('issued_at'))
                ->exists();
            $hasFinding = $itemIds !== [] && RegulatoryFinding::query()
                ->where('source_type', MonitoringRecordItem::FINDING_SOURCE)
                ->whereIn('source_id', $itemIds)
                ->exists();

            if ($hasIssuedNotice || $hasFinding) {
                continue;
            }

            LegalNotice::query()
                ->where('monitoring_record_id', $record->id)
                ->where('status', 'draft')
                ->whereNull('issued_at')
                ->update(['status' => 'cancelled', 'cancelled_at' => now()]);

            TemporalInspection::query()
                ->where('monitoring_record_id', $record->id)
                ->update(['validation_status' => 'superseded']);

            $record->update(['status' => 'superseded']);

            AuditEvent::create([
                'actor_id' => $record->officer_user_id,
                'action' => 'monitoring.capstone_legacy_superseded',
                'subject_type' => MonitoringRecord::class,
                'subject_id' => $record->id,
                'metadata' => [
                    'synthetic' => false,
                    'dataset_version' => self::DATASET_VERSION,
                    'previous_status' => 'accepted',
                    'client_uuid' => $record->client_uuid,
                    'finalized_at' => $record->finalized_at->toIso8601String(),
                ],
            ]);
        }
    }

    private function effectiveBulletins(bool $covered): Collection
    {
        return SrpBulletin::query()
            ->whereNotNull('commodity_key')
            ->whereDate('effective_date', '<=', self::TARGET_DATES[0])
            ->orderBy('commodity_key')
            ->latest('effective_date')
            ->latest('id')
            ->get()
            ->unique('commodity_key')
            ->where('price_freeze_applicable', $covered)
            ->sortBy('commodity_key')
            ->values();
    }

    private function expectedDataset(
        Collection $stores,
        Collection $covered,
        Collection $other,
        FieldReferenceResolver $references
    ): array {
        $allBulletins = $covered->concat($other)->values();
        $indexByBulletinId = $allBulletins->pluck('id')->flip();

        // Build each store's permanent core set (~45 items):
        // - Every covered commodity appears in 3 stores' core sets (guaranteeing >=3 observations per week for APC)
        // - Plus 8 non-covered commodities per store
        $coreByStore = $stores->mapWithKeys(fn ($store) => [$store->id => collect()]);
        foreach ($covered as $commodityIndex => $bulletin) {
            $indexes = collect([
                $commodityIndex % $stores->count(),
                ($commodityIndex + 3) % $stores->count(),
                ($commodityIndex + 7) % $stores->count(),
            ])->unique();
            for ($candidate = 0; $indexes->count() < 3; $candidate++) {
                $indexes = $indexes->push(($commodityIndex + $candidate) % $stores->count())->unique()->values();
            }
            foreach ($indexes as $storeIndex) {
                $coreByStore[$stores[$storeIndex]->id]->push($bulletin);
            }
        }
        foreach ($stores as $storeIndex => $store) {
            for ($i = 0; $i < 8; $i++) {
                $coreByStore[$store->id]->push($other[($storeIndex * 8 + $i) % $other->count()]);
            }
            $coreByStore[$store->id] = $coreByStore[$store->id]->unique('id')->values();
        }

        // For each anomaly store, select 6 core bulletins with baseline_price >= 15.00:
        // - Slots 0, 1: Type 1 (Above SRP only)
        // - Slots 2, 3: Type 2 (>10% previous-record spike while within SRP)
        // - Slots 4, 5: Type 3 (Both Above SRP AND >10% previous-record spike)
        $anomalyRolesByStore = [];
        foreach ($stores as $store) {
            if (! in_array($store->store_name, self::ANOMALY_STORES, true)) {
                $anomalyRolesByStore[$store->id] = [];

                continue;
            }
            $candidates = $coreByStore[$store->id]
                ->filter(fn (SrpBulletin $b) => (float) $b->baseline_price >= 15.00)
                ->sortBy(fn (SrpBulletin $b) => hash('sha256', $store->store_name.'|'.$b->commodity_key))
                ->take(6)
                ->values();

            $roles = [];
            foreach ($candidates as $slot => $bulletin) {
                $roles[$bulletin->id] = match (true) {
                    $slot < 2 => 'type1_srp_only',
                    $slot < 4 => 'type2_spike_only',
                    default => 'type3_both',
                };
            }
            $anomalyRolesByStore[$store->id] = $roles;
        }

        // Cache standard SRP references per bulletin
        $resolvedReferences = $allBulletins->mapWithKeys(function (SrpBulletin $bulletin) {
            $ref = [
                'status' => 'available',
                'type' => 'standard_srp',
                'label' => 'SRP baseline (provisional)',
                'value' => (float) $bulletin->baseline_price,
                'source' => $bulletin->source_reference,
                'effective_date' => $bulletin->effective_date?->toDateString(),
                'source_id' => $bulletin->id,
            ];

            return [$bulletin->id => $ref];
        });
        foreach ($resolvedReferences as $bulletinId => $ref) {
            $ref['reference_version'] = $references->version($ref);
            $resolvedReferences[$bulletinId] = $ref;
        }

        $expected = [];
        $previousWeekPrices = [];

        foreach (self::TARGET_DATES as $weekIndex => $date) {
            $expected[$weekIndex] = [];
            $currentWeekPrices = [];

            foreach ($stores as $storeIndex => $store) {
                $targetCount = $this->targetItemCount($weekIndex, $storeIndex, $allBulletins->count());
                $coreIds = $coreByStore[$store->id]->pluck('id')->flip();
                $neededExtras = max(0, $targetCount - $coreByStore[$store->id]->count());

                $extras = $allBulletins
                    ->reject(fn (SrpBulletin $b) => isset($coreIds[$b->id]))
                    ->sortBy(fn (SrpBulletin $b) => hash('sha256', "extra|{$weekIndex}|{$store->id}|{$b->commodity_key}"))
                    ->take($neededExtras)
                    ->values();

                $selectedBulletins = $coreByStore[$store->id]
                    ->concat($extras)
                    ->sortBy('id')
                    ->values();

                $roles = $anomalyRolesByStore[$store->id];
                $rows = [];
                $currentWeekPrices[$store->id] = [];

                foreach ($selectedBulletins as $bulletin) {
                    $reference = $resolvedReferences[$bulletin->id];
                    $refValue = (float) $reference['value'];
                    $previous = $previousWeekPrices[$store->id][$bulletin->id] ?? null;
                    $role = $roles[$bulletin->id] ?? 'clean';
                    $commodityIndex = (int) ($indexByBulletinId[$bulletin->id] ?? 0);

                    $price = $this->computeItemPrice(
                        $role,
                        $refValue,
                        $previous,
                        $weekIndex,
                        $storeIndex,
                        $commodityIndex
                    );

                    $variance = round((($price - $refValue) / $refValue) * 100, 2);
                    $breachesReference = $price > $refValue;
                    $previousVariance = $previous !== null && $previous > 0
                        ? round((($price - $previous) / $previous) * 100, 2)
                        : null;
                    $isSpike = $previous !== null && $previous > 0
                        && $price > $previous * (1 + MonitoringRecordItem::PREVIOUS_PRICE_THRESHOLD / 100);
                    $findingBasis = $breachesReference
                        ? $reference['type']
                        : ($isSpike ? MonitoringRecordItem::SPIKE_BASIS : null);

                    $rows[] = [
                        'bulletin' => $bulletin,
                        'price' => $price,
                        'previous' => $previous,
                        'variance' => $variance,
                        'previous_variance' => $previousVariance,
                        'is_spike' => $isSpike,
                        'finding_basis' => $findingBasis,
                        'anomaly' => $breachesReference || $isSpike,
                        'reference' => $reference,
                    ];

                    $currentWeekPrices[$store->id][$bulletin->id] = $price;
                }

                $expected[$weekIndex][$store->id] = $rows;
            }

            $previousWeekPrices = $currentWeekPrices;
        }

        return $expected;
    }

    private function targetItemCount(int $weekIndex, int $storeIndex, int $catalogCount): int
    {
        $poolIndex = ($weekIndex * 3 + $storeIndex) % count(self::ITEM_COUNT_POOL);

        return min(self::ITEM_COUNT_POOL[$poolIndex], $catalogCount);
    }

    private function computeItemPrice(
        string $role,
        float $refValue,
        ?float $previous,
        int $weekIndex,
        int $storeIndex,
        int $commodityIndex
    ): float {
        $tick = $this->priceTick($refValue);
        $isOddWeek = ($weekIndex % 2) === 1;

        if ($role === 'type1_srp_only') {
            // Above SRP, but never >10% above previous week's price
            if ($previous !== null && $previous > $refValue) {
                return $previous;
            }
            $price = $this->shelfPrice($refValue * 1.12);
            if ($price <= $refValue * 1.10) {
                $price = round($refValue + $tick * 2, 2);
            }

            return $price;
        }

        if ($role === 'type2_spike_only') {
            // Even weeks: discounted price (~0.82 * SRP)
            // Odd weeks: jumps back to SRP (within SRP, but >10% above the discounted previous week)
            if (! $isOddWeek) {
                $discounted = $this->shelfPrice($refValue * 0.82);

                return min($discounted, round($refValue - $tick * 2, 2));
            }

            $price = round(floor($refValue / $tick) * $tick, 2);
            if ($previous !== null && $price <= $previous * 1.10) {
                $price = $refValue;
            }

            return $price;
        }

        if ($role === 'type3_both') {
            // Even weeks: compliant shelf price (~0.96 * SRP)
            // Odd weeks: jumps to ~1.15 * SRP (both above SRP AND >10% above previous week)
            if (! $isOddWeek) {
                $clean = $this->shelfPrice($refValue * 0.96);

                return min($clean, $refValue);
            }

            $price = $this->shelfPrice($refValue * 1.15);
            if ($price <= $refValue * 1.10) {
                $price = round($refValue * 1.12 + $tick, 2);
            }
            if ($previous !== null && $price <= $previous * 1.10) {
                $price = round($previous * 1.14 + $tick, 2);
            }

            return $price;
        }

        // Clean item: always <= refValue and never > previous * 1.10
        $factor = [0.96, 0.98, 1.00][($commodityIndex + $storeIndex) % 3];
        $price = $this->shelfPrice($refValue * $factor);
        if ($price > $refValue) {
            $price = round(floor($refValue / $tick) * $tick, 2);
        }
        if ($previous !== null && $price > $previous * 1.10) {
            $price = $previous;
        }

        return $price;
    }

    private function visitLocation(Store $store, string $date): array
    {
        if ($store->store_name === self::OFF_PIN_STORE && $date === self::OFF_PIN_DATE) {
            // ~295m northeast of registered pin so (distance - accuracy) > 150m in GIS Visit Check
            return [
                round((float) $store->latitude + 0.0022, 7),
                round((float) $store->longitude + 0.0015, 7),
                8.0,
            ];
        }

        return [
            round((float) $store->latitude + $this->coordinateOffset($store->id, $date, 'lat'), 7),
            round((float) $store->longitude + $this->coordinateOffset($store->id, $date, 'lng'), 7),
            (float) (5 + (hexdec(substr(hash('sha256', "accuracy|{$date}|{$store->id}"), 0, 2)) % 8)),
        ];
    }

    private function existingDatasetIsComplete(
        Collection $stores,
        array $expected,
        string $officerHash,
        string $representativeHash
    ): bool {
        $records = MonitoringRecord::query()
            ->where('client_version', self::CLIENT_VERSION)
            ->where('status', 'accepted')
            ->withCount('items')
            ->get()
            ->keyBy('client_uuid');

        if ($records->isEmpty()) {
            return false;
        }

        $expectedTotalRecords = $stores->count() * count(self::TARGET_DATES);
        if ($records->count() !== $expectedTotalRecords) {
            throw new RuntimeException('A partial capstone 2-month monitoring dataset already exists.');
        }

        $disk = (string) config('filesystems.receipt_evidence_disk', 'receipt_evidence');
        $officerPath = "field-monitoring/capstone-demo-8w/officer-{$officerHash}.png";
        $representativePath = "field-monitoring/capstone-demo-8w/representative-{$representativeHash}.png";
        if (! Storage::disk($disk)->exists($officerPath) || ! Storage::disk($disk)->exists($representativePath)) {
            throw new RuntimeException('Existing capstone 2-month signature evidence is missing from storage.');
        }

        foreach (self::TARGET_DATES as $weekIndex => $date) {
            foreach ($stores as $store) {
                $uuid = $this->clientUuid($weekIndex, $store->id);
                $record = $records->get($uuid);
                if (! $record
                    || $record->items_count !== count($expected[$weekIndex][$store->id])
                    || $record->officer_signature_sha256 !== $officerHash
                    || $record->representative_signature_sha256 !== $representativeHash) {
                    throw new RuntimeException("Existing capstone 2-month dataset differs for store {$store->store_name} on {$date}.");
                }
            }
        }

        return true;
    }

    private function lockApcPreparation(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(?)', [20260901]);
        }
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

    private function visitAt(string $date, int $storeIndex): CarbonImmutable
    {
        return CarbonImmutable::parse($date.' '.self::VISIT_TIMES[$storeIndex], 'Asia/Manila')->utc();
    }

    private function clientUuid(int $weekIndex, int $storeId): string
    {
        return sprintf('20261101-%04d-5000-8000-%012d', $weekIndex + 1, $storeId);
    }

    private function coordinateOffset(int $storeId, string $date, string $axis): float
    {
        return (hexdec(substr(hash('sha256', "{$axis}|{$date}|{$storeId}"), 0, 2)) % 9 - 4) / 100000;
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
