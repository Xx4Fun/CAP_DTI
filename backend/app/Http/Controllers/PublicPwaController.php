<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessReceiptEvidence;
use App\Models\CaptureSession;
use App\Models\ConsumerReport;
use App\Models\ReportStatusHistory;
use App\Models\SrpBulletin;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Services\Ocr\ScanSessionRepository;
use App\Services\Receipt\ReceiptCaptureModes;
use App\Services\Ocr\ShelfTagFieldParser;
use App\Services\Ocr\ShelfTagAutoResolver;
use App\Services\Ocr\ShelfTagComparisonService;
use App\Services\Ocr\ShelfTagImagePreprocessor;
use App\Services\Ocr\ShelfTagOcrService;
use App\Services\Ocr\ShelfTagProductMatcher;
use App\Services\Ocr\ShelfTagTextNormalizer;

class PublicPwaController extends Controller
{
    /**
     * Privacy notice versions a customer can have accepted; a report may only claim one of these. 1.1 names Google as
     * the receipt-reading processor; 1.0 stays accepted for installed apps that still show it (those reports never
     * reach the external service unless 1.0 is listed in RECEIPT_EXTRACTION_CONSENT_VERSIONS).
     */
    public const PRIVACY_NOTICE_VERSIONS = ['1.0', '1.1'];

    public const CURRENT_PRIVACY_NOTICE_VERSION = '1.1';

