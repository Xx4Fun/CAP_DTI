<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\Response;

class OcrRateLimiter
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // 1. Per-IP and Per-Session Rate Limiter (max 10 requests per minute)
        $sessionId = $request->hasSession() ? $request->session()->getId() : null;
        $rateKey = 'ocr_rate:' . ($sessionId ?? $request->ip());
        $maxAttempts = 10;
        $decaySeconds = 60;

        if (RateLimiter::tooManyAttempts($rateKey, $maxAttempts)) {
            $retryAfter = RateLimiter::availableIn($rateKey);
            return response()->json([
                'success' => false,
                'message' => 'Rate limit exceeded. Please wait a moment before taking another scan.',
            ], 429, [
                'Retry-After' => (string) $retryAfter,
            ]);
        }

        // 2. Duplicate Lock by scan_uuid
        $scanUuid = $request->input('scan_uuid') ?? $request->header('X-Scan-UUID');
        if ($scanUuid) {
            $lockKey = 'ocr_lock:' . $scanUuid;
            $acquired = Cache::add($lockKey, true, 60);

            if (!$acquired) {
                return response()->json([
                    'success' => false,
                    'message' => 'A scan operation is currently in progress for this scan UUID.',
                ], 429);
            }
        }

        RateLimiter::hit($rateKey, $decaySeconds);

        return $next($request);
    }
}
