<?php

namespace App\Services\Admin;

use App\Models\ConsumerReport;
use App\Models\ConsumerReportItem;
use App\Models\RegulatoryFinding;
use App\Models\ReportStatusHistory;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportReviewService
{
    public function __construct(private readonly AuditTrailService $audit, private readonly TemporalSrpResolver $srpResolver) {}

    public function decide(ConsumerReport $report, string $action, array $corrected, string $reason, User $actor, Request $request): ConsumerReport
    {
        return DB::transaction(function () use ($report, $action, $corrected, $reason, $actor, $request) {
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

            if ($action !== 'dismiss') {
                $srp = isset($corrected['commodity_key'], $corrected['observed_at'])
                    ? $this->srpResolver->resolve($corrected['commodity_key'], $corrected['observed_at']) : null;
                $decision = $action === 'reject' ? 'rejected' : ($confirmedViolation ? 'confirmed' : 'not_confirmed');
                RegulatoryFinding::updateOrCreate(
                    ['source_type' => 'consumer_report', 'source_id' => $report->id],
                    ['store_id' => $report->store_id, 'srp_bulletin_id' => $srp?->id, 'observed_price' => $corrected['receipt_price'] ?? null,
                     'observed_at' => $corrected['observed_at'] ?? $report->created_at, 'decision' => $decision,
                     'reason' => $reason, 'decided_by' => $actor->id, 'decided_at' => now()]
                );
            }
            if ($report->store_id) $this->recalculateRecidivism(Store::findOrFail($report->store_id));
            $this->audit->recordOrFail($request, 'report.'.$action, $report, [
                'reason' => $reason, 'corrected_fields' => array_keys($corrected),
                'regulatory_finding' => $corrected['regulatory_finding'] ?? null,
            ]);
            return $report->fresh();
        });
    }

    public function recalculateRecidivism(Store $store): int
    {
        $findings = RegulatoryFinding::where('store_id', $store->id)->where('decision', 'confirmed')->get();
        $itemReportIds = ConsumerReportItem::whereIn(
            'id',
            $findings->where('source_type', 'consumer_report_item')->pluck('source_id')
        )->pluck('consumer_report_id', 'id');
        $count = $findings->map(function (RegulatoryFinding $finding) use ($itemReportIds) {
            if ($finding->source_type === 'consumer_report_item') {
                return 'consumer-report:'.($itemReportIds[$finding->source_id] ?? 'missing-'.$finding->source_id);
            }
            if ($finding->source_type === 'consumer_report') {
                return 'consumer-report:'.$finding->source_id;
            }
            return $finding->source_type.':'.$finding->source_id;
        })->unique()->count();
        $store->update(['recidivism_index' => $count]);
        return $count;
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
                $srp = $this->srpResolver->resolve($decision['commodity_key'], $decision['observed_at']);
                RegulatoryFinding::updateOrCreate(
                    ['source_type' => 'consumer_report_item', 'source_id' => $item->id],
                    [
                        'store_id' => $report->store_id,
                        'srp_bulletin_id' => $srp?->id,
                        'observed_price' => $decision['receipt_price'],
                        'observed_at' => $decision['observed_at'],
                        'decision' => $decision['regulatory_finding'] === 'confirmed_violation' ? 'confirmed' : 'not_confirmed',
                        'reason' => $reason,
                        'decided_by' => $actor->id,
                        'decided_at' => now(),
                    ]
                );
            }

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
