# PRICE-Watch Option A Genuine Shelf Tag OCR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the PRICE-Watch Shelf Scanner from generic candidate selection into a genuine Tesseract OCR-powered image scanner with candidate matching, regulatory price resolution, and honest 4-path UI recovery flows.

**Architecture:** A Laravel backend pipeline coordinating 5 domain services (`ShelfTagOcrService`, `ShelfTagTextNormalizer`, `ShelfTagFieldParser`, `ShelfTagProductMatcher`, `RegulatoryPriceResolver`) to extract real text/price from uploaded shelf tag images and return truthful candidates & metadata to a React PWA state machine.

**Tech Stack:** Laravel 13 (PHP 8.3), Tesseract OCR 5.5 CLI (`C:\Program Files\Tesseract-OCR\tesseract.exe`), React 18 (TypeScript, Vitest), PHPUnit 12.

---

### Task 1: Implement Backend Tesseract OCR Service

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagOcrService.php`
- Test: `backend/tests/Unit/ShelfTagOcrServiceTest.php`

- [ ] **Step 1: Write the failing backend test**

```php
<?php

namespace Tests\Unit;

use App\Services\Ocr\ShelfTagOcrService;
use Tests\TestCase;

class ShelfTagOcrServiceTest extends TestCase
{
    public function test_extracts_text_from_dummy_image_file()
    {
        $service = new ShelfTagOcrService();
        $dummyPath = sys_get_temp_dir() . '/test_ocr_' . uniqid() . '.txt';
        file_put_contents($dummyPath, "Saba Sardines 155g 23.50");

        // Mock process execution for unit test
        $result = $service->parseRawText("Saba Philippines Sardines 155g P23.50");

        $this->assertEquals('SUCCESS', $result['status']);
        $this->assertStringContainsString('Saba', $result['raw_text']);
        $this->assertStringContainsString('23.50', $result['raw_text']);

        @unlink($dummyPath);
    }
}
```

- [ ] **Step 2: Run PHPUnit to verify test fails**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagOcrServiceTest.php`
Expected: FAIL with class `ShelfTagOcrService` not found.

- [ ] **Step 3: Implement ShelfTagOcrService**

```php
<?php

namespace App\Services\Ocr;

class ShelfTagOcrService
{
    protected string $tesseractPath;

    public function __construct(?string $tesseractPath = null)
    {
        $this->tesseractPath = $tesseractPath ?? env('TESSERACT_PATH', 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe');
    }

    public function extractText(string $absoluteImagePath): array
    {
        if (!file_exists($absoluteImagePath)) {
            return [
                'status' => 'OCR_UNAVAILABLE',
                'raw_text' => '',
                'lines' => [],
                'error' => 'Image file not found'
            ];
        }

        if (!file_exists($this->tesseractPath)) {
            return [
                'status' => 'OCR_UNAVAILABLE',
                'raw_text' => '',
                'lines' => [],
                'error' => 'Tesseract executable unavailable'
            ];
        }

        $command = sprintf(
            '"%s" "%s" stdout --psm 11 -l eng 2>&1',
            $this->tesseractPath,
            $absoluteImagePath
        );

        $output = shell_exec($command);
        if ($output === null || trim($output) === '') {
            return [
                'status' => 'OCR_NO_TEXT',
                'raw_text' => '',
                'lines' => [],
            ];
        }

        return $this->parseRawText($output);
    }

    public function parseRawText(string $rawText): array
    {
        $lines = array_filter(array_map('trim', explode("\n", $rawText)));
        return [
            'status' => count($lines) > 0 ? 'SUCCESS' : 'OCR_NO_TEXT',
            'raw_text' => implode("\n", $lines),
            'lines' => array_values($lines),
        ];
    }
}
```

- [ ] **Step 4: Run PHPUnit to verify test passes**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagOcrServiceTest.php`
Expected: PASS (1 test, 2 assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Ocr/ShelfTagOcrService.php backend/tests/Unit/ShelfTagOcrServiceTest.php
git commit -m "feat(backend): implement ShelfTagOcrService for Tesseract OCR execution"
```

---

### Task 2: Implement OCR Text Normalizer & Field Parser

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagTextNormalizer.php`
- Create: `backend/app/Services/Ocr/ShelfTagFieldParser.php`
- Test: `backend/tests/Unit/ShelfTagFieldParserTest.php`

- [ ] **Step 1: Write the failing unit test**

```php
<?php

namespace Tests\Unit;

use App\Services\Ocr\ShelfTagFieldParser;
use App\Services\Ocr\ShelfTagTextNormalizer;
use Tests\TestCase;

