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

Notice **v1.2** is the version the team approved (`docs/DECISIONS.md`, 2026-09-12); it states the free-plan terms plainly. Until a paid
project exists, `GEMINI_BILLING_ATTESTED` must be `free_tier_demo` and **never `paid`** — the value is a claim about what the key really
is, it is recorded with every extraction, and it limits capture to the project team's own receipts. Leaving it unset keeps the approval
gate closed outside local and testing.

## Capstone demonstration on Render (free tier)

The team decided (see `docs/DECISIONS.md`, 2026-09-12) to demonstrate on the deployed service without a paid project. Prerequisites
1 and 2 above are replaced by the team's own recorded sign-off; 3 and 5 still apply.

Set in Render:

- `RECEIPT_EXTRACTION_PROVIDER=gemini`
- `RECEIPT_EXTRACTION_CONSENT_VERSIONS=1.2`
- `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=true`
- `GEMINI_BILLING_ATTESTED=free_tier_demo` ← **not `paid`**. The gate accepts it, the preflight and monitoring commands say so loudly,
  a warning is logged at boot, and the value is stored with every extraction.
- `GEMINI_API_KEY` = the free-tier key (still a secret; never in the repo)

**The rule that comes with it:** while `free_tier_demo` is in force, capture only receipts belonging to the project team. Google may use
free-tier content for product improvement and humans may review it, so a panelist's or stranger's receipt must not be submitted. Keep
the daily caps low (`RECEIPT_EXTRACTION_DAILY_CALL_LIMIT`) so a demo cannot run away.

To move to real DTI use later: obtain a paid project, switch the attestation to `paid`, and record a fresh approval — the DPO decision,
not the team's.

## Order of operations

1. **Staging first.** Deploy the branch to a staging service. Staging sends receipts only if it also has
   `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=true` and an attestation (`free_tier_demo` for the capstone, `paid` only once a paid project
   exists); treat staging keys and spend as production.
2. **Deploy production with the engine off.** `RECEIPT_EXTRACTION_PROVIDER=tesseract` (the default in `render.yaml`) and the v1.2
   notice shipped in the PWA. Customers see the new notice; nothing is sent to Google.
3. **Verify the deployment.** `php artisan receipts:extraction-preflight` — on Tesseract every Gemini row is advisory and the
   command exits 0. Confirm `video capture (retired)` reads `disabled`.
4. **Enable the engine** by setting, in Render (for the capstone demonstration use the values in the section above):
   - `RECEIPT_EXTRACTION_PROVIDER=gemini` — note this key has a literal value in `render.yaml`, so a later Blueprint sync will revert a
     dashboard-only edit (it falls back to Tesseract, which is safe but confusing). Change it in `render.yaml` for a lasting switch.
   - `RECEIPT_EXTRACTION_CONSENT_VERSIONS=1.2` (exactly the versions actually approved)
   - `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=true`
   - `GEMINI_BILLING_ATTESTED=free_tier_demo` for the capstone; `paid` **only** once a paid project exists
   - `GEMINI_API_KEY` = the key for the attested project (secret)
5. **Preflight must now exit 0** with no `BLOCK` rows. If it blocks, the engine is misconfigured: fix it before any traffic.
6. **One controlled receipt.** Submit a fresh receipt from a real device, confirm it reaches `Ready for confirmation`, and check
   the Admin extraction panel shows the items, reconciliation, and warnings.
7. **Monitor for two weeks** (below) before widening use or starting Phase 6.

## Monitoring

`php artisan receipts:extraction-status --days=14` (add `--json` for machine reading). It reads only stored results: codes,
counts, timings, and token spend, never receipt contents or credentials.

| Watch | Expected | If breached |
|---|---|---|
| `consent_gate_leaks` | **0** | Set `RECEIPT_EXTRACTION_PROVIDER=tesseract` immediately and investigate: a report reached the provider on a notice version that was not approved **at the time it was sent** (judged against the list recorded with that extraction, so narrowing the list later does not invent leaks). Failed sends count too |
| `consent_snapshot_missing` | 0 for anything sent after this release | A send whose result carries no recorded consent list; it cannot be judged automatically, so check those reports by hand |
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
- **it does not undo anything already sent to Google.** That is why the prerequisites gate the first receipt, and why the free-tier
  demonstration is limited to the project team's own receipts.

Narrower levers, in order of preference: remove a version from `RECEIPT_EXTRACTION_CONSENT_VERSIONS` (stops new consented traffic
while leaving the engine on), lower `RECEIPT_EXTRACTION_DAILY_CALL_LIMIT`, or set `RECEIPT_EXTRACTION_PRODUCTION_APPROVED=false`.

## Exit

Phase 5 ends when two weeks have passed with the table above inside its bounds and no `consent_gate_leaks`. Only then does
Phase 6 (retiring the Tesseract receipt path) become a question, and it has its own drain conditions in the plan.
