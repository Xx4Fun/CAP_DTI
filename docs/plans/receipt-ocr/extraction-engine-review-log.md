# Review log — Claude vision receipt extraction engine

- Date: 2026-09-11
- Host / planner / builder: Claude Code (claude-opus-5). Plan reviewer: Codex CLI 0.154.0 (CLI default model). Final inspector: fresh Codex.
- Plan: `gemini-extraction-plan.md`; mode=full; MAX_ROUNDS=5; MAX_FIX_ROUNDS=2; MAX_INSPECTION_ROUNDS=2; inspect=on; research=web.
- Authorization: plan + Codex review only. **Build is NOT authorized.** Bake-off API spend is NOT authorized (needs explicit approval).
- Safety: Codex plugins/MCP servers are temporarily disabled for each review via `~/.codex/config.toml` backup/restore (sha256 `8a663280…`).
- User decisions: engine = Claude vision only; model = by bake-off data (Opus 5 / Sonnet 5 / Haiku 4.5); failure = Tesseract fallback;
  privacy = v1.1 notice + DTI/DPO gate (flag default off).
- Research sources: AWS Textract pricing (aws.amazon.com/textract/pricing), Google Cloud Vision pricing (cloud.google.com/vision/pricing),
  AWS AI services opt-out policies (docs.aws.amazon.com), Claude vision docs (platform.claude.com/docs/en/build-with-claude/vision),
  Anthropic data use (privacy.claude.com), Packagist `anthropic-ai/sdk` v0.48.0.

## Rounds

### Attempt 1 — FAILED (operational; not a round, no verdict)
- Plan sha256 `b41e360da80137b80ca6bb2fe9b2df469655e2b9f4bb7f72ae909e0eaea75e4e`; artifacts `scratchpad/engine-r1/claudex-5tvnh9d8`.
- Codex CLI exited 1 after 129.7 s: "You've hit your usage limit … try again at Sep 15th, 2026 12:10 PM." No review content was produced.
- Codex config restored (hash-verified). No retry was attempted; the provider was not switched silently.

### User decision: same-provider review
- The user explicitly chose a Claude subagent reviewer (fresh context, read-only `Plan` agent, same verdict/finding schema) while Codex is
  unavailable. **This is not an independent-provider review. The plan will never be labelled claudex-approved.** It can be re-reviewed by
  Codex after the 2026-09-15 reset.

### Round 1 (Claude `Plan` subagent, fresh) — REVISE
- Plan sha256 `b41e360d…`. 15 findings: ENG-001 high (deadline/retry math vs the 300 s budget, per-frame Tesseract reserve, re-run double
  billing); medium ENG-002 (no spend caps / denial-of-wallet), ENG-003 (grouped money), ENG-004 (shared name predicate rejects size tokens),
  ENG-005 (1.png nameless row: a hallucination would pass), ENG-006 (privacy statement understates the image content; notice omits the
  cross-border transfer), ENG-007 (consent default before sign-off; hard-coded versions), ENG-008 (persistence mapping/length/types/continuity),
  ENG-009 (bake-off lacks multi-section, non-receipt, and injection cases); low ENG-010–015 (verbatim date/total, payload size, missing-key
  contradiction and eager SDK construction, reason enum and logging, Admin engine visibility, recapture rule vs the quality evaluator).
- Host verification (spot-checks): `ConsumerReportItem` fillable; `throttle:30,1` public group; hard-coded '1.0' in `reportIntegrity.ts:28`;
  "(v1.0)" heading at `FormalReport.tsx:936`; `item_name` string column. All confirmed.
- Dispositions: **all 15 ACCEPTED**. The plan was rewritten (sections A–G, acceptance, verification, risks).

### Round 2 attempt — FAILED (operational; no verdict)
- Fresh `Plan` subagent terminated: "You've hit your session limit" (HTTP 429). No review content.

### Direction change (user, same day after limit reset)
- The user replaced Claude vision with **Gemini 3.8 Flash** as the primary engine. The Gemini API key is already in backend `.env`.
  The Claude-vision plan is superseded; the Round 1 lessons that still apply (deadline/retry math, spend caps, validation, consent gate,
  persistence mapping, bake-off cases) carry into the Gemini plan.

