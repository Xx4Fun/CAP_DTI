<?php

namespace App\Services\Receipt\Extraction;

use App\Models\ConsumerReport;
use App\Models\ReceiptEvidenceBundle;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Bounds paid extraction calls: per evidence attempt (a fresh capture starts a new attempt), per report across every
 * attempt (terminal once reached), and service-wide daily call and token caps. Capacity is reserved before a call and
 * refunded when the call was never sent or never billed.
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

    /** Read-only eligibility check; reserve still enforces daily limits atomically before sending. */
    public function blockingCode(ConsumerReport $report, ReceiptEvidenceBundle $bundle, int $frameCount): ?string
    {
        if ($this->callsForReport($report) >= (int) config('services.receipt_extraction.max_calls_per_report', 18)) {
            return ReceiptFailureCodes::EXTRACTION_REPORT_CAP;
        }
        if ((int) $bundle->extraction_calls >= (int) config('services.receipt_extraction.max_calls_per_attempt', 6)) {
            return ReceiptFailureCodes::EXTRACTION_ATTEMPT_CAP;
        }
        $day = now('UTC')->format('Y-m-d');
        if ((int) Cache::get($this->key('calls', $day), 0) >= (int) config('services.receipt_extraction.daily_call_limit', 200)
            || (int) Cache::get($this->key('tokens', $day), 0) + $frameCount * self::ESTIMATED_TOKENS_PER_FRAME + self::ESTIMATED_OUTPUT_TOKENS
                > (int) config('services.receipt_extraction.daily_token_limit', 3000000)) {
            return ReceiptFailureCodes::EXTRACTION_BUDGET_EXHAUSTED;
        }

        return null;
    }

    /**
     * Reserves one call and an estimated token amount.
     *
     * @return array{day: string, tokens: int, bundle_id: int}
     */
    public function reserve(ConsumerReport $report, ReceiptEvidenceBundle $bundle, int $frameCount): array
    {
        if ($code = $this->blockingCode($report, $bundle, $frameCount)) {
            if ($code === ReceiptFailureCodes::EXTRACTION_BUDGET_EXHAUSTED) {
                $this->alertExhausted('calls_or_tokens');
            }
            throw new ExtractionFailedException($code);
        }

        $day = now('UTC')->format('Y-m-d');
        $callKey = $this->key('calls', $day);
        $this->ensureCounter($callKey);
        if (Cache::increment($callKey) > (int) config('services.receipt_extraction.daily_call_limit', 200)) {
            Cache::decrement($callKey);
            $this->alertExhausted('calls');
            throw new ExtractionFailedException(ReceiptFailureCodes::EXTRACTION_BUDGET_EXHAUSTED);
        }

        $estimate = $frameCount * self::ESTIMATED_TOKENS_PER_FRAME + self::ESTIMATED_OUTPUT_TOKENS;
        $tokenKey = $this->key('tokens', $day);
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

        return ['day' => $day, 'tokens' => $estimate, 'bundle_id' => (int) $bundle->id];
    }

    /** Replaces the token estimate with the provider-reported usage, on the day the reservation was made. */
    public function reconcile(array $reservation, ?int $actualTokens): void
    {
        if ($actualTokens === null || $actualTokens === $reservation['tokens']) {
            return;
        }
        $tokenKey = $this->key('tokens', $reservation['day']);
        $actualTokens > $reservation['tokens']
            ? Cache::increment($tokenKey, $actualTokens - $reservation['tokens'])
            : Cache::decrement($tokenKey, $reservation['tokens'] - $actualTokens);
    }

    /** Returns a reservation whose call was never sent (e.g. too large) or never billed (rate limited). */
    public function refund(array $reservation): void
    {
        Cache::decrement($this->key('calls', $reservation['day']));
        Cache::decrement($this->key('tokens', $reservation['day']), $reservation['tokens']);
        ReceiptEvidenceBundle::whereKey($reservation['bundle_id'])->where('extraction_calls', '>', 0)->decrement('extraction_calls');
    }

    private function key(string $kind, string $day): string
    {
        return 'receipt-extraction:'.$kind.':'.$day;
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
