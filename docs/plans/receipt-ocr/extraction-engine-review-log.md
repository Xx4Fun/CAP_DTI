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
