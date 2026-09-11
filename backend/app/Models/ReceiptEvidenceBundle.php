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
        'consumer_report_id',
        'store_id',
        'capture_mode',
        'attempt_number',
        'processing_status',
        'processing_attempts',
        'extraction_calls',
        'extraction_attempted_at',
        'processing_result_json',
        'processing_started_at',
        'processing_completed_at',
        'failure_code',
    ];

    protected $casts = [
        'processing_result_json' => 'array',
        'extraction_attempted_at' => 'datetime',
        'processing_started_at' => 'datetime',
        'processing_completed_at' => 'datetime',
    ];

    public function captureSession()
    {
        return $this->belongsTo(CaptureSession::class);
    }

    public function report()
    {
        return $this->belongsTo(ConsumerReport::class, 'consumer_report_id');
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
