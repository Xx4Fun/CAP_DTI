<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\LegalNoticeController;
use App\Http\Controllers\CitizenTipController;
use App\Http\Controllers\CalamityController;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\PublicPwaController;

Route::post('/login', [AuthController::class, 'login']);

// Public Unauthenticated Consumer PWA Routes
Route::prefix('public')->group(function () {
    Route::get('/config', [PublicPwaController::class, 'config']);
    Route::get('/commodities', [PublicPwaController::class, 'commodities']);
    Route::get('/establishments', [PublicPwaController::class, 'establishments']);
    Route::middleware('ocr.rate_limit')->group(function () {
        Route::post('/scan-tag', [PublicPwaController::class, 'scanTag']);
        Route::post('/scan-tag/analyze', [PublicPwaController::class, 'analyzeTag']);
        Route::post('/scan-tag/manual-select', [PublicPwaController::class, 'manualSelect']);
        Route::post('/scan-tag/compare', [PublicPwaController::class, 'compareScanTag']);
        Route::post('/compare-price', [PublicPwaController::class, 'comparePrice']);
    });
    Route::post('/capture-session', [PublicPwaController::class, 'createCaptureSession']);
    Route::post('/reports', [PublicPwaController::class, 'submitReport']);
    Route::post('/reports/{reference}/confirm-ocr', [PublicPwaController::class, 'confirmOcr']);
    Route::get('/reports/track', [PublicPwaController::class, 'trackReport']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/sync/down', [SyncController::class, 'down']);
    Route::post('/sync/up', [SyncController::class, 'up']);

    // Legal Notices
    Route::get('/notices', [LegalNoticeController::class, 'index']);
    Route::get('/notices/{id}', [LegalNoticeController::class, 'show']);
    Route::post('/notices/dispatch', [LegalNoticeController::class, 'dispatchNotice']);
    Route::post('/notices/{id}/rebuttal', [LegalNoticeController::class, 'uploadRebuttal']);

    // Citizen Tips
    Route::get('/tips', [CitizenTipController::class, 'index']);
    Route::post('/tips', [CitizenTipController::class, 'store']);
    Route::post('/tips/{id}/status', [CitizenTipController::class, 'updateStatus']);

    // Calamity Toggle Settings
    Route::get('/calamity', [CalamityController::class, 'show']);
    Route::post('/calamity/toggle', [CalamityController::class, 'toggle']);
});
