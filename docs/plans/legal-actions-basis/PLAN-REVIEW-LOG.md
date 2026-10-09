# Plan review log: Legal Actions basis derivation, notice detail page, layout

Append-only.

## Setup (2026-10-07)

- Host and planner: Claude Code, Opus 5.5 (`claude-opus-5-5`).
- Plan reviewer: Codex CLI 0.160.1, model and effort from its own configuration (not pinned; observed values recorded per round).
- Builder: Claude (host). Final inspector: fresh Codex session.
- Plan: `docs/plans/legal-actions-basis/PLAN.md`. Limits: 5 review rounds, 2 fix rounds, 2 inspection rounds. Inspection on.
- Scope: `backend/` legal policy derivation, `web/` Legal Actions. No schema change.
- Authorization: owner approved the draft plan and the Codex review. Building waits for the owner's go-ahead on the reviewed plan. No commit, push or deploy.
- Owner decisions E1-E3 recorded in the plan.
- Codex guard (AGENTS.md): `~/.codex/config.toml` backed up outside the repo before each call and restored byte-for-byte after, SHA256 checked. `[mcp_servers.node_repl]` had no `enabled` key and is disabled for the duration of each call; every other MCP table and the listed write plugins were already `enabled = false`.

## Round 1 (2026-10-07) — REVISE

- Plan SHA256 `56d3206c7ca117fcffc32604a0c84865b8e989174e84c2499c4d091c3050b503`. Codex CLI 0.160.1, session `01a115cd-8943-7710-8bfc-1622279137f3`, model not reported by the CLI (requested: CLI default). 199 s.
- Config guard: SHA256 `6c239d5b…5080` before and after restore, match.
- Summary: "The plan hash matches. Three concrete gaps affect existing-draft recovery, pagination preservation, and the proposed desktop layout."

| ID | Severity | Finding | Reviewer's fix | Disposition |
|---|---|---|---|---|
| LAB-001 | high | Existing drafts can hold a permitted but mismatched reason (`LegalNoticeLifecycleTest.php:277`). `formFrom` loads it and `save` submits it; with the control locked and `update` refusing mismatches, the evaluator could not correct such a draft. | Initialise the form reason from `policy.derived.reason`, leave the draft dirty when it differs, persist through the ordinary audited save, keep issued payloads and saved bases, test mismatched and null reasons. | Accepted. Plan section B, "Existing drafts with a different saved reason". |
| LAB-002 | medium | `listKind` is `'issued'` only for `view === 'issued'` (`LegalNoticeManager.tsx:168-192`). A `'detail'` view would flip the list to the draft queue, reset the page and fetch drafts; returning would reset again. | Treat detail as issued scope, suspend list fetching while it is open, test from a page greater than 1 via both back paths. | Accepted. Plan section C, "List scope while the detail is open". |
| LAB-003 | medium | The reused visit-page classes need `--visit-aside-width`, defined only on `.field-monitor-review-page` (`admin.css:1627-1642`). Under `.legal-workspace` the two-column grid would be invalid at 1440px. | Define the variable on the Legal Actions wrapper with the responsive override, or reuse the whole owning contract; verify the desktop layout. | Accepted. Plan section C, "Layout contract" (`.legal-page` wrapper). |

- Reviewer coverage: plan and hash; navigation, status and decision docs; legal policy config and service; admin notice create/update/issue/escalate/detail; notice model; SCO template; frontend types; manager form load/save, readiness, list effects, CSS dependencies; history ownership in AdminShell and CitizenTipReview; notice entry points from Store Communications, Field Monitoring and GIS; field reference resolution; no-action writer; vendor receipt and payloads; related tests.
- Reviewer limitations: static review only; no browser or screenshot check and `ref.png` not inspected; the Senate PDF returned 403 and the DTI article was unreachable, so the legal-source statements were not independently validated.
- Result: plan revised to revision 2, SHA256 `97a53f6d21588342dc01b1d1f7ff94d8d1489a7385025e3e8fa75f6af9dc1a5c`.

## Round 2 (2026-10-07) — REVISE

- Plan SHA256 `97a53f6d21588342dc01b1d1f7ff94d8d1489a7385025e3e8fa75f6af9dc1a5c`. Same Codex session (`01a115cd-…37f3`), resumed with host dispositions for round 1. Model not reported by the CLI. 98 s.
- Config guard: SHA256 `6c239d5b…5080` before and after restore, match.
- Summary: "Revision 2 matches the supplied hash and addresses LAB-001 through LAB-003. One additional request-lifecycle defect needs an explicit fix."

