# Plan review log — Restore receipt OCR data flow

- Date: 2026-09-11
- Host / planner / builder: Claude Code (claude-opus-5)
- Plan reviewer: Codex CLI 0.154.0 (model: CLI default, not pinned; observed model recorded per round)
- Final inspector: fresh Codex session
- Plan: `tesseract-remediation-plan.md`; mode=review; MAX_ROUNDS=5; MAX_FIX_ROUNDS=2; MAX_INSPECTION_ROUNDS=2; inspect=on
- Authorization: investigate + plan + Codex review. Build NOT yet authorized.
- Safety: all Codex plugins and MCP servers (firebase, wps-office, render, playwright,
  node_repl, supabase) temporarily disabled via `~/.codex/config.toml`; backup
  sha256 `8a663280bf8c92215583d0468b59239b321feaf7ac16197bf1cc3fd56eaaeaa2`, restored after review.
- Runner artifacts: session scratchpad (outside checkout).
- User decisions: temp-disable Codex MCP (recommended); RC3 = minimal date extractor (recommended).

## Rounds

### Attempt 1 — FAILED (malformed result; not counted as a round, not resumable)
- Plan sha256: `3ab0f6e3ad77126fcbc6e5687f448d8f2ec4e16315e04f1000f3ba15a19b6cf5`
- Runner result: `scratchpad/claudex-r1/claudex-pdxo3xj5/result.json`; exit 0 from Codex, runner
  validation error `Invalid limitations list.` (trailing empty string in `limitations`).
- Model: CLI default (unresolved). Elapsed 216.8s.
- Content (verdict REVISE, used as evidence only, not as a formal round):
  - ENV-001 (high): Customer PWA targets `https://cap-dti.onrender.com/api`
    (`customer-pwa/.env`, `.env.production`); production sets `TESSERACT_PATH=/usr/bin/tesseract`
    (`backend/render.yaml:17-18`), installs Tesseract (`backend/Dockerfile`), and runs a receipt
    worker (`backend/docker/supervisord.conf`). Local `.env` RC1/RC2 do not explain the observed failure.
  - QUEUE-002 (high): local backend uses Supabase + `QUEUE_CONNECTION=database`; a local
    `queue:work` could race the production worker and mutate production receipt reports.
- Host disposition: BOTH ACCEPTED — independently verified against the cited files. Plan to be
  revised: establish failing environment and observed status first; remove local-worker step.
- Codex config restored after attempt (hash-verified).

### Evidence gathered between attempts (host)
- User: installed PWA on phone (production Render); symptom = reaches review, all data empty.
- User-approved read-only query (Postgres `SET TRANSACTION READ ONLY`, diagnostic fields only) of the
  most recent receipt reports: all `OCR_SUCCESS`, text mostly noise; extractor parses the few clean
  lines; primary pass 17.8–35.2 s/frame. Root cause re-established as OCR preprocessing/parameters,
  not config. The plan was rewritten (OCR derivative, Tesseract options, conditional fallback, noise filter,
  date extractor). Local env fixes and the local worker were dropped.
- `receipt-samples/` created and gitignored for user-supplied real receipt photos.

### Attempt 2 — fresh Codex session (attempt 1 had no resumable result)
- Plan rewritten; Codex MCP/plugins re-isolated (backup sha256 unchanged).

### Round 1 (formal) — REVISE
- Session `01a0902c-7238-7380-8cd1-5f5bc03597a5`; plan sha256 `d8623d549e50b620ab4bef6559c94474c199a4120d40bc90e512b36e690fe622`;
  result `scratchpad/claudex-r2/claudex-uf7euf49/result.json`; model: CLI default (not reported).
- Findings:
  - OCR-PLAN-001 high: no pixel-dimension limit before GD decode (upload 2 MiB only; quality evaluator decodes unguarded) → worker OOM.
  - OCR-PLAN-002 medium: fallback condition `zero items AND no total` skips fallback when one signal is missing.
  - OCR-PLAN-003 medium: readability metric biased (filter applied to new path only); use shared ground-truth metric.
  - OCR-PLAN-004 medium: preprocessor swap also affects historical continuous_video_v1; scope or regression-test.
