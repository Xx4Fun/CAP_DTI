<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebPushSubscription extends Model
{
    use HasFactory;

    protected $fillable = [
        'endpoint_hash',
        'subscription_json',
        'user_agent',
        'permission_granted_at',
        'last_success_at',
        'revoked_at',
    ];

    protected $casts = [
        'subscription_json' => 'encrypted:array',
        'permission_granted_at' => 'datetime',
        'last_success_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function reports()
    {
        return $this->belongsToMany(ConsumerReport::class, 'consumer_report_push_subscriptions')->withTimestamps();
    }
}
