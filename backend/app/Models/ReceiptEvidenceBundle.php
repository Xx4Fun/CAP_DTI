<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReceiptEvidenceBundle extends Model
{
    use HasFactory;

    protected $fillable = [
        'evidence_uuid',
        'capture_session_id',
        'store_id',
        'capture_mode',
        'processing_status',
        'processing_attempts',
        'processing_result_json',
        'processing_started_at',
        'processing_completed_at',
        'failure_code',
    ];

    protected $casts = [
        'processing_result_json' => 'array',
        'processing_started_at' => 'datetime',
        'processing_completed_at' => 'datetime',
    ];

    public function captureSession()
    {
        return $this->belongsTo(CaptureSession::class);
    }

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function assets()
    {
        return $this->hasMany(ReceiptEvidenceAsset::class)->orderBy('sequence');
    }
}
