<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RegulatoryPriceRecord extends Model
{
    protected $fillable = ['regulatory_emergency_id', 'commodity_key', 'price_type', 'authoritative_price', 'effective_from', 'effective_until', 'location', 'declaration_reference', 'source_reference', 'created_by'];
    protected $casts = ['authoritative_price' => 'float', 'effective_from' => 'date', 'effective_until' => 'date'];

    public function emergency()
    {
        return $this->belongsTo(RegulatoryEmergency::class, 'regulatory_emergency_id');
    }
}