### Gemini plan draft (host), 2026-09-11
- Recon (code): the env has `GEMINI_API_KEY` (set; value never printed) and `GEMINI_MODEL=gemini-3.8-flash`; there are no code/config references yet.
  Confirmed reuse points: capture/upload/evidence/queue/status/confirm (tamper-proof via `prohibited` fields)/Admin manifest + audited assets.
  Issues found: new video sessions still allowed (`PublicPwaController.php:716`); Admin fabricated defaults (`CitizenTipReview.tsx:677`);
  the shelf-tag scanner still needs the Tesseract binary; `observed_price` = line total.
- Research (official): Gemini 3.8 Flash model ID, thinking levels, Interactions API (`store` defaults true; the plan sets false), structured output
  `response_format`, 20 MB inline limit, pricing ($0.75/$3.75 per 1M until 2026-12-31, doubling on 2027-01-01), Unpaid-tier data use (human review,
  product improvement, "do not submit personal information").
- User decisions: free-tier key for now (dev/own receipts only; paid project is a production gate); technical failure = Processing failed + retry
  (no auto Tesseract fallback; provider flag rollback only); keep the DTI/DPO gate.
- Plan status: **draft, NOT reviewed.** Codex is unavailable until 2026-09-15 12:10 PM. Build is not authorized.

### Gemini plan — Round 1 (Claude `Plan` subagent, fresh, same-provider) — REVISE (2026-09-12)
- User: "do the Claude subagent review then start Phase 0–1". Build of Phases 0–1 is authorized after the review arbitration.
- 20 findings: high GEM-001 (retry mechanics: pipeline returns rather than throws; no backoff; `failed()` overwrites codes) and GEM-002 (attempt
  cap = tries → dead-end Retry; per-bundle counter resets on restart); medium GEM-003 (gate outcomes; Tesseract permanence), GEM-004 (recapture rule
  contradictions; message maps), GEM-005 (discount sign / PH VAT / tolerance), GEM-006 (duplicate index validation/semantics), GEM-007 (persistence
  mapping/readers/`confirm` snapshot/casts), GEM-008 (Admin pre-fills line total as unit price), GEM-009 (12×2 MiB > 20 MB), GEM-010 (free-tier gate
  unenforceable; consent 1.0 leakage; corpus personal data), GEM-011 (tests would load the real key; no stray-request guard), GEM-012 (Phase 1 built on
  unverified API shapes), GEM-013 (provenance is only self-consistency), GEM-014 (refactor would break test call sites); low GEM-015 (**host claim
  wrong: video already flag-blocked**), GEM-016 (PWA badges keyed on null confidence), GEM-017 (SensitiveParameter/exception args/Http exceptions),
  GEM-018 (cache increment/TTL; token reservation), GEM-019 (private label lists; house-brand merchant check; attempts naming), GEM-020 (missing tests).
- Host verification: `PublicPwaController.php:720` abort(404) unless `RECEIPT_CONTINUOUS_CAPTURE_ENABLED`; `CitizenTipReview.tsx:112`
  `receipt_price: Number(item.observed_price || 0)`; no `.env.testing`, an empty `TestCase`, no `preventStrayRequests`. All confirmed.
- Dispositions: **all 20 ACCEPTED**; the plan was rewritten (gate table, retry/backoff mechanics, retryability table, decision table, sign conventions + adjustments,
  duplicate validation, persistence table, Admin fixes moved to Phase 1, 1a contract probe, test isolation in Phase 0, security details).
- Status: revised plan **not re-reviewed** (same-provider budget; user asked to proceed to Phases 0–1). Never labelled claudex-approved.

## Build — Phases 0–1 (host-built by Claude; branch `feat/receipt-extraction-gemini`)
- Commits:
  - `847d0f7`: salvage/retry work
  - `2810b0e`: plans
  - `95528ae`: Phase 0 config and test isolation
  - `227d9e6`: Phase 1 backend
  - `edd196f`: Admin fixes
- Phase 0: no Gemini key is ever used by tests (`phpunit.xml` pins + `Http::preventStrayRequests()`); the provider defaults to `tesseract` everywhere;
  `GEMINI_API_KEY` is declared as a Render secret (`sync: false`). The WebP task (`task_3d7746bd`) was still unfinished (no commits) and was **not merged**.
