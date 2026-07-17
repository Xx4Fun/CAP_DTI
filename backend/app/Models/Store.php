<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Store extends Model
{
    use HasFactory;

    protected $fillable = [
        'dti_sec_number',
        'store_name',
        'owner_name',
        'latitude',
        'longitude',
        'address',
        'recidivism_index',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'recidivism_index' => 'integer',
    ];

    public function inspections(): HasMany
    {
        return $this->hasMany(TemporalInspection::class);
    }

    public function legalNotices(): HasMany
    {
        return $this->hasMany(LegalNotice::class);
    }

    public function citizenTips(): HasMany
    {
        return $this->hasMany(CitizenTip::class);
    }
}