| ID | Severity | Finding | Reviewer's fix | Disposition |
|---|---|---|---|---|
| LAB-004 | medium | Two detail fetch paths with different guards (`LegalNoticeManager.tsx:139-163,505-511`). `reviewIssued` takes a request number, then entering `'detail'` triggers the `[view]` effect, which bumps the number and discards the response. Separately, pushing `source_notice` re-runs the URL effect, whose response calls `openNotice` unguarded: a late response can reopen a notice after Back, or replace a later selection. | One request-ownership mechanism for list, initial-URL and popstate loads; invalidate synchronously when the selection changes or closes; entering detail must not invalidate its own request; separate URL navigation from applying fetched data; delayed-response tests. | Accepted. Verified at `:92-95`, `:141`, `:159-163`, `:501-507`. Plan section C, "One owner for detail loads". |

- Reviewer confirmed LAB-001, LAB-002 and LAB-003 are addressed, and inspected `ref.png` this round.
- Reviewer limitations: static review only; implementation does not exist yet; responsive behaviour judged from source and the reference image; legal-source limits from round 1 remain.
- Result: plan revised to revision 3, SHA256 `9c3a62662136a40fc04ade3f1bfea0f34f685d9bcd08d981054ad360e63feed7`.

## Round 3 (2026-10-07) — APPROVED

- Plan SHA256 `9c3a62662136a40fc04ade3f1bfea0f34f685d9bcd08d981054ad360e63feed7` (revision 3). Same Codex session (`01a115cd-…37f3`), resumed with host dispositions for round 2. Model not reported by the CLI. 62 s.
- Config guard: SHA256 `6c239d5b…5080` before and after restore, match.
- Summary: "Revision 3 matches the supplied SHA256 and addresses LAB-001 through LAB-004. No material unresolved plan defects were found." No findings.
- Reviewer coverage: plan hash and baseline; the existing-draft reason correction and saved legal bases; pagination scope; layout dependencies; unified detail loading, synchronous invalidation, URL initialisation, browser navigation and the delayed-response cases; notice entry points and history ownership in AdminShell, Store Communications, Field Monitoring and GIS; backend draft, update, issue, escalation and policy paths; vendor receipt and response; monitoring decisions; related test source and `ref.png`.
- Reviewer limitations: approval covers the plan, not an implementation; no tests, builds or browser flows were run; the plan's legal interpretations were not independently validated (sources unreachable from the reviewer).
- The approval is bound to this hash. The plan's status line still reads "not yet reviewed" because editing the file would change the hash; this log is the review record. Any further plan edit needs another review round.
- Rounds used: 3 of 5. Not built. Waiting for the owner's go-ahead.

## Build (2026-10-07)

- Owner said "build". Builder: Claude (host). Pre-build commit `f20b8168ecb0bd367cc768c73a011cdda1700879`.
- The working tree already held uncommitted edits that are not part of this build: `vendor-pwa/` (8 files), and in `web/` `AdminPanels.tsx`, `CitizenTipReview.tsx`, `LegalNoticeManager.tsx` (table card wrappers, `legal-primary-btn`) and `admin.css`. They are kept and built on. A patch of the pre-build `web/` diff is saved outside the repo so this build's changes can be told apart.
- Built by Claude: backend (`config/legal_policy.php`, `LegalPolicyService::derive`, `LegalNoticeController`), web (`LegalNoticeManager.tsx`, new `LegalNoticeDetail.tsx`, new `legalNotice.ts`, `admin.css`, `types/admin.ts`), tests, `docs/DECISIONS.md`.

### Deviations from the approved plan

