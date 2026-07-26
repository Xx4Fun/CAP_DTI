# PRICE-Watch Option A Genuine Shelf Tag OCR Implementation Plan (READY FOR IMPLEMENTATION)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-grade, deployment-aware Tesseract TSV OCR price tag scanner pipeline with image preprocessing, TSV spatial field parsing, weighted candidate matching, secure server-side scan sessions, authoritative regulatory price resolution (SRP, Price Freeze, APC), verified historical store pricing, and an honest recovery UI state machine.

**Architecture:** A three-action scanner API flow (`/public/scan-tag/analyze`, `/public/scan-tag/manual-select`, and `/public/scan-tag/compare` with server-side scan session validation) coordinating dedicated domain services (`ShelfTagImagePreprocessor`, `ShelfTagOcrService`, `ShelfTagTextNormalizer`, `ShelfTagFieldParser`, `ShelfTagProductMatcher`, `RegulatoryPriceResolver`, `HistoricalPriceResolver`, `ScanSessionRepository`) utilizing Symfony Process execution of Tesseract with TSV structured output, integer centavo / string decimal arithmetic, `Storage::disk('local')` `try/finally` file cleanup, scheduled abandoned scan purging, and rate limiting.

**Tech Stack (Repository Verified):** PHP ^8.3, Laravel ^13.8, PHPUnit ^12.5.12, Symfony Process, Tesseract OCR 5.5 TSV (`config('services.tesseract.path')`), React ^19.2.7, TypeScript ~6.0.2, Vite ^8.1.1, Vitest ^4.1.10.

---

### Task 0: Environment, Version, Schema, and Host Audit

**Files:**
- Modify: `backend/config/services.php`
- Modify: `backend/.env.example`
- Inspect: `customer-pwa/package.json`, `backend/composer.json`, database migrations & models

- [ ] **Step 1: Audit repository dependencies and runtime versions**
  - Verified versions: PHP ^8.3, Laravel ^13.8, PHPUnit ^12.5.12, React ^19.2.7, Vite ^8.1.1, Vitest ^4.1.10.
- [ ] **Step 2: Audit database schema for stores, bulletins, price freezes, and historical inspections**
  - Check existing columns in `stores`, `srp_bulletins`, `temporal_inspections`.
  - Document missing regulatory emergency tables or columns before writing code.
- [ ] **Step 3: Configure Tesseract in `config/services.php` without hardcoded OS fallbacks**
  ```php
  'tesseract' => [
      'path' => env('TESSERACT_PATH'),
      'language' => env('TESSERACT_LANGUAGE', 'eng'),
      'timeout_seconds' => (int) env('TESSERACT_TIMEOUT_SECONDS', 15),
      'page_segmentation_mode' => (int) env('TESSERACT_PSM', 11),
      'temp_directory' => env('TESSERACT_TEMP_DIRECTORY', storage_path('app/private/scan_vault')),
  ],
  ```
- [ ] **Step 4: Document environment variable examples in `.env.example`**
  - Windows: `TESSERACT_PATH="C:\Program Files\Tesseract-OCR\tesseract.exe"`
  - Linux: `TESSERACT_PATH="/usr/bin/tesseract"`
- [ ] **Step 5: Verify services access configuration ONLY via `config('services.tesseract.path')`**
  - Return `OCR_UNAVAILABLE` immediately if configuration or executable is missing.

---

### Task 1: Secure Image Validation, Preprocessing, and Scheduled Abandoned Cleanup

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagImagePreprocessor.php`
- Create: `backend/app/Jobs/CleanAbandonedScansJob.php`
- Modify: `backend/app/Console/Kernel.php` or `backend/routes/console.php`
- Create: `backend/tests/Unit/ShelfTagImagePreprocessorTest.php`

- [ ] **Step 1: Write failing unit test for image validation, EXIF stripping, preprocessing, and scheduled abandoned cleanup**
  - Test valid image preprocessing, magic bytes validation, dimension bounds (200x200 to 4000x4000), EXIF stripping, contrast/grayscale enhancement, and temporary vault file cleanup (`Storage::disk('local')->delete()`).
  - Test `CleanAbandonedScansJob` deletes expired scan files from `storage/app/private/scan_vault`.
- [ ] **Step 2: Implement `ShelfTagImagePreprocessor` using Laravel Storage API**
  - Validates declared MIME type and actual magic bytes (`finfo`). Rejects invalid, corrupt, or unsupported formats.
  - Checks min/max dimensions (min 200x200, max 4000x4000) and max file size (10MB).
  - Performs EXIF orientation correction, grayscale conversion, contrast enhancement, cropping with safety margins, and temporary file generation in `storage/app/private/scan_vault`.
  - Includes `cleanup()` method.
- [ ] **Step 3: Implement `CleanAbandonedScansJob` and register in Laravel task scheduling**
  - Purges temporary vault files older than configured retention period (30 minutes). Logs failures safely without exposing absolute paths.
- [ ] **Step 4: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/ShelfTagImagePreprocessorTest.php`