    public function config()
    {
        $stateOfCalamity = Cache::get('state_of_calamity', false);
        return response()->json([
            'success' => true,
            'message' => 'Public configuration retrieved successfully.',
            'data' => [
                'app_name' => 'PRICE-Watch',
                'state_of_calamity' => (bool) $stateOfCalamity,
                'privacy_notice_version' => self::CURRENT_PRIVACY_NOTICE_VERSION,
                'max_upload_size_mb' => 10,
                'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
                'receipt_continuous_capture_enabled' => ReceiptCaptureModes::videoEnabled(),
                'receipt_guided_capture_enabled' => true,
                'receipt_web_push_enabled' => (bool) config('services.receipt_push.enabled'),
                'vapid_public_key' => config('services.receipt_push.enabled')
                    ? config('services.receipt_push.public_key')
                    : null,
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
        $hasVerified = \Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_verified');
        return [
            'id' => (int) $store->id,
            'store_name' => (string) $store->store_name,
            'address' => (string) $store->address,
            'latitude' => (float) $store->latitude,
            'longitude' => (float) $store->longitude,
            'image_path' => $store->image_path ?? null,
            'is_verified' => $hasVerified ? (bool) $store->is_verified : true,
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

        if (!$store) {
            abort(response()->json([
                'success' => false,
                'message' => 'The selected establishment is unverified, inactive, or not eligible for public price checking.',
            ], 422));
        }

        $hasActive = \Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_active');
        $hasVerified = \Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_verified');
        $hasPublic = \Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_public');

        $isActive = $hasActive ? $store->is_active : true;
        $isVerified = $hasVerified ? $store->is_verified : true;
        $isPublic = $hasPublic ? $store->is_public : true;

        if (!$isActive || !$isVerified || !$isPublic) {
            abort(response()->json([
                'success' => false,
                'message' => 'The selected establishment is unverified, inactive, or not eligible for public price checking.',
            ], 422));
        }

        return $store;
    }

    public function establishments(Request $request)
    {
        $query = Store::query();

        if (\Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_active')) {
            $query->where('is_active', true);
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_verified')) {
            $query->where('is_verified', true);
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('stores', 'is_public')) {
            $query->where('is_public', true);
        }

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
        ScanSessionRepository $scanSessionRepository,
        ShelfTagAutoResolver $autoResolver,
        ShelfTagComparisonService $comparisonService,
    ) {
        $analysisStartedAt = microtime(true);
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
        $fallbackPath = $preprocessed['fallback_path'] ?? null;
        $fallbackFullPath = $preprocessed['fallback_full_path'] ?? null;
        $passTimeoutSeconds = (int) config('services.tesseract.shelf_tag_pass_timeout_seconds', 3);
        $primaryPsm = (int) config('services.tesseract.shelf_tag_primary_psm', 6);
        $fallbackPsm = (int) config('services.tesseract.shelf_tag_fallback_psm', 11);
        $minimumConfidence = (int) config('services.tesseract.shelf_tag_minimum_confidence', 30);

        try {
            $ocrPassCount = 1;
            $ocrResult = $ocrService->extractText($fullPath, [
                'psm' => $primaryPsm,
                'timeout_seconds' => $passTimeoutSeconds,
                'minimum_confidence' => $minimumConfidence,
            ]);
            $rawStatus = $ocrResult['status'] ?? 'OCR_FAILED';

            if ($rawStatus === 'OCR_NO_TEXT' && $fallbackFullPath) {
                $ocrPassCount = 2;
                $ocrResult = $ocrService->extractText($fallbackFullPath, [
                    'psm' => $fallbackPsm,
                    'timeout_seconds' => $passTimeoutSeconds,
                    'minimum_confidence' => $minimumConfidence,
                ]);
                $rawStatus = $ocrResult['status'] ?? 'OCR_FAILED';
            }

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

            $analysis = $this->interpretShelfTagOcrResult($ocrResult, $fieldParser, $productMatcher);
            $decision = $autoResolver->decide(
                $analysis['candidates'],
                $analysis['detected_price_string'],
                $analysis['price_confidence'],
            );

            if (!$decision['auto_resolved'] && $ocrPassCount === 1 && $fallbackFullPath) {
                $ocrPassCount = 2;
                $fallbackOcrResult = $ocrService->extractText($fallbackFullPath, [
                    'psm' => $fallbackPsm,
                    'timeout_seconds' => $passTimeoutSeconds,
                    'minimum_confidence' => $minimumConfidence,
                ]);

                if (in_array($fallbackOcrResult['status'] ?? null, ['OCR_SUCCESS', 'OCR_NO_TEXT'], true)) {
                    $fallbackAnalysis = $this->interpretShelfTagOcrResult($fallbackOcrResult, $fieldParser, $productMatcher);
                    $fallbackDecision = $autoResolver->decide(
                        $fallbackAnalysis['candidates'],
                        $fallbackAnalysis['detected_price_string'],
                        $fallbackAnalysis['price_confidence'],
                    );

                    if (
                        $fallbackDecision['auto_resolved']
                        || $this->shelfTagAnalysisQuality($fallbackAnalysis) > $this->shelfTagAnalysisQuality($analysis)
                    ) {
                        $analysis = $fallbackAnalysis;
                        $decision = $fallbackDecision;
                    }
                }
            }

            $candidates = $analysis['candidates'];
            $detectedPriceString = $analysis['detected_price_string'];
            $detectedPriceCentavos = $analysis['detected_price_centavos'];
            $priceConfidence = $analysis['price_confidence'];
            $businessOcrStatus = $analysis['ocr_status'];

            $scanId = 'scan_' . Str::uuid();
            $productSource = $decision['auto_resolved'] ? 'OCR_AUTO' : 'OCR';

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
                'price_confidence' => $priceConfidence,
                'detected_price_source' => 'OCR',
                'product_source' => $productSource,
                'consumed_state' => false,
            ]);

            $comparison = null;
            if ($decision['auto_resolved']) {
                $product = SrpBulletin::where('id', $decision['product_id'])
                    ->where('is_active', true)
                    ->first();
                if ($product) {
                    $comparison = array_merge(
                        [
                            'scan_id' => $scanId,
                            'store' => self::formatPublicStore($store),
                        ],
                        $comparisonService->compare(
                            $store,
                            $product,
                            (string) $detectedPriceString,
                            'OCR_AUTO',
                            'OCR_DETECTED',
                        ),
                    );
                }
            }

            Log::info('shelf_tag_scan_analyzed', [
                'duration_ms' => (int) round((microtime(true) - $analysisStartedAt) * 1000),
                'ocr_pass_count' => $ocrPassCount,
                'ocr_status' => $businessOcrStatus,
                'match_level' => $candidates[0]['match_level'] ?? null,
                'recovery_reason' => $comparison === null ? $decision['recovery_reason'] : null,
                'auto_resolved' => $comparison !== null,
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
                    'price_confidence' => $priceConfidence,
                    'detected_price_source' => 'OCR',
                    'product_source' => $productSource,
                    'auto_resolved' => $comparison !== null,
                    'recovery_reason' => $comparison === null ? $decision['recovery_reason'] : null,
                    'comparison' => $comparison,
                    'ocr_pass_count' => $ocrPassCount,
                ]
            ], 200);

        } finally {
            $preprocessor->cleanup($processedPath);
            if ($fallbackPath) {
                $preprocessor->cleanup($fallbackPath);
            }
        }
    }

    private function interpretShelfTagOcrResult(
        array $ocrResult,
        ShelfTagFieldParser $fieldParser,
        ShelfTagProductMatcher $productMatcher,
    ): array {
        if (($ocrResult['status'] ?? 'OCR_NO_TEXT') !== 'OCR_SUCCESS') {
            return [
                'ocr_status' => 'OCR_NO_TEXT',
                'candidates' => [],
                'detected_price_string' => null,
                'detected_price_centavos' => null,
                'price_confidence' => 0,
            ];
        }

        $parsed = $fieldParser->parseFromTsvWords($ocrResult['words'] ?? [], 30);
        $candidates = $productMatcher->matchCandidates(
            $parsed['product_raw_tokens'] ?? [],
            $parsed['package_size_normalized'] ?? null,
        );
        $detectedPriceString = $parsed['detected_price_string'] ?? null;
        $hasProduct = !empty($candidates);
        $hasPrice = $detectedPriceString !== null;

        $ocrStatus = match (true) {
            $hasProduct && $hasPrice => 'OCR_PRODUCT_AND_PRICE_DETECTED',
            $hasProduct => 'PRODUCT_DETECTED_PRICE_MISSING',
            $hasPrice => 'PRICE_DETECTED_PRODUCT_MISSING',
            default => 'NO_RELIABLE_PRODUCT_MATCH',
        };

        return [
            'ocr_status' => $ocrStatus,
            'candidates' => $candidates,
            'detected_price_string' => $detectedPriceString,
            'detected_price_centavos' => $parsed['detected_price_centavos'] ?? null,
            'price_confidence' => (int) ($parsed['price_confidence'] ?? 0),
        ];
    }

    private function shelfTagAnalysisQuality(array $analysis): int
    {
        $topMatchScore = (int) ($analysis['candidates'][0]['match_score'] ?? 0);

        return (int) ($analysis['price_confidence'] ?? 0) + $topMatchScore;
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
        ShelfTagComparisonService $comparisonService,
    ) {
        $request->validate([
            'scan_id' => 'required|string',
            'store_id' => 'required|numeric',
            'product_id' => 'required|integer',
            'displayed_price' => 'required|numeric|min:0.01',
            'product_source' => 'required|string|in:OCR,OCR_AUTO,OCR_CANDIDATE_SELECTED,MANUAL_SEARCH',
            'price_source' => 'required|string|in:OCR_DETECTED,USER_CONFIRMED,USER_CORRECTED,USER_ENTERED',
        ]);

        $store = $this->getVerifiedStore($request->input('store_id'));

        $scanId = (string) $request->input('scan_id');
        $session = $scanSessionRepository->get($scanId);

        if (!$session) {
            return response()->json([
                'success' => false,
                'message' => 'Scan session not found or expired.',
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

        if (in_array($productSource, ['OCR', 'OCR_AUTO', 'OCR_CANDIDATE_SELECTED'], true)) {
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

        $allowedPriceSources = [];
        if ($detectedPriceStr !== null && trim((string) $detectedPriceStr) !== '') {
            $sessionPriceFormatted = number_format((float) $detectedPriceStr, 2, '.', '');
            $displayedPriceFormatted = number_format((float) $displayedPriceRaw, 2, '.', '');
            if ($sessionPriceFormatted === $displayedPriceFormatted) {
                $allowedPriceSources = ['OCR_DETECTED', 'USER_CONFIRMED'];
            } else {
                $allowedPriceSources = ['USER_CORRECTED'];
            }
        } else {
            $allowedPriceSources = ['USER_ENTERED'];
        }

        if (!in_array($priceSource, $allowedPriceSources, true)) {
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

        $comparison = $comparisonService->compare(
            $store,
            $product,
            $displayedPriceRaw,
            $productSource,
            $priceSource,
        );

        return response()->json([
            'success' => true,
            'data' => array_merge([
                'scan_id' => $scanId,
                'store' => self::formatPublicStore($store),
            ], $comparison),
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
            'store_id' => 'required|exists:stores,id',
            'capture_mode' => 'nullable|in:continuous_video_v1,guided_photos_v1',
        ]);

        $captureMode = $request->input('capture_mode', 'guided_photos_v1');
        if (ReceiptCaptureModes::isVideo($captureMode) && ! ReceiptCaptureModes::videoEnabled()) {
            abort(404);
        }
        $store = $this->getVerifiedStore($request->input('store_id'));

        $sessionUuid = 'cs_' . Str::uuid();
        $rawToken = 'ct_sec_' . Str::random(32);
        $tokenHash = hash('sha256', $rawToken);
        $expiresAt = now()->addMinutes(15);

        $session = CaptureSession::create([
            'session_uuid' => $sessionUuid,
            'store_id' => $store?->id,
            'capture_mode' => $captureMode,
            'processing_status' => 'open',
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
                'store_id' => $store?->id,
                'capture_mode' => $captureMode,
                'max_file_size' => $captureMode === 'continuous_video_v1' ? 25 * 1024 * 1024 : 2 * 1024 * 1024,
                'accepted_types' => $captureMode === 'continuous_video_v1'
                    ? ['video/webm', 'video/mp4']
                    : ['image/jpeg', 'image/png', 'image/webp'],
                'limits' => $captureMode === 'continuous_video_v1'
                    ? [
                        'max_duration_seconds' => 30,
                        'max_video_bytes' => 25 * 1024 * 1024,
                        'min_frames' => 2,
                        'max_frames' => 12,
                    ]
                    : [
                        'max_frame_bytes' => 2 * 1024 * 1024,
                        'min_frames' => 1,
                        'max_frames' => 12,
                    ],
            ]
        ], 201);
    }

    public function submitReport(Request $request)
    {
        $allowedFields = [
            'submission_uuid', 'capture_token', 'privacy_notice_version', 'store_id',
            'tracking_token', 'resume_token',
        ];
        $prohibitedRules = [];
        foreach (array_keys($request->except($allowedFields)) as $field) {
            $prohibitedRules[$field] = 'prohibited';
        }
        $request->validate($prohibitedRules);

        // 1. Check Idempotency UUID first
        if ($request->filled('submission_uuid')) {
            $existing = ConsumerReport::where('submission_uuid', $request->submission_uuid)->first();
            if ($existing) {
                $replayToken = (string) $request->input('capture_token');
                $captureSession = $existing->captureSession;
                abort_unless(
                    $captureSession
                    && $replayToken !== ''
                    && hash_equals($captureSession->token_hash, hash('sha256', $replayToken)),
                    403,
                    'Invalid capture credential for this submission.',
                );
                $replayTrackingToken = (string) $request->input('tracking_token');
                $replayResumeToken = (string) $request->input('resume_token');
                return response()->json([
                    'success' => true,
                    'message' => 'Report submission already received (Idempotent replay).',
                    'data' => [
                        'report_reference' => $existing->report_reference,
                        'status' => $existing->status,
                        'submitted_at' => $existing->submitted_at?->toIso8601String(),
                        'created_at' => $existing->created_at->toIso8601String(),
                        'secret_tracking_token' => $replayTrackingToken !== ''
                            && hash_equals($existing->tracking_token_hash, hash('sha256', $replayTrackingToken))
                                ? $replayTrackingToken : null,
                        'device_resume_token' => $replayResumeToken !== ''
                            && $existing->resume_token_hash
                            && hash_equals($existing->resume_token_hash, hash('sha256', $replayResumeToken))
                                ? $replayResumeToken : null,
                    ]
                ], 200);
            }
        }

        $request->validate([
            'submission_uuid' => 'required|string',
            'capture_token' => 'required|string',
            'privacy_notice_version' => ['required', 'string', \Illuminate\Validation\Rule::in(self::PRIVACY_NOTICE_VERSIONS)],
            'store_id' => 'nullable|exists:stores,id',
            'tracking_token' => 'nullable|string|min:32|max:128',
            'resume_token' => 'nullable|string|min:32|max:128',
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

        if ($session->capture_mode === 'single_image_v1') {
            return response()->json([
                'success' => false,
                'message' => 'This legacy capture session cannot create a new receipt report. Start a guided receipt capture.',
            ], 410);
        }

        return $this->submitAsyncReceiptDraft($request, $session);
    }

    private function submitAsyncReceiptDraft(Request $request, CaptureSession $session)
    {
        // A video session opened before the flag went off may not become a report either.
        if (ReceiptCaptureModes::isVideo($session->capture_mode) && ! ReceiptCaptureModes::videoEnabled()) {
            abort(404);
        }

        $bundle = $session->evidenceBundle()->with('assets')->first();
        if (!$bundle) {
            return response()->json([
                'success' => false,
                'message' => 'Receipt evidence must be uploaded before creating a report.',
            ], 422);
        }

        $requiredAssets = $session->capture_mode === 'continuous_video_v1'
            ? $bundle->assets->where('kind', 'original_video')
            : $bundle->assets->where('kind', 'source_frame');
        $hasRequiredEvidence = $requiredAssets->isNotEmpty()
            && ! $requiredAssets->contains(fn ($asset) => ! $asset->hasValidContent());
        if (!$hasRequiredEvidence) {
            return response()->json([
                'success' => false,
                'message' => 'The receipt capture does not contain the required evidence.',
            ], 422);
        }

        $reportReference = 'REP-' . date('Ymd') . '-' . strtoupper(Str::random(4));
        $rawTrackingToken = $request->filled('tracking_token')
            ? (string) $request->input('tracking_token')
            : 'trk_' . Str::random(32);
        $rawResumeToken = $request->filled('resume_token')
            ? (string) $request->input('resume_token')
            : 'rsm_' . Str::random(32);

        $report = DB::transaction(function () use (
            $request,
            $session,
            $bundle,
            $reportReference,
            $rawTrackingToken,
            $rawResumeToken,
        ) {
            $rep = ConsumerReport::create([
                'report_reference' => $reportReference,
                'tracking_token_hash' => hash('sha256', $rawTrackingToken),
                'resume_token_hash' => hash('sha256', $rawResumeToken),
                'store_id' => $session->store_id,
                'submission_uuid' => $request->submission_uuid,
                'capture_session_id' => $session->id,
                'receipt_evidence_bundle_id' => $bundle->id,
                'capture_mode' => $session->capture_mode,
                'processing_status' => 'queued',
                'evidence_disk' => config('filesystems.receipt_evidence_disk'),
                'evidence_version' => 1,
                'status' => 'Processing receipt',
                'privacy_notice_version' => $request->privacy_notice_version,
                'user_ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            ReportStatusHistory::create([
                'consumer_report_id' => $rep->id,
                'previous_status' => null,
                'new_status' => 'Processing receipt',
                'public_message' => 'Receipt uploaded and queued for processing.',
                'actor_type' => 'system',
            ]);

            $bundle->update([
                'consumer_report_id' => $rep->id,
                'attempt_number' => 1,
                'processing_status' => 'queued',
            ]);
            $session->update(['is_used' => true, 'processing_status' => 'finalized']);

            return $rep;
        });

        ProcessReceiptEvidence::dispatch($report->report_reference)->afterCommit();

        return response()->json([
            'success' => true,
            'message' => 'Receipt uploaded and queued for processing.',
            'data' => [
                'report_reference' => $report->report_reference,
                'secret_tracking_token' => $rawTrackingToken,
                'device_resume_token' => $rawResumeToken,
                'status' => $report->status,
                'created_at' => $report->created_at->toIso8601String(),
                'submitted_at' => null,
            ],
        ], 201);
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