- Limitations reported: no access to production records/photos/telemetry; classes not yet implemented; no tests run.
- Dispositions: all 4 ACCEPTED after host verification (feedback file `scratchpad/feedback-r2.md`).
- New host evidence: user samples (dot-matrix print, polka-dot background, two-line POS layout with VAT flag); baseline
  harness reproduces production; scratch experiment grounds crop/blur/psm choices. Plan revised (sections A–G).

### Round 2 — REVISE
- Same session (resumed); plan sha256 `729196c85c353872e22fd7d543eb62cdb793e7790bd14afd0bdf922b412b3ac5`;
  result `scratchpad/claudex-r3/*/result.json`; elapsed 143.6 s. Reviewer: prior 4 findings substantively addressed.
- Findings:
  - OCR-PLAN-005 medium: backward pairing can turn merchant header into an item.
  - OCR-PLAN-006 medium: guard in shared quality evaluator changes the historical video path.
  - OCR-PLAN-007 medium: expanded extractor on both modes changes persisted historical items on reprocess.
  - OCR-PLAN-008 low: `UNSUPPORTED_IMAGE` is outside the documented recapture code contract.
- Dispositions: all 4 ACCEPTED after verification (feedback `scratchpad/feedback-r3.md`): forward-only pairing with eligibility
  rules; guard moved to the guided path; POS rules scoped by `posLayout` flag (extractor + selector); unsafe → `INSUFFICIENT_FRAMES`.

### Round 3 — REVISE
- Same session; plan sha256 `f08fb08b7c80471c973c1071e8f4ce67ec7a1f62a25b471d62986169e093ad47`; result `scratchpad/claudex-r4/*/result.json`;
  elapsed 111.6 s. Reviewer: round-2 findings resolved.
- Findings: OCR-PLAN-009 medium (unbounded derivative height); OCR-PLAN-010 medium (no precision bound; loose pairing);
  OCR-PLAN-011 medium (merchant symptom has no acceptance gate).
- Host evidence: header OCR probe. `1.png` header reads `GATSANO GRAND MALL OF ANTIQUE`; `2.png` header is unreadable in all tested settings.
- Dispositions: all 3 ACCEPTED (feedback `scratchpad/feedback-r4.md`): bounded scale; POS-row signature + exclusions + precision ≥ 0.75;
  merchant criterion 1b on `1.png` + E2 display trimming; `2.png` merchant not gated (documented).

### Round 4 — REVISE
- Same session; plan sha256 `c0eff6718865ab8024569718b20f02324c55d4f56851113bad7a07d5177a929c`; result `scratchpad/claudex-r5/*/result.json`;
  elapsed 52.8 s. Reviewer: round-3 findings resolved.
- Finding: OCR-PLAN-012 medium. The POS-row "no letters" precondition contradicts the allowed VAT letter suffix; `\D*` admits letters.
- Disposition: ACCEPTED (feedback `scratchpad/feedback-r5.md`): ordered suffix-strip-then-letter-free signature; tests for all flag forms and negatives.

### Round 5 (final; MAX_ROUNDS reached) — REVISE
- Same session; plan sha256 `17afebfd7623b4327b460fccee9c7939f86b761cd598ea4a3f8a912bfe76982f`; result `scratchpad/claudex-r6/*/result.json`;
  elapsed 47.2 s. Reviewer: OCR-PLAN-012 resolved.
- Finding: OCR-PLAN-013 medium. The verification commands use POSIX inline env assignment, which is invalid in Windows PowerShell,
  so the integration test would skip.
- Disposition: ACCEPTED. The plan now gives PowerShell (save/restore) and Git Bash forms for both commands. Note: the Bash form is what the
  host actually executed successfully for the baseline benchmark, so the defect was shell ambiguity, not a wrong command.
- **Status: NOT APPROVED.** Round budget exhausted; the final plan revision (013 fix) has not been reviewed. No convergence claimed.
- Codex config restored (hash-verified `8a663280…`).

### User decision after round 5
- User explicitly granted **one extra review round** (beyond MAX_ROUNDS=5) and **authorized the build if the plan is APPROVED**.
  If round 6 returns REVISE/BLOCKED, the host stops and reports (no build).

