<?php

namespace App\Models;

use App\Services\CommodityImageStorage;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorRegistration extends Model
{
    protected $fillable = [
        'user_id',
        'store_id',
        'store_name',
        'owner_name',
        'representative_title',
        'dti_sec_number',
        'address',
        'latitude',
        'longitude',
        'image_path',
        'status',
        'rejection_reason',
        'submitted_at',
        'reviewed_at',
        'reviewed_by',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'submitted_at' => 'datetime',
        'reviewed_at' => 'datetime',
    ];

    protected function imagePath(): Attribute
    {
        return Attribute::get(fn (?string $value) => app(CommodityImageStorage::class)->publicUrl($value));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'store_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
