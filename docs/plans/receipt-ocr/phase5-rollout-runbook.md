# Phase 5 — Gemini receipt extraction rollout runbook

Rollout is an operator procedure, not a code change. Nothing here happens automatically, and every step is reversible by one
environment variable until real receipts have been sent.

## Prerequisites (all required before enabling)

| # | Prerequisite | Who | Status |
|---|---|---|---|
| 1 | Paid Google project; its key stored as the Render secret `GEMINI_API_KEY` (`sync: false`) | Project owner | **Outstanding** |
| 2 | DPO sign-off recorded in `docs/DECISIONS.md`, naming the approved notice version(s) and the billing attestation | DTI DPO | **Outstanding** |
| 3 | Independent Codex inspection of `31e71e8..HEAD` | Reviewer | **Outstanding** (Codex available after 2026-09-15 12:10 PM) |
| 4 | Budget alerts on the Google project (daily spend and quota) | Project owner | **Outstanding** |
| 5 | Deploy authorization for this branch | Repository owner | **Outstanding** |

The free tier is for development only. Until prerequisite 1 exists, `GEMINI_BILLING_ATTESTED` must stay unset, which keeps the
approval gate closed outside local and testing.

## Order of operations

1. **Staging first.** Deploy the branch to a staging service. Staging sends real receipts only if it also has
   `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=true` and `GEMINI_BILLING_ATTESTED=paid`; treat staging keys and spend as production.
2. **Deploy production with the engine off.** `RECEIPT_EXTRACTION_PROVIDER=tesseract` (the default in `render.yaml`) and the v1.1
   notice shipped in the PWA. Customers see the new notice; nothing is sent to Google.
3. **Verify the deployment.** `php artisan receipts:extraction-preflight` — on Tesseract every Gemini row is advisory and the
   command exits 0. Confirm `video capture (retired)` reads `disabled`.
4. **Enable the engine** by setting, in Render:
   - `RECEIPT_EXTRACTION_PROVIDER=gemini`
   - `RECEIPT_EXTRACTION_CONSENT_VERSIONS=1.1` (exactly the versions the DPO approved)
   - `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=true`
   - `GEMINI_BILLING_ATTESTED=paid`
   - `GEMINI_API_KEY` = the paid project key (secret)
5. **Preflight must now exit 0** with no `BLOCK` rows. If it blocks, the engine is misconfigured: fix it before any traffic.
6. **One controlled receipt.** Submit a fresh receipt from a real device, confirm it reaches `Ready for confirmation`, and check
   the Admin extraction panel shows the items, reconciliation, and warnings.
7. **Monitor for two weeks** (below) before widening use or starting Phase 6.

## Monitoring

`php artisan receipts:extraction-status --days=14` (add `--json` for machine reading). It reads only stored results: codes,
counts, timings, and token spend, never receipt contents or credentials.

| Watch | Expected | If breached |
|---|---|---|
| `consent_gate_leaks` | **0** | Set `RECEIPT_EXTRACTION_PROVIDER=tesseract` immediately and investigate: a report reached the provider on a notice version the DPO never approved |
| `failure_codes` totals | < 5% of reports | Check codes: `GEMINI_AUTH` / `GEMINI_NOT_CONFIGURED` mean a broken key (operator fix); `GEMINI_UNAVAILABLE` / `GEMINI_RATE_LIMITED` are provider-side |
| `EXTRACTION_BUDGET_EXHAUSTED`, log `receipt_extraction.daily_cap_reached` | absent | Raise the daily caps deliberately, or accept the pause |
| `outcomes` → `Needs recapture` | < 20% of reports | Capture guidance or model quality problem; compare with the Phase 2 corpus |
| `reconciliation` → `mismatch` | < 10% of gemini reports | Investigate before trusting totals; DTI review still catches these |
| `latency_p95_ms` | ≤ 30000 | Reconsider `GEMINI_IMAGE_RESOLUTION` / `GEMINI_THINKING_LEVEL` (config only) |
| `estimated_cost_usd`, `today.calls`, `today.tokens` | within budget and caps | Adjust caps or pause |
| `manual_review_rate` | tracked, no target | A rate near 1.0 means the uncertainty signal is not discriminating |

Cost is an estimate from stored token counts at $0.75 / $3.75 per 1M input / output tokens (valid until 2026-12-31). The Google
billing console is the authority.

## Rollback

Set `RECEIPT_EXTRACTION_PROVIDER=tesseract`. That is the whole rollback:

- new jobs route to Tesseract from the next dispatch; no migration, no data change;
- reports already extracted keep their stored results and stay reviewable;
- an in-flight job finishes on the engine it started with;
- **it does not undo anything already sent to Google.** That is why prerequisites 1 and 2 gate the first real receipt.

Narrower levers, in order of preference: remove a version from `RECEIPT_EXTRACTION_CONSENT_VERSIONS` (stops new consented traffic
while leaving the engine on), lower `RECEIPT_EXTRACTION_DAILY_CALL_LIMIT`, or set `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=false`.

## Exit

Phase 5 ends when two weeks have passed with the table above inside its bounds and no `consent_gate_leaks`. Only then does
Phase 6 (retiring the Tesseract receipt path) become a question, and it has its own drain conditions in the plan.
