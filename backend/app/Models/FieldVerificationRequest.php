<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use LogicException;

class FieldVerificationRequest extends Model
{
    protected $fillable = [
        'consumer_report_id', 'source_type', 'store_id', 'requested_by', 'claimed_by', 'status',
        'reason', 'context_json', 'requested_at', 'claimed_at', 'released_at',
        'completed_at', 'cancelled_at',
    ];

    protected $casts = [
        'context_json' => 'array', 'requested_at' => 'datetime', 'claimed_at' => 'datetime',
        'released_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::updating(function (self $request) {
            if ($request->isDirty('context_json')) {
                throw new LogicException('Verification request context is immutable.');
            }
        });
    }

    public function report(): BelongsTo { return $this->belongsTo(ConsumerReport::class, 'consumer_report_id'); }
    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function requester(): BelongsTo { return $this->belongsTo(User::class, 'requested_by'); }
    public function claimant(): BelongsTo { return $this->belongsTo(User::class, 'claimed_by'); }
    public function monitoringRecord(): HasOne { return $this->hasOne(MonitoringRecord::class); }
}
