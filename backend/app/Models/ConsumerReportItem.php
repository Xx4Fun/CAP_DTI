<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ConsumerReportItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'consumer_report_id',
        'sequence',
        'raw_text',
        'item_name',
        'quantity',
        'unit',
        'observed_price',
        'ocr_confidence',
        'srp_id',
        'consumer_correction_json',
        'consumer_confirmed',
        'evaluator_decision_json',
        'reviewed_by',
        'reviewed_at',
    ];

    protected $casts = [
        'quantity' => 'decimal:3',
        'observed_price' => 'decimal:2',
        'ocr_confidence' => 'float',
        'consumer_correction_json' => 'array',
        'consumer_confirmed' => 'boolean',
        'evaluator_decision_json' => 'array',
        'reviewed_at' => 'datetime',
    ];

    public function report()
    {
        return $this->belongsTo(ConsumerReport::class, 'consumer_report_id');
    }

    public function srp()
    {
        return $this->belongsTo(SrpBulletin::class, 'srp_id');
    }
}
