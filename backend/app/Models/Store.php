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
        'image_path',
        'recidivism_index',
        'is_active',
        'is_verified',
        'is_public',
        'vendor_user_id',
        'verified_at',
        'verified_by',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'recidivism_index' => 'integer',
        'is_active' => 'boolean',
        'is_verified' => 'boolean',
        'is_public' => 'boolean',
        'verified_at' => 'datetime',
    ];

    public function inspections(): HasMany
    {
        return $this->hasMany(TemporalInspection::class);
    }

    public function monitoringRecords(): HasMany
    {
        return $this->hasMany(MonitoringRecord::class);
    }

    public function latestMonitoringRecord()
    {
        return $this->hasOne(MonitoringRecord::class)->where('status', 'accepted')->latestOfMany('finalized_at');
    }

    public function verificationRequests(): HasMany
    {
        return $this->hasMany(FieldVerificationRequest::class);
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
