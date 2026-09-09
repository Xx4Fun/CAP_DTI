<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MonitoringRecordItem extends Model
{
    protected $fillable = [
        'monitoring_record_id', 'srp_id', 'recorded_price', 'baseline_price',
        'previous_price', 'variance_percent', 'is_anomaly', 'reference_status',
        'reference_type', 'reference_label', 'reference_value', 'reference_source',
        'reference_effective_date', 'reference_source_id', 'reference_version',
    ];

    protected $casts = [
        'recorded_price' => 'float', 'baseline_price' => 'float', 'previous_price' => 'float',
        'variance_percent' => 'float', 'is_anomaly' => 'boolean', 'reference_value' => 'float',
        'reference_effective_date' => 'date',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(MonitoringRecord::class, 'monitoring_record_id');
    }

    public function bulletin(): BelongsTo
    {
        return $this->belongsTo(SrpBulletin::class, 'srp_id');
    }
}