| # | Plan | Built | Why |
|---|---|---|---|
| V1 | `derive(array $referenceTypes)` | `derive(array $referenceTypes, string $noticeType)`; returns null when the notice type's policy does not permit the derived reason, and keeps only permitted bases | `LegalActionsWorkflowTest` runs with a policy whose reasons differ. Without this, a save would be refused against a reason the policy does not offer, and a draft could be pre-filled with a basis issue then rejects. It also replaces the `in_array` guard `issue()` already had. |
| V2 | Group key and heading "Violated law" (owner decision E1) | Key `applicable_law`, heading "Applicable law" | DECISIONS 2026-08 and the regulatory-actions plan forbid the Admin UI from stating a violation before DTI decides one. The grouping itself is as decided. Needs the owner's confirmation. |
| V3 | "What the evidence shows" table inside Section 2 | No table in Section 2. Each product row in Section 4 (Evidence) now shows how far it is over its reference and an "Above SRP" / "Above price ceiling" chip; the reason line in Section 2 points to it. The detail page has the full cited-products table. | The table repeated the list already in Section 4 of the same form (six existing tests failed on the duplicate product names). One list is cleaner. |
| V4 | Prepare Notice wrapped in `.legal-page` with the visit top bar | A back button ("Back to drafts" / "Back to visits"), the title and a status chip inside the existing heading; no `.legal-page` wrapper | The editor keeps its own two-column grid, so it needs no aside-width variable. The back labels avoid the tab names so two buttons do not share one accessible name. |
| V5 | New file `LegalNoticeDetail.tsx` only | Also `legalNotice.ts` for shared constants and helpers | The lint rule `react(only-export-components)` forbids exporting non-components from a component file; the repo lints clean. |
| V6 | Tests in the three existing web test files | New behaviour is in `LegalNoticeBasisAndDetail.test.tsx`; two existing tests in `LegalNoticeResponseReview.test.tsx` were rewritten for the page (open, go back, open the second; "Cancelled" chip) | Keeps the new cases together. |

### Proof run by the host

- Backend: `php artisan test --filter="Legal|RegulatoryDecisions|AdminDraftImmutability"` 82 passed; full suite `php artisan test` 767 passed (5,844 assertions).
- Web: `npx vitest run` 34 files, 252 tests passed (run before the final CSS-only polish; the 5 Legal files, 55 tests, re-run after it and passed); `npx tsc -b --noEmit` clean; `npx oxlint` clean; `npm run build` succeeded.
- Mutation check of the new web tests: removing each of four guards (the `[view]` backstop exception, issued scope for the detail view, applying the derived reason to the form, reading `source_notice` once) made at least one new test fail; the file was restored after each.
- Browser, local backend on a scratch SQLite copy (two seeded accepted visits with flagged SRP items) and local web dev server, seeded test evaluator:
  - Needs Review lists both visits. Start notice then Start LOI draft: `POST /admin/legal-notices` 201; Section 2 shows "Prices above SRP · Determined from evidence", no dropdown, RA 7581 ticked under Applicable law, the other three unticked in their groups.
  - Issue (after re-authentication): 200; lands on the notice page. Computed `grid-template-columns` of `.visit-review-layout`: `726.8px 340px` at 1440px, one column `670.8px` at 1024px with no horizontal scroll; rail `position: sticky` at 1440px and `static` at 1024px.
  - Back button returns to the list. Opening from the list sets `?module=legal_actions&view=issued&source_notice=1` with one `GET /admin/legal-notices/1`; browser Back returns to the list and removes `source_notice`. Loading the URL with `source_notice=1` opens the page directly.
  - Send reminder: `POST …/reminder` 201. Close with "No violation found": `POST …/close` 200; the page shows "Closed", the outcome, and no action bar.
  - Only console error: the expected 403 that opens the re-authentication prompt.
- Not exercised in the browser: escalate (needs a vendor response or a passed deadline) and the legacy delivery / offline-response forms. Both are covered by the existing web tests, which pass through the new page.

## Inspection 1 (2026-10-07) — REVISE

