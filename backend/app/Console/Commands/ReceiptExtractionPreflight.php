<?php

namespace App\Console\Commands;

use App\Http\Controllers\PublicPwaController;
use App\Services\Receipt\Extraction\ReceiptExtractionRouter;
use Illuminate\Console\Command;

/**
 * Rollout gate for the receipt extraction provider. Reports whether this environment is configured to send real
 * receipts to the external engine, and refuses (exit 1) when the provider is enabled but a prerequisite is missing.
 * Safe to run in production: it prints configuration shape and never a secret value.
 */
class ReceiptExtractionPreflight extends Command
{
    protected $signature = 'receipts:extraction-preflight {--json : Print the checks as JSON}';

    protected $description = 'Check that receipt extraction is safely configured before enabling or after deploying';

    /** The job may not be retried by a second worker while the first is still running (duplicate paid calls). */
    private const JOB_TIMEOUT_SECONDS = 360;

    public function handle(): int
    {
        $gemini = config('services.receipt_extraction.provider') === ReceiptExtractionRouter::GEMINI;
        $environment = app()->environment();
        $localOrTesting = app()->environment(['local', 'testing']);
        $consentVersions = (array) config('services.receipt_extraction.consent_versions', []);
        $keyUsable = ReceiptExtractionRouter::isUsableKey((string) config('services.gemini.key'));
        $approved = (bool) config('services.receipt_extraction.production_approved');
        $attested = config('services.gemini.billing_attested') === 'paid';
        $connection = (string) config('queue.default');
        $retryAfter = config("queue.connections.{$connection}.retry_after");

        // A check blocks only when the provider is actually enabled; on the Tesseract default everything is advisory.
        $blocking = fn (bool $ok) => $ok ? 'OK' : ($gemini ? 'BLOCK' : 'INFO');
        $checks = [
            ['environment', 'OK', $environment.($localOrTesting ? ' (approval gate not required)' : '')],
            ['provider', 'OK', (string) config('services.receipt_extraction.provider')],
            ['gemini key usable', $blocking($keyUsable), $keyUsable ? 'configured' : 'missing or malformed'],
            ['model', 'OK', (string) config('services.gemini.model')],
            ['endpoint host', 'OK', (string) parse_url((string) config('services.gemini.endpoint'), PHP_URL_HOST)],
            ['thinking level / image resolution', 'OK', config('services.gemini.thinking_level').' / '.config('services.gemini.image_resolution')],
            ['production approved', $localOrTesting ? 'OK' : $blocking($approved), $approved ? 'true' : 'false'],
            ['billing attested paid', $localOrTesting ? 'OK' : $blocking($attested), $attested ? 'paid' : 'not attested'],
            ['approved consent versions', $blocking($consentVersions !== []), $consentVersions === [] ? 'none' : implode(', ', $consentVersions)],
            ['current notice version', $blocking(in_array(PublicPwaController::CURRENT_PRIVACY_NOTICE_VERSION, $consentVersions, true)),
                PublicPwaController::CURRENT_PRIVACY_NOTICE_VERSION.(in_array(PublicPwaController::CURRENT_PRIVACY_NOTICE_VERSION, $consentVersions, true) ? ' (approved)' : ' (not approved: no report can reach the provider)')],
            ['queue retry_after > job timeout', $retryAfter === null ? 'OK' : $blocking((int) $retryAfter > self::JOB_TIMEOUT_SECONDS),
                $connection.': '.($retryAfter === null ? 'not applicable' : $retryAfter.'s vs '.self::JOB_TIMEOUT_SECONDS.'s job timeout')],
            ['caps (attempt / report / daily calls / daily tokens)', 'OK', implode(' / ', [
                (int) config('services.receipt_extraction.max_calls_per_attempt'),
                (int) config('services.receipt_extraction.max_calls_per_report'),
                (int) config('services.receipt_extraction.daily_call_limit'),
                (int) config('services.receipt_extraction.daily_token_limit'),
            ])],
            ['video capture (retired)', 'OK', config('services.receipt_capture.enabled') ? 'ENABLED - should be off' : 'disabled'],
        ];

        $blocked = array_values(array_filter($checks, fn (array $check) => $check[1] === 'BLOCK'));
        if ($this->option('json')) {
            $this->line((string) json_encode([
                'ready' => $blocked === [],
                'provider' => config('services.receipt_extraction.provider'),
                'environment' => $environment,
                'checks' => array_map(fn (array $check) => ['check' => $check[0], 'status' => $check[1], 'value' => $check[2]], $checks),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(['Check', 'Status', 'Value'], $checks);
            $blocked === []
                ? $this->info($gemini ? 'Gemini extraction is configured for this environment.' : 'Running on Tesseract; Gemini checks are advisory.')
                : $this->error(count($blocked).' blocking issue(s): '.implode(', ', array_column($blocked, 0)));
        }

        return $blocked === [] ? self::SUCCESS : self::FAILURE;
    }
}
