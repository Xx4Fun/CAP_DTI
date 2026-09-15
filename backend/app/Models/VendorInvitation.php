<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VendorInvitation extends Model
{
    protected $fillable = ['store_id', 'email', 'token_hash', 'status', 'expires_at', 'invited_by', 'accepted_by', 'accepted_at', 'cancelled_at'];
    protected $hidden = ['token_hash'];
    protected $casts = ['expires_at' => 'datetime', 'accepted_at' => 'datetime', 'cancelled_at' => 'datetime'];

    public function store(): BelongsTo { return $this->belongsTo(Store::class); }
    public function inviter(): BelongsTo { return $this->belongsTo(User::class, 'invited_by'); }
}