---

### Task 2: TSV-Structured Tesseract OCR Service Adapter

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagOcrService.php`
- Create: `backend/tests/Unit/ShelfTagOcrServiceTest.php`

- [ ] **Step 1: Write failing unit test for Tesseract TSV output parsing**
  - Test returns `OCR_UNAVAILABLE` when `services.tesseract.path` configuration is missing.
  - Test parses TSV words, confidence levels (`conf`), bounding boxes (`left`, `top`, `width`, `height`), `line_num`, `block_num`.
  - Strict separation: `ShelfTagOcrService` returns raw extraction status ONLY (`OCR_SUCCESS`, `OCR_NO_TEXT`, `OCR_UNAVAILABLE`, `OCR_TIMEOUT`, `OCR_FAILED`).
- [ ] **Step 2: Implement `ShelfTagOcrService` using Symfony Process & Tesseract TSV output**
  - Command: `tesseract <image> stdout --psm 11 -l eng tsv`
  - Filters out low confidence (<60) tokens.
- [ ] **Step 3: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/ShelfTagOcrServiceTest.php`

---

### Task 3: Strict Real Image OCR Integration Tests

**Files:**
- Create: `backend/tests/Integration/TesseractIntegrationTest.php`
- Create: `backend/tests/Fixtures/shelf_tag_saba.png`

- [ ] **Step 1: Create real shelf tag image fixture and strict integration test**
  - Requires `tests/Fixtures/shelf_tag_saba.png` fixture image.
  - Asserts status is `$this->assertSame('OCR_SUCCESS', $result['status'])`.
  - Asserts extracted text contains product text (`SABA`), package size (`155`), and price (`23.50`). Fails on `OCR_NO_TEXT`, `OCR_UNAVAILABLE`, `OCR_TIMEOUT`, or `OCR_FAILED`.
  - May be skipped locally if Tesseract binary is not installed, but skipped integration test blocks production deployment status.
- [ ] **Step 2: Run integration test**
  Run: `vendor/bin/phpunit tests/Integration/TesseractIntegrationTest.php`

---

### Task 4: TSV Spatial Field Parsing & Decimal-Safe Price Extraction

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagTextNormalizer.php`
- Create: `backend/app/Services/Ocr/ShelfTagFieldParser.php`
- Test: `backend/tests/Unit/ShelfTagFieldParserTest.php`

- [ ] **Step 1: Write failing unit test for TSV spatial word grouping and price candidate ranking**
  - Test spatial line/block grouping, monetary anchor proximity (`₱`, `PHP`, `SRP`, `PRICE`), unit normalization (`g`, `kg`, `mL`, `L`, `pcs`, `pack`), decimal separators, multipacks (`155 g × 2`), and SKU/barcode/date penalty scoring.
- [ ] **Step 2: Implement `ShelfTagTextNormalizer` & `ShelfTagFieldParser`**
  - Formats supported: `₱23.50`, `P23.50`, `PHP 23.50`, `23.50`, `23,50`, `₱23`, and normalized `23.5`.
  - Returns price as decimal string (`'23.50'`) and integer centavos (`2350`), avoiding binary floats.
- [ ] **Step 3: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/ShelfTagFieldParserTest.php`

---

### Task 5: Database-Driven Weighted Product Matching

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagProductMatcher.php`
- Test: `backend/tests/Unit/ShelfTagProductMatcherTest.php`

- [ ] **Step 1: Write failing unit test for weighted candidate scoring, size penalties, and secrecy**
  - Test signals: exact phrase (+40), brand (+30), token overlap (+15), package size (+25), unit (+15), variant (+20).
  - Heavy penalties for package size/unit/variant conflicts (-50). Minimum score threshold (>= 35).
  - Test secrecy requirement: returns candidate list without exposing internal `baseline_price`.
- [ ] **Step 2: Implement `ShelfTagProductMatcher`**
  - Queries active `srp_bulletins`. Returns ranked candidate list with match levels (`STRONG`, `POSSIBLE`, `SIZE_UNCERTAIN`).
- [ ] **Step 3: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/ShelfTagProductMatcherTest.php`

