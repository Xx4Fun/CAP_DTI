<?php

namespace App\Providers;

use App\Services\Admin\AuditTrailService;
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
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
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
