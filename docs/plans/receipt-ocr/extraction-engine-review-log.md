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
