<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RegulatoryFinding extends Model
{
    protected $fillable = ['store_id', 'srp_bulletin_id', 'source_type', 'source_id', 'observed_price', 'observed_at', 'decision', 'reason', 'decided_by', 'decided_at',
        'reference_type', 'reference_source_id', 'reference_value', 'reference_effective_date', 'reference_label', 'reference_source', 'reference_version'];
    protected $casts = ['observed_price' => 'float', 'observed_at' => 'datetime', 'decided_at' => 'datetime',
        'reference_value' => 'float', 'reference_effective_date' => 'date'];

    public function decider(): BelongsTo { return $this->belongsTo(User::class, 'decided_by'); }
}
