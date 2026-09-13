# Plan — Fix receipt OCR extraction quality (customer PWA → production backend)

## Goal
Receipts captured through the installed customer PWA reach "Review your receipt" but show
"No items detected" and Merchant/Date/Total "Not detected". Make the backend OCR stage for
guided photo receipts produce usable text, and make extraction parse Philippine POS receipt
layouts, so items, total, and date are extracted within the production CPU budget.

## Acceptance criteria (observable)
Ground truth: human transcription of the local sample corpus (`receipt-samples/`, gitignored, private):
- `2.png`: full Gaisano Grand Mall of Antique receipt. 13 items with line totals
  `111.75, 27.00, 27.50, 27.50, 19.00, 70.25, 130.50, 35.00, 15.50, 15.50, 30.00, 49.75, 49.25`;
  name prefixes `CALLA PWD, COBRA BERRY, SISTERS NET ×2, HAPPY ABSRBNT, QUAKER INST, SAFEGUARD BAR,
  POSH H&S, POS HYDRATING ×2, CALLA BAR, CASINO FMME, ESKINOL CLSR`; Total `608.50`; no date visible.
- `1.png`: upper/middle section of the same receipt (the first 11 items visible; total not visible).
  (`3.png` is a byte-identical duplicate of `1.png`; it is counted once.)
1. The same independent metric is applied to both paths on the **raw selected OCR lines and final extraction**
   (never on filter-retained lines only):
   - item recall = extracted items whose price equals a ground-truth line total (multiset match) and whose name
     contains the ground-truth name prefix (case-insensitive, after whitespace normalization) / ground-truth count;
   - total correct (Y/N);
   - raw price-token recall = ground-truth prices found anywhere in the raw selected OCR text / count.
   - item precision = extracted items matching a ground-truth item by the same rule / all extracted items
     (Codex OCR-PLAN-010; a correct name with a wrong price counts as a false item).
   Current path baseline (measured): 0 items, no total, price-token recall ≤ 1/13 on `2.png`.
   Targets: `2.png` item recall ≥ 7/13, item precision ≥ 0.75, total = 608.50; `1.png` item recall ≥ 5/11, item
   precision ≥ 0.75. In both samples no header/footer/closing text (`GAISANO…`, `SOLD TO`, `Cash`, `CHANGE`,
   `Cashier`, `No Of Items`, `VATable Sales`, `THANK YOU`) may appear as an item name.
   Filter retention (lines kept / lines seen) is reported separately and is not an acceptance metric.
1b. **Merchant (Codex OCR-PLAN-011).** With the selected store named `Gaisano Grand Mall of Antique`, `1.png` must yield
   merchant `status = matched` and a non-null `display_name` taken from OCR text (never substituted from the store
   record), so `GET /public/reports/{ref}/review` → `data.merchant.display_name` renders instead of "Not detected".
   Measured: new-path header OCR on `1.png` = `GATSANO GRAND MALL OF ANTIQUE =. |` (3/4 store tokens). `2.png` is
   reported but **not gated**: its header is at the top edge, curled and tiny, and no tested setting reads it (header-only
   crops, blur 0–3, psm 4/6/11, 1–1.5×). This is a capture limitation outside this plan.
2. Per-frame OCR wall time on the local machine for the new path ≤ 1.25× the current path on the same image
   (measured current ≈ 2.1–2.5 s/pass, 2 passes; relative proxy for production 0.1 CPU).
3. Canonical evidence unchanged: stored source frames, SHA-256 integrity, and customer review photos are
   byte-identical; only the transient OCR derivative changes.
4. `continuous_video_v1` (historical) processing is unchanged in preprocessing, OCR, filtering, selector scoring,
   item/total extraction, and dimension handling. It still uses `ShelfTagImagePreprocessor`, psm 6/11, and no line
   filter; `ReceiptFrameQualityEvaluator` is not modified. **The one accepted change:** `transaction_date` is now
   populated for both modes (a new field that was previously always null; no existing value is altered).
   Shelf-tag scanning is unchanged (default Tesseract command byte-identical).
