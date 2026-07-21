<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConsumerReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'report_reference',
        'tracking_token_hash',
        'store_id',
        'submission_uuid',
        'capture_session_id',
        'image_hash',
        'image_vault_path',
        'redacted_image_path',
        'raw_ocr_json',
        'consumer_confirmed_json',
        'evaluator_confirmed_json',
        'status',
        'privacy_notice_version',
        'user_ip',
        'user_agent',
    ];

    protected $casts = [
        'raw_ocr_json' => 'array',
        'consumer_confirmed_json' => 'array',
        'evaluator_confirmed_json' => 'array',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }

    public function captureSession()
    {
        return $this->belongsTo(CaptureSession::class);
    }

    public function statusHistories()
    {
        return $this->hasMany(ReportStatusHistory::class)->orderBy('created_at', 'asc');
    }
}
