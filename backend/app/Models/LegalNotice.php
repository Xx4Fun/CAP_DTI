<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LegalNotice extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'notice_type',
        'pdf_file_path',
        'status',
        'due_date_timestamp',
    ];

    protected $casts = [
        'due_date_timestamp' => 'datetime',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