5. All pass: `php artisan test --filter=Receipt`, `--filter=ShelfTag`, `--filter=AdminRegulatoryWorkflowTest`,
   and `ReceiptOcrIntegrationTest` **run with a real Tesseract** (not skipped), including the new tests below.

## Environment facts (verified)
- Installed PWA → `https://cap-dti.onrender.com/api` (`customer-pwa/.env`, `.env.production`).
- Production: `TESSERACT_PATH=/usr/bin/tesseract` (`backend/render.yaml:17-18`), Debian bookworm `tesseract-ocr`
  5.3.x (`backend/Dockerfile`), receipt queue worker (`backend/docker/supervisord.conf`), Render **free** plan
  (`render.yaml:7`, ~0.1 CPU, 512 MB).
- Local: Tesseract 5.5.0; local `backend/.env` has no `TESSERACT_PATH` and points at the shared Supabase DB.

## Root cause (evidence)
Read-only query (user-approved) of the 3 most recent production receipt reports (`REP-20260911-KZAY`,
`REP-20260910-DA10`, `REP-20260905-LUDT`; all `guided_photos_v1`, all `Ready for confirmation`):
every pass `OCR_SUCCESS`, but text is noise (`Wy`, `yy`, `Uy YY`, `|`) with sparse real fragments. DA10: 42 lines,
0 items. Pass times 17.8–35.2 s primary / 4.8–12.7 s fallback per frame. The local harness on the user's photos
reproduces this exactly with the current path (0 items, no total).

Contributing defects:
1. **Background not removed.** The whole camera frame is OCR'd. The user's receipt lies on polka-dot fabric;
   the dots become `Wy/yy` noise.
2. **Dot-matrix print.** Characters are made of separate dots. The current sharpen kernel
   (`ShelfTagImagePreprocessor.php:96-98`) keeps them separated. A blur that joins dots
   raised price-token recall to 8/13 in the experiment.
3. **Wrong fallback derivative / PSM.** `imagetruecolortopalette(..., 2)` (`:103`) is a lossy 2-color quantize;
   PSM 11 (sparse) amplifies noise.
4. **Extractor cannot parse the PH POS layout** even on clean text:
   `004793487   1   111.75   111.75T` followed by the name on the next line `CALLA PWD F/C ROSE GARDEN`.
   The trailing VAT flag `T` defeats the end-anchored price regex (`ReceiptItemExtractor.php:29`). It is often
   OCR'd as `7`/`1` (`15.507`, `130.501`). The digits-only prefix is rejected as a nameless item, and the name
   on the following line is never paired. This is consistent with production `rejected_item_lines`
   (`4 7 (0 27.00`, `49.75`).
5. **transaction_date is never populated** (the pipeline never sets it; readers disagree on the key; see E).

Experiment (scratchpad, `2.png`, same metric): full frame psm6 → 1/13 prices; manual paper crop + grayscale +
3× Gaussian blur, psm 4 → **8/13** prices, ~1.06 s; crop + 2× blur psm 6 → 6/13 and **total found**; upscale
to 1400 px → 1/13 (worse); Sauvola thresholding → 0/13 (worse). Column mean saturation separates paper (≈0.04)
from background (≈0.25) sharply; a brightness/low-saturation pixel mask does not (white dots on the fabric pass it).

## Approach (scope: `guided_photos_v1` for A–E2 and G; F (date) applies to both modes)

### A. `ReceiptImagePreprocessor` (new, guided stills only)
`backend/app/Services/Receipt/ReceiptImagePreprocessor.php`, same return contract the pipeline uses (`path`,
`full_path`, `fallback_path`, `fallback_full_path`) plus `cleanup()`. It produces a transient derivative only.
1. **Safe decode:** `getimagesize()` before any GD decode. Reject width or height > 4000 or pixels > 16,000,000
   with a typed `UnsafeReceiptImageException`.