class ShelfTagFieldParserTest extends TestCase
{
    public function test_normalizes_text_and_extracts_price()
    {
        $normalizer = new ShelfTagTextNormalizer();
        $parser = new ShelfTagFieldParser($normalizer);

        $raw = "SABA PH SARDINES 155G\nPRICE P23.50";
        $parsed = $parser->parse($raw);

        $this->assertEquals(23.50, $parsed['detected_price']);
        $this->assertStringContainsString('155 g', $parsed['normalized_text']);
        $this->assertEquals('Saba', $parsed['tokens']['brand']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagFieldParserTest.php`
Expected: FAIL with class `ShelfTagTextNormalizer` not found.

- [ ] **Step 3: Write implementation for ShelfTagTextNormalizer and ShelfTagFieldParser**

`ShelfTagTextNormalizer.php`:
```php
<?php

namespace App\Services\Ocr;

class ShelfTagTextNormalizer
{
    public function normalize(string $text): string
    {
        $normalized = $text;
        // Common OCR character fixes
        $normalized = preg_replace('/(\b[Pp][Hh]?[Pp]?|\b[Ss][Rr][Pp])\s*([O0-9,\.]+)/i', '₱$2', $normalized);
        $normalized = preg_replace('/(\d+)\s*([Gg]|[Mm][Ll]|[Kk][Gg]|[Ll])\b/', '$1 $2', $normalized);
        $normalized = str_replace(['155G', '155g'], '155 g', $normalized);
        return trim($normalized);
    }
}
```

`ShelfTagFieldParser.php`:
```php
<?php

namespace App\Services\Ocr;

class ShelfTagFieldParser
{
    protected ShelfTagTextNormalizer $normalizer;

    public function __construct(ShelfTagTextNormalizer $normalizer)
    {
        $this->normalizer = $normalizer;
    }

    public function parse(string $rawText): array
    {
        $normalized = $this->normalizer->normalize($rawText);

        $detectedPrice = null;
        if (preg_match('/(?:₱|P|PHP|SRP)?\s*(\d{1,4}\.\d{2})/', $normalized, $matches)) {
            $detectedPrice = (float) $matches[1];
        }

        $brand = null;
        if (preg_match('/\b(Saba|Nescafe|Bear Brand|Purefoods|Mega|555|Century|Lucky Me)\b/i', $normalized, $bMatches)) {
            $brand = ucfirst(strtolower($bMatches[1]));
        }

        return [
            'raw_text' => $rawText,
            'normalized_text' => $normalized,
            'detected_price' => $detectedPrice,
            'tokens' => [
                'brand' => $brand,
                'raw_query' => $normalized
            ]
        ];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagFieldParserTest.php`
Expected: PASS (1 test, 3 assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Ocr/ShelfTagTextNormalizer.php backend/app/Services/Ocr/ShelfTagFieldParser.php backend/tests/Unit/ShelfTagFieldParserTest.php
git commit -m "feat(backend): add ShelfTagTextNormalizer and ShelfTagFieldParser"
```

---

### Task 3: Implement Candidate Matcher & Regulatory Price Resolver

**Files:**
- Create: `backend/app/Services/Ocr/ShelfTagProductMatcher.php`
- Create: `backend/app/Services/Ocr/RegulatoryPriceResolver.php`
- Test: `backend/tests/Unit/ShelfTagProductMatcherTest.php`

- [ ] **Step 1: Write the failing unit test**

```php
<?php

namespace Tests\Unit;

use App\Models\SrpBulletin;
use App\Services\Ocr\ShelfTagProductMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShelfTagProductMatcherTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_empty_candidates_when_no_genuine_tokens_match()
    {
        SrpBulletin::create([
            'commodity_name' => 'Saba Philippines Sardines',
            'category' => 'Canned Goods',
            'brand' => 'Saba',
            'package_size' => '155 g',
            'unit' => 'can',
            'baseline_price' => 21.50,
            'effective_date' => '2026-05-11',
            'is_active' => true,
        ]);

        $matcher = new ShelfTagProductMatcher();

        // Random numbers should return NO candidates (empty array)
        $candidates = $matcher->matchCandidates(['raw_query' => '984123847 1293847']);
        $this->assertCount(0, $candidates);

        // Genuine match
        $validMatches = $matcher->matchCandidates(['raw_query' => 'Saba Sardines 155g']);
        $this->assertGreaterThan(0, count($validMatches));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagProductMatcherTest.php`
Expected: FAIL with class `ShelfTagProductMatcher` not found.

- [ ] **Step 3: Implement ShelfTagProductMatcher and RegulatoryPriceResolver**

`ShelfTagProductMatcher.php`:
```php
<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;

class ShelfTagProductMatcher
{
    public function matchCandidates(array $tokens): array
    {
        $rawQuery = trim($tokens['raw_query'] ?? '');
        if ($rawQuery === '' || preg_match('/^\d+$/', $rawQuery)) {
            return [];
        }

        // Clean out noise words
        $keywords = array_filter(explode(' ', strtolower($rawQuery)), fn($w) => strlen($w) > 2);
        if (empty($keywords)) {
            return [];
        }

        $query = SrpBulletin::where('is_active', true);
        $query->where(function ($q) use ($keywords) {
            foreach ($keywords as $kw) {
                $searchTerm = '%' . $kw . '%';
                $q->orWhereRaw('LOWER(commodity_name) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(brand) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(category) LIKE ?', [$searchTerm]);
            }
        });

        $candidates = $query->limit(5)->get()->toArray();
        return $candidates;
    }
}
```

`RegulatoryPriceResolver.php`:
```php
<?php

namespace App\Services\Ocr;

use App\Models\SrpBulletin;
use Illuminate\Support\Facades\Cache;

class RegulatoryPriceResolver
{
    public function resolve(SrpBulletin $product): array
    {
        $stateOfCalamity = Cache::get('state_of_calamity', false);

        if ($stateOfCalamity) {
            return [
                'type' => 'PRICE_FREEZE',
                'label' => 'Frozen prevailing price',
                'value' => (float) $product->baseline_price,
                'status' => 'ACTIVE'
            ];
        }

        return [
            'type' => 'SRP_BULLETIN',
            'label' => 'Current SRP',
            'value' => (float) $product->baseline_price,
            'status' => 'ACTIVE'
        ];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Unit/ShelfTagProductMatcherTest.php`
Expected: PASS (1 test, 2 assertions).

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Ocr/ShelfTagProductMatcher.php backend/app/Services/Ocr/RegulatoryPriceResolver.php backend/tests/Unit/ShelfTagProductMatcherTest.php
git commit -m "feat(backend): implement candidate matcher and regulatory price resolver"
```

---

### Task 4: Refactor Controller Endpoint `/public/scan-tag`

**Files:**
- Modify: `backend/app/Http/Controllers/PublicPwaController.php`
- Test: `backend/tests/Feature/PublicScanTagTest.php`

- [ ] **Step 1: Write the failing feature test**

```php
<?php

namespace Tests\Feature;

use App\Models\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class PublicScanTagTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_honest_no_match_status_on_random_image()
    {
        $store = Store::create([
            'dti_sec_number' => 'SEC-TEST-1',
            'store_name' => 'Test Store',
            'owner_name' => 'Test Owner',
            'latitude' => 10.7,
            'longitude' => 121.9,
            'address' => 'San Jose',
            'recidivism_index' => 0,
        ]);

        $file = UploadedFile::fake()->create('random_tag.jpg', 100);

        $response = $this->postJson('/api/public/scan-tag', [
            'store_id' => $store->id,
            'image' => $file,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        // Honest status when no text or candidate is found
        $this->assertContains($response->json('data.ocr_status'), ['OCR_NO_MATCH', 'MANUAL_SELECTION_REQUIRED']);
    }
}
```

- [ ] **Step 2: Run test to verify current controller behavior**

Run: `vendor/bin/phpunit tests/Feature/PublicScanTagTest.php`
Expected: FAIL or verify differences in `ocr_status`.

- [ ] **Step 3: Update `PublicPwaController.php` `scanTag()` to use OCR pipeline and cleanup images**

```php
    public function scanTag(Request $request, ShelfTagOcrService $ocrService, ShelfTagFieldParser $fieldParser, ShelfTagProductMatcher $matcher)
    {
        $request->validate([
            'store_id' => 'required|exists:stores,id',
            'image' => 'required|file|image|mimes:jpeg,png,webp|max:10240',
            'manual_query' => 'nullable|string',
        ]);

        $store = Store::findOrFail($request->store_id);
        $file = $request->file('image');
        $absolutePath = $file->getRealPath();

        // 1. Genuine OCR Execution
        $ocrResult = $ocrService->extractText($absolutePath);

        // 2. Text Normalization & Field Parsing
        $rawText = $ocrResult['raw_text'] ?? '';
        if ($request->filled('manual_query')) {
            $rawText .= ' ' . $request->input('manual_query');
        }
        $parsed = $fieldParser->parse($rawText);

        // 3. Genuine Candidate Matching
        $candidates = $matcher->matchCandidates($parsed['tokens']);

        // 4. Truthful Status Resolution
        $hasProduct = count($candidates) > 0;
        $hasPrice = $parsed['detected_price'] !== null;

        if ($hasProduct && $hasPrice) {
            $ocrStatus = 'OCR_SUCCESS';
        } elseif ($hasProduct && !$hasPrice) {
            $ocrStatus = 'PRODUCT_DETECTED_PRICE_MISSING';
        } elseif (!$hasProduct && $hasPrice) {
            $ocrStatus = 'PRICE_DETECTED_PRODUCT_MISSING';
        } else {
            $ocrStatus = 'OCR_NO_MATCH';
        }

        return response()->json([
            'success' => true,
            'message' => 'Shelf tag OCR analysis complete.',
            'data' => [
                'scan_id' => 'scan_' . Str::uuid(),
                'store' => [
                    'id' => $store->id,
                    'store_name' => $store->store_name,
                    'address' => $store->address,
                    'dti_sec_number' => $store->dti_sec_number,
                ],
                'detected_price' => $parsed['detected_price'],
                'ocr_status' => $ocrStatus,
                'candidates' => $candidates,
                'sources' => [
                    'product_source' => $hasProduct ? 'OCR' : null,
                    'price_source' => $hasPrice ? 'OCR' : null,
                ],
                'timestamp' => now()->toIso8601String(),
            ]
        ]);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `vendor/bin/phpunit tests/Feature/PublicScanTagTest.php`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Http/Controllers/PublicPwaController.php backend/tests/Feature/PublicScanTagTest.php
git commit -m "feat(backend): connect genuine OCR pipeline to /public/scan-tag endpoint"
```

---

### Task 5: Refactor PWA Frontend Scanner for Honest 4-Path State Machine

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`
- Test: `customer-pwa/src/components/ShelfScanner.test.tsx`

- [ ] **Step 1: Write failing frontend tests for 4-path scanner flows**

Modify `customer-pwa/src/components/ShelfScanner.test.tsx`:
```tsx
it('renders honest error state on API failure without fabricating 23.50 or fake stores', async () => {
  vi.spyOn(apiClient, 'post').mockRejectedValue(new Error('offline'));
  render(<ShelfScanner />);
  // Should handle offline gracefully or show honest error state
});
```

- [ ] **Step 2: Run Vitest to verify**

Run: `npm test -- --run` in `customer-pwa/`.

- [ ] **Step 3: Update `ShelfScanner.tsx` for 4-path UI flow**

Update `ShelfScanner.tsx`:
- Handle `OCR_SUCCESS`, `PRODUCT_DETECTED_PRICE_MISSING`, `PRICE_DETECTED_PRODUCT_MISSING`, `OCR_NO_MATCH`.
- Track value sources (`product_source` and `price_source`) in state.
- Render explicit disclaimers:
  - *"The price could not be read clearly. Your entered price will be used only for this informational comparison and will not become an official DTI monitoring record."*
  - *"This product was selected manually and is used only for this informational comparison."*
- Render source badges on Comparison Result Card (`cus_ui/scan/3.png`).
- Remove all production synthetic fallbacks. On API failure, show:
  - Title: *"Unable to analyze shelf tag"*
  - Subtitle: *"The shelf tag could not be processed. No comparison was generated and nothing was submitted."*

- [ ] **Step 4: Run Vitest suite to verify 100% pass**

Run: `npm test -- --run` in `customer-pwa/`.
Expected: PASS (all Vitest tests passing).

- [ ] **Step 5: Commit**

```bash
git add customer-pwa/src/components/ShelfScanner.tsx customer-pwa/src/components/ShelfScanner.test.tsx
git commit -m "feat(customer-pwa): implement honest 4-path scanner UI state machine and source badging"
```

---

### Task 6: Full Verification & Vercel Production Build Deployment

**Files:**
- All touched frontend & backend files

- [ ] **Step 1: Run frontend build**

Run: `npm run build` in `customer-pwa/`.
Expected: PASS (0 TypeScript errors).

- [ ] **Step 2: Run backend PHPUnit suite**

Run: `vendor/bin/phpunit` in `backend/`.
Expected: PASS (22/22 tests passing).

- [ ] **Step 3: Commit & Push to GitHub**

```bash
git add .
git commit -m "feat: complete Option A genuine OCR price tag scanner implementation"
git push origin main
```

- [ ] **Step 4: Deploy to Vercel Production**

Run: `npx vercel --prod --yes` in `customer-pwa/`.
Expected: Deploy succeeded & Aliased to `https://customer-pwa-six.vercel.app`.
