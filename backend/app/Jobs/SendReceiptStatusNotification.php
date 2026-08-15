<?php

namespace App\Jobs;

use App\Models\ConsumerReport;
use App\Services\Receipt\ReceiptPushMessage;
use App\Services\Receipt\ReceiptPushSender;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class SendReceiptStatusNotification implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public function __construct(public string $reportReference, public string $status)
    {
        $this->onQueue('notifications');
    }

    public function handle(ReceiptPushMessage $messages, ReceiptPushSender $sender): void
    {
        $report = ConsumerReport::where('report_reference', $this->reportReference)
            ->with(['pushSubscriptions' => fn ($query) => $query->whereNull('revoked_at')])
            ->first();
        if (! $report) {
            return;
        }

        $payload = $messages->forStatus($report->report_reference, $this->status);
        foreach ($report->pushSubscriptions as $subscription) {
            $result = $sender->send($subscription, $payload);
            if ($result['success']) {
                $subscription->update(['last_success_at' => now()]);

                continue;
            }
            if ($result['expired']) {
                $subscription->reports()->detach();
                $subscription->delete();

                continue;
            }
            if (! $result['skipped']) {
                Log::warning('Receipt Web Push delivery failed.', [
                    'report_reference' => $report->report_reference,
                    'endpoint_hash' => $subscription->endpoint_hash,
                    'reason' => $result['reason'],
                ]);
            }
        }
    }
}
