<?php

namespace App\Providers;

use App\Services\Admin\AuditTrailService;
use App\Services\Receipt\Extraction\GeminiReceiptExtractor;
use App\Services\Receipt\Extraction\ReceiptExtractor;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Built only when a report is routed to the provider, so gate-off environments never need a key.
        $this->app->bind(ReceiptExtractor::class, fn () => new GeminiReceiptExtractor(
            apiKey: trim((string) config('services.gemini.key')),
            model: (string) config('services.gemini.model'),
            endpoint: (string) config('services.gemini.endpoint'),
            thinkingLevel: (string) config('services.gemini.thinking_level'),
            imageResolution: config('services.gemini.image_resolution') ?: null,
            timeoutSeconds: (int) config('services.gemini.timeout_seconds'),
            maxRequestBytes: (int) config('services.receipt_extraction.max_request_bytes'),
            caBundle: config('services.gemini.ca_bundle') ?: null,
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (config('services.receipt_extraction.provider') === 'gemini'
            && ! \App\Services\Receipt\Extraction\ReceiptExtractionRouter::isUsableKey((string) config('services.gemini.key'))) {
            \Illuminate\Support\Facades\Log::error('receipt_extraction.gemini_not_configured');
        }

        // A demonstration attestation outside local development is a deliberate, restricted state worth recording.
        if (config('services.receipt_extraction.provider') === 'gemini'
            && \App\Services\Receipt\Extraction\ReceiptExtractionRouter::isFreeTierDemo()
            && ! app()->environment(['local', 'testing'])) {
            \Illuminate\Support\Facades\Log::warning('receipt_extraction.free_tier_demo_attestation', ['environment' => app()->environment()]);
        }

        if (request()->header('X-Forwarded-Proto') === 'https' || app()->environment('production')) {
            \Illuminate\Support\Facades\URL::forceScheme('https');
        }

        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));
            $identity = hash('sha256', $email.'|'.$request->ip());

            return [
                Limit::perMinute(5)->by('login:'.$identity),
                Limit::perMinute(20)->by('login-ip:'.$request->ip()),
            ];
        });

        Sanctum::authenticateAccessTokensUsing(function ($accessToken, bool $isValid): bool {
            if (! $accessToken->can('dti-admin')) {
                return $isValid;
            }

            $lastActivity = $accessToken->last_used_at ?? $accessToken->created_at;
            $idleExpired = ! $lastActivity
                || $lastActivity->lte(now()->subMinutes(config('admin_security.idle_timeout_minutes')));

            if (! $isValid || $idleExpired) {
                app(AuditTrailService::class)->recordAs(
                    request(),
                    $accessToken->tokenable,
                    'auth.session_expired',
                    $accessToken->tokenable,
                    ['reason' => $idleExpired ? 'idle_timeout' : 'absolute_timeout']
                );
                $accessToken->delete();

                return false;
            }

            return true;
        });
    }
}
