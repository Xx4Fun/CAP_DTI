<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class MonitoringRecordItem extends Model
{
    /** regulatory_findings.source_type for a DTI decision on a field monitoring item. */
    public const FINDING_SOURCE = 'monitoring_record_item';

    /** finding_basis when the flag rests on the price rising more than the threshold over this store's last verified price. */
    public const SPIKE_BASIS = 'previous_price_spike';

    /** Percent over the store's previous verified price that makes an increase reviewable (DTI interview). */
    public const PREVIOUS_PRICE_THRESHOLD = 10;

    /** The rule this flag rests on. Rows accepted before finding_basis existed fall back to the reference kind. */
    public function basis(): ?string
    {
        return $this->finding_basis ?? $this->reference_type;
    }

    protected $fillable = [
        'monitoring_record_id', 'srp_id', 'recorded_price', 'baseline_price',
        'previous_price', 'variance_percent', 'is_anomaly', 'reference_status',
        'reference_type', 'reference_label', 'reference_value', 'reference_source',
        'reference_effective_date', 'reference_source_id', 'reference_version',
        'previous_price_variance_percent', 'is_previous_price_spike', 'finding_basis',
    ];

    protected $casts = [
        'recorded_price' => 'float', 'baseline_price' => 'float', 'previous_price' => 'float',
        'variance_percent' => 'float', 'is_anomaly' => 'boolean', 'reference_value' => 'float',
        'reference_effective_date' => 'date',
        'previous_price_variance_percent' => 'float', 'is_previous_price_spike' => 'boolean',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(MonitoringRecord::class, 'monitoring_record_id');
    }

    public function bulletin(): BelongsTo
    {
        return $this->belongsTo(SrpBulletin::class, 'srp_id');
    }

    /** DTI's decision on this item (no action, or a notice closure), if any. */
    public function finding(): HasOne
    {
        return $this->hasOne(RegulatoryFinding::class, 'source_id')->where('source_type', self::FINDING_SOURCE);
    }

    /**
     * Flagged with the comparison value its basis is cited against: an item a notice may cite.
     * A spike is cited against the store's previous price, so it stands even where the reference was unavailable.
     */
    public function scopeEligible($query)
    {
        return $query->where('is_anomaly', true)->where(fn ($basis) => $basis
            ->where(fn ($spike) => $spike->where('finding_basis', self::SPIKE_BASIS)->whereNotNull('previous_price'))
            ->orWhere(fn ($reference) => $reference
                ->where(fn ($other) => $other->where('finding_basis', '!=', self::SPIKE_BASIS)->orWhereNull('finding_basis'))
                ->where('reference_status', 'available')->whereNotNull('reference_value')));
    }

    /**
     * Eligible and not yet decided by DTI: no finding row, and not cited by an open notice (that product awaits its notice).
     * One rule for Needs review, no-action and Store Communications.
     */
    public function scopeUndecidedEligible($query)
    {
        return $query->eligible()->whereNotExists(fn ($finding) => $finding->selectRaw('1')->from('regulatory_findings')
            ->where('regulatory_findings.source_type', self::FINDING_SOURCE)
            ->whereColumn('regulatory_findings.source_id', 'monitoring_record_items.id'))
            ->whereNotIn('monitoring_record_items.id', self::citedByOpenNotices());
    }

    /**
     * Item ids cited by draft, issued or answered notices, read from their frozen snapshots in PHP so the rule is the same on
     * SQLite and PostgreSQL. ponytail: loads every open notice's snapshot; open notices are few (one per visit at a time). Add a
     * notice-item pivot if that ever grows large.
     */
    public static function citedByOpenNotices(): array
    {
        return LegalNotice::whereIn('status', ['draft', 'issued', 'response_received'])->pluck('source_snapshot')
            ->flatMap(fn ($snapshot) => collect($snapshot['items'] ?? [])->pluck('id'))->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