- Phase 1a live contract probe (free tier, synthetic receipt, no personal data):
  - HTTP 200 in 6.7 s; the Interactions API request shape was confirmed;
  - output is at `steps[type=model_output].content[].text`; usage fields `total_input_tokens` / `total_output_tokens` / `total_thought_tokens` (0 at `low`);
  - errors are `{error:{message,code}}` (404 `not_found`, 400 `invalid_request`);
  - `media_resolution` is **not** a `generation_config` field; the per-image `resolution` field takes `low|medium|high|ultra_high` (low = 272 vs high = 1088 tokens).
  - Sanitized fixtures are in `backend/tests/Fixtures/gemini/`; a string check confirmed no key is present.
- Deviations from the plan text:
  1. `GEMINI_MEDIA_RESOLUTION` → `GEMINI_IMAGE_RESOLUTION` (per-image `resolution`, default `high`), per the probe.
  2. An optional `GEMINI_CA_BUNDLE` was added because local PHP has no CA bundle (TLS stays verified; production uses system CAs).
  3. The Admin issue was worse than GEM-008: the item form had **no visible price input** and submitted the line total silently. A required
     unit-price input was added.
  4. The overall reconciliation status includes the line-arithmetic check (the user spec lists qty × unit price as a check).
  5. Warning messages were moved to a shared `ReceiptWarning` class (Tesseract behaviour unchanged).
- Proof (host-run):
  - backend `php artisan test` → 459/460 (the only failure is the pre-existing date-based `EmergencyApcWorkflowTest`);
  - `tests/Integration/ReceiptOcrIntegrationTest.php` → 3/3 with real Tesseract;
  - web `tsc` OK + vitest 113/113;
  - PWA `tsc` OK + vitest 346/346.
  - New tests: amount (13), reconciler (8), validator (24), Gemini extractor with fixtures (13), feature integration (11), web `receiptPrice` (3) + Admin unit-price/"Not available" (1).
- **Inspection: NOT yet performed.** Codex is unavailable until 2026-09-15 12:10 PM. These edits are host-authored and unreviewed by an independent provider.

## Code inspection 1 — Phases 0–1 (Claude subagent, fresh, same-provider) — REVISE (2026-09-12)
- User: "do the Claude reviewer now". Scope: `31e71e8..cbb5ee9`. Same provider as the builder, so this is **not** an independent
  cross-provider inspection; it is labelled accordingly.
- 13 findings, all **ACCEPTED** and fixed by the host:
  - INS-001 (high): one per-report cap made Restart after `EXTRACTION_ATTEMPT_CAP` a dead end, and 429/too-large calls consumed it. Fix: per-attempt cap
    (6) + per-report cap (18, new terminal `EXTRACTION_REPORT_CAP`, operator-only); 429 and too-large reservations are refunded.
  - INS-002 (high): a key with an embedded newline could surface in a Guzzle header exception. Fix: `isUsableKey` (printable ASCII after trim) gates
    routing and the boot log; the binding trims; the extractor wraps any other `Throwable` as `GEMINI_UNAVAILABLE` without keeping the cause.
  - INS-003 (medium): values from images the model flagged (problems, not clear, total region invisible) could be Ready without review. Fix: `EVIDENCE_QUALITY` warning.
  - INS-004 (medium): section 1 "no overlap" produced `INCOMPLETE_SCAN`. Fix: the prompt says section 1 is always `unknown`; the validator ignores
    section 1 and single-photo receipts.
  - INS-005 (high): a job re-run after a successful paid call bought the extraction again. Fix: the raw extraction is stored as `pending_extraction`
    immediately after the call and reused by re-runs; `retry-processing` keeps it.
  - INS-006 (medium): the schema check accepted malformed elements. Fix: strict per-element checks (source lines, uncertain fields, amounts, discounts, adjustments).
  - INS-007 (low): `duplicates_are_likely_genuine` ignored receipts with a subtotal. Fix: computed against the subtotal when present.
  - INS-008 (medium): every non-completed interaction status was retryable. Fix: `failed`/`incomplete` retry; other states are `GEMINI_REJECTED`.
  - INS-009 (low): `possible_duplicate_of` indexing was ambiguous. Fix: schema description + prompt say 0-based; the validator also requires the same
    line total or name, adjacent sections, and clamps out-of-range sections (`invalid_section`).
  - INS-010 (medium): the live probe used a reduced schema, not the production request. Fix: re-probed the exact `GeminiReceiptExtractor` request
    (free tier, synthetic two-section receipt): HTTP 200 in 14.4 s, 2,600 input / 759 output tokens, 3 items, all reconciliation checks matched,
    no warnings; model merged the overlapping line itself. Saved as `tests/Fixtures/gemini/interaction-production-request.json` (key-free check
    before save) with a replay test. The first probe attempt ended as `GEMINI_TIMEOUT` (classified retryable, as designed); the rerun succeeded.
  - INS-011 (medium): missing tests. Added: reuse after crash + retry, attempt cap → restart → fresh attempt processed, report cap terminal, 429
    refund, legacy route, trimmed/invalid key (no leak), `RECEIPT_INCOMPLETE` history message, unexpected client error, blocked statuses, schema
    rejections, evidence-quality, section/duplicate validation, subtotal duplicates, privacy notice validation. Outcome table in
    `backend/docs/receipt-ocr-remediation.md` updated.
  - INS-012 (low): review lacked `total` and subtotal/total uncertainty; warning messages missing for recapture codes. Fix: `total`,
    `subtotal_uncertain`, `total_uncertain` added (job snapshot + review); messages for `EVIDENCE_QUALITY`, `INSUFFICIENT_FRAMES`, `TEXT_UNREADABLE`, `RECEIPT_INCOMPLETE`.
  - INS-013 (low): any `privacy_notice_version` string was accepted, so a client could claim the future consent version. Fix: validated against
    `PublicPwaController::PRIVACY_NOTICE_VERSIONS` (`1.0` only until Phase 3 ships the 1.1 notice).
