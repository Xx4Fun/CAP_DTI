<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CitizenTip extends Model
{
    use HasFactory;

    protected $fillable = [
        'store_id',
        'extracted_text_json',
        'image_hash_path',
        'status',
    ];

    protected $casts = [
        'extracted_text_json' => 'array',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
