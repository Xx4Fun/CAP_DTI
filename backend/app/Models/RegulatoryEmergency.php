<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RegulatoryEmergency extends Model
{
    protected $fillable = [
        'location', 'starts_on', 'ends_on', 'declaration_reference', 'status',
        'active_scope_key', 'confirmed_at', 'responsible_admin_id',
        'source_week_starts_at', 'source_week_ends_at', 'preparation_hash',
        'prepared_at', 'prepared_by',
    ];

    protected $casts = [
        'starts_on' => 'date', 'ends_on' => 'date', 'confirmed_at' => 'datetime',
        'source_week_starts_at' => 'datetime', 'source_week_ends_at' => 'datetime',
        'prepared_at' => 'datetime',
    ];

    public function candidates(): HasMany
    {
        return $this->hasMany(RegulatoryPriceCandidate::class, 'regulatory_emergency_id');
    }

    public function priceRecords(): HasMany
    {
        return $this->hasMany(RegulatoryPriceRecord::class, 'regulatory_emergency_id');
    }
}
