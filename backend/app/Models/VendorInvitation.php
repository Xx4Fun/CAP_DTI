<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VendorInvitation extends Model
{
    protected $fillable = ['store_id', 'email', 'token_hash', 'status', 'expires_at', 'invited_by', 'accepted_by', 'accepted_at', 'cancelled_at'];
    protected $hidden = ['token_hash'];
    protected $casts = ['expires_at' => 'datetime', 'accepted_at' => 'datetime', 'cancelled_at' => 'datetime'];
}
