<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\LegalNoticeController;
use App\Http\Controllers\CitizenTipController;
use App\Http\Controllers\CalamityController;
use App\Http\Controllers\Admin\AdminOverviewController;
use App\Http\Controllers\Admin\AuditEventController;
use App\Http\Controllers\Admin\EmergencyAdminController;
use App\Http\Controllers\Admin\LegalDraftController;
use App\Http\Controllers\Admin\ReportReviewController;
use App\Http\Controllers\Admin\SrpAdminController;
use App\Http\Controllers\Admin\StoreAdminController;
use App\Http\Controllers\Admin\TemporalAnalyticsController;
use App\Http\Controllers\Admin\VendorInvitationController;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\PublicPwaController;

Route::post('/login', [AuthController::class, 'login']);
Route::post('/vendor-invitations/{token}/accept', [VendorInvitationController::class, 'accept']);

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
    Route::prefix('admin')->group(function () {
        Route::get('/overview', [AdminOverviewController::class, 'show']);
        Route::get('/audit-events', [AuditEventController::class, 'index']);
        Route::get('/stores', [StoreAdminController::class, 'index']);
        Route::post('/stores', [StoreAdminController::class, 'store']);
        Route::patch('/stores/{store}', [StoreAdminController::class, 'update']);
        Route::post('/stores/{store}/invitations', [VendorInvitationController::class, 'store']);
        Route::post('/invitations/{invitation}/cancel', [VendorInvitationController::class, 'cancel']);
        Route::get('/srp', [SrpAdminController::class, 'index']);
        Route::post('/srp/import/preview', [SrpAdminController::class, 'preview']);
        Route::post('/srp/import', [SrpAdminController::class, 'import']);
        Route::get('/srp/resolve', [SrpAdminController::class, 'resolve']);
        Route::get('/reports', [ReportReviewController::class, 'index']);
        Route::post('/reports/{report}/decision', [ReportReviewController::class, 'decision']);
        Route::get('/reports/{report}/evidence', [ReportReviewController::class, 'evidence']);
        Route::get('/analytics/stores/{store}', [TemporalAnalyticsController::class, 'show']);
        Route::get('/emergencies', [EmergencyAdminController::class, 'index']);
        Route::post('/emergencies', [EmergencyAdminController::class, 'store']);
        Route::patch('/emergencies/{emergency}', [EmergencyAdminController::class, 'update']);
        Route::post('/emergency-prices', [EmergencyAdminController::class, 'storePrice']);
        Route::get('/emergency-prices/resolve', [EmergencyAdminController::class, 'resolve']);
        Route::post('/legal/dispatch', [LegalDraftController::class, 'dispatch']);
        Route::post('/legal/draft-preview', [LegalDraftController::class, 'preview']);
    });

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
