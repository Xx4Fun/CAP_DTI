<?php

namespace App\Services\Admin;

use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryEmergency;
use App\Models\RegulatoryPriceCandidate;
use App\Models\SrpBulletin;
use App\Models\User;
use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class EmergencyApcPreparationService
{
    public function prepare(RegulatoryEmergency $emergency, User $admin): RegulatoryEmergency
    {
        return DB::transaction(function () use ($emergency, $admin) {
            $snapshot = $this->snapshot($emergency);

            $emergency->candidates()->delete();
            foreach ($snapshot['rows'] as $row) {
                RegulatoryPriceCandidate::create($row);
            }
            $emergency->update([
                'source_week_starts_at' => $snapshot['source_week']['starts_at'],
                'source_week_ends_at' => $snapshot['source_week']['ends_at'],
                'preparation_hash' => $snapshot['hash'],
                'prepared_at' => now(),
                'prepared_by' => $admin->id,
            ]);

            return $emergency->fresh('candidates');
        });
    }

    public function currentHash(RegulatoryEmergency $emergency): string
    {
        return $this->snapshot($emergency)['hash'];
    }

    public function coveredCommodityKeys(RegulatoryEmergency $emergency): Collection
    {
        $date = CarbonImmutable::parse($emergency->starts_on, MonitoringWeek::TIMEZONE)->toDateString();

        return SrpBulletin::query()->whereNotNull('commodity_key')->whereDate('effective_date', '<=', $date)
            ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
            ->unique('commodity_key')->where('price_freeze_applicable', true)
            ->pluck('commodity_key')->sort()->values();
    }

    private function snapshot(RegulatoryEmergency $emergency): array
    {
        $localStart = CarbonImmutable::parse($emergency->starts_on, MonitoringWeek::TIMEZONE)->startOfDay();
        $sourceWeek = MonitoringWeek::for($localStart->subWeek());
        $rows = $this->coveredCommodityKeys($emergency)->map(function (string $commodityKey) use ($emergency, $sourceWeek) {
            $items = MonitoringRecordItem::query()
                ->whereHas('bulletin', fn ($query) => $query->where('commodity_key', $commodityKey))
                ->whereHas('record', fn ($query) => $query
                    ->where('status', 'accepted')->whereNull('field_verification_request_id')
                    ->where('protocol_mode', 'standard')
                    ->where('finalized_at', '>=', $sourceWeek['starts_at'])
                    ->where('finalized_at', '<', $sourceWeek['ends_at']))
                ->with('record:id,store_id')->orderBy('id')->get();

            return $items->isEmpty() ? null : $this->candidateAttributes($emergency, $commodityKey, $items);
        })->filter()->values();
        $hash = hash('sha256', json_encode($rows->map(fn ($row) => [
            $row['commodity_key'], $row['dataset_hash'], $row['computed_apc_price'],
        ])->all(), JSON_PRESERVE_ZERO_FRACTION));

        return ['source_week' => $sourceWeek, 'rows' => $rows, 'hash' => $hash];
    }

    private function candidateAttributes(RegulatoryEmergency $emergency, string $commodityKey, Collection $items): array
    {
        $prices = $items->map(fn ($item) => (int) round(((float) $item->recorded_price) * 100));
        $minimum = $prices->min();
        $maximum = $prices->max();
        $average = (int) round($prices->sum() / $prices->count(), 0, PHP_ROUND_HALF_UP);
        $apc = (int) round(($minimum + $maximum) / 2, 0, PHP_ROUND_HALF_UP);
        $source = $items->map(fn ($item) => [$item->id, number_format((float) $item->recorded_price, 2, '.', '')])->all();

        return [
            'regulatory_emergency_id' => $emergency->id,
            'commodity_key' => $commodityKey,
            'minimum_price' => $minimum / 100,
            'maximum_price' => $maximum / 100,
            'observed_average_price' => $average / 100,
            'computed_apc_price' => $apc / 100,
            'observation_count' => $items->count(),
            'establishment_count' => $items->pluck('record.store_id')->unique()->count(),
            'source_item_ids' => $items->pluck('id')->all(),
            'dataset_hash' => hash('sha256', json_encode($source)),
        ];
    }
}