- Fresh Codex session `01a115fb-8efc-7ad0-99ee-5b0e8c41b9f5`, Codex CLI 0.160.1, model not reported by the CLI. 284 s. Config guard: SHA256 `6c239d5b…5080` before and after restore, match.
- Run on an isolated copy, because the working checkout holds about 1,760 unrelated untracked files (`mobile/`, `scratch/`, `documents/`) and other uncommitted work. The copy was `git archive` of `f20b816`, plus the web edits that were already uncommitted before this build as a second commit (the inspection base), with this build's 13 files copied on top. Snapshot `5d6d4d31…3319`. So this inspection covered this build only, not those earlier web edits.
- Summary: "The supplied file hashes match. Static inspection found unresolved navigation races, URL mismatches, and evidence-display defects."

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| LAB-005 | medium | The `popstate` handler invalidated a pending load only when a detail page was already showing. Open A, go back, browser Forward (load pending), browser Back before it resolves: the late response reopened A. | Accepted. Verified in `restore`. A URL without `source_notice` now always bumps the request number. Test: "does not reopen a notice that browser Forward was loading once Back is pressed first". |
| LAB-006 | medium | Only a list open put the notice in the URL. After escalation the URL still named the LOI while the SCO was shown; after issue, and from a waiting visit, the URL named nothing. A reload opened the wrong notice or none. | Accepted. One effect keeps `source_notice` equal to the notice on screen in the detail and editor views (`replaceState`, no history entry; `view=issued` or `view=queue` with it). Leaving by a tab, the back buttons or a discarded draft clears it. Test: "names in the URL a notice opened from a waiting visit, and a draft only while it is open". Checked in the browser for a draft, including reload. |
| LAB-007 | medium | Mutation handlers bumped the request number but applied their results unconditionally. Close A, press browser Back while the request runs: the response reopened A. Withdraw, offline response, delivery and escalate were the same. | Accepted. `begin()` returns a check; every handler (issue, delivery, offline response, discard, close, withdraw, escalate) always updates the lists but changes the page only if the same notice is still open. `closeDetail` also clears the close, withdraw and confirm dialogs. Test: "keeps the list when a close finishes after the evaluator went back, and leaves no dialog behind". |
| LAB-008 | medium | `openNotice` never reconciled `record`. Choose visit A, then open draft B of another visit from the queue: Sections 1 and 4 still showed A, under a reason derived from B. An existing defect that the new "see Evidence below" line made misleading. | Accepted. `openNotice` drops a chosen visit that is not the notice's own, so the notice's frozen snapshot is shown. Test: "shows the visit and products of the draft that is open, not of the visit chosen before it". |
| LAB-009 | medium | Legacy notices can have null `source_snapshot` and `draft_payload` (nullable columns; `test_legacy_notice_without_frozen_rules_is_offline_only`). The form loader, the manager and the new detail page dereferenced them. | Accepted. `adminApi` gives every legal notice it returns an empty snapshot item list and an empty payload when the server sends null (one helper, ten call sites); nothing is rewritten on the server. The detail page states "This notice records no cited products." Tests: `adminApi.test.ts` "gives a legacy legal notice…", and "opens a notice that cites no products and says so". |

- Reviewer limitations: static only; no tests, builds or browser run; host-reported results not independently verified; legal sources not validated; owner acceptance of "Applicable law" (deviation V2) not in evidence.
- Mutation check: removing each of the five fixes (and the dialog reset) made its regression test fail; the file was restored after each.

## Scope extension (owner, 2026-10-07): Antigravity's UI edits

- The owner stated that the web edits already uncommitted before this build came from Antigravity (table and card restyling across the Admin portal) and asked for them to be included, checked and built. They are outside the approved plan. Files: `AdminPanels.tsx` (Audit Trail table), `CitizenTipReview.tsx` (table card wrapper), `LegalNoticeManager.tsx` (table card wrappers, primary row button), `admin.css` (about 480 changed lines: table cells, table cards, user management, field monitoring, consumer reports, APC and emergency tables, Legal Actions lists).
- Authorship of the final change set: Antigravity (those edits), Claude (this build and the fixes below). Neither is Codex, so the second inspection covers both.
- Host review of the Antigravity edits found and fixed:

| # | Defect | Evidence | Fix |
|---|---|---|---|
| AG-1 | Double border on every table card. The second `.admin-table-wrap` rule lost its `border: 0; border-radius: 0` reset, so the base rule's border showed inside the card's own. | Browser, Audit Trail: card `1px solid`, inner wrapper `1px solid` with `10px` radius. | Reset restored. After: wrapper border `0px` on Audit Trail, Field Monitoring, User Management, Consumer Reports and Price Regulation. |
| AG-2 | Field Monitoring visit page: the observed price shrank from 16px/800 to 14.08px/700. `.admin-data-table td strong` and `td small` were raised to `.admin-shell .admin-data-table …`, which outranks `.visit-items-table .visit-observed`. | Browser, visit #1: computed `14.08px`, `700`. | Both rules returned to their original selectors (new values kept). After: `16px`, `800`. |
| AG-3 | `{event.subject_id && <small>…}` would print `0` for a zero id. | Source. | `event.subject_id != null &&`. |
| AG-4 | Dead CSS: `.legal-queue td button.legal-danger-button` (and `:hover`) is fully overridden by the existing `!important` rule on `.legal-workspace .legal-danger-button`. | Cascade; browser computed background stays `#fff`. | Both rules removed. |
| AG-5 | Closing tags of the new wrapper in `CitizenTipReview.tsx` were mis-indented. | Source. | Re-indented; no behaviour change. |

