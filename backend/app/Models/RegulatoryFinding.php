<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RegulatoryFinding extends Model
{
    protected $fillable = ['store_id', 'srp_bulletin_id', 'source_type', 'source_id', 'observed_price', 'observed_at', 'decision', 'reason', 'decided_by', 'decided_at'];
    protected $casts = ['observed_price' => 'float', 'observed_at' => 'datetime', 'decided_at' => 'datetime'];
}
