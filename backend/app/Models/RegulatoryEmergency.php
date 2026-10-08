<?php

namespace App\Models;

use App\Support\MonitoringWeek;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RegulatoryEmergency extends Model
{
    protected $fillable = [
        'location', 'starts_on', 'ends_on', 'declaration_reference', 'status',
        'active_scope_key', 'confirmed_at', 'responsible_admin_id',
        'source_week_starts_at', 'source_week_ends_at', 'preparation_hash',
        'prepared_at', 'prepared_by', 'ended_at',
    ];

    protected $casts = [
        'starts_on' => 'date', 'ends_on' => 'date', 'confirmed_at' => 'datetime',
        'source_week_starts_at' => 'datetime', 'source_week_ends_at' => 'datetime',
        'prepared_at' => 'datetime', 'ended_at' => 'immutable_datetime',
    ];

    public function setEndedAtAttribute($value): void
    {
        // Eloquent's default date serialization drops microseconds; retain them for this cutoff only.
        $this->attributes['ended_at'] = $value === null ? null : CarbonImmutable::parse($value)->utc()->format('Y-m-d H:i:s.u');
    }

    public function scopeEffectiveAt(Builder $query, CarbonInterface|string $at): void
    {
        $instant = CarbonImmutable::parse($at, MonitoringWeek::TIMEZONE);
        $date = $instant->setTimezone(MonitoringWeek::TIMEZONE)->toDateString();
        $utc = $instant->utc()->format('Y-m-d H:i:s.u');
        $query->whereIn('status', ['active', 'ended'])
            ->whereNotNull('confirmed_at')->where('confirmed_at', '<=', $utc)
            ->whereDate('starts_on', '<=', $date)
            ->where(fn ($dates) => $dates->whereNull('ends_on')->orWhereDate('ends_on', '>=', $date))
            ->where(fn ($cutoff) => $cutoff->whereNull('ended_at')->orWhere('ended_at', '>', $utc));
    }

    public function candidates(): HasMany
    {
        return $this->hasMany(RegulatoryPriceCandidate::class, 'regulatory_emergency_id');
    }

    public function priceRecords(): HasMany
    {
        return $this->hasMany(RegulatoryPriceRecord::class, 'regulatory_emergency_id');
    }
}