- Kept as Antigravity wrote them: the wider cell padding, the unified header style, the hover row tint, `.admin-table-card` and `.user-table-card` styling, the Audit Trail badge and code styles, the 36px row buttons, hard-coded colours where tokens were used before (`#e2e8f0` for `var(--admin-border)`; the Admin portal has no alternate theme, so nothing breaks, but tokens would be more consistent), and the shortened Audit Trail label "Representative changed".
- Seen and not changed (not from this build or from Antigravity): on a Field Monitoring visit whose product already has a DTI decision, the Observation chip carries the decision text on one unwrapped line, so the prices table scrolls sideways at 1440px.
- Page sweep in the browser after the fixes (1440px, local backend): Audit Trail, Field Monitoring list and visit, User Management, Consumer Reports, Price Regulation, Emergency Protocol and Legal Actions render with single card borders, no sideways scroll except the case above, and no console errors other than the expected re-authentication 403.

### Proof after the fixes

- Web: `npx vitest run` 34 files, 258 tests passed; `npx tsc -b --noEmit` clean; `npx oxlint` clean; `npm run build` succeeded.
- Backend unchanged since its last run: 767 passed.
- Browser: a draft is named in the URL (`view=queue&source_notice=2`), a reload of that URL reopens it, and "Back to drafts" clears it.

## Inspection 2 (2026-10-07) — REVISE

- Fresh Codex session `01a1160c-502a-78e0-b015-f83f7d55e6ff`, Codex CLI 0.160.1, model not reported by the CLI. 266 s. Config guard: SHA256 `6c239d5b…5080` before and after restore, match.
- Isolated copy again, this time with `f20b816` alone as the base, so the diff held everything: this build, the inspection 1 fixes, and the Antigravity edits with their fixes (13 modified files, 4 new; 18 manifest entries with the plan and log). Snapshot `35402028…0e0d`.
- Summary: "The plan and all 18 manifest file hashes match. Static review found three unresolved navigation and evidence-display defects." LAB-005 to LAB-009 were not raised again. Nothing was raised against the backend or the Antigravity CSS and markup.

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| LAB-010 | medium | Open an LOI from the list, escalate it: the SCO editor replaces the pushed entry. Browser Back reaches the list URL, but `restore()` closed only the detail view, so the SCO editor stayed on screen under a list URL. | Accepted. `restore()` now also leaves a draft editor (`leaveDraft`): it closes to the list the URL names. With unsaved edits it puts the draft's entry back and asks "Discard unsaved changes?" first. Test: "closes the SCO editor on browser Back after an escalation, reopens it on Forward, and asks before dropping edits". |
| LAB-011 | medium | From `source_record=14`, opening a draft of visit 99 left `source_record=14` in the URL beside `source_notice`. On reload both load; if the visit response came second it replaced the draft's visit on screen. | Accepted. Naming a notice in the URL removes a `source_record` that is not that notice's visit, and the source-record response is ignored when a notice of another visit is open. Tests: "reloads with a visit and a draft of another visit in the URL and shows the draft", both response orders. |
| LAB-012 | medium | With a visit chosen and a draft of the same visit citing only some of its products, Evidence still listed every eligible visit product with the earlier ticks. | Accepted. Once a draft exists, Evidence lists its `source_snapshot.items`; the selectable visit list is shown only before a draft exists. Test: "lists as evidence only what a draft cites, even when its visit has more flagged products selected". |

- Reviewer limitations: no tests, builds, browser flows or screenshots; CSS reviewed by rule, not by visual acceptance of every Admin screen; legal interpretations and the owner's acceptance of the wording and layout deviations not verified.
- Mutation check: removing each of the three fixes (five mutations) made its regression test fail; the file was restored after each.

## Final state (2026-10-07)

- Proof run by the host after the last edit: web `npx vitest run` 34 files, 262 tests passed; `npx tsc -b --noEmit` clean; `npx oxlint` clean; `npm run build` succeeded. Backend files unchanged since `php artisan test` passed 767 tests.
- Budgets used: plan review 3 of 5 rounds; fix rounds 2 of 2; inspections 2 of 2.
- **Not independently inspected:** the fixes for LAB-010, LAB-011 and LAB-012 (in `LegalNoticeManager.tsx` and its test file) were made after inspection 2, and the inspection budget is spent. They are covered by the host's tests and mutation check only. A third inspection needs the owner's go-ahead.
- Open with the owner: deviation V2 ("Applicable law" instead of "Violated law"), the three wording questions for DTI in the plan, and whether to keep Antigravity's hard-coded colours.
- Not committed, pushed, deployed or migrated.
