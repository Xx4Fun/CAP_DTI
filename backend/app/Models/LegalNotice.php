<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LegalNotice extends Model
{
    use HasFactory;

    /** Durable private disk for official PDFs and notice attachments (S3 in production). */
    public const DOCUMENT_DISK = 'legal_documents';

    protected $fillable = [
        'store_id', 'monitoring_record_id', 'preceding_notice_id', 'notice_type', 'prepared_by', 'issued_by',
        'control_number', 'policy_version', 'source_snapshot', 'draft_payload', 'internal_justification',
        'pdf_disk', 'pdf_file_path', 'pdf_sha256', 'status', 'issued_at', 'intended_delivery_method',
        'delivery_state', 'delivery_details', 'delivered_at', 'due_date_timestamp', 'response_text',
        'response_reason_category', 'response_certified_at', 'response_received_at', 'closed_at', 'cancelled_at',
        'vendor_user_id', 'deadline_rules', 'response_channel', 'signatory_snapshot', 'outcome', 'outcome_reason',
    ];

    protected $hidden = ['pdf_disk', 'pdf_file_path'];

    protected $casts = [
        'source_snapshot' => 'array', 'draft_payload' => 'array', 'delivery_details' => 'array', 'deadline_rules' => 'array', 'signatory_snapshot' => 'array',
        'issued_at' => 'datetime', 'delivered_at' => 'datetime', 'due_date_timestamp' => 'datetime',
        'response_received_at' => 'datetime', 'response_certified_at' => 'datetime', 'closed_at' => 'datetime', 'cancelled_at' => 'datetime',
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
    public function audience(): BelongsTo { return $this->belongsTo(User::class, 'vendor_user_id'); }

    /** Only non-legacy notices issued to this exact vendor, and still on a store linked to them, reach the portal. */
    public function scopeVisibleToVendor($query, User $vendor)
    {
        return $query->where('legal_notices.vendor_user_id', $vendor->id)->whereNotNull('deadline_rules')
            ->whereIn('store_id', Store::query()->where('vendor_user_id', $vendor->id)->select('id'))
            ->whereIn('status', ['issued', 'response_received', 'closed', 'cancelled'])->whereNotNull('issued_at');
    }
}
