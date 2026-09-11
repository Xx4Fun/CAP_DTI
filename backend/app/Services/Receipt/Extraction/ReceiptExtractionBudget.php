<?php

namespace App\Services\Receipt\Extraction;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceBundle;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Bounds paid extraction calls: a per-report cap summed across every evidence attempt, plus service-wide daily
 * call and token caps. Capacity is reserved before a call; refused calls are not counted.
 */
class ReceiptExtractionBudget
{
    /** Conservative per-image and output estimates used to reserve tokens before the call. */
    private const ESTIMATED_TOKENS_PER_FRAME = 2000;

    private const ESTIMATED_OUTPUT_TOKENS = 4000;

    public function callsForReport(ConsumerReport $report): int
    {
        return (int) ReceiptEvidenceBundle::query()
            ->where(fn ($query) => $query->where('consumer_report_id', $report->id)
                ->when($report->receipt_evidence_bundle_id, fn ($inner) => $inner->orWhere('id', $report->receipt_evidence_bundle_id)))
            ->sum('extraction_calls');
    }

    /** Reserves one call and an estimated token amount; returns the token reservation to reconcile afterwards. */
    public function reserve(ConsumerReport $report, ReceiptEvidenceBundle $bundle, int $frameCount): int
    {
        if ($this->callsForReport($report) >= (int) config('services.receipt_extraction.max_calls_per_report', 9)) {
            throw new ExtractionFailedException(ReceiptFailureCodes::EXTRACTION_ATTEMPT_CAP);
        }

        $callKey = $this->dailyKey('calls');
        $this->ensureCounter($callKey);
        if (Cache::increment($callKey) > (int) config('services.receipt_extraction.daily_call_limit', 200)) {
            Cache::decrement($callKey);
            $this->alertExhausted('calls');
            throw new ExtractionFailedException(ReceiptFailureCodes::EXTRACTION_BUDGET_EXHAUSTED);
        }

        $estimate = $frameCount * self::ESTIMATED_TOKENS_PER_FRAME + self::ESTIMATED_OUTPUT_TOKENS;
        $tokenKey = $this->dailyKey('tokens');
        $this->ensureCounter($tokenKey);
        if (Cache::increment($tokenKey, $estimate) > (int) config('services.receipt_extraction.daily_token_limit', 3000000)) {
            Cache::decrement($tokenKey, $estimate);
            Cache::decrement($callKey);
            $this->alertExhausted('tokens');
            throw new ExtractionFailedException(ReceiptFailureCodes::EXTRACTION_BUDGET_EXHAUSTED);
        }

        $bundle->forceFill([
            'extraction_calls' => (int) $bundle->extraction_calls + 1,
            'extraction_attempted_at' => now(),
        ])->save();

        return $estimate;
    }

    /** Replaces the token estimate with the provider-reported usage once it is known. */
    public function reconcile(int $estimate, ?int $actualTokens): void
    {
        if ($actualTokens === null || $actualTokens === $estimate) {
            return;
        }
        $tokenKey = $this->dailyKey('tokens');
        $actualTokens > $estimate
            ? Cache::increment($tokenKey, $actualTokens - $estimate)
            : Cache::decrement($tokenKey, $estimate - $actualTokens);
    }

    private function dailyKey(string $kind): string
    {
        return 'receipt-extraction:'.$kind.':'.now('UTC')->format('Y-m-d');
    }

    private function ensureCounter(string $key): void
    {
        Cache::add($key, 0, now('UTC')->endOfDay()->addHour());
    }

    private function alertExhausted(string $kind): void
    {
        Log::critical('receipt_extraction.daily_cap_reached', ['cap' => $kind]);
    }
}
