<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CaptureSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'session_uuid',
        'store_id',
        'token_hash',
        'expires_at',
        'is_used',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'is_used' => 'boolean',
    ];

    public function store()
    {
        return $this->belongsTo(Store::class);
    }
}
