<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LegalNoticeAttachment extends Model
{
    protected $fillable = ['legal_notice_id', 'uploaded_by', 'kind', 'disk', 'path', 'original_name', 'mime_type', 'size_bytes', 'sha256'];

    protected $hidden = ['disk', 'path'];

    public function notice(): BelongsTo { return $this->belongsTo(LegalNotice::class, 'legal_notice_id'); }
    public function uploader(): BelongsTo { return $this->belongsTo(User::class, 'uploaded_by'); }
}