2. Decode, EXIF-orient (same logic as shelf tags), keep color for detection.
3. **Paper crop:** downsample to 160 px wide; compute per-column and per-row mean saturation
   (`(max-min)/max`). Threshold = midpoint of the profile's 10th and 90th percentiles. Paper = the longest
   contiguous run of columns below the threshold (rows likewise, within the paper columns). Expand by a 3% margin.
   Use the full frame when the profile contrast (p90 - p10) < 0.08 or the box is < 15% / > 97% of the area.
4. Crop, grayscale, resize by `scale = min(1000 / cropW, 4000 / cropH, sqrt(4_000_000 / (cropW × cropH)))`
   (bicubic; up or down), so the derivative is ≤ 1000 px wide, ≤ 4000 px tall, and ≤ 4 MP (Codex OCR-PLAN-009).
   Example: the `2.png` crop (~700×2000) → ~1000×2857. A 150×2000 strip → 300×4000, not 1000×13333. No sharpening.
5. Gaussian blur ×N to join dot-matrix dots (primary N=3, fallback N=2; exact N and target width finalized by the
   harness grid against the acceptance metric, and the chosen values are recorded in the build report).
6. Write primary and fallback PNGs to the existing local `scan_vault` area; `cleanup()` deletes them.

### B. Tesseract options (additive; shelf-tag default command byte-identical)
`ShelfTagOcrService::scan()` gains optional `dpi` (int) and `config` (map → repeated `-c key=value`), appended
only when supplied. Guided receipt passes: primary `--psm 4 --dpi 300 -c preserve_interword_spaces=1`,
min confidence 45 on the blur-3 derivative; fallback `--psm 6 --dpi 300 -c preserve_interword_spaces=1`,
min confidence 35 on the blur-2 derivative. No PSM 11 and no Sauvola for guided receipts.

### C. Conditional fallback + cross-pass total (guided only)
Fallback runs when the primary is non-`OCR_SUCCESS`, **or** `items === []`, **or** `total === null`, **or** the
raw readable-line ratio < 0.5 (Codex OCR-PLAN-002). Otherwise diagnostics record the fallback as `skipped`.
When both ran, `ReceiptOcrResultSelector` picks as today. If the selected pass has no total line and the other
pass does, the other pass's matching total line is appended to that frame's lines, and diagnostics note
`total_from_other_pass`.

### D. Noise-line filter (guided only)
Before `ReceiptTextAggregator::merge`, drop lines with < 3 alphanumerics or alphanumeric ratio < 0.5 unless they
contain a money token (`\d+[.,]\d{2}`). Raw per-pass lines stay in `ocr` diagnostics (Admin-only per
`DECISIONS.md:44`); kept/dropped counts are added to diagnostics. The filter is applied to each frame's lines before they enter
`$frames`, so multi-frame guided continuity (`ReceiptEvidencePipeline.php:148-154`) runs on filtered lines. For
guided mode a continuity failure is only an `INCOMPLETE_SCAN` warning, never a recapture.
Intended behavior change: a frame whose lines are **all** noise now counts as unreadable
(`ReceiptEvidencePipeline.php:110-112,129-136`). If its quality is also not acceptable, it gets `TEXT_UNREADABLE`
recapture (consistent with `DECISIONS.md:42`: poor images require recapture). Noise-only frames with acceptable
quality still proceed as today. A pipeline test covers both cases.

### E. Item extractor: PH POS layouts (guided only; Codex OCR-PLAN-007)
`ReceiptItemExtractor::analyze(array $lines, bool $posLayout = false)`. With `false` (default: video mode,
`extract()`, and every existing caller) behavior is byte-for-byte today's. `ReceiptOcrResultSelector::selectedPass()`
/ `select()` gain the same trailing `bool $posLayout = false`, passed to its internal item scoring, so guided pass
selection counts POS items while video scoring is unchanged. The pipeline passes
`$report->capture_mode === 'guided_photos_v1'`. With `$posLayout = true`, keeping existing behavior for current
single-line formats:
1. **VAT flag suffix:** accept an optional trailing flag after the money token: `[TVXZE]` or OCR confusions
   `7|1|I|l|\|`. It is only interpreted as a flag when stripping it leaves exactly two decimals (for example,
   `15.507` → `15.50`, `111.75T` → `111.75`). A genuine 2-decimal price is never altered.
