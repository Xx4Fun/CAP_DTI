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
        'resume_token_hash',
        'store_id',
        'submission_uuid',
        'capture_session_id',
        'receipt_evidence_bundle_id',
        'capture_mode',
        'processing_status',
        'image_hash',
        'image_vault_path',
        'evidence_disk',
        'evidence_version',
        'redacted_image_path',
        'raw_ocr_json',
        'consumer_confirmed_json',
        'evaluator_confirmed_json',
        'status',
        'submitted_at',
        'consumer_confirmed_at',
        'privacy_notice_version',
        'user_ip',
        'user_agent',
    ];

    protected $casts = [
        'raw_ocr_json' => 'array',
        'consumer_confirmed_json' => 'array',
        'evaluator_confirmed_json' => 'array',
        'submitted_at' => 'datetime',
        'consumer_confirmed_at' => 'datetime',
    ];

    /** The consumer's tracking secrets must never reach an API response, admin-facing or otherwise. */
    protected $hidden = ['tracking_token_hash', 'resume_token_hash'];

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

    public function evidenceBundle()
    {
        return $this->belongsTo(ReceiptEvidenceBundle::class, 'receipt_evidence_bundle_id');
    }

    public function evidenceAttempts()
    {
        return $this->hasMany(ReceiptEvidenceBundle::class)->orderBy('attempt_number');
    }

    public function items()
    {
        return $this->hasMany(ConsumerReportItem::class)->orderBy('sequence');
    }

    public function pushSubscriptions()
    {
        return $this->belongsToMany(WebPushSubscription::class, 'consumer_report_push_subscriptions')->withTimestamps();
    }

    /**
     * A report can be referred more than once over its lifetime, so referrals are history.
     * Callers that mean "the one blocking a decision" want activeVerificationRequest().
     */
    public function verificationRequests()
    {
        return $this->hasMany(FieldVerificationRequest::class)->orderByDesc('requested_at')->orderByDesc('id');
    }

    public function activeVerificationRequest()
    {
        return $this->hasOne(FieldVerificationRequest::class)->whereIn('status', ['open', 'claimed']);
    }

    public function latestVerificationRequest()
    {
        return $this->hasOne(FieldVerificationRequest::class)->latestOfMany();
    }

    /** @deprecated Retained so existing callers keep working; prefer the explicit relations above. */
    public function verificationRequest()
    {
        return $this->latestVerificationRequest();
    }
}
