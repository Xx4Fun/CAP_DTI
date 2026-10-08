<?php

namespace App\Services\Receipt;

use App\Models\ConsumerReport;
use App\Models\RegulatoryFinding;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Services\Admin\AuditTrailService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class ConsumerReportAssessment
{
    public const CATEGORIES = ['violations', 'confirmed_findings', 'no_violation', 'to_review', 'with_officer', 'rejected'];

    public function __construct(private readonly ReceiptPriceComparison $comparison, private readonly AuditTrailService $audit) {}

    /** One SQL expression owns row categories, filters, and counts on SQLite and PostgreSQL. */
    public static function categorySql(): string
    {
        $assessment = DB::connection()->getQueryGrammar()->wrap('consumer_reports.automatic_assessment_json->category');

        return "CASE
            WHEN consumer_reports.status = 'Referred for field verification' OR EXISTS (
                SELECT 1 FROM field_verification_requests v WHERE v.consumer_report_id = consumer_reports.id AND v.status IN ('open', 'claimed')
            ) THEN 'with_officer'
            WHEN consumer_reports.status = 'Closed' THEN 'rejected'
            WHEN EXISTS (
                SELECT 1 FROM regulatory_findings f WHERE f.decision = 'confirmed' AND (
                    (f.source_type = 'consumer_report' AND f.source_id = consumer_reports.id) OR
                    (f.source_type = 'consumer_report_item' AND f.source_id IN (
                        SELECT i.id FROM consumer_report_items i WHERE i.consumer_report_id = consumer_reports.id
                    ))
                )
            ) THEN 'confirmed_findings'
            WHEN consumer_reports.status = 'Resolved' THEN 'no_violation'
            WHEN consumer_reports.status = 'Under regulatory review' THEN 'violations'
            WHEN consumer_reports.status IN ('Submitted', 'Under initial evaluation') THEN
                CASE WHEN consumer_reports.evaluator_confirmed_json IS NULL AND {$assessment} = 'violations'
                    THEN 'violations' ELSE 'to_review' END
            ELSE 'all' END";
    }

    public function eligible(ConsumerReport $report): bool
    {
        return in_array($report->status, ['Submitted', 'Under initial evaluation'], true)
            && $report->automatic_assessment_json === null
            && $report->evaluator_confirmed_json === null
            && ! $report->items()->whereNotNull('evaluator_decision_json')->exists()
            && ! $report->activeVerificationRequest()->exists()
            && ! RegulatoryFinding::where(function ($query) use ($report) {
                $query->where(fn ($q) => $q->where('source_type', 'consumer_report')->where('source_id', $report->id))
                    ->orWhere(fn ($q) => $q->where('source_type', 'consumer_report_item')->whereIn('source_id', $report->items()->select('id')));
            })->exists();
    }

    /** Preview and apply use the same assessment; preview never changes matches or evidence. */
    public function evaluate(ConsumerReport $report): array
    {
        $report->loadMissing('items.srp', 'store', 'evidenceBundle.assets');
        $raw = $report->raw_ocr_json ?? [];
        $result = $report->evidenceBundle?->processing_result_json ?? $raw;
        $warnings = array_merge($raw['warnings'] ?? [], $result['warnings'] ?? []);
        $reasons = [];
        $date = data_get($raw, 'transaction_date');
        $observedAt = null;
        if (is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            try {
                $parsed = Carbon::createFromFormat('!Y-m-d', $date);
                if ($parsed->format('Y-m-d') === $date) $observedAt = $date;
            } catch (\Throwable) {
                // An invalid receipt date cannot be replaced by the submission date for automation.
            }
        }
        if ($observedAt === null) $reasons[] = 'Receipt date is missing or invalid.';
        $dateConfidenceKnown = is_bool($raw['transaction_date_uncertain'] ?? null) || is_bool($result['transaction_date_uncertain'] ?? null);
        $dateUncertain = ($raw['transaction_date_uncertain'] ?? false) || ($result['transaction_date_uncertain'] ?? false)
            || (! $dateConfidenceKnown && collect($warnings)->pluck('code')->contains('FIELDS_UNCERTAIN'));
        if ($dateUncertain) $reasons[] = 'The receipt date is uncertain.';
        if (! $report->store || data_get($result, 'merchant.status') !== 'matched' || data_get($result, 'merchant.uncertain', false)) {
            $reasons[] = 'The receipt store is not reliably identified.';
        }
        $originals = $report->evidenceBundle?->assets->where('kind', $report->capture_mode === 'continuous_video_v1' ? 'original_video' : 'source_frame') ?? collect();
        $originalsValid = $originals->isNotEmpty() && ! $originals->contains(fn ($asset) => ! $asset->hasValidContent());
        if (! $originalsValid) {
            $reasons[] = 'Original receipt evidence is unavailable or failed integrity verification.';
        }
        // Unknown quality is reviewable, never silently accepted as clear evidence.
        $quality = data_get($result, 'evidence_assessment');
        if (! is_array($quality) || ($quality['is_receipt'] ?? null) !== true || ($quality['legibility'] ?? null) !== 'clear' || ($quality['problems'] ?? []) !== []) {
            $reasons[] = 'Receipt evidence needs a quality check.';
        }
        $identityReliable = $originalsValid && $observedAt !== null && ! $dateUncertain && $report->store
            && data_get($result, 'merchant.status') === 'matched' && ! data_get($result, 'merchant.uncertain', false)
            && ($quality['is_receipt'] ?? null) === true && in_array($quality['legibility'] ?? null, ['clear', 'partially_readable'], true);
        foreach ($warnings as $warning) {
            $reasons[] = is_array($warning) ? ($warning['message'] ?? $warning['code'] ?? 'Extraction needs review.') : (string) $warning;
        }
        if (($raw['manual_review_required'] ?? false) || ($result['manual_review_required'] ?? false)) $reasons[] = 'Extraction requires DTI review.';
        $items = [];
        $hasViolation = false;
        $allCompared = $report->items->isNotEmpty();
        foreach ($report->items as $item) {
            $reference = $this->comparison->forItem($item, $observedAt);
            $itemReasons = [];
            if (! $reference['auto_matched'] || ! $reference['commodity_key']) $itemReasons[] = 'Product is unidentified or its match is uncertain.';
            if (($item->uncertain_fields ?? []) !== [] || $item->possible_duplicate_of !== null) $itemReasons[] = 'Receipt line is uncertain or may be duplicated.';
            if ($reference['receipt_unit_price'] === null || $reference['receipt_unit_price'] < 0
                || ($item->unit_price === null && (float) $item->quantity !== 1.0)) $itemReasons[] = 'Unit price is unavailable or invalid.';
            if ($reference['status'] !== 'available') $itemReasons[] = 'The applicable price reference is unavailable.';
            $reliable = $identityReliable && $itemReasons === [];
            $hasViolation = $hasViolation || ($reliable && $reference['is_above_reference'] === true);
            $allCompared = $allCompared && $reliable && $reference['is_above_reference'] === false;
            $items[] = ['item_id' => $item->id, 'reliable' => $reliable, 'reasons' => $itemReasons, 'reference' => $reference];
        }
        if ($report->items->isEmpty()) $reasons[] = 'No receipt items were extracted.';
        $category = $hasViolation ? 'violations' : ($allCompared && $reasons === [] ? 'no_violation' : 'to_review');

        return ['category' => $category, 'assessed_at' => now()->toIso8601String(), 'reasons' => array_values(array_unique($reasons)), 'items' => $items];
    }

    public function assess(ConsumerReport $report, Request $request): ?array
    {
        return DB::transaction(function () use ($report, $request) {
            if ($report->store_id) Store::whereKey($report->store_id)->lockForUpdate()->first();
            $locked = ConsumerReport::whereKey($report->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $locked->store_id === (int) $report->store_id, 409, 'This report changed. Reload it and try again.');
            if (! $this->eligible($locked)) return null;
            $assessment = $this->evaluate($locked);
            $previous = $locked->status;
            $locked->update(['automatic_assessment_json' => $assessment, 'status' => $assessment['category'] === 'no_violation' ? 'Resolved' : $previous]);
            ReportStatusHistory::create([
                'consumer_report_id' => $locked->id, 'previous_status' => $previous, 'new_status' => $locked->status,
                'public_message' => match ($assessment['category']) {
                    'no_violation' => 'System assessment found no price violations. The report was automatically resolved.',
                    'violations' => 'System assessment detected a possible price violation for DTI checking.',
                    default => 'Receipt evidence requires DTI review before a reliable assessment can be made.',
                },
                'actor_type' => 'system',
            ]);
            abort_unless($this->audit->recordAs($request, null, 'report.automatically_assessed', $locked, ['category' => $assessment['category'], 'item_count' => count($assessment['items'])]), 503, 'Audit trail is unavailable. Automatic assessment could not be saved.');
            return $assessment;
        });
    }
}
