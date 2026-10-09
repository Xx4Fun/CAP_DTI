<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SrpBulletin extends Model
{
    use HasFactory;

    protected $fillable = [
        'commodity_name',
        'image_path',
        'category',
        'unit',
        'regulatory_classification',
        'baseline_price',
        'effective_date',
        'is_active',
        'price_freeze_applicable',
        'price_freeze_treatment',
        'commodity_key',
        'source_reference',
        'created_by',
    ];

    protected $casts = [
        'baseline_price' => 'float',
        'effective_date' => 'date',
        'is_active' => 'boolean',
        'price_freeze_applicable' => 'boolean',
    ];

    /**
     * Bulletin rows observing the same commodity at the same unit. A prior observation is comparable only across
     * these: a revision keeps commodity_key but may change unit (SrpRevisionService::proposedAttributes), and a
     * different package size is a different quantity, not a price movement.
     */
    public static function comparableIds(self $bulletin): array
    {
        if ($bulletin->commodity_key === null) {
            return [$bulletin->id];
        }

        return self::query()->where('commodity_key', $bulletin->commodity_key)
            ->get(['id', 'unit'])
            ->filter(fn (self $row) => self::normalizeUnit($row->unit) === self::normalizeUnit($bulletin->unit))
            ->pluck('id')->all();
    }

    /** Group identity shared by the server lookup and the field PWA's previous-price map. */
    public static function comparabilityKey(?string $commodityKey, ?string $unit, int $srpId): string
    {
        return $commodityKey === null ? "id:$srpId" : $commodityKey.'|'.self::normalizeUnit($unit);
    }

    /** Same normalization SrpRevisionService::ensureFrozenUnitKept compares units with. */
    public static function normalizeUnit(?string $unit): string
    {
        return mb_strtolower(trim((string) $unit));
    }

    public function aliases(): HasMany
    {
        return $this->hasMany(ItemAlias::class, 'srp_bulletin_id');
    }

    public function inspections(): HasMany
    {
        return $this->hasMany(TemporalInspection::class, 'srp_id');
    }
}