### Round 6 (user-granted extra) — APPROVED
- Same session; plan sha256 `13317330f5ccf758932f124849f436a8afa6270a934fabc4954c0230ad135036`; result `scratchpad/claudex-r7/*/result.json`; elapsed 30.4 s.
- Summary: no material unresolved defects. Limitations: plan-only approval; private corpus/production data not independently inspected;
  OCR accuracy/timing/tests unverified.
- `runner check`: "Approval matches the current plan." Codex config restored (hash-verified).

## Build
- Builder: Claude (host), in place. Pre-build commit `31e71e832f18b63be2365dcd00c1d49a4a9f7d8a`. Pre-existing loop-owned changes:
  `.gitignore` (receipt-samples entry), `tesseract-remediation-plan.md`, `tesseract-remediation-review-log.md`.
- Baseline before build: `php artisan test --filter='Receipt|ShelfTag|AdminRegulatoryWorkflowTest'` → 108/108 passed.

### Build status (paused for user decision; NOT inspected)
- Implemented sections A–G per plan. Existing guided tests updated for intended behavior (psm 4/6 + dpi; fallback skipped).
- Deviations (additive, guided-only):
  1. `ShelfTagOcrService` TSV parsing gains opt-in `paragraph_lines`. Root cause found in build: lines are keyed by block+line only,
     and Tesseract restarts `line_num` per paragraph, so multi-paragraph receipt text merged unrelated lines (also affects production).
     The default (shelf-tag, video) grouping is unchanged.
  2. Pairing exclusion adds an address heuristic (≥ 2 commas, or a comma + trailing 4-digit postal code). This was required by the
     plan's own negative test.
  3. posLayout rejects OCR-damaged SKU rows as items (≥ 5-digit run with < 3 letters), for precision.
- Tests: 149/150 pass. FAIL: `ReceiptProcessingBudgetTest::test_exhausted_budget_stops_before_fallback_and_preserves_original`.
  Cause: GD Gaussian blur costs ~379 ms/pass on 0.5 MP (5 passes ≈ 1.6–1.9 s on the fixture; ~11 s locally for a real 2.9 MP
  derivative; ~10× slower in production) → a real CPU-budget regression.
- **Acceptance (benchmark on the real pipeline, private samples):**
  - Criterion 1 FAIL. Best configurations: `2.png` 2/13 items (precision 0.67–1.0), no total; `1.png` 0–1/11. The current path gives 0 items.
    Raw price tokens improved from 0–1 to 5–8/13.
  - Criterion 1b FAIL: merchant `mismatch` in the full pipeline for both samples.
  - Criterion 2: per-pass OCR is faster (1.3–2.3 s vs 3.5–4.1 s), but blur preprocessing cost outweighs it (see above).
  - Tuning tried: the plan's width/blur grid (9 combos), crop margin (+3%, 0, −2%), confidence floor, and a banded-OCR deviation
    (12 combos). None reached the targets; banding was slower.
  - Conclusion: the ceiling is Tesseract recognition of dot-matrix print in phone photos (qty column read as `i`/`it`, SKUs and amounts
    dropped), not the extraction rules (unit-tested correct on clean text).

### User decision: salvage now, OCR-engine plan next
- Removed `ReceiptImagePreprocessor` (crop/blur); guard moved to `ReceiptImageLimits`. Guided passes: legacy psm 6/11 + dpi 300 +
  preserve_interword_spaces + paragraph_lines (psm 4/6 variants measured, no gain on the old derivative).
- Found and fixed a precision regression from the salvage benchmark: noise `Te 30,501` became item "Te" after flag stripping. POS-mode
  single-line names now need ≥ 3 letters.
- tesseract-remediation-plan.md: appended an "Amendment — user-directed salvage" section. The approval hash no longer matches, by design; this build is a
  user-directed subset, recorded here and never labelled as the approved plan.