- Proof after fixes (host-run): backend full suite 487/488 (only the pre-existing `EmergencyApcWorkflowTest` date failure); integration 3/3;
  web `tsc` OK + vitest 113/113; PWA `tsc` OK + vitest 346/346.
- Plan text updated to the as-built caps (§ gate table, budgets, retryability).
- Next: fresh same-provider re-inspection of the fix commit (the inspection budget allows one more). An independent Codex inspection is still owed
  when Codex is available (after 2026-09-15 12:10 PM).

## Code inspection 2 — fix commit `64cae82` (Claude subagent, fresh, same-provider) — APPROVED (2026-09-12)
- The first launch ended with a session-limit API error (no result; not counted). The relaunch completed.
- Verdict **APPROVED**: all 13 INS fixes were verified as correct (INS-011 had small test gaps). Focused suite ran 244/244.
- Two low findings, both **ACCEPTED** and fixed by the host after the approval:
  - RI-001: an unparseable subtotal/total the model did not flag set `*_uncertain` but produced no warning. The fix adds parse failures to the
    `FIELDS_UNCERTAIN` check; the test now isolates the subtotal case.
  - RI-002: the extractor catch-all turned Laravel's `StrayRequestException` into `GEMINI_UNAVAILABLE`, so a wrong-URL bug could pass the retry
    test. The fix rethrows it; the retry test asserts 3 sends to the endpoint. The 429 test also asserts the token refund.
- Inspector limitations (accepted risks, recorded):
  1. If processing after a stored `pending_extraction` failed deterministically, retries would reuse the same payload and never reach the attempt cap.
     No concrete trigger was found.
  2. A worker killed between the response and the pending save still pays twice.
  3. Redis/Beanstalkd `retry_after` defaults (90 s) are shorter than the 360 s job timeout. The configured database queue (480 s) is safe. Do not
     switch drivers without raising `retry_after`.
- Proof after RI fixes: backend full suite 487/488 (only the pre-existing `EmergencyApcWorkflowTest`).
- **Inspection budget exhausted** (2 of 2). The RI-001/RI-002 edits were made after the approval and are unreviewed. Both inspections were
  same-provider, so an independent Codex inspection of `31e71e8..HEAD` is still owed before rollout.

## Phase 2 — evaluation corpus (started 2026-09-12, host-built by Claude)
- User: "start Phase 2".
- **Harness:** `php artisan receipts:evaluate` (`app/Console/Commands/EvaluateReceiptExtraction.php`) and `ReceiptEvaluationScorer`.
  - Calls the production `GeminiReceiptExtractor` and validator directly: no reports, consent path, queue, or DB.
  - Local and testing environments only.
  - Refuses cases not marked `masked` unless `GEMINI_BILLING_ATTESTED=paid`.
  - Re-encodes sections as the PWA does (long side ≤ 2000 px, JPEG 86).
  - Paces calls (`--delay`), retries transient failures (30 s, 60 s), and caps calls (`--max-calls`).
  - Writes private results to the gitignored `receipt-samples/eval-results/`.
