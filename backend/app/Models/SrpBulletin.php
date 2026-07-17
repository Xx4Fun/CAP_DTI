<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SrpBulletin extends Model
{
    use HasFactory;

    protected $fillable = [
        'commodity_name',
        'baseline_price',
        'effective_date',
        'is_active',
    ];

    protected $casts = [
        'baseline_price' => 'float',
        'effective_date' => 'date',
        'is_active' => 'boolean',
    ];

    public function aliases(): HasMany
    {
        return $this->hasMany(ItemAlias::class, 'srp_bulletin_id');
    }

    public function inspections(): HasMany
    {
        return $this->hasMany(TemporalInspection::class, 'srp_id');
    }
}