- Proof (host-run):
  - `php artisan test --filter='Receipt|ShelfTag|AdminRegulatoryWorkflowTest'` → 162/162 passed.
  - `php vendor/bin/phpunit tests/Integration/ReceiptOcrIntegrationTest.php` → 3/3 passed with real Tesseract 5.5.0 (not skipped).
    `tests/Integration` is not in `phpunit.xml`, so the plan's `--filter` command found no tests. Corrected in the amendment.
  - Full suite: 370/371. The one failure, `EmergencyApcWorkflowTest::test_activation_rejects_a_stale_review...`, is date-based
    (`starts_on 2026-09-09`, state `ended` vs `in_effect` on 2026-09-11). No changed file references APC; judged pre-existing/unrelated.
  - Corpus benchmark (real pipeline): salvage == old path on both samples (0 items, 0 false items, similar time). Criteria 1/1b are deferred.

### Inspection 1 (fresh Codex session `01a0906a-11ea-79f3-a423-81ba0a9a186a`, base `31e71e8`) — REVISE
- Result `scratchpad/claudex-inspect1/*/result.json`; elapsed 805 s; snapshot sha256 `e56d8645…`; Codex config isolated, then restored.
- Findings and dispositions (all ACCEPTED after host verification; fix round 1 of 2):
  - OCR-IMG-001 high: the 16 MP limit is unsafe; `ShelfTagImagePreprocessor` holds two true-colour buffers and the header-only test never
    allocated. **Fixed:** `MAX_PIXELS = 4_000_000` (PWA frames are ≤ 2000 px on the long side). **Measured** in an isolated process with
    real decodable JPEGs through the full guided pipeline at `memory_limit=128M`: 1080×1920 → peak 80 MiB; 2000×2000 (the maximum) →
    peak 100 MiB (baseline 24 MiB). Tests: a real 2000×2000 PNG upload is accepted; 2001×2000 and 4001×10 are rejected.
  - OCR-IMG-002 medium: undecodable frames were accepted at upload and later crashed the evaluator, so the job retried.
    **Fixed:** upload rejects an unreadable header and any image GD cannot decode (422). Guided frames that are unreadable at the header,
    evaluator, or preprocessor become a controlled `INSUFFICIENT_FRAMES` recapture (`UnreadableReceiptImageException`, diagnostics
    `unreadable_frame`). Tests cover the three variants.
  - OCR-POS-001 medium: textual dates and merchant headers after a POS row were paired. **Fixed:** shared `ReceiptDateExtractor::containsDate()`;
    header words (CORP, INC, MGMT, MALL, BRANCH, SUPERMARKET) are excluded; known store/owner names are excluded via
    `ReceiptMerchantMatcher::mentions()` (the same 50% token rule). Tests: `11 Sep 2026`, `September 11 2026`, `GAISANO GRAND MALL`,
    a company header, and merchant context on/off.
  - OCR-DATE-001 low: the customer reader missed `raw_ocr_json.transaction_date`. **Fixed:** fallback chain
    processing_result → raw top-level → legacy metadata. Test with only the top-level raw value.
- Noted, out of scope: the production Dockerfile builds GD without WebP (`--with-freetype --with-jpeg`), so WebP frames already cannot be
  decoded in production; they are now rejected at upload rather than crash-looping. The PWA sends JPEG only.
- Proof after fixes: receipt/shelf-tag/admin filters 172/172; integration 3/3 with real Tesseract. The full suite surfaced
  `PublicPwaTest::test_can_submit_formal_report_and_enforce_idempotency`, which uploaded a zero-filled non-image as a receipt frame and is now
  correctly rejected (IMG-002). The test now uses `UploadedFile::fake()->image(...)`; its intent (submission idempotency) is unchanged.
  Full suite 380/381; the only failure is the unrelated, date-based `EmergencyApcWorkflowTest`.

### Inspection 2 (fresh Codex session `01a0907d-0f7e-7ae2-a662-70d76702d332`) — REVISE; inspection budget exhausted (2/2)
- Result `scratchpad/claudex-inspect2/*/result.json`; elapsed 294 s; snapshot sha256 `43f9d45d…`; Codex config restored.
- Inspection-1 fixes were not re-flagged. New findings (host-verified):
  - OCR-INTEGRITY-002 high, **pre-existing** (base `31e71e8` pipeline has no source-hash check): processing uses stored bytes without
    re-verifying `sha256` (DECISIONS.md:39). Hashes are checked only at submit/confirm/serve.
  - OCR-FALLBACK-003 medium, **introduced by this build**: `primaryIsWeak()` and selector scoring run POS extraction without the
    store/owner names that final extraction uses.
  - OCR-WEBP-004 medium, **pre-existing**: prod GD lacks WebP while the API advertises and accepts it. Already spun off as task `task_3d7746bd`.
