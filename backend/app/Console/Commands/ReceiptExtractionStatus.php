<?php

namespace App\Console\Commands;

use App\Models\ReceiptEvidenceBundle;
use App\Services\Receipt\Evaluation\ReceiptEvaluationScorer;
use App\Services\Receipt\Extraction\ReceiptExtractionRouter;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * Rollout monitoring for receipt extraction: what the engine did over a window, read from stored results only.
 * Read-only and safe in production; it reports codes, counts, and timings, never receipt contents or credentials.
 */
class ReceiptExtractionStatus extends Command
{
    protected $signature = 'receipts:extraction-status {--days=14 : Window in days} {--json : Print the summary as JSON}';

    protected $description = 'Summarise receipt extraction outcomes, reconciliation, latency, and spend for a rollout window';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $since = now()->subDays($days);
        $consentVersions = (array) config('services.receipt_extraction.consent_versions', []);

        $counts = ['reports' => 0, 'providers' => [], 'routes' => [], 'outcomes' => [], 'failure_codes' => [],
            'recapture_reasons' => [], 'reconciliation' => [], 'warnings' => [], 'manual_review' => 0, 'extraction_calls' => 0];
        $durations = [];
        $tokens = ['input' => 0, 'output' => 0, 'thought' => 0];
        $consentLeaks = 0;

        ReceiptEvidenceBundle::query()
            ->with('report:id,status,privacy_notice_version')
            ->where(fn ($query) => $query->where('processing_completed_at', '>=', $since)
                ->orWhere(fn ($inner) => $inner->whereNull('processing_completed_at')->where('created_at', '>=', $since)))
            ->orderBy('id')
            ->chunkById(200, function ($bundles) use (&$counts, &$durations, &$tokens, &$consentLeaks, $consentVersions) {
                foreach ($bundles as $bundle) {
                    $result = (array) $bundle->processing_result_json;
                    $engine = (array) ($result['engine'] ?? []);
                    $counts['reports']++;
                    $this->tally($counts['providers'], (string) ($engine['provider'] ?? 'none'));
                    $this->tally($counts['routes'], (string) ($engine['route'] ?? 'none'));
                    $this->tally($counts['outcomes'], (string) ($bundle->report?->status ?? $bundle->processing_status ?? 'unknown'));
                    $counts['extraction_calls'] += (int) $bundle->extraction_calls;
                    if ($bundle->failure_code) {
                        $this->tally($counts['failure_codes'], (string) $bundle->failure_code);
                    }
                    if (($result['status'] ?? null) === 'needs_recapture' && ($result['reason_code'] ?? null)) {
                        $this->tally($counts['recapture_reasons'], (string) $result['reason_code']);
                    }
                    if (isset($result['reconciliation']['status'])) {
                        $this->tally($counts['reconciliation'], (string) $result['reconciliation']['status']);
                    }
                    foreach ((array) ($result['warnings'] ?? []) as $warning) {
                        if (is_array($warning) && isset($warning['code'])) {
                            $this->tally($counts['warnings'], (string) $warning['code']);
                        }
                    }
                    $counts['manual_review'] += ($result['manual_review_required'] ?? false) ? 1 : 0;
                    if (is_int($engine['duration_ms'] ?? null)) {
                        $durations[] = $engine['duration_ms'];
                    }
                    foreach (['input' => 'input_tokens', 'output' => 'output_tokens', 'thought' => 'thought_tokens'] as $key => $field) {
                        $tokens[$key] += (int) ($engine['usage'][$field] ?? 0);
                    }
                    // No report may reach the provider on a notice version that was never approved.
                    if (($engine['route'] ?? null) === 'primary' && $bundle->report
                        && ! in_array((string) $bundle->report->privacy_notice_version, $consentVersions, true)) {
                        $consentLeaks++;
                    }
                }
            });

