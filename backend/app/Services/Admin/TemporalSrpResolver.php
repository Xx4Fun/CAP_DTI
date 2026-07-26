<?php

namespace App\Services\Admin;

use App\Models\SrpBulletin;

class TemporalSrpResolver
{
    public function resolve(string $commodityKey, string|\DateTimeInterface $observedAt): ?SrpBulletin
    {
        return SrpBulletin::query()
            ->where('commodity_key', $commodityKey)
            ->whereDate('effective_date', '<=', $observedAt)
            ->orderByDesc('effective_date')
            ->orderByDesc('id')
            ->first();
    }
}
