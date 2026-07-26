<?php

namespace App\Http\Controllers;

use App\Models\CaptureSession;
use App\Models\CitizenTip;
use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use App\Services\Ocr\HistoricalPriceResolver;
use App\Services\Ocr\RegulatoryPriceResolver;
use App\Services\Ocr\ScanSessionRepository;
use App\Services\Ocr\ShelfTagFieldParser;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Ocr\ShelfTagProductMatcher;
use App\Services\Ocr\ShelfTagTextNormalizer;

class PublicPwaController extends Controller
{
    public function config()
    {
        $stateOfCalamity = Cache::get('state_of_calamity', false);
        return response()->json([
            'success' => true,
            'message' => 'Public configuration retrieved successfully.',
            'data' => [
                'app_name' => 'PRICE-Watch',
                'state_of_calamity' => (bool) $stateOfCalamity,
                'privacy_notice_version' => '1.0',
                'max_upload_size_mb' => 10,
                'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
                'last_updated_at' => now()->toIso8601String(),
            ]
        ]);
    }

    public function commodities(Request $request)
    {
        $query = SrpBulletin::where('is_active', true);

        if ($request->filled('query')) {
            $search = trim($request->input('query'));
            $searchTerm = '%' . strtolower($search) . '%';

            $query->where(function ($q) use ($searchTerm) {
                $q->whereRaw('LOWER(commodity_name) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(category) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(unit) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(regulatory_classification) LIKE ?', [$searchTerm]);
            });
        }

        $commodities = $query->orderBy('regulatory_classification', 'asc')
            ->orderBy('category', 'asc')
            ->orderBy('commodity_name', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Commodities retrieved successfully.',
            'data' => $commodities
        ]);
    }

    public static function formatPublicStore(Store $store): array
    {
        return [
            'id' => (int) $store->id,
            'store_name' => (string) $store->store_name,
            'address' => (string) $store->address,
            'latitude' => (float) $store->latitude,
            'longitude' => (float) $store->longitude,
            'is_verified' => (bool) $store->is_verified,
        ];
    }

    public function getVerifiedStore(mixed $storeId): Store
    {
        if (!$storeId || !is_numeric($storeId)) {
            abort(response()->json([
                'success' => false,
                'message' => 'The selected establishment is unverified, inactive, or not eligible for public price checking.',
            ], 422));
        }

        $store = Store::find((int) $storeId);

        if (!$store || !$store->is_active || !$store->is_verified) {
            abort(response()->json([
                'success' => false,
                'message' => 'The selected establishment is unverified, inactive, or not eligible for public price checking.',
            ], 422));
        }

        return $store;
    }

    public function establishments(Request $request)
    {
        $query = Store::where('is_active', true)->where('is_verified', true);

        if ($request->filled('query')) {
            $search = $request->input('query');
            $query->where(function ($q) use ($search) {
                $q->where('store_name', 'like', "%{$search}%")
                  ->orWhere('address', 'like', "%{$search}%");
            });
        }

        $stores = $query->orderBy('store_name', 'asc')->get()->map(function ($store) {
            return self::formatPublicStore($store);
        });

        return response()->json([
            'success' => true,
            'message' => 'Establishments retrieved successfully.',
            'data' => $stores
        ]);
    }

    /**
     * Dynamic Shelf Tag OCR & Product Matching Endpoint
     */
    public function scanTag(Request $request)
    {
        $request->validate([
            'store_id' => 'required',
            'image' => 'required|file|image|mimes:jpeg,png,webp|max:10240',
            'manual_query' => 'nullable|string',
        ]);

        $store = $this->getVerifiedStore($request->store_id);
        $file = $request->file('image');
        $vaultPath = $file->store('scan_vault', 'local');

        // Optional query text parameter (passed from client OCR or manual hint)
        $queryText = trim($request->input('manual_query', ''));

        // Look up candidate products dynamically from srp_bulletins table
        $candidatesQuery = SrpBulletin::where('is_active', true);

        if ($queryText !== '') {
            $searchTerm = '%' . strtolower($queryText) . '%';
            $candidatesQuery->where(function ($q) use ($searchTerm) {
                $q->whereRaw('LOWER(commodity_name) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(category) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(unit) LIKE ?', [$searchTerm]);
            });
        }

        $candidates = $candidatesQuery->limit(5)->get();

        // If no specific candidates matched, return top active regulated commodities for consumer selection
        if ($candidates->isEmpty()) {
            $candidates = SrpBulletin::where('is_active', true)
                ->orderBy('regulatory_classification', 'asc')
                ->limit(5)
                ->get();
        }

        // Attempt price parsing if embedded in text query or image metadata
        $detectedPrice = null;
        if (preg_match('/(\d+\.\d{2})/', $queryText, $matches)) {
            $detectedPrice = (float) $matches[1];
        }

        $hasTextQuery = $queryText !== '';
        return response()->json([
            'success' => true,
            'message' => $hasTextQuery
                ? 'Shelf tag uploaded and matched against input text query.'
                : 'Shelf tag uploaded. Select the corresponding product commodity below for comparison.',
            'data' => [
                'scan_id' => 'scan_' . Str::uuid(),
                'store' => self::formatPublicStore($store),
                'detected_price' => $detectedPrice,
                'ocr_status' => $hasTextQuery ? 'TEXT_QUERY_MATCHED' : 'MANUAL_SELECTION_REQUIRED',
                'candidates' => $candidates,
                'timestamp' => now()->toIso8601String(),
            ]
        ]);
    }

    /**
     * Analyze Shelf Tag OCR Endpoint (POST /public/scan-tag/analyze)
     */
    public function analyzeTag(
        Request $request,
        ShelfTagImagePreprocessor $preprocessor,
        ShelfTagOcrService $ocrService,
        ShelfTagFieldParser $fieldParser,
        ShelfTagProductMatcher $productMatcher,
        ScanSessionRepository $scanSessionRepository
    ) {
        $request->validate([
            'store_id' => 'required|numeric',
            'image' => 'required|file',
            'scan_uuid' => 'required|string',
        ]);

        $store = $this->getVerifiedStore($request->store_id);

        $file = $request->file('image');

        try {
            $preprocessed = $preprocessor->preprocess($file);
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }

        $processedPath = $preprocessed['path'];
        $fullPath = $preprocessed['full_path'];

        try {
            $ocrResult = $ocrService->extractText($fullPath);
            $rawStatus = $ocrResult['status'] ?? 'OCR_FAILED';

            if ($rawStatus === 'OCR_UNAVAILABLE') {
                return response()->json([
                    'success' => false,
                    'ocr_status' => 'OCR_UNAVAILABLE',
                    'message' => 'OCR service is currently unavailable.',
                ], 503);
            }

            if ($rawStatus === 'OCR_TIMEOUT') {
                return response()->json([
                    'success' => false,
                    'ocr_status' => 'OCR_TIMEOUT',
                    'message' => 'OCR processing timed out.',
                ], 504);
            }

            if ($rawStatus === 'OCR_FAILED') {
                return response()->json([
                    'success' => false,
                    'ocr_status' => 'OCR_FAILED',
                    'message' => 'OCR processing failed.',
                ], 500);
            }

            $candidates = [];
            $detectedPriceString = null;
            $detectedPriceCentavos = null;
            $businessOcrStatus = 'OCR_NO_TEXT';

            if ($rawStatus === 'OCR_NO_TEXT') {
                $businessOcrStatus = 'OCR_NO_TEXT';
            } elseif ($rawStatus === 'OCR_SUCCESS') {
                $words = $ocrResult['words'] ?? [];
                $parsed = $fieldParser->parseFromTsvWords($words);

                $detectedPriceString = $parsed['detected_price_string'] ?? null;
                $detectedPriceCentavos = $parsed['detected_price_centavos'] ?? null;

                $productRawTokens = $parsed['product_raw_tokens'] ?? [];
                $packageSizeNormalized = $parsed['package_size_normalized'] ?? null;

                $candidates = $productMatcher->matchCandidates($productRawTokens, $packageSizeNormalized);

                $hasProduct = !empty($candidates);
                $hasPrice = $detectedPriceString !== null;

                if ($hasProduct && $hasPrice) {
                    $businessOcrStatus = 'OCR_PRODUCT_AND_PRICE_DETECTED';
                } elseif ($hasProduct && !$hasPrice) {
                    $businessOcrStatus = 'PRODUCT_DETECTED_PRICE_MISSING';
                } elseif (!$hasProduct && $hasPrice) {
                    $businessOcrStatus = 'PRICE_DETECTED_PRODUCT_MISSING';
                } else {
                    $businessOcrStatus = 'NO_RELIABLE_PRODUCT_MATCH';
                }
            }

            $scanId = 'scan_' . Str::uuid();

            $allowedCandidateProductIds = array_values(array_map(fn($c) => (int) $c['id'], $candidates));

            $scanSessionRepository->put($scanId, [
                'scan_id' => $scanId,
                'scan_uuid' => (string) $request->scan_uuid,
                'store_id' => (int) $store->id,
                'ocr_status' => $businessOcrStatus,
                'allowed_candidate_product_ids' => $allowedCandidateProductIds,
                'manual_product_ids' => [],
                'detected_price_centavos' => $detectedPriceCentavos,
                'detected_price_string' => $detectedPriceString,
                'detected_price_source' => 'OCR',
                'product_source' => 'OCR',
                'consumed_state' => false,
            ]);

            return response()->json([
                'success' => true,
                'data' => [
                    'scan_id' => $scanId,
                    'scan_uuid' => (string) $request->scan_uuid,
                    'ocr_status' => $businessOcrStatus,
                    'store' => self::formatPublicStore($store),
                    'candidates' => $candidates,
                    'detected_price_string' => $detectedPriceString,
                    'detected_price_source' => 'OCR',
                    'product_source' => 'OCR',
                ]
            ], 200);

        } finally {
            $preprocessor->cleanup($processedPath);
        }
    }

    /**
     * Manual Commodity Selection Endpoint (POST /public/scan-tag/manual-select)
     */
    public function manualSelect(
        Request $request,
        ScanSessionRepository $scanSessionRepository
    ) {
        $request->validate([
            'scan_id' => 'required|string',
            'product_id' => 'required|integer',
        ]);

        $scanId = $request->input('scan_id');
        $productId = (int) $request->input('product_id');

        $session = $scanSessionRepository->get($scanId);

        if (!$session || !empty($session['consumed_state'])) {
            return response()->json([
                'success' => false,
                'message' => 'Scan session not found, expired, or already consumed.',
            ], 422);
        }

        $bulletin = SrpBulletin::where('id', $productId)->where('is_active', true)->first();

        if (!$bulletin) {
            return response()->json([
                'success' => false,
                'message' => 'The selected commodity is invalid or inactive.',
            ], 422);
        }

        $updated = $scanSessionRepository->addManualProductId($scanId, $productId);

        if (!$updated) {
            return response()->json([
                'success' => false,
                'message' => 'Scan session not found, expired, or already consumed.',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'product_id' => $productId,
                'product_source' => 'MANUAL_SEARCH',
            ]
        ], 200);
    }

    /**
     * Compare Endpoint (POST /public/scan-tag/compare)
     */
    public function compareScanTag(
        Request $request,
        ScanSessionRepository $scanSessionRepository,
        RegulatoryPriceResolver $regulatoryPriceResolver,
        HistoricalPriceResolver $historicalPriceResolver
    ) {
        $request->validate([
            'scan_id' => 'required|string',
            'store_id' => 'required|numeric',
            'product_id' => 'required|integer',
            'displayed_price' => 'required|numeric|min:0.01',
            'product_source' => 'required|string|in:OCR,MANUAL_SEARCH',
            'price_source' => 'required|string|in:USER_CONFIRMED,USER_CORRECTED,USER_ENTERED',
        ]);

        $store = $this->getVerifiedStore($request->input('store_id'));

        $scanId = (string) $request->input('scan_id');
        $session = $scanSessionRepository->get($scanId);

        if (!$session || !empty($session['consumed_state'])) {
            return response()->json([
                'success' => false,
                'message' => 'Scan session not found, expired, or already consumed.',
            ], 422);
        }

        if ((int) $store->id !== (int) ($session['store_id'] ?? 0)) {
            return response()->json([
                'success' => false,
                'message' => 'Store ID does not match scan session store.',
            ], 422);
        }

        $productId = (int) $request->input('product_id');
        $productSource = $request->input('product_source');

        if ($productSource === 'OCR') {
            $allowed = $session['allowed_candidate_product_ids'] ?? [];
            if (!in_array($productId, array_map('intval', $allowed), true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Selected product was not identified by OCR for this scan session.',
                ], 422);
            }
        } elseif ($productSource === 'MANUAL_SEARCH') {
            $manual = $session['manual_product_ids'] ?? [];
            if (!in_array($productId, array_map('intval', $manual), true)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Selected product was not registered via manual selection for this scan session.',
                ], 422);
            }
        }

        $priceSource = $request->input('price_source');
        $displayedPriceRaw = (string) $request->input('displayed_price');
        $detectedPriceStr = $session['detected_price_string'] ?? null;

        $expectedPriceSource = null;
        if ($detectedPriceStr !== null && trim((string) $detectedPriceStr) !== '') {
            $sessionPriceFormatted = number_format((float) $detectedPriceStr, 2, '.', '');
            $displayedPriceFormatted = number_format((float) $displayedPriceRaw, 2, '.', '');
            if ($sessionPriceFormatted === $displayedPriceFormatted) {
                $expectedPriceSource = 'USER_CONFIRMED';
            } else {
                $expectedPriceSource = 'USER_CORRECTED';
            }
        } else {
            $expectedPriceSource = 'USER_ENTERED';
        }

        if ($priceSource !== $expectedPriceSource) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid price source for detected OCR price state.',
            ], 422);
        }

        $product = SrpBulletin::where('id', $productId)->where('is_active', true)->first();
        if (!$product) {
            return response()->json([
                'success' => false,
                'message' => 'The selected commodity is invalid or inactive.',
            ], 422);
        }

        $stateOfCalamity = (bool) Cache::get('state_of_calamity', false);
        $regulatoryResult = $regulatoryPriceResolver->resolve($product, $stateOfCalamity);
        $historicalResult = $historicalPriceResolver->resolve($store, $product);

        $displayedPriceFloat = (float) $displayedPriceRaw;
        $displayedPriceFormatted = number_format($displayedPriceFloat, 2, '.', '');
        $displayedPriceCentavos = (int) round($displayedPriceFloat * 100);

        $regulatoryPriceCentavos = $regulatoryResult['value_centavos'] ?? null;
        $referencePrice = $regulatoryResult['value_string'] ?? null;

        $differenceCentavos = null;
        $pesoDifference = null;
        $percentDifference = null;
        $isAboveReference = false;

        if ($regulatoryPriceCentavos !== null) {
            $differenceCentavos = $displayedPriceCentavos - $regulatoryPriceCentavos;
            $pesoDifference = number_format($differenceCentavos / 100, 2, '.', '');

            if ($regulatoryPriceCentavos > 0) {
                $percentDiffFloat = ($differenceCentavos / $regulatoryPriceCentavos) * 100;
                $percentDifference = number_format($percentDiffFloat, 1, '.', '');
            }

            $isAboveReference = $differenceCentavos > 0;
        }

        $disclaimer = 'This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.';

        $scanSessionRepository->consume($scanId);

        $packageSize = ShelfTagTextNormalizer::normalizePackageSize($product->unit ?? '') 
            ?? ShelfTagTextNormalizer::normalizePackageSize($product->commodity_name) 
            ?? (string) ($product->unit ?? '');

        $unit = (string) ($product->unit ?? '');

        return response()->json([
            'success' => true,
            'data' => [
                'scan_id' => $scanId,
                'store' => self::formatPublicStore($store),
                'commodity_name' => (string) $product->commodity_name,
                'package_size' => (string) $packageSize,
                'unit' => (string) $unit,
                'displayed_price' => $displayedPriceFormatted,
                'reference_price' => $referencePrice,
                'regulatory_label' => $regulatoryResult['label'] ?? 'Current SRP',
                'regulatory_mode' => $regulatoryResult['regulatory_mode'] ?? 'NORMAL_SRP',
                'peso_difference' => $pesoDifference,
                'percent_difference' => $percentDifference,
                'is_above_reference' => $isAboveReference,
                'product_source' => $productSource,
                'price_source' => $priceSource,
                'historical_pricing' => $historicalResult,
                'disclaimer' => $disclaimer,
            ]
        ], 200);
    }

    /**
     * Dynamic Regulatory Price Comparison Engine Endpoint
     */
    public function comparePrice(Request $request)
    {
        $request->validate([
            'store_id' => 'required',
            'srp_bulletin_id' => 'required|exists:srp_bulletins,id',
            'displayed_price' => 'required|numeric|min:0.01',
        ]);

        $store = $this->getVerifiedStore($request->store_id);
        $bulletin = SrpBulletin::findOrFail($request->srp_bulletin_id);
        $stateOfCalamity = (bool) Cache::get('state_of_calamity', false);

        $displayedPrice = (float) $request->displayed_price;
        $baselinePrice = (float) $bulletin->baseline_price;

        $diffPesos = $displayedPrice - $baselinePrice;
        $percentageSrp = $baselinePrice > 0 ? (($displayedPrice - $baselinePrice) / $baselinePrice) * 100 : 0;

        // Fetch latest verified store price from temporal_inspections table
        $lastInspection = DB::table('temporal_inspections')
            ->where('store_id', $store->id)
            ->where('srp_id', $bulletin->id)
            ->orderBy('inspection_timestamp', 'desc')
            ->first();

        $previousPrice = $lastInspection ? (float) $lastInspection->recorded_price : null;
        $previousRecordedDate = $lastInspection ? date('d M Y', strtotime($lastInspection->inspection_timestamp)) : null;
        $percentagePrevious = ($previousPrice && $previousPrice > 0)
            ? (($displayedPrice - $previousPrice) / $previousPrice) * 100
            : null;

        // Determine regulatory status label & card state
        $comparisonLabel = 'Current SRP';
        $comparisonStatus = 'MATCHES_SRP';

        if (abs($diffPesos) < 0.01) {
            $comparisonStatus = 'MATCHES_SRP';
        } elseif ($diffPesos > 0) {
            $comparisonStatus = 'ABOVE_SRP';
        } else {
            $comparisonStatus = 'BELOW_SRP';
        }

        if ($stateOfCalamity && $bulletin->price_freeze_applicable) {
            $comparisonLabel = 'Frozen prevailing price';
        }

        return response()->json([
            'success' => true,
            'message' => 'Regulatory price comparison computed successfully.',
            'data' => [
                'store' => self::formatPublicStore($store),
                'product' => [
                    'id' => $bulletin->id,
                    'commodity_name' => $bulletin->commodity_name,
                    'category' => $bulletin->category,
                    'unit' => $bulletin->unit,
                    'regulatory_classification' => $bulletin->regulatory_classification,
                    'baseline_price' => $baselinePrice,
                    'effective_date' => $bulletin->effective_date ?? '11 May 2026',
                ],
                'displayed_price' => $displayedPrice,
                'baseline_price' => $baselinePrice,
                'comparison_label' => $comparisonLabel,
                'comparison_status' => $comparisonStatus,
                'difference_pesos' => round($diffPesos, 2),
                'percentage_srp' => round($percentageSrp, 1),
                'previous_verified_price' => $previousPrice,
                'previous_recorded_date' => $previousRecordedDate,
                'percentage_previous' => $percentagePrevious !== null ? round($percentagePrevious, 1) : null,
                'state_of_calamity' => $stateOfCalamity,
                'informational_notice' => 'A possible price difference was found. This does not automatically confirm a violation.',
            ]
        ]);
    }

    public function createCaptureSession(Request $request)
    {
        $request->validate([
            'store_id' => 'nullable|exists:stores,id',
        ]);

        $sessionUuid = 'cs_' . Str::uuid();
        $rawToken = 'ct_sec_' . Str::random(32);
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = now()->addMinutes(15);

        $session = CaptureSession::create([
            'session_uuid' => $sessionUuid,
            'store_id' => $request->store_id,
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'is_used' => false,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Capture session initialized.',
            'data' => [
                'capture_session_id' => $session->id,
                'session_uuid' => $sessionUuid,
                'capture_token' => $rawToken,
                'expires_at' => $expiresAt->toIso8601String(),
                'store_id' => $request->store_id,
                'max_file_size' => 10485760,
                'accepted_types' => ['image/jpeg', 'image/png', 'image/webp'],
            ]
        ], 201);
    }

    public function submitReport(Request $request)
    {
        // 1. Check Idempotency UUID first
        if ($request->filled('submission_uuid')) {
            $existing = ConsumerReport::where('submission_uuid', $request->submission_uuid)->first();
            if ($existing) {
                return response()->json([
                    'success' => true,
                    'message' => 'Report submission already received (Idempotent replay).',
                    'data' => [
                        'report_reference' => $existing->report_reference,
                        'status' => $existing->status,
                        'submitted_at' => $existing->created_at->toIso8601String(),
                    ]
                ], 200);
            }
        }

        $request->validate([
            'submission_uuid' => 'required|string',
            'capture_token' => 'required|string',
            'image' => 'required|file|image|mimes:jpeg,png,webp|max:10240',
            'privacy_notice_version' => 'required|string',
            'store_id' => 'nullable|exists:stores,id',
        ]);

        // 2. Validate Capture Session Token
        $tokenHash = hash('sha256', $request->capture_token);
        $session = CaptureSession::where('token_hash', $tokenHash)->first();

        if (!$session || $session->is_used || $session->expires_at < now()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid, expired, or already used capture session token.',
                'errors' => ['capture_token' => ['The capture session token is invalid or expired.']]
            ], 422);
        }

        // 3. Process File & Calculate Server SHA-256
        $file = $request->file('image');
        $serverSha256 = hash_file('sha256', $file->getRealPath());
        $vaultPath = $file->store('receipt_vault', 'local');

        $rawOcr = $request->filled('extracted_text_json')
            ? (is_string($request->extracted_text_json) ? json_decode($request->extracted_text_json, true) : $request->extracted_text_json)
            : ['lines' => [], 'ocr_confidence' => 0.0, 'status' => 'PENDING_MANUAL_REVIEW'];

        // 4. Generate Identifiers & Secret Tracking Token
        $reportReference = 'REP-' . date('Ymd') . '-' . strtoupper(Str::random(4));
        $rawTrackingToken = 'trk_' . Str::random(32);
        $trackingTokenHash = hash('sha256', $rawTrackingToken);

        $report = DB::transaction(function () use (
            $request,
            $session,
            $reportReference,
            $trackingTokenHash,
            $serverSha256,
            $vaultPath,
            $rawOcr
        ) {
            $rep = ConsumerReport::create([
                'report_reference' => $reportReference,
                'tracking_token_hash' => $trackingTokenHash,
                'store_id' => $request->store_id ?? $session->store_id,
                'submission_uuid' => $request->submission_uuid,
                'capture_session_id' => $session->id,
                'image_hash' => $serverSha256,
                'image_vault_path' => $vaultPath,
                'raw_ocr_json' => $rawOcr,
                'status' => 'Submitted',
                'privacy_notice_version' => $request->privacy_notice_version,
                'user_ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            // Create initial status history entry
            ReportStatusHistory::create([
                'consumer_report_id' => $rep->id,
                'previous_status' => null,
                'new_status' => 'Submitted',
                'public_message' => 'Report received and queued for preliminary DTI evaluation.',
                'actor_type' => 'system',
            ]);

            // Sync with existing citizen_tips queue so DTI Evaluator dashboard sees it instantly
            CitizenTip::create([
                'store_id' => $rep->store_id,
                'extracted_text_json' => $rawOcr,
                'image_hash_path' => $vaultPath,
                'status' => 'pending',
            ]);

            // Mark capture session as used
            $session->update(['is_used' => true]);

            return $rep;
        });

        return response()->json([
            'success' => true,
            'message' => 'Formal receipt report successfully submitted to DTI for evaluation.',
            'data' => [
                'report_reference' => $report->report_reference,
                'secret_tracking_token' => $rawTrackingToken,
                'status' => $report->status,
                'submitted_at' => $report->created_at->toIso8601String(),
            ]
        ], 201);
    }

    public function confirmOcr(Request $request, $reference)
    {
        $request->validate([
            'tracking_token' => 'required|string',
            'confirmed_items' => 'required',
        ]);

        $tokenHash = hash('sha256', $request->tracking_token);
        $report = ConsumerReport::where('report_reference', $reference)
            ->where('tracking_token_hash', $tokenHash)
            ->first();

        if (!$report) {
            return response()->json([
                'success' => false,
                'message' => 'Action Forbidden (403): Invalid report reference or tracking token.',
            ], 403);
        }

        $confirmed = is_string($request->confirmed_items)
            ? json_decode($request->confirmed_items, true)
            : $request->confirmed_items;

        $report->update([
            'consumer_confirmed_json' => $confirmed,
            'status' => 'Under initial evaluation',
        ]);

        ReportStatusHistory::create([
            'consumer_report_id' => $report->id,
            'previous_status' => 'Submitted',
            'new_status' => 'Under initial evaluation',
            'public_message' => 'Consumer confirmed receipt product details. Assigned for initial evaluation.',
            'actor_type' => 'system',
        ]);

        return response()->json([
            'success' => true,
            'message' => 'OCR field corrections stored successfully.',
            'data' => [
                'report_reference' => $report->report_reference,
                'status' => $report->status,
            ]
        ]);
    }

    public function trackReport(Request $request)
    {
        $request->validate([
            'reference' => 'required|string',
            'token' => 'required|string',
        ]);

        $tokenHash = hash('sha256', $request->token);
        $report = ConsumerReport::where('report_reference', $request->reference)
            ->where('tracking_token_hash', $tokenHash)
            ->with(['store', 'statusHistories'])
            ->first();

        if (!$report) {
            return response()->json([
                'success' => false,
                'message' => 'Report not found or tracking token is invalid.',
            ], 404);
        }

        $sanitizedHistory = $report->statusHistories->map(function ($h) {
            return [
                'status' => $h->new_status,
                'public_message' => $h->public_message,
                'timestamp' => $h->created_at->toIso8601String(),
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Report status retrieved.',
            'data' => [
                'report_reference' => $report->report_reference,
                'store_name' => $report->store->store_name ?? 'Unspecified Store',
                'current_status' => $report->status,
                'submitted_at' => $report->created_at->toIso8601String(),
                'status_history' => $sanitizedHistory,
            ]
        ]);
    }
}
