<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MonitoringRecord extends Model
{
    protected $fillable = [
        'client_uuid', 'officer_user_id', 'store_id', 'offline_lease_id', 'status',
        'started_at', 'finalized_at', 'received_at', 'latitude', 'longitude',
        'location_accuracy_meters', 'location_captured_at', 'representative_name',
        'representative_title', 'officer_signature_disk', 'officer_signature_path',
        'officer_signature_sha256', 'representative_signature_disk',
        'representative_signature_path', 'representative_signature_sha256',
        'sync_source', 'client_version', 'protocol_mode', 'protocol_reference',
        'field_verification_request_id',
    ];

    protected $hidden = [
        'officer_signature_disk', 'officer_signature_path',
        'representative_signature_disk', 'representative_signature_path',
    ];

    protected $casts = [
        'started_at' => 'datetime', 'finalized_at' => 'datetime', 'received_at' => 'datetime',
        'location_captured_at' => 'datetime', 'latitude' => 'float', 'longitude' => 'float',
        'location_accuracy_meters' => 'float',
    ];

    public function officer(): BelongsTo { return $this->belongsTo(User::class, 'officer_user_id'); }
    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function items(): HasMany { return $this->hasMany(MonitoringRecordItem::class); }
    public function lease(): BelongsTo { return $this->belongsTo(FieldOfflineLease::class, 'offline_lease_id'); }
    public function verificationRequest(): BelongsTo { return $this->belongsTo(FieldVerificationRequest::class, 'field_verification_request_id'); }
}