2. **Forward-only two-line pairing (Codex OCR-PLAN-005, -010, -012).** POS-row recognition is two ordered steps:
   (a) **Suffix normalization first:** trim the line. If it ends with a money token immediately followed by exactly one
       flag character (`[TVXZEIl|]`, or a digit `7`/`1` forming a 3-decimal amount as in rule 1), remove exactly that one
       character. At most one suffix is removed, and only from the final money token.
   (b) **Letter-free signature on the remainder:** the normalized line must contain no `\p{L}` characters **and** match
       `^[\s\p{P}]*\d{5,}[\s\p{P}]*\s+(\d{1,3})\s+(?:(money)\s+)?(money)$`, where `money = \d{1,7}[.,]\d{2}` and the
       `[\s\p{P}]` classes exclude both letters and digits.
   Only lines passing (a) then (b) are POS rows.
   A POS row pairs **only** with the immediately next line, and only if that line has ≥ 3 letters, no money token,
   is not a non-item label, and does not match the exclusion pattern
   `\b(?:TIN|MIN|SERIAL|DATE|OR\s*NO|SOLD\s*TO|ADDRESS|CASHIER|TERMINAL|THANK|WELCOME|VISIT|PROMO|POINTS|MEMBER|SAVE)\b`
   or a date pattern. The paired line is consumed. There is **no backward pairing**. Numeric rows that are not POS
   rows (footer numbers, cashier ids, orphan prices) are never paired and are rejected exactly as today.
3. **Columns:** when the prefix matches `^\S*\d{5,}\S*\s+(\d{1,3})\s+(money)` before the final money token,
   `quantity` = the integer and `observed_price` stays the **final** money token (line total, current semantics
   used by `TOTAL_MISMATCH`).
4. Header and footer lines (`ITEM QTY PRICE TOTAL`, `No Of Items`, `VATable Sales`, `Cash`, `Change`,
   `Cashier`) remain non-items (extend `NON_ITEM_LABELS` with `vatable`, `no of items`, `cashier`).

