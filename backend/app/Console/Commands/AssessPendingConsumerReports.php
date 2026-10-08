<?php

namespace App\Console\Commands;

use App\Models\ConsumerReport;
use App\Services\Receipt\ConsumerReportAssessment;
use Illuminate\Console\Command;
use Illuminate\Http\Request;

class AssessPendingConsumerReports extends Command
{
    protected $signature = 'reports:assess-pending {--apply : Save assessments and resolve reliable clean reports}';
    protected $description = 'Preview or assess undecided consumer reports without changing DTI decisions or active referrals';

    public function handle(ConsumerReportAssessment $assessment): int
    {
        $counts = ['violations' => 0, 'no_violation' => 0, 'to_review' => 0];
        $apply = (bool) $this->option('apply');
        $request = Request::create('/console/reports-assess-pending');
        try {
            ConsumerReport::whereIn('status', ['Submitted', 'Under initial evaluation'])
                ->whereNull('automatic_assessment_json')->whereNull('evaluator_confirmed_json')
                ->chunkById(50, function ($reports) use ($assessment, $apply, $request, &$counts) {
                    foreach ($reports as $report) {
                        if (! $assessment->eligible($report)) continue;
                        $result = $apply ? $assessment->assess($report, $request) : $assessment->evaluate($report);
                        if ($result) $counts[$result['category']]++;
                    }
                });
        } catch (\Throwable $exception) {
            report($exception);
            $this->error('Assessment stopped. Saved reports will be skipped on retry; remaining reports are unchanged.');
            return self::FAILURE;
        }
        $this->info(($apply ? 'Applied' : 'Preview only').' — Violations: '.$counts['violations'].'; No Violations: '.$counts['no_violation'].'; For Review: '.$counts['to_review']);
        return self::SUCCESS;
    }
}