- Status: NOT APPROVED. Awaiting user decision on fix round 2/2 and any further inspection.

### User decision: fix round 2/2 + one extra (user-granted) inspection
- OCR-FALLBACK-003 ACCEPTED/fixed: store/owner names are computed once in `process()` and passed to `primaryIsWeak()`, selector
  scoring (`selectedPass/select(..., $merchantNames)`), and final extraction. Tests: merchant header in the primary forces the fallback;
  selector scoring with and without merchant context.
- OCR-INTEGRITY-002 ACCEPTED/fixed (pre-existing gap): `assertOriginal()` hashes the exact local copy of every source frame and original video
  against `asset.sha256` before any decode/OCR. A mismatch → `failed` / `EVIDENCE_INTEGRITY_FAILED` (Processing failed, not recapture),
  with diagnostics `integrity_failure`. Applies to all modes (DECISIONS.md:39); `sha256` is `char(64)` NOT NULL. Tests: guided frame replaced by a
  valid image after submission; historical video replaced (inspector never called).
- OCR-WEBP-004: deferred to separate task `task_3d7746bd` (pre-existing production GD build gap).
- Proof: receipt/shelf-tag/admin filters 176/176; integration 3/3 (real Tesseract); full suite 384/385 (only the unrelated date-based APC test);
  corpus benchmark unchanged versus the old path (0 false items).

### Inspection 3 (user-granted extra; fresh Codex session `01a09087-235f-7690-ba1a-02f81187f661`) — REVISE
- Result `scratchpad/claudex-inspect3/*/result.json`; elapsed 287 s; snapshot sha256 `bf74d73b…`; Codex config restored (hash-verified).
- FALLBACK-003 and INTEGRITY-002 not re-flagged. Remaining:
  - OCR-INTEGRITY-RETRY-001 medium, **introduced by the integrity fix**: `EVIDENCE_INTEGRITY_FAILED` surfaces as `Processing failed`, and
    `retryProcessing` plus the PWA offer "Retry processing", which can never succeed against changed evidence. Suggested fix: non-retryable
    gate on `failure_code`, a flag in the `/processing` response, and PWA copy that does not suggest re-running OCR.
  - OCR-WEBP-002 medium, pre-existing: same as WEBP-004; separate task `task_3d7746bd`.
- **Final status: NOT APPROVED.** Fix budget (2/2) and inspection budget (2 + 1 extra) exhausted; the two findings above remain open.
  No edits were made after inspection 3, so the inspected snapshot `bf74d73b…` is the current working tree.

### Post-loop user-directed fix: OCR-INTEGRITY-RETRY-001 (NOT independently inspected)
- The user asked to fix the retry issue directly after the inspection budget was exhausted. These edits are **host-authored and have no
  Codex inspection**.
- Backend (`ReceiptReportController`): `retryProcessing` returns 409 for bundle `failure_code = EVIDENCE_INTEGRITY_FAILED`.
  `/processing` adds `can_retry_processing` and `failure_reason`, and sets `can_recapture` true for that case. `startRecapture` allows
  **restart only** from an integrity failure (replace/append → 422, since carrying the compromised originals is refused); `finalizeRecapture`
  accepts that state. `ProcessReceiptEvidence` public message no longer says "try again" for integrity failures.
- PWA (`ReceiptDraftView`): Retry is hidden when `can_retry_processing === false`; shows `failure_reason` and a **Restart receipt** action;
  skips loading compromised photos. Backward compatible (a missing flag keeps today's retry behaviour).
- Proof: backend receipt/shelf-tag/admin/PublicPwa filters 183/183; full backend 385/386 (only the unrelated APC test); PWA `tsc` clean;
  PWA vitest 346/346. New tests: the end-to-end integrity path (job → flags → retry 409 → replace 422 → restart → finalize → requeued as
  attempt 2), the generic failure staying retryable, and the PWA integrity view.