### E2. Merchant display cleanup (guided only; Codex OCR-PLAN-011)
`ReceiptMerchantMatcher` logic is unchanged (the token threshold already matches the OCR'd Gaisano header). For guided
receipts only, the pipeline trims leading/trailing non-alphanumeric characters and collapses whitespace in
`merchant.display_name` (`GATSANO GRAND MALL OF ANTIQUE =. |` → `GATSANO GRAND MALL OF ANTIQUE`). It is never replaced
with the store record's name. If trimming leaves < 3 letters, `display_name` becomes `null`. Header lines still come
from the first two readable frames (`ReceiptEvidencePipeline.php:158-162`), after the D filter.

### F. transaction_date (user-approved scope)
Readers: customer review `ReceiptReportController.php:351-352` (`processing_result_json.transaction_date` →
`raw_ocr_json.metadata.transactionDate`); Admin web `CitizenTipReview.tsx:364` (`raw_ocr_json.transaction_date`).
1. New `ReceiptDateExtractor::extract(array $lines): ?string` → ISO date. Formats: `MM/DD/YYYY`, `MM-DD-YYYY`,
   `MM/DD/YY` (month-first), `YYYY-MM-DD`, `YYYY/MM/DD`, `Sep 11, 2026`, `September 11 2026`, `11 Sep 2026`,
   `11-Sep-26`. `checkdate()`; 2-digit year → `20YY`; reject < 2000-01-01 or > today+1; prefer lines matching
   `date|txn|trans`, else the first valid match.
2. Pipeline ready result adds `transaction_date` (recapture/failure → `null`); no new warning code.
3. `ProcessReceiptEvidence` writes `raw_ocr_json.transaction_date` (top-level); `processing_result_json` already
   stores the full result. The legacy `metadata.transactionDate` fallback read is kept.

### G. Decompression-bomb safety, guided only (Codex OCR-PLAN-001, -006, -008)
1. Upload (primary barrier): `ReceiptEvidenceController` validates `source_frame` dimensions with `getimagesize()`
   (no decode): reject > 4000 px on either side or > 16 MP with 422 "Receipt frames must be at most 4000×4000
   pixels." PWA frames are ≤ 2000 px (`GuidedReceiptCapture.tsx:101`). Video uploads are unaffected.
2. Defense in depth for already-stored guided frames: `ReceiptEvidencePipeline::prepareUploadedFrames()` checks each
   frame's `getimagesize()` **before** calling the shared `ReceiptFrameQualityEvaluator::evaluate()` (line 249).
   `ReceiptImagePreprocessor` repeats the check before its own decode. The shared evaluator is **not** modified, so the
   video path (`qualityEvaluator->select()`, lines 226-231) is untouched.
3. An unsafe guided frame yields `recaptureResult('INSUFFICIENT_FRAMES', ['unsafe_dimensions' => [...]])`. This reuses
   the existing documented code "No usable receipt image exists" (`backend/docs/receipt-ocr-remediation.md` outcome
   table), which is semantically equivalent, so no new public reason code, message, or doc contract change is needed.
   It is a controlled outcome instead of a worker crash or retry loop.

### Wiring
`ReceiptEvidencePipeline` keeps `ShelfTagImagePreprocessor` (video) and appends `ReceiptImagePreprocessor`
and `ReceiptDateExtractor` as constructor params. Update the 3 positional constructions in
`ReceiptEvidenceWorkflowTest.php:407,450,488` and `ReceiptOcrIntegrationTest.php` if it constructs the pipeline.
Pass options are selected by `capture_mode`.

## Non-goals
- Client capture changes (no client-side crop); source images stay canonical evidence (`DECISIONS.md:38`).
- Customer-editable OCR values (`DECISIONS.md:41`).
- Changing `continuous_video_v1` OCR behavior (OCR-PLAN-004: scoped out, regression-tested).
- Local queue worker or local job processing against the shared Supabase DB.
- Deploying. Pushing to the branch Render deploys from needs separate explicit user authorization.
- Render plan changes (risk only).

## Verification

### Local benchmark (scratchpad script, not committed; no DB, no queue)
`ocr_benchmark.php` mimics PWA capture (long side ≤ 2000 px, JPEG q86). For each unique sample it runs the current
path and the new path (real `ReceiptImagePreprocessor` + pass options + filter + extractors) and prints the
acceptance metrics, raw lines, extracted items, total, date, per-pass ms, fallback ran/skipped, and filter
retention. Run from `backend/` with Tesseract supplied via the process env only (never via `.env`).
PowerShell (the user's primary shell; saves and restores any prior value):
```powershell
$previousTesseractPath = $env:TESSERACT_PATH; $env:TESSERACT_PATH = 'C:\Program Files\Tesseract-OCR\tesseract.exe'; php <scratchpad>\ocr_benchmark.php both; $env:TESSERACT_PATH = $previousTesseractPath
```
Git Bash (POSIX inline assignment, scoped to the one command):
```bash
TESSERACT_PATH="C:/Program Files/Tesseract-OCR/tesseract.exe" php <scratchpad>/ocr_benchmark.php both
```

### Automated (phpunit.xml forces sqlite `:memory:` + sync queue; no live DB)
From `backend/`:
```
php artisan test --filter=Receipt
php artisan test --filter=ShelfTag
php artisan test --filter=AdminRegulatoryWorkflowTest
```
Real-engine integration test. PowerShell:
```powershell
$previousTesseractPath = $env:TESSERACT_PATH; $env:TESSERACT_PATH = 'C:\Program Files\Tesseract-OCR\tesseract.exe'; php artisan test --filter=ReceiptOcrIntegrationTest; $env:TESSERACT_PATH = $previousTesseractPath
```
Git Bash:
```bash
TESSERACT_PATH="C:/Program Files/Tesseract-OCR/tesseract.exe" php artisan test --filter=ReceiptOcrIntegrationTest
```
The integration test must report as **run, not skipped** (`ReceiptOcrIntegrationTest.php:38` skips when no binary is
configured). A skipped result fails acceptance criterion 5.
New/extended tests:
- `ReceiptImagePreprocessorTest`: synthetic GD image (low-saturation paper strip with dark text on a saturated
  dotted background). The crop contains the paper and excludes most background. A uniform image falls back to the
  full frame. Output width = 1000. Derivatives are cleaned up. Oversized dimensions (header-only PNG of
  5000×5000, or > 16 MP) throw before decode.
- Upload 422 test for a > 4000 px source frame (header-only PNG, so no big allocation in the test) and a 4000×4000
  boundary acceptance test; a pipeline test for a stored oversized guided frame → `Needs recapture` /
  `INSUFFICIENT_FRAMES` without invoking the evaluator decode.
- `ReceiptItemExtractorTest` (posLayout = true): the Gaisano two-line layout (exact strings from `2.png`) → items with
  names, quantity 1, and line totals; `T`/`7`/`1` flag suffixes; genuine `12.50` unchanged; header/footer lines ignored;
  **orphan numeric row preceded by merchant header (`GAISANO GRAND MALL`, then `004793487 1 111.75 111.75T`, then
  `Total P111.75`) stays rejected, and the header is never an item**; next line that is a TIN/date/serial line is not
  paired; **a POS-row-looking footer followed by `THANK YOU`, an address line (`BAGUMBAYAN, SAN JOSE, ANTIQUE 5700`),
  or a promotion line is not paired**; a non-POS numeric line (`70033`, `13`, `49.75`) followed by a letters line is
  not paired. **Every flag form (`T`, `V`, `X`, `Z`, `E`, `I`, `l`, `|`, `7`, `1`) is tested on the full two-line POS
  layout** (e.g. `004793487 1 111.75 111.75V` + `CALLA PWD F/C ROSE GARDEN` → one item at 111.75). Negatives: two flags
  (`111.75TT`), a letter inside the SKU/qty part (`00479A487 1 111.75 111.75T`), and a letter-bearing prefix
  (`QTY 1 111.75 111.75T`) are not POS rows. posLayout = false: all existing cases pass unchanged, and the Gaisano
  strings produce today's output.
- `ReceiptImagePreprocessorTest` also covers a tall, narrow accepted crop (e.g. 150×2000 paper): output ≤ 1000 wide,
  ≤ 4000 tall, ≤ 4 MP.
- Merchant: a pipeline test with store `Gaisano Grand Mall of Antique` and header lines
  `GATSANO GRAND MALL OF ANTIQUE =. |`, `BAGUMBAYAN, SAN JOSE, ANTIQUE 5700` → `matched` with display
  `GATSANO GRAND MALL OF ANTIQUE`, served by the review endpoint as `data.merchant.display_name`; junk-only display → null.
- `ReceiptOcrResultSelectorTest`: default scoring unchanged; posLayout scoring counts POS items.
- `ReceiptDateExtractorTest`: every format; `02/30/2026` → null; far-future → null; keyword preference; none → null.
- Line-filter test: noise dropped, short money lines (`49.75`) kept.
- `ShelfTagOcrServiceTest`: no new options → command unchanged; `dpi`/`config` → `--dpi 300`, `-c k=v`.
- Pipeline tests (mocked OCR): fallback skipped when the primary has items **and** a total; it runs for
  items-present/total-missing and total-present/items-missing primaries (separate tests); cross-pass total borrowing;
  unsafe-dimension → `INSUFFICIENT_FRAMES` recapture; `transaction_date` flows to `GET /public/reports/{ref}/review` → `data.transaction_date`
  and `raw_ocr_json.transaction_date`.
- Video regression: `continuous_video_v1` pipeline test asserts the `ShelfTagImagePreprocessor` path and psm 6/11 are
  used, no line filter is applied, posLayout = false for extraction and selection, continuity outcomes are unchanged on
  the existing fixtures, and persisted items for noisy historical text are identical to the pre-change extractor.

### Post-deploy (only after user-authorized deploy)
Capture a receipt in the installed PWA; review shows items/total. Re-run the read-only diagnostics query to confirm
readable OCR lines and pass timings within budget.

## Remaining risks
- **CPU budget:** production passes were 18–35 s/frame at 0.1 CPU. Local measurements show cropping lowers
  per-pass time (≈1.06 s vs ≈2.1 s), and conditional fallback removes a pass on good frames, so production time should
  drop, but long 12-frame receipts may still approach the 300 s budget. The lever beyond this is the Render plan
  (user decision).
- Crop heuristic assumes a saturated/colored background. On white or grey tables it falls back to the full frame,
  no worse than today.
- The corpus is 2 unique photos of one merchant and printer. Parameters may be overfit. Accepted for now; the
  harness and ground-truth metric make re-tuning cheap as more samples arrive.
- Dot-matrix OCR remains imperfect (~50–60% item recall expected); results stay read-only system extraction, and DTI
  reviews the photo (`DECISIONS.md:42`).
- Numeric dates are month-first; day-first receipts will be misread (accepted, read-only).
- Merchant matching depends on the selected establishment's stored name sharing ≥ 50% of its tokens with the printed
  header. The production store record for these reports was not inspected, so if it is named very differently the
  status stays `mismatch` (display is still shown only when matched). Merchant headers at the curled top edge of a photo
  (as in `2.png`) remain unreadable. Capture guidance is a possible follow-up, out of scope here.

---

## Amendment — user-directed salvage (after approval; supersedes parts of A–E2 for this build)
Build measurements showed Tesseract cannot reach criteria 1/1b on the dot-matrix samples: best 2/13 items even with crop+blur; banded
OCR was no better. GD Gaussian blur also cost ~379 ms/pass per 0.5 MP, a CPU-budget regression. The user chose to **salvage the
engine-independent parts now and plan a stronger OCR engine next**. This build therefore:
- **Removes section A** (`ReceiptImagePreprocessor`: paper crop, resize, blur). Guided photos reuse the existing `ShelfTagImagePreprocessor`
  derivative.
- **Section B, revised:** guided passes keep legacy psm 6 (primary) / 11 (fallback) and add `--dpi 300`, `preserve_interword_spaces=1`,
  and the new opt-in `paragraph_lines` TSV grouping. The latter fixes lines of different paragraphs being merged
  (`ShelfTagOcrService` keyed lines by block+line only while Tesseract restarts `line_num` per paragraph). Shelf-tag and video defaults are unchanged.
- **Keeps C, D, E, E2, F, G.** G's guard lives in `ReceiptImageLimits::safeDimensions()`. POS-layout single-line item names need ≥ 3
  letters (precision guard; OCR noise such as `Te 30,501` otherwise became an item after flag stripping). Pairing also excludes address
  lines (≥ 2 commas, or comma + trailing 4-digit postal code).
- **Criteria 1/1b are explicitly NOT met and are deferred** to the OCR-engine plan. Salvage acceptance: no regression versus the old path on
  the corpus (0 false items, similar time), all receipt/shelf-tag/admin suites pass, and `tests/Integration/ReceiptOcrIntegrationTest.php`
  passes with a real engine.
- **Proof-command correction:** `tests/Integration` is not in `phpunit.xml`, so `php artisan test --filter=ReceiptOcrIntegrationTest` finds no
  tests. Run it by path: `php vendor/bin/phpunit tests/Integration/ReceiptOcrIntegrationTest.php`.
