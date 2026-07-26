<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RegulatoryEmergency extends Model
{
    protected $fillable = ['location', 'starts_on', 'ends_on', 'declaration_reference', 'status', 'confirmed_at', 'responsible_admin_id'];
    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'confirmed_at' => 'datetime'];
}
