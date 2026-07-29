<?php

use Illuminate\Foundation\Application;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\Request;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'ocr.rate_limit' => \App\Http\Middleware\OcrRateLimiter::class,
            'dti.role' => \App\Http\Middleware\EnsureDtiRole::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
        $exceptions->render(function (\Throwable $exception, Request $request) {
            if (! $request->is('api/*')) return null;
            if ($exception instanceof ValidationException
                || $exception instanceof AuthenticationException
                || $exception instanceof AuthorizationException
                || $exception instanceof ModelNotFoundException
                || $exception instanceof HttpResponseException
                || $exception instanceof HttpExceptionInterface) {
                return null;
            }

            return response()->json([
                'status' => 'INTERNAL_SERVER_ERROR',
                'message' => 'The request could not be completed.',
            ], 500);
        });
    })->create();