---

### Task 6: Authoritative Regulatory Price Resolver (Schema Inspection & Conditional Strategy)

**Files:**
- Create: `backend/app/Services/Ocr/RegulatoryPriceResolver.php`
- Test: `backend/tests/Unit/RegulatoryPriceResolverTest.php`

- [ ] **Step 1: Inspect actual database migrations, models, and approved schema**
  - Audit existing tables for Price Freeze and APC models before assuming their existence.
  - **Conditional Strategy:**
    1. **If Price Freeze and APC tables/models exist:** Use isolated test fixtures in `RegulatoryPriceResolverTest` to test Price Freeze prevailing prices, APC ceilings, and APC precedence over price freeze.
    2. **If tables exist but have no production records yet:** Continue implementation and return `REGULATORY_PRICE_UNAVAILABLE` when no authoritative record is available.
    3. **If tables/models do not exist:** Do NOT invent models or run unapproved migrations. Document missing schema and official data-source requirements in Task 0 report.
- [ ] **Step 2: Write failing unit test for SRP resolution and missing emergency record handling**
  - Test normal monitoring returns active SRP `baseline_price` from `srp_bulletins` under label `"Current SRP"`.
  - Test emergency state with missing authoritative emergency record returns status `REGULATORY_PRICE_UNAVAILABLE`.
  - **Strict Rule:** Resolver MUST NEVER reuse normal SRP `baseline_price` and relabel it as `"Frozen prevailing price"` or `"Current APC ceiling"`.
- [ ] **Step 3: Implement `RegulatoryPriceResolver`**
  - Resolves active SRP from `srp_bulletins`.
  - If Price Freeze / APC schema exists and active emergency records are present, returns corresponding emergency cap values. Otherwise returns status `REGULATORY_PRICE_UNAVAILABLE`.
- [ ] **Step 4: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/RegulatoryPriceResolverTest.php`

---

### Task 7: Database-Backed Historical Verified Price Resolver (`temporal_inspections`)

**Files:**
- Create: `backend/app/Services/Ocr/HistoricalPriceResolver.php`
- Test: `backend/tests/Unit/HistoricalPriceResolverTest.php`

- [ ] **Step 1: Write failing unit test for `temporal_inspections` historical queries**
  - Test queries latest compatible verified DTI field inspection record matching store, product, size, unit, and approved officer signature.
  - Test ignores older verified records when a newer verified record exists.
  - Test rejects unverified, pending, or rejected records, wrong-store, wrong-product, wrong-size/unit, consumer public shelf scans, user-entered prices, OCR observations, and sample/demo records.
  - Test returns exact status `NO_VERIFIED_HISTORY` when no record qualifies.
- [ ] **Step 2: Implement `HistoricalPriceResolver`**
  - Performs Eloquent query against `temporal_inspections`.
- [ ] **Step 3: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/HistoricalPriceResolverTest.php`

---

### Task 8: Verified Store Enforcement, Duplicate Locking, and Middleware Rate Limiter

**Files:**
- Create: `backend/app/Http/Middleware/OcrRateLimiter.php`
- Test: `backend/tests/Feature/VerifiedStoreAndRateLimitTest.php`

- [ ] **Step 1: Write failing feature test for store verification, duplicate scan UUID locking, and HTTP 429 rate limiting**
  - Test active approved verified public store accepted.
  - Test pending, rejected, disabled, hidden, unverified, and missing stores rejected with HTTP 422.
  - **Strict Requirement:** Test reusing the same active `scan_uuid` during its lock or scan-session lifetime rejects the second request with HTTP 429 and verifies OCR process execution ran **only once**.
  - Allow scan UUID reuse only after expiry according to the documented reuse policy.
  - Test per-IP and anonymous session burst limits return HTTP 429 (`Too Many Requests`).
- [ ] **Step 2: Implement `OcrRateLimiter` middleware**
  - Uses Laravel Cache locks for scan UUID duplicate prevention and rate limiting.
- [ ] **Step 3: Update store validation in controller**
  - Omits internal SEC numbers, owner names, and private vendor details from public response payload.
- [ ] **Step 4: Run feature test to verify it passes**
  Run: `vendor/bin/phpunit tests/Feature/VerifiedStoreAndRateLimitTest.php`

---

