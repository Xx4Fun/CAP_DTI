<?php

namespace App\Jobs;

use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Services\Receipt\Extraction\ReceiptFailureCodes;
use App\Services\Receipt\Extraction\RetryableExtractionException;
use App\Services\Receipt\ReceiptEvidencePipeline;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\MaxAttemptsExceededException;
use Illuminate\Queue\SerializesModels;
use Illuminate\Queue\TimeoutExceededException;
use Illuminate\Support\Facades\DB;
use Throwable;

class ProcessReceiptEvidence implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 360;

    /** Seconds to wait before the second and third attempts. */
    public array $backoff = [30, 120];

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

        try {
            $result = $pipeline->process($report);
        } catch (RetryableExtractionException $exception) {
            // Transient provider failure: retry with backoff; on the last attempt record the specific code ourselves.
            if ($this->attempts() < $this->tries) {
                $this->release($this->backoff[$this->attempts() - 1] ?? end($this->backoff));

                return;
            }
            $result = [
                'status' => 'failed',
                'reason_code' => $exception->failureCode,
                'lines' => [],
                'items' => [],
                'transaction_date' => null,
                'warnings' => [],
                'manual_review_required' => false,
                'engine' => ['provider' => 'gemini', ...$exception->engine, 'failure_code' => $exception->failureCode],
            ];
        }
        $internalStatus = $result['status'] ?? 'failed';
        $publicStatus = $internalStatus === 'ready'
            ? 'Ready for confirmation'
            : ($internalStatus === 'needs_recapture' ? 'Needs recapture' : 'Processing failed');
        $reasonCode = (string) ($result['reason_code'] ?? ($internalStatus === 'failed' ? ReceiptFailureCodes::PROCESSING_FAILED : ''));

        DB::transaction(function () use ($report, $result, $internalStatus, $publicStatus, $reasonCode) {
            $report->items()->delete();
            if ($internalStatus === 'ready') {
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
                    'detected_total' => $result['detected_total'] ?? null,
                    'transaction_date' => $result['transaction_date'] ?? null,
                    'receipt_number' => $result['receipt_number'] ?? null,
                    'subtotal' => $result['subtotal'] ?? null,
                    'discounts' => $result['discounts'] ?? [],
                    'adjustments' => $result['adjustments'] ?? [],
                    'reconciliation' => $result['reconciliation'] ?? null,
                    'engine' => [
                        'provider' => $result['engine']['provider'] ?? null,
                        'model' => $result['engine']['model'] ?? null,
                    ],
                    'reason_code' => $result['reason_code'] ?? null,
                    'warnings' => $result['warnings'] ?? [],
                    'manual_review_required' => (bool) ($result['manual_review_required'] ?? false),
                ],
            ]);
            $report->evidenceBundle?->update([
                'processing_status' => $internalStatus,
                'processing_result_json' => $result,
                'processing_completed_at' => now(),
                'failure_code' => $internalStatus === 'ready' ? null : ($reasonCode ?: ReceiptFailureCodes::PROCESSING_FAILED),
            ]);

            ReportStatusHistory::create([
                'consumer_report_id' => $report->id,
                'previous_status' => 'Processing receipt',
                'new_status' => $publicStatus,
                'public_message' => match ($publicStatus) {
                    'Ready for confirmation' => 'Receipt processing is complete. Review the original evidence and read-only system extraction.',
                    'Needs recapture' => $this->safeReasonMessage($reasonCode),
                    default => ReceiptFailureCodes::historyMessage($reasonCode),
                },
                'actor_type' => 'system',
            ]);
        });

        SendReceiptStatusNotification::dispatch($report->report_reference, $publicStatus)->afterCommit();
    }

    private function safeReasonMessage(string $reasonCode): string
    {
        return match ($reasonCode) {
            'INSUFFICIENT_FRAMES' => 'No usable receipt image was captured.',
            'TEXT_UNREADABLE' => 'The receipt text was not clear enough to read. Keep it flat, well lit, and in focus.',
            'RECEIPT_INCOMPLETE' => 'The bottom of the receipt, including the total, is missing. Add a section that shows it.',
            'INCOMPLETE_SCAN' => 'Adjacent receipt sections do not overlap enough to verify that the receipt is complete.',
            'STORE_NOT_CONFIRMED' => 'The store name could not be matched to the selected establishment.',
            'ITEMS_NOT_FOUND' => 'No complete receipt item lines could be verified.',
            'TOTAL_NOT_FOUND' => 'The receipt total was not visible or readable.',
            'TOTAL_MISMATCH' => 'The detected item amounts did not match the receipt total.',
            default => 'The receipt could not be verified. Please capture it again.',
        };
    }

    public function failed(?Throwable $exception): void
    {
        $report = ConsumerReport::where('report_reference', $this->reportReference)->with('evidenceBundle')->first();
        if (! $report) {
            return;
        }

        // Keep a specific failure code if one was already recorded; otherwise classify the job-level failure.
        $code = $report->evidenceBundle?->failure_code
            ?: ($exception instanceof TimeoutExceededException || $exception instanceof MaxAttemptsExceededException
                ? ReceiptFailureCodes::JOB_TIMEOUT
                : ReceiptFailureCodes::PROCESSING_FAILED);
        $previousStatus = $report->status;
        $report->update(['status' => 'Processing failed', 'processing_status' => 'failed']);
        $report->evidenceBundle?->update([
            'processing_status' => 'failed',
            'processing_completed_at' => now(),
            'failure_code' => $code,
        ]);
        ReportStatusHistory::create([
            'consumer_report_id' => $report->id,
            'previous_status' => $previousStatus,
            'new_status' => 'Processing failed',
            'public_message' => ReceiptFailureCodes::historyMessage($code),
            'actor_type' => 'system',
        ]);
        SendReceiptStatusNotification::dispatch($report->report_reference, 'Processing failed');
    }
}
