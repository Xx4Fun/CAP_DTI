<?php

namespace App\Console\Commands;

use App\Services\Receipt\Evaluation\CorpusImageException;
use App\Services\Receipt\Evaluation\ReceiptEvaluationScorer;
use App\Services\Receipt\Extraction\ExtractionFailedException;
use App\Services\Receipt\Extraction\ReceiptAmount;
use App\Services\Receipt\Extraction\ReceiptExtraction;
use App\Services\Receipt\Extraction\ReceiptExtractionRouter;
use App\Services\Receipt\Extraction\ReceiptExtractionValidator;
use App\Services\Receipt\Extraction\ReceiptExtractor;
use App\Services\Receipt\Extraction\RetryableExtractionException;
use Illuminate\Console\Command;
use Illuminate\Support\Sleep;

/**
 * Phase 2 evaluation harness: runs the production extractor and validator directly on a private, human-labelled
 * receipt corpus and scores the results. It never touches reports, consent, queues, or the database, and only runs in
 * local development. Unless the paid project is attested, every case must be marked as masked by whoever prepared it.
 */
class EvaluateReceiptExtraction extends Command
{
    protected $signature = 'receipts:evaluate
        {--corpus= : Directory of case folders (default: ../receipt-samples/corpus)}
        {--case=* : Only evaluate these case ids}
        {--out= : Results directory (default: ../receipt-samples/eval-results/<UTC timestamp>)}
        {--repeat=1 : Runs per case, for latency and stability}
        {--delay=6 : Seconds between provider calls (free-tier pacing)}
        {--max-calls=40 : Hard cap on provider calls in this run}
        {--dry-run : Check the case manifests and images without calling the provider}';

    protected $description = 'Evaluate receipt extraction against a private labelled corpus (local development only)';

    /** Waits before retrying a transient provider failure; free-tier rate limits recover within a minute. */
    private const RETRY_WAITS = [30, 60];

    /** Sections are re-encoded the way the PWA captures them, so the harness measures what production sends. */
    private const CAPTURE_LONG_EDGE = 2000;

    private const CAPTURE_QUALITY = 86;

    private const ENGINE_FIELDS = ['provider', 'model', 'thinking_level', 'image_resolution', 'service_tier', 'derived_images', 'provider_status', 'http_status'];

    private int $calls = 0;

    /** Token usage of every provider call made for the current case, including retried and failed attempts. */
    private array $pendingUsage = [];

    public function handle(ReceiptEvaluationScorer $scorer, ReceiptExtractionValidator $validator): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('The evaluation harness only runs in local development.');

