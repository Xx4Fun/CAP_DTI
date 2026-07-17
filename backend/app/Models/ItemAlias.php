<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ItemAlias extends Model
{
    use HasFactory;

    protected $fillable = [
        'alias_name',
        'srp_bulletin_id',
    ];

    public function bulletin(): BelongsTo
    {
        return $this->belongsTo(SrpBulletin::class, 'srp_bulletin_id');
    }
}