- **Collection guide:** `docs/plans/receipt-ocr/phase2-evaluation-corpus.md`.
- **Tests:** 9 scorer unit tests, 5 command feature tests (replaying the live fixture; unmasked refusal; invalid ground truth; env
  refusal; 429 retry).
- **Corpus status:** only one real receipt exists (`receipt-samples/2.png` full and `1.png` top section; `3.png` is a duplicate).
  - Two pilot cases were built from it: `gaisano-full-single` (1 photo) and `gaisano-two-section` (2 overlapping photos).
  - Ground truth was drafted by Claude from the photos (13 lines summing to the printed 608.50) and is marked **unverified** until the
    user checks it against the paper receipt.
- **Masking:** SOLD TO / ADDRESS / TIN are blank on this receipt, so the cashier ID is the only personal field.
  - The **first mask attempt was misplaced**: it covered the POSH H&S price and left the cashier ID visible. The visual check caught it
    **before any call**.
  - The mask was regenerated and re-checked visually: the cashier ID is hidden and all item values are intact.
- **Pilot run** (free tier, `gemini-3.8-flash`, thinking `low`, image resolution `high`; 2 cases × 2 runs = 4 runs):
  - All 4 runs: 13/13 items, 0 wrong, 0 missed, 0 invented, total correct, status ready, reconciliation matched.
  - Item precision 1.0. Exact names 90% (the rest paired by similarity).
  - Overlap: the model merged the three overlapping lines itself (0 flagged lines, 0 genuine lines flagged).
  - Latency: p50 11.9 s, p95 18.6 s; single-section p95 14.3 s.
  - Cost: 8,154 input / 8,408 output tokens, about $0.009 per receipt.
  - 5 provider calls: one transient `GEMINI_UNAVAILABLE` was retried and succeeded.
- **Phase 2 exit is NOT met.** The pilot is one receipt (one store, one printer) with unverified ground truth and no `clean`-category data.
  The plan needs ≥ 30 receipts from ≥ 5 stores across the guide's categories. No config tuning is warranted yet.
- **Proof:** backend full suite 501/502 (only the pre-existing `EmergencyApcWorkflowTest`).
- **Unreviewed:** the harness and scorer are host-authored and have not been inspected.
- **User decision (2026-09-12):** "Im fine with that just 1 for now and since its accurate enough".
  - Phase 2 is **closed on the one-receipt pilot**. The user **overrides** the plan exit (≥ 30 receipts from ≥ 5 stores) and accepts
    the provisional config (thinking `low`, image resolution `high`).
  - The ground truth stays marked unverified: no paper check was done.
  - Residual risk: accuracy is proven for one store and one dot-matrix printer only. Faded thermal, crumpled, low-light, discount,
    SC/PWD, weighed, and unreadable-field receipts are untested.
  - Mitigations:
    - every extraction stays read-only and DTI-reviewed, with uncertainty and evidence-quality warnings;
    - the Phase 5 monitoring window becomes the real accuracy check;
    - the harness can be rerun whenever more receipts are added.
  - The production gates are unchanged: paid project, DPO sign-off, and the Codex inspection before rollout.

## Phase 3 — customer review UI, notice v1.1, Admin extraction panel (2026-09-12, host-built by Claude)
- User: "start Phase 3".
- **Customer review (`ReceiptDraftView.tsx`):** read-only receipt number, per-item unit price and line total, subtotal, discounts, adjustments,
  total, and a plain-language reconciliation line. Uncertainty badges come from `uncertain_fields` when
  `extraction_provider === 'gemini'`; `ocr_confidence` (always null under Gemini) drives badges only on the Tesseract path. Overlap
  duplicates are shown as "May repeat item N". Raw source lines stay off the customer screen and every value stays read-only.
- **Privacy notice v1.1** (`customer-pwa/src/app/privacyNotice.ts`): one shared constant and text used by the notice modal, the report
  payloads, and the config default.
  - New section names Google (Gemini) as DTI's processor, says processing may happen outside the Philippines, that only photos are sent,
    and that request storage is off.
  - The v1.0 text leaked the private server path `storage/app/private/receipt_vault` to customers; v1.1 drops it.
  - **The wording is a draft pending DPO sign-off**, and the consent gate stays closed: `RECEIPT_EXTRACTION_CONSENT_VERSIONS` is still empty,
    so shipping 1.1 sends nothing to Google by itself.
  - Backend `PublicPwaController` accepts `1.0` and `1.1` and reports `1.1` as current; older installed apps keep working.
