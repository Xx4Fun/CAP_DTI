<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReceiptEvidenceAsset extends Model
{
    use HasFactory;

    protected $fillable = [
        'receipt_evidence_bundle_id',
        'kind',
        'sequence',
        'disk',
        'path',
        'original_filename',
        'mime_type',
        'size_bytes',
        'sha256',
        'metadata_json',
    ];

    protected $casts = [
        'metadata_json' => 'array',
    ];

    public function bundle()
    {
        return $this->belongsTo(ReceiptEvidenceBundle::class, 'receipt_evidence_bundle_id');
    }
}