### Task 9: Secure Server-Side Scan Session Repository (`ScanSessionRepository`)

**Files:**
- Create: `backend/app/Services/Ocr/ScanSessionRepository.php`
- Test: `backend/tests/Unit/ScanSessionRepositoryTest.php`

- [ ] **Step 1: Write failing unit test for `ScanSessionRepository` lifecycle**
  - Test explicit `put()` before `get()`.
  - Test standard field name `consumed_state`.
  - Test session creation, retrieval, expiration, consumption, store mismatch rejection, unauthorized product rejection, tampered product source rejection, and tampered price source rejection.
- [ ] **Step 2: Implement `ScanSessionRepository` using Laravel Cache (Redis / Database backed)**
  - Payload fields: `scan_id`, `scan_uuid`, `store_id`, `ocr_status`, `allowed_candidate_product_ids`, `manual_product_ids`, `detected_price_centavos`, `detected_price_string`, `detected_price_source`, `product_source`, `created_at`, `expires_at`, `consumed_state`, `correlation_id`.
- [ ] **Step 3: Run unit test to verify it passes**
  Run: `vendor/bin/phpunit tests/Unit/ScanSessionRepositoryTest.php`

---

### Task 10: Analyze Endpoint (`POST /public/scan-tag/analyze`)

**Files:**
- Modify: `backend/app/Http/Controllers/PublicPwaController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AnalyzeEndpointTest.php`

- [ ] **Step 1: Write failing feature test with structured TSV mocks for `/analyze`**
  - Creates matching active `SrpBulletin` and approved/verified `Store`.
  - Mocks `ShelfTagOcrService` to return TSV word objects containing `text`, `confidence`, `left`, `top`, `width`, `height`, `line_num`, `block_num` for `SABA SARDINES 155g P23.50`.
  - Asserts response HTTP 200 and business status `OCR_PRODUCT_AND_PRICE_DETECTED`.
- [ ] **Step 2: Implement `/analyze` endpoint**
  - Accepts verified store, scan UUID, image (min 200x200). Runs preprocessing, TSV OCR adapter, TSV spatial field parser, weighted product matcher.
  - Guaranteed `try / finally` temporary image cleanup via `Storage::disk('local')->delete()`.
  - Saves scan session in `ScanSessionRepository` storing OCR candidates in `allowed_candidate_product_ids` and returns status.
- [ ] **Step 3: Run feature test to verify it passes**
  Run: `vendor/bin/phpunit tests/Feature/AnalyzeEndpointTest.php`

---

### Task 11: Manual-Selection Endpoint (`POST /public/scan-tag/manual-select`)

**Files:**
- Modify: `backend/app/Http/Controllers/PublicPwaController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/ManualSelectEndpointTest.php`

- [ ] **Step 1: Write failing feature test for `/manual-select` using `ScanSessionRepository`**
  - Seed session fixture with `ocr_status = 'NO_RELIABLE_PRODUCT_MATCH'`.
  - **Strict Session Separation Rule:** Manual-selected products MUST be stored in `manual_product_ids`. Do NOT mix manual-selected products into `allowed_candidate_product_ids`. Keep `allowed_candidate_product_ids` strictly for OCR-derived candidates.
  - Test selecting active directory product adds product ID to `manual_product_ids` and sets `product_source = 'MANUAL_SEARCH'`.
- [ ] **Step 2: Implement `/manual-select` endpoint**
  - Validates session, verifies product is active and publicly searchable, appends product ID to `manual_product_ids`, and updates session.
- [ ] **Step 3: Run feature test to verify it passes**
  Run: `vendor/bin/phpunit tests/Feature/ManualSelectEndpointTest.php`

---

### Task 12: Compare Endpoint (`POST /public/scan-tag/compare`), Price Source Rules & Mandatory Disclaimer

**Files:**
- Modify: `backend/app/Http/Controllers/PublicPwaController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/CompareEndpointTest.php`

- [ ] **Step 1: Write failing feature test for `/compare`**
  - **Strict Product Source Validation Rule:** The compare endpoint accepts a product ONLY when it exists in either:
    1. `allowed_candidate_product_ids`, with source `OCR`
    2. `manual_product_ids`, with source `MANUAL_SEARCH`
  - Test server-side price source rules:
    - OCR price unchanged and confirmed ➔ `USER_CONFIRMED`
    - OCR price changed by consumer ➔ `USER_CORRECTED`
    - OCR price missing and consumer enters value ➔ `USER_ENTERED`
  - Test response includes mandatory disclaimer: *"This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation."*
  - Test session is marked consumed (`consumed_state = true`).