- **Admin (`ReceiptExtractionPanel.tsx`):** provider and model, merchant/date/receipt number, photo-quality flags, an items table with
  uncertainty badges (plus validator reasons), section, possible-duplicate markers and source lines, amounts, reconciliation badges, the
  genuine-duplicate note, and warnings. Missing values read "Not available". `EvidenceSectionNav` adds "Section i of N" with previous/next
  across the viewed attempt. The panel renders only for structured (Gemini) results; Tesseract reports are unchanged.
  - Deviation from plan §7: no per-attempt thumbnail strip. Every asset view is an audited, integrity-checked fetch, so thumbnails would
    multiply audited evidence reads. The existing per-attempt buttons plus the new counter cover navigation.
- **Docs:** `customer-pwa-api.md` (accepted versions) and `customer-pwa-security-and-privacy.md` (automated reading, version acceptance).
- **Tests:** PWA structured-review test (unit price, per-field badge, duplicate marker, amounts, reconciliation, no raw lines, no inputs);
  `receiptCapture` payload pinned to 1.1; backend config/acceptance tests updated (1.1 accepted, 9.9 rejected); new web panel and section-nav tests.
- **Proof:** PWA `tsc` clean + vitest 347/347; backend full suite 501/502 (only the pre-existing `EmergencyApcWorkflowTest`); web `tsc` clean +
  vitest 117/117 **with `--no-file-parallelism`**.
  - **Known pre-existing flake:** the web suite fails intermittently under its default parallel run, and the failing test moves between runs
    (`AdminSafeguards` SRP panel, session-toast test). It also failed with the new test file excluded, and the three admin files pass together,
    so this is lazy `Suspense` panels racing 5 s `findBy` timeouts under load, not a Phase 3 regression. Sequential runs are green.
- **Unreviewed:** Phase 3 is host-authored and not yet inspected. The owed independent Codex inspection now covers `31e71e8..HEAD`.

## Code inspection 3 — Phase 3 (`04662a7`) and the Phase 2 harness (`858cd85`) (Claude subagent, fresh, same-provider) — REVISE (2026-09-12)
- User: "Can you do the same with phase 3 review with subagents?". Scope covered both commits; the Phase 2 harness had never been inspected.
- **Notice accuracy audit** (the reason this round mattered): every v1.1 claim was checked against code. Supported: private storage, SHA-256
  fingerprints, "only the photos are sent" (the request body is exactly model/store/system_instruction/generation_config/response_format/input),
  `store:false`, read-only results. Unverifiable in code (contractual): processor status, cross-border processing, whether the provider honours
  `store:false`. **Not supported: the old §2 "Only authorized DTI personnel can view the original photos"**, which contradicted §4.
- 11 findings, all **ACCEPTED** and fixed:
  - P3-001 (medium): notice contradicted itself about who can see the photos. §2 now reads "Apart from the automated reading described below…",
    and the summary card states the automated reading first.
  - P3-002 (medium): discount descriptions and negative (discount) item lines were unbounded, source-unverified model text shown to customers; a
    negative line escaped the item name cap entirely. Text shown to people is now normalized and capped at 255. (Adjustments have no description
    field in the schema, so none ever reached a person — corrected here after round 2's R2-012.) No XSS (React escapes; no
    `dangerouslySetInnerHTML` anywhere), but it is untrusted text presented as DTI output.
  - P3-003 (medium): the scorer counted a printed amount placed in the wrong field as *invented*, breaking the zero-tolerance target, and its
    test passed for the wrong reason. `compare()` now takes the printed-amount set; such values count as wrong.
  - P3-004 (medium): every target could read "met" while the model omitted most numbers (`missed` was in no denominator and no target). Added the
    `numeric_completeness` target (≥ 0.95).
  - P3-005 (low-medium): corpus frames were created outside the cleanup block and GD decode failures were unchecked, so one bad image aborted a
    paid run and left receipt imagery in the temp directory. Capture now runs inside the `try`, and an undecodable section fails just that case.
  - P3-006 (low-medium): failed and retried provider calls were billed but missing from the token and cost totals. Usage now accumulates across
    every attempt of a case.
  - P3-007 (low): section navigation could label an exhibit with the wrong photo (racing fetches) and fired an audited read per click. Added a
    request-generation guard and a `busy` lock.
  - P3-008 (low): the amount sign branched on the raw value while the text came from `peso()`, which could print `−null`. Defensive only.
  - P3-009 (low): the harness call cap — its only spend guard — had no test. Added.
  - P3-010 (low): an unreadable-name ground-truth line could steal the row a named line matched exactly. Named lines now pair first.
  - P3-011 (low): `/public/config.privacy_notice_version` is declared but never consumed by the PWA. Kept and documented as informational (consent
    is gated on the version stored with each report), rather than adding an unused re-consent path.
