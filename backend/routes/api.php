<?php

use App\Http\Controllers\Admin\AdminOverviewController;
use App\Http\Controllers\Admin\AdminSessionController;
use App\Http\Controllers\Admin\AdminSettingsController;
use App\Http\Controllers\Admin\AuditEventController;
use App\Http\Controllers\Admin\EmergencyAdminController;
use App\Http\Controllers\Admin\LegalDraftController;
use App\Http\Controllers\Admin\ReportReviewController;
use App\Http\Controllers\Admin\SrpAdminController;
use App\Http\Controllers\Admin\SrpManagementController;
use App\Http\Controllers\Admin\StoreAdminController;
use App\Http\Controllers\Admin\TemporalAnalyticsController;
use App\Http\Controllers\Admin\VendorInvitationController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CalamityController;
use App\Http\Controllers\CitizenTipController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\LegalNoticeController;
use App\Http\Controllers\PublicCommodityController;
use App\Http\Controllers\PublicPwaController;
use App\Http\Controllers\ReceiptEvidenceController;
use App\Http\Controllers\ReceiptReportController;
use App\Http\Controllers\SyncController;
use Illuminate\Support\Facades\Route;

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/vendor-invitations/{token}/accept', [VendorInvitationController::class, 'accept']);
Route::get('/health/ready', [HealthController::class, 'ready'])->middleware('throttle:30,1');

Route::prefix('public')->group(function () {
    Route::get('/config', [PublicPwaController::class, 'config']);
    Route::get('/commodities', [PublicCommodityController::class, 'index']);
    Route::get('/commodities/{commodity}/history', [PublicCommodityController::class, 'history']);
    Route::get('/establishments', [PublicPwaController::class, 'establishments']);
    Route::middleware('ocr.rate_limit')->group(function () {
        Route::post('/scan-tag', [PublicPwaController::class, 'scanTag']);
        Route::post('/scan-tag/analyze', [PublicPwaController::class, 'analyzeTag']);
        Route::post('/scan-tag/manual-select', [PublicPwaController::class, 'manualSelect']);
        Route::post('/scan-tag/compare', [PublicPwaController::class, 'compareScanTag']);
        Route::post('/compare-price', [PublicPwaController::class, 'comparePrice']);
    });
    Route::middleware('throttle:30,1')->group(function () {
        Route::post('/capture-session', [PublicPwaController::class, 'createCaptureSession']);
        Route::post('/capture-sessions/{session}/assets', [ReceiptEvidenceController::class, 'storeAsset']);
        Route::delete('/capture-sessions/{session}', [ReceiptEvidenceController::class, 'destroy']);
        Route::post('/reports', [PublicPwaController::class, 'submitReport']);
        Route::get('/reports/{reference}/processing', [ReceiptReportController::class, 'processing']);
        Route::get('/reports/{reference}/review', [ReceiptReportController::class, 'review']);
        Route::post('/reports/{reference}/push-subscription', [ReceiptReportController::class, 'subscribe']);
        Route::delete('/reports/{reference}/push-subscription', [ReceiptReportController::class, 'unsubscribe']);
        Route::post('/reports/{reference}/confirm-ocr', [ReceiptReportController::class, 'confirm']);
    });
    Route::get('/reports/track', [PublicPwaController::class, 'trackReport']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('admin')->middleware('dti.role:super_admin,dti_evaluator,field_officer')->group(function () {
        Route::get('/session', [AdminSessionController::class, 'show']);
        Route::post('/reauthenticate', [AdminSessionController::class, 'reauthenticate']);
        Route::get('/overview', [AdminOverviewController::class, 'show']);
        Route::get('/audit-events', [AuditEventController::class, 'index']);
        Route::get('/stores', [StoreAdminController::class, 'index']);
        Route::post('/stores', [StoreAdminController::class, 'store']);
        Route::patch('/stores/{store}', [StoreAdminController::class, 'update']);
        Route::post('/stores/{store}/invitations', [VendorInvitationController::class, 'store']);
        Route::post('/invitations/{invitation}/cancel', [VendorInvitationController::class, 'cancel']);
        Route::get('/srp', [SrpManagementController::class, 'index']);
        Route::post('/srp', [SrpManagementController::class, 'store']);
        Route::put('/srp/{srp}', [SrpManagementController::class, 'updateMetadata']);
        Route::post('/srp/batch-revisions', [SrpManagementController::class, 'batchRevisions']);
        Route::post('/srp/import/preview', [SrpAdminController::class, 'preview']);
        Route::post('/srp/import', [SrpAdminController::class, 'import']);
        Route::post('/srp/upload-image', [SrpAdminController::class, 'uploadImage']);
        Route::get('/srp/resolve', [SrpAdminController::class, 'resolve']);
        Route::post('/srp/{srp}/revisions/preview', [SrpManagementController::class, 'previewRevision']);
        Route::post('/srp/{srp}/revisions', [SrpManagementController::class, 'storeRevision']);
        Route::get('/reports', [ReportReviewController::class, 'index']);
        Route::post('/reports/{report}/decision', [ReportReviewController::class, 'decision']);
        Route::get('/reports/{report}/evidence', [ReportReviewController::class, 'evidence']);
        Route::get('/reports/{report}/evidence-manifest', [ReportReviewController::class, 'evidenceManifest']);
        Route::get('/reports/{report}/evidence-assets/{asset}', [ReportReviewController::class, 'evidenceAsset']);
        Route::get('/analytics/options', [TemporalAnalyticsController::class, 'options']);
        Route::get('/analytics/stores/{store}', [TemporalAnalyticsController::class, 'show']);
        Route::get('/emergencies', [EmergencyAdminController::class, 'index']);
        Route::post('/emergencies', [EmergencyAdminController::class, 'store']);
        Route::patch('/emergencies/{emergency}', [EmergencyAdminController::class, 'update']);
        Route::post('/emergency-prices', [EmergencyAdminController::class, 'storePrice']);
        Route::get('/emergency-prices/resolve', [EmergencyAdminController::class, 'resolve']);
        Route::post('/legal/dispatch', [LegalDraftController::class, 'dispatch']);
        Route::post('/legal/draft-preview', [LegalDraftController::class, 'preview']);

        Route::get('/settings', [AdminSettingsController::class, 'index']);
        Route::put('/settings/profile', [AdminSettingsController::class, 'updateProfile']);
        Route::put('/settings/preferences', [AdminSettingsController::class, 'updatePreferences']);
        Route::put('/settings/system', [AdminSettingsController::class, 'updateSystem']);
    });

    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/sync/down', [SyncController::class, 'down']);
    Route::post('/sync/up', [SyncController::class, 'up']);

    Route::get('/notices', [LegalNoticeController::class, 'index']);
    Route::get('/notices/{id}', [LegalNoticeController::class, 'show']);
    Route::post('/notices/dispatch', [LegalNoticeController::class, 'dispatchNotice']);
    Route::post('/notices/{id}/rebuttal', [LegalNoticeController::class, 'uploadRebuttal']);

    Route::get('/tips', [CitizenTipController::class, 'index'])
        ->middleware('dti.role:super_admin,dti_evaluator');
    Route::post('/tips', [CitizenTipController::class, 'store']);
    Route::post('/tips/{id}/status', [CitizenTipController::class, 'updateStatus'])
        ->middleware('dti.role:super_admin,dti_evaluator');

    Route::get('/calamity', [CalamityController::class, 'show']);
    Route::post('/calamity/toggle', [CalamityController::class, 'toggle'])
        ->middleware('dti.role:super_admin,dti_evaluator');
});
