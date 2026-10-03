<?php

namespace App\Services\Admin;

use App\Models\ConsumerReport;
use App\Models\ConsumerReportItem;
use App\Models\MonitoringRecordItem;
use App\Models\RegulatoryFinding;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Models\User;
use App\Services\Receipt\ReceiptPriceComparison;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportReviewService
{
    /** Outcomes that assert a price determination, and therefore must cite a real reference. */
    private const FINDING_OUTCOMES = ['confirmed_violation', 'no_violation'];

    /** States a report may be decided from. Anything else is still being captured or extracted. */
    public const DECIDABLE_STATUSES = [
        'Submitted', 'Under initial evaluation', 'Under regulatory review', 'Resolved', 'Closed',
    ];

    public function __construct(
        private readonly AuditTrailService $audit,
        private readonly TemporalSrpResolver $srpResolver,
        private readonly ReceiptPriceComparison $comparison,
    ) {}

    /**
     * The reference a finding will cite, or a 422 when none applies.
     *
     * A confirmed violation with no baseline behind it is not a defensible regulatory record, and
     * previously the resolver simply returned null and the finding saved anyway. Outcomes that assert
     * nothing about price (insufficient evidence, rejection) never reach this.
     *
     * @return array<string, mixed>
     */
    private function requireReference(string $commodityKey, string $observedAt, string $finding): array
    {
        $reference = $this->comparison->referenceFor($commodityKey, $observedAt);

        abort_if(
            ($reference['status'] ?? null) !== 'available',
            422,
            sprintf(
                'No authoritative price reference applies to "%s" on %s, so this finding cannot be recorded. %s',
                $commodityKey,
                $observedAt,
                $reference['label'] ?? 'The commodity or date may be wrong.',
            ),
        );

        return $reference;
    }

    /** The reference columns a finding stores, so it keeps showing the baseline it was decided against. */
    private function referenceColumns(array $reference): array
    {
        return [
            'srp_bulletin_id' => $reference['srp_bulletin_id'] ?? null,
            'reference_type' => $reference['type'] ?? null,
            'reference_source_id' => $reference['source_id'] ?? null,
            'reference_value' => $reference['value'] ?? null,
            'reference_effective_date' => $reference['effective_date'] ?? null,
            'reference_label' => $reference['label'] ?? null,
            'reference_source' => $reference['source'] ?? null,
            'reference_version' => $reference['version'] ?? null,
        ];
    }

    /**
     * Locks in the order every finding writer uses (store, then report; field sync and verification requests
     * lock the store first too), then re-checks what the controller checked before the transaction.
     */
    private function lockForDecision(ConsumerReport $report): ConsumerReport
    {
        if ($report->store_id) Store::whereKey($report->store_id)->lockForUpdate()->first();
        $locked = ConsumerReport::query()->lockForUpdate()->findOrFail($report->id);
        abort_unless((int) $locked->store_id === (int) $report->store_id, 409, 'This report changed while it was being decided. Reload it and decide again.');
        abort_unless(in_array($locked->status, self::DECIDABLE_STATUSES, true), 422, 'This report is still being processed and cannot be decided yet.');
        abort_if($locked->activeVerificationRequest()->exists(), 409, 'An open field verification request must be resolved first.');

        return $locked;
    }

    public function decide(ConsumerReport $report, string $action, array $corrected, string $reason, User $actor, Request $request): ConsumerReport
    {
        return DB::transaction(function () use ($report, $action, $corrected, $reason, $actor, $request) {
            $report = $this->lockForDecision($report);
            $previous = $report->status;
            $reviewed = in_array($action, ['validate', 'correct'], true);
            $confirmedViolation = $reviewed && ($corrected['regulatory_finding'] ?? null) === 'confirmed_violation';
            $status = $confirmedViolation ? 'Under regulatory review' : ($action === 'reject' ? 'Closed' : 'Resolved');
            if ($reviewed) $report->evaluator_confirmed_json = $corrected;
            $report->status = $status;
            $report->save();

            ReportStatusHistory::create([
                'consumer_report_id' => $report->id, 'previous_status' => $previous,
                'new_status' => $status, 'public_message' => $confirmedViolation ? 'DTI evaluation completed. The report is under regulatory review.' : 'DTI evaluation completed.',
                'internal_notes' => $reason, 'actor_type' => 'dti_evaluator', 'actor_id' => $actor->id,
            ]);

            $finding = $corrected['regulatory_finding'] ?? null;
            // Only a real price determination records a finding. Dismissal and rejection assert
            // nothing, and an earlier finding must not survive a decision that withdraws it.
            if ($reviewed && in_array($finding, self::FINDING_OUTCOMES, true)) {
                $reference = $this->requireReference(
                    $corrected['commodity_key'],
                    $corrected['observed_at'],
                    $finding,
                );
                RegulatoryFinding::updateOrCreate(
                    ['source_type' => 'consumer_report', 'source_id' => $report->id],
                    ['store_id' => $report->store_id, 'observed_price' => $corrected['receipt_price'] ?? null,
                     'observed_at' => $corrected['observed_at'], 'decision' => $confirmedViolation ? 'confirmed' : 'not_confirmed',
                     'reason' => $reason, 'decided_by' => $actor->id, 'decided_at' => now()]
                    + $this->referenceColumns($reference)
                );
            } else {
                RegulatoryFinding::where('source_type', 'consumer_report')->where('source_id', $report->id)->delete();
            }
            if ($report->store_id) $this->recalculateRecidivism(Store::findOrFail($report->store_id));
            $this->audit->recordOrFail($request, 'report.'.$action, $report, [
                'reason' => $reason, 'corrected_fields' => array_keys($corrected),
                'regulatory_finding' => $corrected['regulatory_finding'] ?? null,
            ]);
            return $report->fresh();
        });
    }

    /** Callers hold the store row lock (store-first order), so concurrent decisions cannot each miss the other. */
    public function recalculateRecidivism(Store $store): int
    {
        $count = self::confirmedCaseCount($store->id);
        $store->update(['recidivism_index' => $count]);
        return $count;
    }

    /**
     * Distinct confirmed cases for a store: one consumer report, or one monitoring visit, counts once however many
     * of its lines were confirmed. Analytics uses the same count so the two never disagree.
     */
    public static function confirmedCaseCount(int $storeId): int
    {
        $findings = RegulatoryFinding::where('store_id', $storeId)->where('decision', 'confirmed')->get();
        $itemReportIds = ConsumerReportItem::whereIn(
            'id',
            $findings->where('source_type', 'consumer_report_item')->pluck('source_id')
        )->pluck('consumer_report_id', 'id');
        $itemVisitIds = MonitoringRecordItem::whereIn(
            'id',
            $findings->where('source_type', MonitoringRecordItem::FINDING_SOURCE)->pluck('source_id')
        )->pluck('monitoring_record_id', 'id');

        return $findings->map(function (RegulatoryFinding $finding) use ($itemReportIds, $itemVisitIds) {
            if ($finding->source_type === 'consumer_report_item') {
                return 'consumer-report:'.($itemReportIds[$finding->source_id] ?? 'missing-'.$finding->source_id);
            }
            if ($finding->source_type === 'consumer_report') {
                return 'consumer-report:'.$finding->source_id;
            }
            if ($finding->source_type === MonitoringRecordItem::FINDING_SOURCE) {
                return 'monitoring-record:'.($itemVisitIds[$finding->source_id] ?? 'missing-'.$finding->source_id);
            }
            return $finding->source_type.':'.$finding->source_id;
        })->unique()->count();
    }

    public function decideItems(
        ConsumerReport $report,
        string $action,
        array $itemDecisions,
        string $reason,
        User $actor,
        Request $request
    ): ConsumerReport {
        return DB::transaction(function () use ($report, $action, $itemDecisions, $reason, $actor, $request) {
            $report = $this->lockForDecision($report);
            $previous = $report->status;
            $hasConfirmedViolation = collect($itemDecisions)
                ->contains(fn ($decision) => $decision['regulatory_finding'] === 'confirmed_violation');
            $status = $hasConfirmedViolation ? 'Under regulatory review' : 'Resolved';

            foreach ($itemDecisions as $decision) {
                $item = $report->items()->findOrFail($decision['item_id']);
                $item->update([
                    'evaluator_decision_json' => $decision,
                    'reviewed_by' => $actor->id,
                    'reviewed_at' => now(),
                ]);

                // Insufficient evidence asserts nothing about price, so it records no finding — and
                // supersedes any earlier one, which would otherwise keep counting toward recidivism.
                // "No violation" on a line with no SRP commodity has no baseline to record against,
                // so it is recorded the same way. A key that was given but does not resolve still 422s.
                $unregulated = $decision['regulatory_finding'] === 'no_violation' && empty($decision['commodity_key']);
                if ($unregulated || ! in_array($decision['regulatory_finding'], self::FINDING_OUTCOMES, true)) {
                    RegulatoryFinding::where('source_type', 'consumer_report_item')
                        ->where('source_id', $item->id)->delete();

                    continue;
                }

                $reference = $this->requireReference(
                    $decision['commodity_key'],
                    $decision['observed_at'],
                    $decision['regulatory_finding'],
                );
                RegulatoryFinding::updateOrCreate(
                    ['source_type' => 'consumer_report_item', 'source_id' => $item->id],
                    [
                        'store_id' => $report->store_id,
                        'observed_price' => $decision['receipt_price'],
                        'observed_at' => $decision['observed_at'],
                        'decision' => $decision['regulatory_finding'] === 'confirmed_violation' ? 'confirmed' : 'not_confirmed',
                        'reason' => $reason,
                        'decided_by' => $actor->id,
                        'decided_at' => now(),
                    ] + $this->referenceColumns($reference)
                );
            }

            // An item decision supersedes any report-level finding from an earlier pass, so the two
            // paths cannot both count the same report.
            RegulatoryFinding::where('source_type', 'consumer_report')->where('source_id', $report->id)->delete();

            $report->update([
                'evaluator_confirmed_json' => ['items' => $itemDecisions],
                'status' => $status,
            ]);
            ReportStatusHistory::create([
                'consumer_report_id' => $report->id,
                'previous_status' => $previous,
                'new_status' => $status,
                'public_message' => $hasConfirmedViolation
                    ? 'DTI evaluation completed. The report is under regulatory review.'
                    : 'DTI evaluation completed.',
                'internal_notes' => $reason,
                'actor_type' => 'dti_evaluator',
                'actor_id' => $actor->id,
            ]);
            if ($report->store_id) {
                $this->recalculateRecidivism(Store::findOrFail($report->store_id));
            }
            $this->audit->recordOrFail($request, 'report.'.$action, $report, [
                'reason' => $reason,
                'item_count' => count($itemDecisions),
                'regulatory_finding' => $hasConfirmedViolation ? 'confirmed_violation' : 'not_confirmed',
            ]);

            return $report->fresh(['items']);
        });
    }
}
