<?php

namespace App\Models;

use App\Services\CommodityImageStorage;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

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

    /** The stored object key reaches every client as a loadable URL (or null); see CommodityImageStorage. */
    protected function imagePath(): Attribute
    {
        return Attribute::get(fn (?string $value) => app(CommodityImageStorage::class)->publicUrl($value));
    }

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
        // Status filters must sit inside the ofMany aggregate: an outer where lets a later non-accepted visit hide the latest accepted one.
        return $this->hasOne(MonitoringRecord::class)->ofMany(
            ['finalized_at' => 'max', 'id' => 'max'],
            fn ($query) => $query->where('status', 'accepted'),
        );
    }

    public function routineMonitoringRecords(): HasMany
    {
        return $this->monitoringRecords()->where('status', 'accepted')->whereNull('field_verification_request_id');
    }

    public function latestRoutineMonitoringRecord(): HasOne
    {
        return $this->hasOne(MonitoringRecord::class)->ofMany(
            ['finalized_at' => 'max', 'id' => 'max'],
            fn ($query) => $query->where('status', 'accepted')->whereNull('field_verification_request_id'),
        );
    }

    public function verificationRequests(): HasMany
    {
        return $this->hasMany(FieldVerificationRequest::class);
    }

    public function activeVerificationRequest(): HasOne
    {
        return $this->hasOne(FieldVerificationRequest::class)->whereIn('status', ['open', 'claimed'])->latestOfMany();
    }

    public function legalNotices(): HasMany
    {
        return $this->hasMany(LegalNotice::class);
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'vendor_user_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(StoreMessage::class);
    }

    public function citizenTips(): HasMany
    {
        return $this->hasMany(CitizenTip::class);
    }
}
