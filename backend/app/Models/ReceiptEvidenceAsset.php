<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

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

    public function hasValidContent(): bool
    {
        $storage = Storage::disk($this->disk);
        if (! $storage->exists($this->path)) {
            return false;
        }
        $stream = $storage->readStream($this->path);
        if (! is_resource($stream)) {
            return false;
        }
        try {
            $context = hash_init('sha256');
            hash_update_stream($context, $stream);

            return hash_equals((string) $this->sha256, hash_final($context));
        } finally {
            fclose($stream);
        }
    }
}
