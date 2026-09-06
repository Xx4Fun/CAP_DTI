<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LegalNotice extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id', 'monitoring_record_id', 'preceding_notice_id', 'notice_type', 'prepared_by', 'issued_by',
        'control_number', 'policy_version', 'source_snapshot', 'draft_payload', 'internal_justification',
        'pdf_disk', 'pdf_file_path', 'pdf_sha256', 'status', 'issued_at', 'intended_delivery_method',
        'delivery_state', 'delivery_details', 'delivered_at', 'due_date_timestamp', 'response_text',
        'response_received_at', 'closed_at', 'cancelled_at',
    ];

    protected $hidden = ['pdf_disk', 'pdf_file_path'];

    protected $casts = [
        'source_snapshot' => 'array', 'draft_payload' => 'array', 'delivery_details' => 'array',
        'issued_at' => 'datetime', 'delivered_at' => 'datetime', 'due_date_timestamp' => 'datetime',
        'response_received_at' => 'datetime', 'closed_at' => 'datetime', 'cancelled_at' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function monitoringRecord(): BelongsTo { return $this->belongsTo(MonitoringRecord::class); }
    public function precedingNotice(): BelongsTo { return $this->belongsTo(self::class, 'preceding_notice_id'); }
    public function preparer(): BelongsTo { return $this->belongsTo(User::class, 'prepared_by'); }
    public function issuer(): BelongsTo { return $this->belongsTo(User::class, 'issued_by'); }
    public function attachments(): HasMany { return $this->hasMany(LegalNoticeAttachment::class); }
}
