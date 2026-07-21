<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReportStatusHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'consumer_report_id',
        'previous_status',
        'new_status',
        'public_message',
        'internal_notes',
        'actor_type',
        'actor_id',
    ];

    public function consumerReport()
    {
        return $this->belongsTo(ConsumerReport::class);
    }
}
