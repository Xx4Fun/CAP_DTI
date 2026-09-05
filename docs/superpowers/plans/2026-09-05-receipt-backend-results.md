# Receipt backend reliability results

Date: 2026-09-05
Scope: Task 1 only (`backend/`), isolated worktree, no commit/deployment/migration/reprocessing/private evidence.

## Implemented

- Receipt item extraction rejects symbol-only and numeric-only labels (including `$ 8.50`) while retaining valid raw lines in the aggregate OCR result. Parsed items now use `ocr_confidence: null`; no confidence value is fabricated.
- Successful OCR passes are ranked in this order: plausible item count, recognized total, measured mean word confidence, then primary on a tie. The selected pass remains coherent; fields are not mixed across passes.
- Pass ranking calls the production item and total extractors, so malformed price-only lines and unsupported total labels cannot inflate a pass score through separate heuristics.
- Each frame's private processing result retains the complete primary and fallback results plus `selected_pass`, while the selected aggregate raw OCR remains unchanged for existing consumers. Empty/technical results remain present in failure diagnostics, and technical outcomes still map to `Processing failed`.
- Merchant matching adds nullable `display_name` only when exactly one actual observed header line unambiguously matches the registered store/owner. Observed header lines remain intact and the selected store name is never substituted.
- Public receipt review adds `attempt_number`, nullable `merchant.display_name`, and nullable `transaction_date`. The date comes only from already stored processing data or legacy `raw_ocr_json.metadata.transactionDate`; otherwise it is `null`.
- Guided-still adjacent-overlap mismatch now stays reviewable with `continuity.status: unverified`, an `INCOMPLETE_SCAN` warning, and `manual_review_required: true`. Historical `continuous_video_v1` retains the existing `Needs recapture` behavior. Evidence-quality failures and technical failure classifications were otherwise unchanged.
- Rejected price-like item candidates are retained as `rejected_item_lines` in the private processing result. Any rejected candidate adds `OCR_INCOMPLETE`, including mixed results where valid items and the total otherwise reconcile.
- CORS exposes only the existing `Retry-After` response header, allowing the Customer Vercel origin to honor backend throttling without changing other CORS settings.
- The manager-authorized Admin evidence manifest adds nullable `processing_result` for the current bundle only. Its pass diagnostics remain absent from Customer endpoints, and prior bundles are not modified.
- Existing original-evidence hash/existence checks, confirmation request validation, immutable attempt history, raw OCR, repeat-item handling, and correction-field behavior were not changed.

## Tests added or extended

- `ReceiptItemExtractorTest`: malformed item names and nullable unknown confidence.
- `ReceiptOcrResultSelectorTest`: ranking precedence and primary tie behavior.
- `ReceiptMerchantMatcherTest`: actual unique header display name and ambiguous/null behavior.
- `ReceiptEvidenceWorkflowTest`: additive public metadata, nullable date, guided overlap/manual review, and both-pass provenance.
- `VerifiedStoreAndRateLimitTest`: an actual 429 response exposes `Retry-After` cross-origin.
- `AdminReceiptEvidenceTest`: current private processing diagnostics are available to an authorized evaluator, forbidden to a Field Officer, and remain absent publicly.

The new regressions were observed failing for the missing behavior before their corresponding fixes were completed (wrong item count, missing selector API/display name, absent review attempt metadata, and invalid fixture setup), then rerun green.

## Verification

- Focused changed receipt tests: **37 passed, 203 assertions**.
- Complete backend receipt filter: **68 passed, 314 assertions** (baseline was 60 passed, 282 assertions).
- Real Tesseract integrations: **4 passed, 55 assertions** using isolated synthetic receipt fixtures; both one-section and overlapping-section cases completed.
- Final review regressions: extraction/selector/warning **3 passed, 8 assertions**; CORS **1 passed, 15 assertions**; Admin/public visibility **2 passed, 16 assertions**.
- Full Laravel backend suite: **272 passed, 1,367 assertions**.
- `git diff --check`: clean for backend changes; warnings referenced concurrently owned Customer PWA line endings only.

## Not performed

- No production/Android receipt acceptance, Render worker check, external database operation, schema migration, historical reprocessing, deployment, commit, or push.
- No private receipt evidence was accessed.
