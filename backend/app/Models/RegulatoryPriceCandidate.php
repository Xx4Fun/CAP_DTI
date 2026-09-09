<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegulatoryPriceCandidate extends Model
{
    protected $fillable = [
        'regulatory_emergency_id', 'commodity_key', 'minimum_price', 'maximum_price',
        'observed_average_price', 'computed_apc_price', 'observation_count',
        'establishment_count', 'source_item_ids', 'dataset_hash',
    ];

    protected $casts = [
        'minimum_price' => 'float', 'maximum_price' => 'float',
        'observed_average_price' => 'float', 'computed_apc_price' => 'float',
        'observation_count' => 'integer', 'establishment_count' => 'integer',
        'source_item_ids' => 'array',
    ];

    public function emergency(): BelongsTo
    {
        return $this->belongsTo(RegulatoryEmergency::class, 'regulatory_emergency_id');
    }
}
