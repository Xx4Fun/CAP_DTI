<?php

namespace App\Jobs;

use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Services\Receipt\ReceiptEvidencePipeline;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Throwable;

class ProcessReceiptEvidence implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 360;

    public function __construct(public string $reportReference)
    {
        $this->onQueue('receipt-processing');
    }

    public function handle(ReceiptEvidencePipeline $pipeline): void
    {
        $report = ConsumerReport::where('report_reference', $this->reportReference)
            ->with('evidenceBundle')
            ->firstOrFail();

        if (! in_array($report->processing_status, ['queued', 'processing'], true)) {
            return;
        }

        $report->update(['processing_status' => 'processing']);
        $report->evidenceBundle?->update([
            'processing_status' => 'processing',
            'processing_started_at' => now(),
            'processing_attempts' => DB::raw('processing_attempts + 1'),
        ]);

        $result = $pipeline->process($report);
        $internalStatus = $result['status'] ?? 'failed';
        $publicStatus = in_array($internalStatus, ['ready', 'ready_manual_review'], true)
            ? 'Ready for confirmation'
            : ($internalStatus === 'needs_recapture' ? 'Needs recapture' : 'Processing failed');

        DB::transaction(function () use ($report, $result, $internalStatus, $publicStatus) {
            $report->items()->delete();
            if (in_array($internalStatus, ['ready', 'ready_manual_review'], true)) {
                foreach (($result['items'] ?? []) as $item) {
                    $report->items()->create($item);
                }
            }

            $report->update([
                'status' => $publicStatus,
                'processing_status' => $internalStatus,
                'raw_ocr_json' => [
                    'lines' => $result['lines'] ?? [],
                    'continuity' => $result['continuity'] ?? null,
                    'merchant' => $result['merchant'] ?? null,
                ],
            ]);
            $report->evidenceBundle?->update([
                'processing_status' => $internalStatus,
                'processing_result_json' => $result,
                'processing_completed_at' => now(),
                'failure_code' => $internalStatus === 'failed' ? 'PROCESSING_FAILED' : null,
            ]);

            ReportStatusHistory::create([
                'consumer_report_id' => $report->id,
                'previous_status' => 'Processing receipt',
                'new_status' => $publicStatus,
                'public_message' => match ($publicStatus) {
                    'Ready for confirmation' => 'Receipt processing is complete. Review and confirm the detected items.',
                    'Needs recapture' => 'The receipt could not be verified as one continuous receipt. Please capture it again.',
                    default => 'Receipt processing could not be completed. Please try again.',
                },
                'actor_type' => 'system',
            ]);
        });

        SendReceiptStatusNotification::dispatch($report->report_reference, $publicStatus)->afterCommit();
    }

    public function failed(?Throwable $exception): void
    {
        $report = ConsumerReport::where('report_reference', $this->reportReference)->with('evidenceBundle')->first();
        if (! $report) {
            return;
        }

        $previousStatus = $report->status;
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle?->update([
            'processing_status' => 'failed',
            'processing_completed_at' => now(),
            'failure_code' => 'PROCESSING_FAILED',
        ]);
        ReportStatusHistory::create([
            'consumer_report_id' => $report->id,
            'previous_status' => $previousStatus,
            'new_status' => 'Processing failed',
            'public_message' => 'Receipt processing could not be completed. Please try again.',
            'actor_type' => 'system',
        ]);
        SendReceiptStatusNotification::dispatch($report->report_reference, 'Processing failed');
    }
}