- Also hardened on the back of the notice audit: the request-contract test now pins the **entire** top-level key set, so a future addition cannot
  silently start sending more than the photos.
- **Correction to the Phase 3 proof note:** the inspector found the customer PWA suite has the same parallel-load flake as the web suite (5 timeout
  failures in files this work never touched). Both suites are green only with `--no-file-parallelism`; a separate task is fixing the root cause.
- Proof after fixes: PWA `tsc` clean + vitest 347/347 sequential; web `tsc` clean + vitest 118/118 sequential; backend suite below.
- **Inspection budget for Phase 3: 1 of 2 used.** These fixes are host-authored and unreviewed. The independent Codex inspection is still owed.

## Code inspection 4 — Phase 3 fix commit `091c219` (Claude subagent, fresh, same-provider) — REVISE (2026-09-12)
- The first launch died on a session-limit API error before reading any code; it produced no verdict and was **not** counted as a round. The
  relaunch completed.
- Fix verification: P3-001, P3-003, P3-004, P3-006, P3-008, P3-009, P3-010, P3-011 confirmed fixed; P3-002 fixed for the paths that exist;
  **P3-005 and P3-007 only partially fixed**. 13 new findings, all **ACCEPTED** and fixed:
  - R2-001 (medium): the new `catch (\RuntimeException)` also swallowed Laravel's `StrayRequestException`, so a harness test that forgot an HTTP
    fake would have reported "unreadable corpus image" and passed — defeating the guard added in round 2 of Phase 0–1. Now a dedicated
    `CorpusImageException`.
  - R2-002 (medium): the P3-003 fix overshot. Because the printed-amount set contained the row's own line total, a model copying a line total into
    an unprinted unit price scored "wrong" instead of "invented" — and the per-unit price is exactly what DTI compares to the SRP. The row's
    counterpart amount is now excluded everywhere it appears. **My first attempt removed only one occurrence and still failed when the fabricated
    value also equalled the receipt total; my own new test caught it.**
  - R2-003 (medium): `selectReport` never invalidated in-flight fetches, so switching reports mid-load could paint report A's receipt into report
    B's exhibit panel, with B's loading state cleared by A's promise. The request generation is now bumped on selection and honoured by the manifest
    fetch, the initial asset fetch, and the legacy branch.
  - R2-004 (low-medium): an undecodable later section left the earlier sections' temp JPEGs on disk — the exact leak P3-005 claimed to fix. Capture
    now cleans up its own partial work before rethrowing.
  - R2-005 (low): the truncation flag fired at `>=` the cap, so an accurate 255-character name was reported as truncated and forced manual review.
  - R2-006 (low): capping before the checks meant the non-product and merchant-mention checks saw only the first 255 characters, so a padded footer
    line could survive as a purchased item. Checks now run on the full normalized text; only stored/displayed values are capped.
  - R2-007 (low): a cut discount description reached the customer with `uncertain: false` and no warning at all. Truncation is now an uncertainty.
  - R2-008 (low): plan §10 did not list the new `numeric_completeness` target. Added.
  - R2-009 (low): `URL.revokeObjectURL(URL.createObjectURL(blob))` was a no-op that read like cleanup. Removed.
  - R2-010 (low): the token-cost test asserted exactly 2× the single-call fixture, so it could not tell "failed + success" from "success counted
    twice". The two faked responses now carry different usage.
  - R2-011 (low): the key-set assertion pinned key *order* (brittle) and only the top level; the normalization half of the discount test passed
    regardless. Now an order-insensitive set comparison plus per-input-part shapes, and a short description that actually exercises normalization.
  - R2-012 (low): the round-3 log claimed adjustment descriptions were exposed; the schema has no such field. Log corrected.
  - R2-013 (low): two notice section bodies changed while `PRIVACY_NOTICE_VERSION` stayed `1.1`, against the file's own rule. Disposition: v1.1 is
    **explicitly mutable until DPO sign-off** (no production report can have consented to it — the consent list is empty), and the text is now
    pinned by `privacyNotice.test.ts`. Once the DPO signs off, any further change bumps the version.
