<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class RegulatoryPriceRecord extends Model
{
    protected $fillable = ['regulatory_emergency_id', 'source_candidate_id', 'commodity_key', 'price_type', 'authoritative_price', 'effective_from', 'effective_until', 'location', 'declaration_reference', 'source_reference', 'created_by'];

    protected $casts = ['authoritative_price' => 'float', 'effective_from' => 'date', 'effective_until' => 'date'];

    public function emergency()
    {
        return $this->belongsTo(RegulatoryEmergency::class, 'regulatory_emergency_id');
    }

    /** Official references that can still apply: the declaration was confirmed and the record has not run out. */
    public function scopeStillApplicable(Builder $query): void
    {
        $query->where(fn ($dates) => $dates->whereNull('effective_until')->orWhereDate('effective_until', '>=', now('Asia/Manila')->toDateString()))
            ->whereHas('emergency', fn ($emergency) => $emergency->whereIn('status', ['active', 'ended'])
                ->where(fn ($cutoff) => $cutoff->whereNull('ended_at')->orWhere('ended_at', '>', now('UTC')->format('Y-m-d H:i:s.u'))));
    }
}