- [ ] **Step 2: Implement `/compare` endpoint**
  - Validates scan session, revalidates store & product source, invokes `RegulatoryPriceResolver` and `HistoricalPriceResolver`, calculates string decimal / centavo differences, returns result payload with mandatory disclaimer.
- [ ] **Step 3: Run feature test to verify it passes**
  Run: `vendor/bin/phpunit tests/Feature/CompareEndpointTest.php`

---

### Task 13: Scanner-Only Synthetic Fallback Removal

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`
- Modify: `customer-pwa/src/api/client.ts`

- [ ] **Step 1: Remove scanner production synthetic fallbacks**
  - Purge `23.50`, Saba Sardines defaults, fallback commodities on scanner API failure, synthetic store lists, fake verified badges, and fake local scan IDs.
  - Scope correctly: preserve cached public data for the separate Prices directory.
  - Restrict development samples behind `VITE_ENABLE_SCANNER_DEMO=true` with an explicit "Demo Data" badge.

---

### Task 14: Frontend Honest Recovery State Machine & Vitest Suite

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`
- Modify: `customer-pwa/src/components/ShelfScanner.test.tsx`

- [ ] **Step 1: Write failing Vitest tests for honest recovery UI flows & distinct statuses**
  - **Strict Recovery States:** Frontend UI state machine must explicitly handle:
    1. `OCR_PRODUCT_AND_PRICE_DETECTED`
    2. `PRODUCT_DETECTED_PRICE_MISSING`
    3. `PRICE_DETECTED_PRODUCT_MISSING`
    4. `NO_RELIABLE_PRODUCT_MATCH`
    5. `OCR_NO_TEXT`
  - Test API network error renders honest error screen (*"Unable to analyze shelf tag"* & *"No comparison was generated and nothing was submitted"* visible, `23.50` & Saba absent, Retry & Retake visible).
  - Test successful comparison result screen renders mandatory consumer disclaimer (*"This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation."*), price cards, and difference math.
  - Test `PRODUCT_DETECTED_PRICE_MISSING` path prompts consumer to enter displayed price.
  - Test `NO_RELIABLE_PRODUCT_MATCH` and `OCR_NO_TEXT` paths direct user to manual directory search.
  - Test formal report handoff includes contextual info but excludes shelf tag image.
- [ ] **Step 2: Update `ShelfScanner.tsx` UI state machine**
  - Connect to `/analyze`, `/manual-select`, and `/compare`.
  - Implement 5 recovery states (`OCR_PRODUCT_AND_PRICE_DETECTED`, `PRODUCT_DETECTED_PRICE_MISSING`, `PRICE_DETECTED_PRODUCT_MISSING`, `NO_RELIABLE_PRODUCT_MATCH`, `OCR_NO_TEXT`).
  - Render value source badges (`✔ OCR-Detected Tag Price` vs `✏️ Consumer-Entered Price`).
  - Render dynamic regulatory labels (`Current SRP`, `Frozen prevailing price`, `Current APC ceiling`).
  - Render mandatory consumer disclaimer on comparison result screen.
- [ ] **Step 3: Run Vitest suite**
  Run: `npm test -- --run` in `customer-pwa/`.
  Expected: PASS.

---

### Task 15: Complete Backend Unit, Feature, Integration, and Security Tests

**Files:**
- Run: `vendor/bin/phpunit` in `backend/`

- [ ] **Step 1: Run full PHPUnit test suite**
  - Verify all unit, feature, integration, and security tests pass cleanly.

---

### Task 16: Complete Frontend Tests

**Files:**
- Run: `npm test -- --run` in `customer-pwa/`

- [ ] **Step 1: Run Vitest suite**
  - Verify all frontend component and state tests pass cleanly.

---

### Task 17: Performance, OCR Readiness, and Deployment-Readiness Report

**Files:**
- Produce: `docs/audits/ocr-deployment-readiness-report.md`

- [ ] **Step 1: Perform audit and measure latencies**
  - Audit camera init, image prep, upload, OCR, matching, and total scan-to-result latency.
  - Document Tesseract installation status on target server environment.

---

### Task 18: STOP AND WAIT FOR USER APPROVAL

**Files:**
- None

- [ ] **Step 1: STOP execution completely**
  - *(DO NOT commit, stage files with git add, push, merge, run migrations, or deploy frontend/backend until user explicitly approves)*