- Proof: backend 510/511 (only the pre-existing `EmergencyApcWorkflowTest`); web `tsc` clean + 118/118; PWA `tsc` clean + 351/351 (all sequential).
- **Inspection budget for Phase 3: 2 of 2 used.** The R2 fixes above are host-authored and unreviewed by any inspector. The independent Codex
  inspection of `31e71e8..HEAD` remains owed, and is now the only outstanding review for this feature.

## Phase 4 — video capture path (2026-09-12, host-built by Claude)
- User: "Start Phase 4".
- **Decision: harden, do not remove.** Plan §3 keeps `ReceiptVideoInspector`, `ReceiptFrameSampler`, and FFmpeg until the drain query is empty, so
  deleting the path now would strand historical video reports. Phase 4 therefore closes the entry points and leaves the exits open.
- **Gap found:** `RECEIPT_CONTINUOUS_CAPTURE_ENABLED` was checked only when *opening* a capture session (`PublicPwaController::createCaptureSession`).
  A video session opened while the flag was on could still upload video and become a report after the flag was turned off, so the kill switch did not
  actually stop new video reports.
- **As built:** new `App\Services\Receipt\ReceiptCaptureModes` holds the mode constants and the switch, and the check now also runs in
  `ReceiptEvidenceController::storeAsset` (video upload → 404 when off) and `PublicPwaController::submitAsyncReceiptDraft` (video session → 404 when
  off). `/public/config` reports the flag through the same helper.
- **Deliberately untouched:** `ReceiptEvidencePipeline`, retry, Customer review, and the Admin manifest/asset endpoints never consult the flag, so
  historical video reports keep processing and stay downloadable. Guided capture is unaffected.
- **Tests (Phase 4 exit):** video upload and report creation refused after the flag flips mid-session (with the earlier asset still stored and no
  report created); guided capture unaffected while video is off; a historical video report still processes and is reviewable with the flag off.
- **Proof:** backend 513/514 (only the pre-existing `EmergencyApcWorkflowTest`). No frontend source changed, so the PWA and web suites were not rerun.
- **Note:** the PWA never offers video capture (`receiptCaptureSupport` returns guided or unsupported), so this phase is backend-only.
- **Unreviewed:** host-authored; no inspection round has been run for Phase 4. The owed independent Codex inspection now covers `31e71e8..HEAD`.

### Phase 4 — author self-review (2026-09-12, NOT an independent inspection)
- User asked for a review while Codex is unavailable, so the author reviewed their own commit. **This is the weakest form of review**: the same
  blind spots that produced the code produce the review. It does not consume an inspection round and does not substitute for the Codex pass.
- Verified correct: the flag is checked at exactly the three entry points that can create video evidence and nowhere else (`grep` over `app/`
  confirms processing, retry, review, and Admin never consult it); the idempotent replay branch in `submitReport` runs **before** the new guard, so
  an existing video report can still be replayed while the flag is off; a guided session uploading video still gets 422, while a video session with
  the flag off gets 404; recapture sessions are guided-only, so they cannot reintroduce video.
- Findings, both fixed in the follow-up commit:
  - P4-001 (medium, test quality): the two `assertNotFound()` assertions could not distinguish the new guard from any other 404 — they would have
    passed even if the guard did nothing and the 404 came from elsewhere. The test now flips the flag back on and asserts the same submission
    returns 201. **Writing that assertion immediately exposed a second problem**: with the flag on, the submission runs the video job synchronously
    in tests and fails on missing FFmpeg, so the assertion fakes the queue. The original test never reached that code at all.
  - P4-002 (low): `ReceiptCaptureModes::VIDEO`/`GUIDED` were unused outside the class while the controller kept literal mode strings — the drift the
    class exists to prevent. `createCaptureSession` now uses the constants.
- Accepted, not changed: a customer whose video session is killed mid-flow by the flag gets a bare 404 and loses that capture. Video is off by
  default and the PWA never offers it, so no real customer can hit this; a friendlier 422 would advertise a retired path.
- Proof after the fixes: backend 513/514 (only the pre-existing `EmergencyApcWorkflowTest`).
