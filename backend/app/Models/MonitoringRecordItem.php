<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class MonitoringRecordItem extends Model
{
    /** regulatory_findings.source_type for a DTI decision on a field monitoring item. */
    public const FINDING_SOURCE = 'monitoring_record_item';

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

    /** DTI's decision on this item (no action, or a notice closure), if any. */
    public function finding(): HasOne
    {
        return $this->hasOne(RegulatoryFinding::class, 'source_id')->where('source_type', self::FINDING_SOURCE);
    }

    /** Flagged with an available captured reference: an item a notice may cite. */
    public function scopeEligible($query)
    {
        return $query->where('is_anomaly', true)->where('reference_status', 'available')->whereNotNull('reference_value');
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
