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
    /**
     * Serializes preparation and activation with SRP changes that touch a commodity's key or unit, until the transaction ends.
     * Take it first, before any row lock, so every holder locks in the same order. PostgreSQL only: other drivers get no lock.
     */
    public static function lock(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::select('SELECT pg_advisory_xact_lock(?)', [20260901]);
        }
    }

    public function prepare(RegulatoryEmergency $emergency, User $admin): RegulatoryEmergency
    {
        return DB::transaction(function () use ($emergency, $admin) {
            self::lock();
            // Same row lock as activation: a refresh admitted while the declaration was a draft must not replace the
            // candidates of a declaration that was activated in the meantime.
            $emergency = RegulatoryEmergency::query()->lockForUpdate()->findOrFail($emergency->id);
            abort_unless($emergency->status === 'draft', 422, 'Only a draft declaration can be prepared.');
            $snapshot = $this->snapshot($emergency);

            $emergency->candidates()->delete();
            foreach ($snapshot['rows'] as $row) {
                RegulatoryPriceCandidate::create($row);
            }
            $emergency->update([
                'source_week_starts_at' => $snapshot['cutoff']['starts_at'],
                'source_week_ends_at' => $snapshot['cutoff']['ends_at'],
                'preparation_hash' => $snapshot['hash'],
                'prepared_at' => now(),
                'prepared_by' => $admin->id,
            ]);

            return $emergency->fresh('candidates');
        });
    }

    /** The bulletin in effect on the declaration date for each Price Freeze-covered product, ordered by commodity key. */
    public function coveredBulletins(RegulatoryEmergency $emergency): Collection
    {
        $date = CarbonImmutable::parse($emergency->starts_on, MonitoringWeek::TIMEZONE)->toDateString();

        return SrpBulletin::query()->whereNotNull('commodity_key')->whereDate('effective_date', '<=', $date)
            ->orderBy('commodity_key')->latest('effective_date')->latest('id')->get()
            ->unique('commodity_key')->where('price_freeze_applicable', true)
            ->sortBy('commodity_key')->values();
    }

    /** Covered products with no usable observation: their SRP is held as the Price Freeze ceiling. */
    public function srpFallbacks(Collection $coveredBulletins, Collection $candidateKeys): Collection
    {
        return $coveredBulletins->whereNotIn('commodity_key', $candidateKeys->all())->map(fn (SrpBulletin $bulletin) => [
            'commodity_key' => $bulletin->commodity_key, 'commodity_name' => $bulletin->commodity_name,
            'unit' => $bulletin->unit, 'srp_id' => $bulletin->id, 'srp_price' => (float) $bulletin->baseline_price,
        ])->values();
    }

    /** Inclusive Manila dates of each candidate's own source week, keyed by candidate id. */
    public function candidateWeeks(Collection $candidates): Collection
    {
        $finalizedAt = MonitoringRecordItem::query()->whereIn('id', $candidates->map(fn ($candidate) => $candidate->source_item_ids[0]))
            ->with('record:id,finalized_at')->get()->mapWithKeys(fn ($item) => [$item->id => $item->record->finalized_at]);

        return $candidates->mapWithKeys(function (RegulatoryPriceCandidate $candidate) use ($finalizedAt) {
            $observedAt = $finalizedAt->get($candidate->source_item_ids[0]);
            $week = $observedAt ? MonitoringWeek::for($observedAt) : null;

            return [$candidate->id => $week ? [
                'starts_on' => $week['starts_at']->setTimezone(MonitoringWeek::TIMEZONE)->toDateString(),
                'ends_on' => $week['ends_at']->setTimezone(MonitoringWeek::TIMEZONE)->subDay()->toDateString(),
            ] : null];
        });
    }

    /**
     * Everything one preparation is made of: the cutoff week, the APC candidate rows, the SRP fallbacks and the hash over both.
     * Activation writes official prices from a single call, so the reviewed hash and the written values cannot diverge.
     */
    public function snapshot(RegulatoryEmergency $emergency): array
    {
        $localStart = CarbonImmutable::parse($emergency->starts_on, MonitoringWeek::TIMEZONE)->startOfDay();
        $cutoff = MonitoringWeek::for($localStart->subWeek());
        $bulletins = $this->coveredBulletins($emergency)->keyBy('commodity_key');
        // A revision keeps the commodity key but may change the unit, and an item has no unit of its own: an observation counts
        // only when its bulletin's unit is the one in effect on the declaration date.
        $unit = fn (?string $value) => mb_strtolower(trim((string) $value));
        // ponytail: loads every qualifying observation of the covered products up to the cutoff and picks each product's latest
        // week in PHP (a few hundred rows today). Move the "latest week per product" step into SQL if history grows large.
        $observations = MonitoringRecordItem::query()
            ->whereHas('bulletin', fn ($query) => $query->whereIn('commodity_key', $bulletins->keys()))
            ->whereHas('record', fn ($query) => $query
                ->where('status', 'accepted')->whereNull('field_verification_request_id')
                ->where('protocol_mode', 'standard')
                ->where('finalized_at', '<', $cutoff['ends_at']))
            ->with(['bulletin:id,commodity_key,unit', 'record:id,store_id,finalized_at'])->orderBy('id')->get()
            ->filter(fn ($item) => $unit($item->bulletin->unit) === $unit($bulletins[$item->bulletin->commodity_key]->unit))
            ->groupBy('bulletin.commodity_key');
        $rows = $bulletins->keys()->map(function (string $commodityKey) use ($emergency, $observations) {
            $items = $observations->get($commodityKey);
            if (! $items) {
                return null;
            }
            $week = MonitoringWeek::for($items->max('record.finalized_at'));

            return $this->candidateAttributes($emergency, $commodityKey,
                $items->filter(fn ($item) => $item->record->finalized_at >= $week['starts_at'])->values());
        })->filter()->values();
        $fallbacks = $this->srpFallbacks($bulletins->values(), $rows->pluck('commodity_key'));
        $hash = hash('sha256', json_encode([
            $rows->map(fn ($row) => [$row['commodity_key'], $row['dataset_hash'], $row['computed_apc_price']])->all(),
            $fallbacks->map(fn ($row) => [$row['commodity_key'], $row['srp_id'], $row['srp_price']])->all(),
        ], JSON_PRESERVE_ZERO_FRACTION));

        return ['cutoff' => $cutoff, 'rows' => $rows, 'fallbacks' => $fallbacks, 'hash' => $hash];
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