            return self::FAILURE;
        }

        $corpus = rtrim((string) ($this->option('corpus') ?: base_path('../receipt-samples/corpus')), '/\\');
        [$cases, $errors] = $this->loadCases($corpus, array_values(array_filter((array) $this->option('case'))));
        foreach ($errors as $error) {
            $this->error($error);
        }
        if ($cases === []) {
            $this->error('No runnable cases found.');

            return self::FAILURE;
        }
        $unverified = array_keys(array_filter($cases, fn (array $case) => ($case['ground_truth']['verified'] ?? false) !== true));
        if ($unverified !== []) {
            $this->warn('Ground truth not yet verified by a person: '.implode(', ', $unverified));
        }

        if ($this->option('dry-run')) {
            $this->table(['Case', 'Sections', 'Items', 'Categories'], array_map(fn (array $case) => [
                $case['id'], count($case['sections']), count($case['expected']['items']), implode(', ', (array) ($case['categories'] ?? [])),
            ], array_values($cases)));

            return $errors === [] ? self::SUCCESS : self::FAILURE;
        }
        if (! ReceiptExtractionRouter::isUsableKey((string) config('services.gemini.key'))) {
            $this->error('GEMINI_API_KEY is not configured or not usable.');

            return self::FAILURE;
        }

        $out = rtrim((string) ($this->option('out') ?: base_path('../receipt-samples/eval-results/'.now('UTC')->format('Ymd-His'))), '/\\');
        if (! is_dir($out.'/runs') && ! mkdir($out.'/runs', 0777, true)) {
            $this->error('Could not create the results directory.');

            return self::FAILURE;
        }

        $repeat = max(1, (int) $this->option('repeat'));
        $maxCalls = max(1, (int) $this->option('max-calls'));
        $runs = [];
        foreach ($cases as $case) {
            for ($run = 1; $run <= $repeat; $run++) {
                if ($this->calls >= $maxCalls) {
                    $this->warn("Stopped at the --max-calls limit ({$maxCalls}).");
                    break 2;
                }
                $record = $this->evaluate($case, $run, $scorer, $validator, $maxCalls);
                $runs[] = $record;
                file_put_contents("{$out}/runs/{$case['id']}-{$run}.json", json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION));
                $this->line($this->runLine($record));
                if ($this->output->isVerbose()) {
                    foreach ($record['score']['details'] ?? [] as $detail) {
                        $this->line('    - '.$detail);
                    }
                }
            }
        }

        $engines = array_values(array_filter(array_column($runs, 'engine')));
        $summary = [
            'generated_at' => now('UTC')->toIso8601String(),
            'engine' => $engines[0] ?? null,
            'cases' => count($cases),
            'provider_calls' => $this->calls,
            'unverified_ground_truth' => $unverified,
            'metrics' => $scorer->aggregate($runs),
        ];
        file_put_contents($out.'/summary.json', json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION));
        file_put_contents($out.'/summary.md', $this->markdown($summary, $runs));

        $this->table(['Target', 'Value', 'Goal', 'Met'], array_map(fn (string $name, array $target) => [
            $name, json_encode($target['value']), json_encode($target['target']), $this->metLabel($target['met']),
        ], array_keys($summary['metrics']['targets']), $summary['metrics']['targets']));
        $this->info('Results written to '.$out);

        return self::SUCCESS;
    }

    /** @return array<string, mixed> */
    private function evaluate(array $case, int $run, ReceiptEvaluationScorer $scorer, ReceiptExtractionValidator $validator, int $maxCalls): array
    {
        $record = ['case' => $case['id'], 'run' => $run, 'categories' => (array) ($case['categories'] ?? []), 'sections' => count($case['sections']),
            'failure' => null, 'duration_ms' => null, 'usage' => [], 'engine' => [], 'score' => null];
        $frames = [];
        try {
            $frames = $this->captureFrames($case);
            $extraction = $this->extractWithRetries($frames, $maxCalls);
        } catch (RetryableExtractionException|ExtractionFailedException $exception) {
            return [...$record, 'failure' => $exception->failureCode, 'usage' => $this->takeUsage($exception->engine['usage'] ?? []),
                'engine' => array_intersect_key($exception->engine, array_flip(self::ENGINE_FIELDS))];
        } catch (CorpusImageException $exception) {
            // A corpus image the provider never saw: report the case and keep the rest of the run going.
            $this->warn("  {$case['id']}: {$exception->getMessage()}");

            return [...$record, 'failure' => 'CORPUS_IMAGE_UNREADABLE', 'usage' => $this->takeUsage()];
        } finally {
            foreach ($frames as $frame) {
                @unlink($frame['path']);
            }
        }

        $result = $validator->validate($extraction->payload, [
            'store_name' => $case['store'] ?? null,
            'frame_count' => count($frames),
            'prior_recapture_reasons' => [],
        ]);

        return [...$record,
            'duration_ms' => $extraction->engine['duration_ms'] ?? null,
            'usage' => $this->takeUsage($extraction->engine['usage'] ?? []),
            'engine' => array_intersect_key($extraction->engine, array_flip(self::ENGINE_FIELDS)),
            'score' => $scorer->score($case['expected'], $result),
            'result' => $result,
            'extraction' => $extraction->payload,
        ];
    }

    private function extractWithRetries(array $frames, int $maxCalls): ReceiptExtraction
    {
        $retries = 0;
        while (true) {
            if ($this->calls > 0) {
                Sleep::for(max(0, (int) $this->option('delay')))->seconds();
            }
            $this->calls++;
            try {
                return app(ReceiptExtractor::class)->extract($frames);
            } catch (RetryableExtractionException $exception) {
                if ($retries >= count(self::RETRY_WAITS) || $this->calls >= $maxCalls) {
                    throw $exception;
                }
                $this->recordUsage($exception->engine['usage'] ?? []);
                $this->warn("  {$exception->failureCode}; retrying in ".self::RETRY_WAITS[$retries].' s');
                Sleep::for(self::RETRY_WAITS[$retries++])->seconds();
            }
        }
    }

    /** Adds one call's token usage to the current case's running total (`addUsage` is taken by Symfony's Command). */
    private function recordUsage(mixed $usage): void
    {
        foreach ((array) $usage as $key => $value) {
            if (is_int($value) || is_float($value)) {
                $this->pendingUsage[$key] = ($this->pendingUsage[$key] ?? 0) + (int) $value;
            }
        }
    }

    /** Returns the case's total usage (every attempt, billed or not) and resets it for the next case. */
    private function takeUsage(mixed $final = []): array
    {
        $this->recordUsage($final);
        $usage = $this->pendingUsage;
        $this->pendingUsage = [];

        return $usage;
    }

    /** @return array<int, array{path: string, mime_type: string, sequence: int}> Transient JPEG copies, deleted after the call. */
    private function captureFrames(array $case): array
    {
        $frames = [];
        try {
            foreach ($case['sections'] as $sequence => $file) {
                $image = @imagecreatefromstring((string) @file_get_contents($case['dir'].DIRECTORY_SEPARATOR.$file));
                if (! $image) {
                    throw new CorpusImageException("section image {$file} could not be decoded");
                }
                $scale = min(1, self::CAPTURE_LONG_EDGE / max(imagesx($image), imagesy($image)));
                if ($scale < 1) {
                    $image = imagescale($image, max(1, (int) round(imagesx($image) * $scale)), max(1, (int) round(imagesy($image) * $scale)));
                }
                $path = (string) tempnam(sys_get_temp_dir(), 'receipt-eval-');
                imagejpeg($image, $path, self::CAPTURE_QUALITY);
                $frames[] = ['path' => $path, 'mime_type' => 'image/jpeg', 'sequence' => $sequence];
            }
        } catch (\Throwable $exception) {
            // Receipt imagery must never be left behind when a later section fails.
            foreach ($frames as $frame) {
                @unlink($frame['path']);
            }
            throw $exception;
        }

        return $frames;
    }

    /** @return array{0: array<string, array<string, mixed>>, 1: array<int, string>} */
    private function loadCases(string $corpus, array $only): array
    {
        $cases = [];
        $errors = [];
        $paidProject = config('services.gemini.billing_attested') === 'paid';
        foreach (glob($corpus.'/*/case.json') ?: [] as $file) {
            $dir = dirname($file);
            $id = basename($dir);
            if ($only !== [] && ! in_array($id, $only, true)) {
                continue;
            }
            $case = json_decode((string) file_get_contents($file), true);
            $problem = is_array($case) ? $this->caseProblem($case, $dir, $paidProject) : 'case.json is not valid JSON';
            if ($problem !== null) {
                $errors[] = "{$id}: {$problem}";

                continue;
            }
            $cases[$id] = [...$case, 'id' => $id, 'dir' => $dir];
        }
        ksort($cases);

        return [$cases, $errors];
    }

    private function caseProblem(array $case, string $dir, bool $paidProject): ?string
    {
        if (($case['masked'] ?? false) !== true && ! $paidProject) {
            return 'not marked "masked": true; on the free tier personal fields must be masked in every image first';
        }
        $sections = $case['sections'] ?? null;
        if (! is_array($sections) || $sections === [] || ! array_is_list($sections)) {
            return '"sections" must list the section image files in order';
        }
        foreach ($sections as $file) {
            $path = $dir.DIRECTORY_SEPARATOR.(is_string($file) ? $file : '');
            if (! is_string($file) || ! is_file($path) || @getimagesize($path) === false) {
                return 'section image '.json_encode($file).' is missing or not an image';
            }
        }
        $expected = $case['expected'] ?? null;
        if (! is_array($expected) || ! is_array($expected['items'] ?? null) || ! array_is_list($expected['items'])) {
            return '"expected.items" must be a list';
        }
        $amounts = [$expected['total'] ?? null, $expected['subtotal'] ?? null, ...(array) ($expected['discounts'] ?? []), ...(array) ($expected['other_amounts'] ?? [])];
        foreach ($expected['items'] as $index => $item) {
            if (! is_array($item) || ! array_key_exists('name', $item)) {
                return 'expected item '.($index + 1).' needs a "name" (null when unreadable)';
            }
            if (($item['quantity'] ?? null) !== null && ReceiptAmount::quantity((string) $item['quantity']) === null) {
                return 'expected item '.($index + 1).' has an invalid quantity';
            }
            array_push($amounts, $item['unit_price'] ?? null, $item['line_total'] ?? null);
        }
        foreach ($amounts as $amount) {
            if ($amount !== null && (! is_string($amount) || ReceiptAmount::money($amount) === null)) {
                return 'expected amount '.json_encode($amount).' must be a printed amount string such as "27.50"';
            }
        }

        return null;
    }

    private function runLine(array $record): string
    {
        if ($record['failure'] !== null) {
            return sprintf('%s #%d  FAILED %s', $record['case'], $record['run'], $record['failure']);
        }
        $score = $record['score'];

        return sprintf('%s #%d  status %s  items %d/%d  wrong %d  missed %d  invented %d  total %s  %s ms',
            $record['case'], $record['run'], $score['status_correct'] ? 'ok' : 'MISMATCH', $score['items_paired'], $score['items_expected'],
            $score['numeric']['wrong'], $score['numeric']['missed'], $score['numeric']['invented'] + count($score['invented_fields']),
            match ($score['total_correct']) { true => 'ok', false => 'WRONG', null => 'n/a' }, $record['duration_ms'] ?? '-');
    }

    private function metLabel(?bool $met): string
    {
        return match ($met) { true => 'yes', false => 'NO', null => 'no data' };
    }

    private function markdown(array $summary, array $runs): string
    {
        $metrics = $summary['metrics'];
        $lines = [
            '# Receipt extraction evaluation',
            '',
            'Generated '.$summary['generated_at'].'. Engine: `'.json_encode($summary['engine']).'`.',
            '',
            sprintf('%d cases, %d runs (%d scored), %d provider calls. Unverified ground truth: %s.', $summary['cases'], $metrics['runs'],
                $metrics['scored_runs'], $summary['provider_calls'], $summary['unverified_ground_truth'] === [] ? 'none' : implode(', ', $summary['unverified_ground_truth'])),
            '',
            '| Target | Value | Goal | Met |',
            '|---|---|---|---|',
        ];
        foreach ($metrics['targets'] as $name => $target) {
            $lines[] = sprintf('| %s | %s | %s | %s |', $name, json_encode($target['value']), json_encode($target['target']), $this->metLabel($target['met']));
        }
        array_push($lines, '', '| Metric | Value |', '|---|---|');
        foreach (['item_recall', 'item_precision', 'names_exact', 'exact_numeric_accuracy', 'wrong_values', 'missed_values', 'invented_numeric', 'false_items',
            'overlap_lines_flagged', 'genuine_lines_flagged', 'date_accuracy', 'status_accuracy', 'reconciliation_matched', 'latency_p50_ms',
            'latency_p95_ms', 'tokens', 'estimated_cost_usd', 'failures'] as $key) {
            $lines[] = "| {$key} | ".json_encode($metrics[$key]).' |';
        }
        array_push($lines, '', '## Runs', '');
        foreach ($runs as $record) {
            $lines[] = '- '.$this->runLine($record);
        }

        return implode("\n", $lines)."\n";
    }
}