        $day = now('UTC')->format('Y-m-d');
        $summary = [
            'window_days' => $days,
            'since' => $since->toIso8601String(),
            'reports' => $counts['reports'],
            'providers' => $counts['providers'],
            'routes' => $counts['routes'],
            'outcomes' => $counts['outcomes'],
            'failure_codes' => $counts['failure_codes'],
            'recapture_reasons' => $counts['recapture_reasons'],
            'reconciliation' => $counts['reconciliation'],
            'top_warnings' => $this->top($counts['warnings']),
            'manual_review_rate' => $counts['reports'] > 0 ? round($counts['manual_review'] / $counts['reports'], 4) : null,
            'extraction_calls' => $counts['extraction_calls'],
            'latency_p50_ms' => $this->percentile($durations, 50),
            'latency_p95_ms' => $this->percentile($durations, 95),
            'tokens' => $tokens,
            'estimated_cost_usd' => round(($tokens['input'] * ReceiptEvaluationScorer::INPUT_USD_PER_MILLION
                + ($tokens['output'] + $tokens['thought']) * ReceiptEvaluationScorer::OUTPUT_USD_PER_MILLION) / 1_000_000, 4),
            'today' => [
                'calls' => (int) Cache::get('receipt-extraction:calls:'.$day, 0),
                'call_limit' => (int) config('services.receipt_extraction.daily_call_limit'),
                'tokens' => (int) Cache::get('receipt-extraction:tokens:'.$day, 0),
                'token_limit' => (int) config('services.receipt_extraction.daily_token_limit'),
            ],
            'consent_gate_leaks' => $consentLeaks,
            'billing_attestation' => ReceiptExtractionRouter::billingAttestation(),
        ];

        if ($this->option('json')) {
            $this->line((string) json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));

            return $consentLeaks === 0 ? self::SUCCESS : self::FAILURE;
        }

        $this->info("Receipt extraction, last {$days} day(s): {$summary['reports']} evidence attempt(s)");
        $rows = [];
        foreach (['providers' => 'Provider', 'routes' => 'Route', 'outcomes' => 'Outcome', 'failure_codes' => 'Failure',
            'recapture_reasons' => 'Recapture', 'reconciliation' => 'Reconciliation'] as $key => $label) {
            foreach ($summary[$key] as $name => $count) {
                $rows[] = [$label, $name, $count];
            }
        }
        foreach ($summary['top_warnings'] as $name => $count) {
            $rows[] = ['Warning', $name, $count];
        }
        $this->table(['Group', 'Value', 'Count'], $rows);
        $this->table(['Metric', 'Value'], [
            ['manual review rate', $summary['manual_review_rate'] ?? 'n/a'],
            ['paid calls', $summary['extraction_calls']],
            ['latency p50 / p95 ms', ($summary['latency_p50_ms'] ?? 'n/a').' / '.($summary['latency_p95_ms'] ?? 'n/a')],
            ['tokens in / out', $tokens['input'].' / '.($tokens['output'] + $tokens['thought'])],
            ['estimated cost (USD)', $summary['estimated_cost_usd']],
            ['today calls / limit', $summary['today']['calls'].' / '.$summary['today']['call_limit']],
            ['today tokens / limit', $summary['today']['tokens'].' / '.$summary['today']['token_limit']],
            ['consent gate leaks', $summary['consent_gate_leaks']],
            ['billing attestation', $summary['billing_attestation'] ?? 'none'],
        ]);
        if (ReceiptExtractionRouter::isFreeTierDemo()) {
            $this->warn('FREE-TIER DEMO attestation is in force: only the project team\'s own receipts may be captured.');
        }
        if ($consentLeaks > 0) {
            $this->error("{$consentLeaks} report(s) reached the provider on an unapproved notice version. Disable the provider and investigate.");
        }

        return $consentLeaks === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function tally(array &$bucket, string $key): void
    {
        $bucket[$key] = ($bucket[$key] ?? 0) + 1;
    }

    /** @return array<string, int> */
    private function top(array $bucket, int $limit = 8): array
    {
        arsort($bucket);

        return array_slice($bucket, 0, $limit, true);
    }

    private function percentile(array $values, int $percent): ?int
    {
        if ($values === []) {
            return null;
        }
        sort($values);

        return $values[max(0, (int) ceil($percent / 100 * count($values)) - 1)];
    }
}
