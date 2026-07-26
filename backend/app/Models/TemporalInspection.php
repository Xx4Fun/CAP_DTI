<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TemporalInspection extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'srp_id',
        'recorded_price',
        'is_flagged',
        'inspection_timestamp',
        'sync_timestamp',
        'officer_signature',
        'vendor_signature',
        'validation_status',
        'validated_at',
        'validated_by',
    ];

    protected $casts = [
        'recorded_price' => 'float',
        'is_flagged' => 'boolean',
        'inspection_timestamp' => 'datetime',
        'sync_timestamp' => 'datetime',
        'validated_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function bulletin(): BelongsTo
    {
        return $this->belongsTo(SrpBulletin::class, 'srp_id');
    }
}
