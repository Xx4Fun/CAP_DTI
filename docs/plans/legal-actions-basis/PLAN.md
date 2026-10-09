# Legal Actions: evidence-derived reason and legal basis, notice detail page, layout cleanup

Status: revision 3. Codex round 1 (LAB-001 to LAB-003) and round 2 (LAB-004) each returned REVISE; all four findings are accepted and addressed here. Revision 3 is not yet reviewed. Nothing built.
Source read: `main` at `f20b816`, 2026-10-07.

## Context

Legal Actions (`web/src/components/admin/LegalNoticeManager.tsx`) prepares LOI/SCO notices from accepted monitoring visits. Four problems prompted this plan:

1. **Reason for issuance** is a free dropdown, although the backend already derives it from the cited products at draft time (`REASON_FOR_REFERENCE`, `backend/app/Http/Controllers/Admin/LegalNoticeController.php:38,116`) and refuses any other value at issue (`:210-211`). A wrong pick only fails at the last step.
2. **Approved legal bases** always start empty and are never derived. Four flat checkboxes give no hint which one the evidence supports.
3. Opening a row in **Issued & Responses** renders the notice under the table (`LegalNoticeManager.tsx:536-566`), so the admin has to scroll past the list to read it.
4. The five Legal Actions screens grew piecemeal and are not laid out consistently.

Intended outcome: the system states what the evidence shows and pre-fills reason and legal basis from it; the evaluator still reviews and issues. An issued notice opens as its own page. All Legal Actions screens share one layout pattern.

## Owner decisions (2026-10-07)

| # | Decision |
|---|---|
| E1 | Keep the four approved legal-basis strings unchanged. Show them **grouped**: Violated law / Penalty and procedure / Other law. |
| E2 | **Reason is locked** to what the evidence supports. **Legal bases are pre-ticked but editable**, with "Reset to suggested". |
| E3 | The notice detail page follows the Field Monitoring visit page (`ref.png`): back button, title and status on top, main column plus right rail of info cards. |

## Are the four legal bases correct?

Checked against DTI sources (links in Assumptions). All four are real instruments, but they are not the same kind of thing:

| Basis | What it is | Supported by what the system detects? |
|---|---|---|
| RA 7581 (Price Act) | The law on SRPs, profiteering (Sec. 5) and price ceilings / price freeze (Sec. 6-7). | **Yes**, for both "above SRP" and "above price ceiling". |
| RA 7394 (Consumer Act) | Price tags, deceptive and unfair sales acts. | **No.** The system records price comparisons only. |
| DAO No. 6, s. 2007 | Revised schedule of administrative fines for Consumer Act and Price Act violations. | Penalty schedule, not a violated provision. |
| DO No. 18-122 | Procedural guidelines on monitoring and enforcement. | Procedure, not a violated provision. |

So the list stays (E1), the engine pre-ticks only RA 7581, and the other three are labelled for what they are. Wording changes to the approved strings (for example "as amended by RA 10623", or section-level citations) are **not** made here; they are listed under Open questions for DTI.

## Approach

### A. Derivation ("engine"), backend

The system detects exactly two finding kinds, both already stored per item as `reference_type` (`standard_srp`, `emergency_ceiling`), and a notice may cite only one kind (`LegalNoticeController.php:85-86`). The engine is therefore a config map plus one service method, not a rules framework.

- `backend/config/legal_policy.php`: add
  - `findings`: `standard_srp => {reason: 'Prices above SRP', legal_bases: ['RA 7581 (Price Act)']}`, `emergency_ceiling => {reason: 'Prices above price ceiling', legal_bases: ['RA 7581 (Price Act)']}`.
  - `basis_groups`: each of the four strings mapped to `violated_law`, `penalty_procedure` or `other_law`.
  - `policy_version` is unchanged: no approved value changes.
- `LegalPolicyService::derive(array $referenceTypes): ?array` returns the `findings` entry when the items record exactly one known kind, else `null`.
- `LegalNoticeController`:
  - Delete `REASON_FOR_REFERENCE`; `createDraft` (`:116`) and `issue` (`:210`) call `derive()`. Config becomes the single owner.
  - `createDraft` pre-fills `draft_payload.legal_bases` from `derive()` instead of `[]`.
  - `escalate` (`:522`) pre-fills the SCO draft's `legal_bases` the same way instead of `[]`.
  - `update` refuses a non-null `reason` that differs from the derived one (422, same message as issue). Legal bases keep today's validation: any distinct subset of the approved list.
  - `detail()` adds `policy.derived` (`{reason, legal_bases}` or `null`) and `policy.basis_groups`.
- Unchanged: `issue()` checks, the SCO "at least one basis" rule, the LOI "bases optional" rule, both Blade templates, deadlines, snapshots.

### B. Section 2 "Notice Type & Basis", web

In `LegalNoticeManager.tsx` (`:579-587`) and `web/src/types/admin.ts:624`:

- **What the evidence shows**: a compact table of the cited products from the snapshot (or the selected visit items before a draft exists): product, observed price, reference and its label, amount and percent over, and a chip "Above SRP" or "Above price ceiling". Every value is already in the payload (`variance_percent`, `reference_type`, `reference_label`).
- **Reason for issuance**: read-only value with a "Determined from evidence" tag and one line of explanation ("All 3 cited products were compared against the SRP"). When `policy.derived` is absent (legacy draft, or an older backend), the current dropdown is shown instead.
- **Legal bases**: three labelled groups from `policy.basis_groups`.
  - Violated law: pre-ticked, tagged "Suggested from evidence".
  - Penalty and procedure: unticked.
  - Other law: unticked, hint "Select only if the evidence supports it. The system does not record price-tag or deceptive-sale findings."
  - "Reset to suggested" appears when the ticks differ from `policy.derived.legal_bases`.
  - LOI hint: "Kept on the record. The LOI form does not print legal bases." SCO hint: "Printed on the order."
- The live readiness check (`:284`) is unchanged.
- **Existing drafts with a different saved reason (LAB-001).** Today's `update` accepts either approved reason, so a saved draft can hold a reason the evidence does not support, or none. When a draft's detail arrives with `policy.derived`:
  - the form's `reason` is set to `policy.derived.reason`, while the saved-form snapshot (`savedForm`) keeps the reason actually stored. The draft is therefore dirty when the two differ, the read-only field shows the derived reason, and a line reads "Corrected from the saved reason; save to record it."
  - the correction is stored by the ordinary audited save (`legal.draft_saved`), including the automatic save before preview and issue (`saveIfDirty`). Nothing is rewritten on load.
  - `formFrom` stays the raw payload reader; the derived reason is applied in `openNotice` and in `openDraft`'s detail swap, after the "keep anything typed while loading" comparison, so typed edits are still kept.
  - Saved `legal_bases` are never changed on load. Issued, closed and cancelled notices are displayed exactly as stored.

### C. Notice detail page, web

- New file `web/src/components/admin/LegalNoticeDetail.tsx` takes the JSX now at `LegalNoticeManager.tsx:538-565` together with its local form state (`deliveryState`, `deliveredAt`, `offline`). The manager keeps the API handlers and passes them in.
- View gains `'detail'`. `openNotice` routes a non-draft notice to `'detail'`; the list is not rendered while it is open. The "Issued & Responses" tab stays marked current and returns to the list.
- **List scope while the detail is open (LAB-002).** `listKind` (`:167`) is `'issued'` for both `'issued'` and `'detail'`, so opening a notice does not flip the list to the draft queue and does not trigger the page reset at `:169`. The list-fetch effect (`:170-187`) returns early for `'detail'` as it does for `'prepare'` and `'review'`. `view` is already one of its dependencies, so returning to the list refetches the same page once and picks up anything changed from the detail page (close, cancel, escalate).
- Layout reuses the visit page classes from `FieldMonitoringRecords.tsx:1925-2060` (`visit-review-topbar`, `visit-review-back`, `visit-review-layout`, `visit-review-main`, `visit-review-aside`, `visit-info-card`, `visit-info-grid`).
- **Layout contract (LAB-003).** Those classes take their column width from `--visit-aside-width`, which is defined only on `.field-monitor-review-page` (`admin.css:1638` and its narrower-desktop override), and the visit page's inner scrolling depends on being a direct child of `.admin-panel` (`:1625`). Legal Actions sits under `.legal-workspace` with the tabs above it, so:
  - the detail page and the Prepare top bar are wrapped in a new `.legal-page` element that sets `--visit-aside-width` to the same values as the visit page, including the same override breakpoint;
  - `.legal-page` scrolls with the panel instead of scrolling its main column: `.legal-page .visit-review-main { overflow: visible }`, and `.legal-page .visit-review-aside` is `position: sticky` under the tabs with `overflow: visible`;
  - the existing `max-width: 1100px` rule (`:1710-1717`) already collapses `visit-review-topbar` and `visit-review-layout` to one column for any wrapper.
- Page content:
  - Top bar: "Back to Issued & Responses", control number, type and status chip, "Open document".
  - Main: outcome banner, issue result, **cited products table** (the same component as B; today the issued view does not show the products at all), vendor response, legacy delivery / offline-response forms, action bar (Escalate, Send reminder, Close, Cancel).
  - Right rail cards: Notice (reason, legal bases, issued date, prepared by), Delivery and deadline, Recipient, Signatory, Source visit link.
- History, following `CitizenTipReview.tsx:171-184`:
  - Opening from the list pushes `?module=legal_actions&view=issued&source_notice=<id>` (the param already reopens a notice on load, `:95,159-163`).
  - A `popstate` listener in the manager reopens or closes the detail from the URL, so browser Back returns to the list.
  - The back button calls `history.back()` when this page pushed the entry; otherwise it shows the list and drops `source_notice` with `replaceState`.
  - List page, status filter, search and scroll position are kept (state stays in the manager; scroll restored as in `CitizenTipReview`).
- Entry from Store Communications, Field Monitoring and GIS (`source_notice`) lands directly on the detail page.
- **One owner for detail loads (LAB-004).** Today there are two fetch paths with different guards, and the new view breaks both:
  - `reviewIssued` (`:501-507`) takes a `detailRequest` number and then calls `openNotice`; the `[view]` effect (`:141`) bumps the number on every view change. Once `openNotice` enters `'detail'`, that bump would discard the very response that opened the page.
  - `sourceNoticeId` is re-read from `window.location` on every render (`:92-95`), so pushing `source_notice` would re-run the URL effect (`:159-163`), which fetches and calls `openNotice` with no guard. A late response could reopen a notice after Back closed it, or replace a notice selected afterwards.

  The change:
  - `source_notice` is read **once**, at mount. Pushing or replacing the URL never starts a load.
  - A single `loadNotice(id)` does every detail fetch (list row, mount with `source_notice`, `popstate`): it takes `const request = ++detailRequest.current`, fetches, and applies the result only if `request === detailRequest.current`. `reviewIssued(row)` shows the list row at once and then calls it. The unguarded effect at `:159-163` is removed.
  - The number is bumped **synchronously** wherever the selection changes or closes: opening another notice (inside `loadNotice`), the page's back button, the `popstate` handler before it reopens or closes, `goTo`, and every mutation handler that already bumps it (close, cancel, withdraw, escalate, record delivery, record response).
  - The `[view]` effect stays only as a backstop for the remaining direct `setView` calls and no longer bumps when the new view is `'detail'`, so entering the detail page cannot invalidate the request that opened it.
  - Drafts opened through `source_notice` keep `openDraft`'s existing `openedId` guard.

### D. Layout cleanup across Legal Actions, web

One pattern for every screen, using existing admin tokens and classes only (no new colours or fonts):

- **Lists** (Needs Review, Action Queue, Issued & Responses): heading and description, one controls row (search, filter, pager), table. Status shown as chips (existing `monitor-observation` chip styles) instead of plain text; "Overdue" and "Waiting on …" get the warning variant. Primary row action uses the primary button style, secondary actions the secondary style.
- **Prepare Notice**: same top bar as the detail page ("Back to …", title, draft status); Section 2 as in B; consistent two-column input grid; Issuance Panel stays the right rail and is sticky.
- **Detail**: as in C.
- CSS in `web/src/components/admin/admin.css`: remove rules that only served the inline detail, add the few needed for the evidence table and basis groups. Below 1100px the right rail drops under the main column, as the visit page already does.

"Clean and organised" is judged by the owner from screenshots (see Verification); the plan does not claim an objective measure.

### E. Docs

- `docs/DECISIONS.md`: new 2026-10-07 entry for E1-E3, the derivation rule, and the legal-basis findings with sources.
- This plan is copied to `docs/plans/legal-actions-basis/PLAN.md` with `PLAN-REVIEW-LOG.md` beside it (repo convention).

## Files

- `backend/config/legal_policy.php`, `backend/app/Services/Admin/LegalPolicyService.php`, `backend/app/Http/Controllers/Admin/LegalNoticeController.php`
- `backend/tests/Feature/LegalNoticeLifecycleTest.php` (and `LegalActionsWorkflowTest`, `AdminDraftImmutabilityTest`, `RegulatoryDecisionsTest` where they assert an empty `legal_bases` on a new draft)
- `web/src/components/admin/LegalNoticeManager.tsx`, new `LegalNoticeDetail.tsx`, `admin.css`, `web/src/types/admin.ts`
- `web/src/components/admin/LegalNoticeResponseReview.test.tsx`, `LegalNoticeAndEmergency.test.tsx`, `AdminSafeguards.test.tsx`
- `docs/DECISIONS.md`, `docs/plans/legal-actions-basis/`

## Non-goals

- New finding kinds (price tags, month-over-month increase, weights). The engine derives only from what is stored today.
- Changing the approved reason or legal-basis strings, the flag tolerance, deadlines, or either printed form.
- Automatic notice-type selection or automatic issuing. `LegalPolicyService::noticeType()` stays disabled; a person reviews and issues every notice.
- `vendor-pwa/`, `field-officer-pwa/`, `customer-pwa/`.
- Commit, push, deploy or migration. There is no schema change.

## Assumptions and risks

- **A1.** `reference_type` has only the two values (`FieldMonitoringController.php:558`, `FieldReferenceResolver.php:50-69`).
- **A2.** The LOI template prints no legal bases (`official-loi.blade.php`); the SCO prints them in "constitutes a violation under the following legal basis/bases" (`official-sco.blade.php:5,42`). Pre-ticking RA 7581 therefore changes what a new SCO prints by default only if the evaluator leaves it ticked, which is the intent.
- **A3.** Legal sources: [DAO No. 06, s. 2007](https://dti.gov.ph/sdm_downloads/department-administrative-order-no-06-s-2007) (revised schedule of administrative fines), [DO 18-122](https://dti.gov.ph/regions/region-8/region-8-news/fair-trade-laws-monitoring-and-enforcement-to-be-strengthened-in-region-8) (procedural guidelines on monitoring and enforcement), [RA 7581](https://ldr.senate.gov.ph/sites/default/files/2022-12/RA%207581.pdf), [DTI on Sec. 5 profiteering](https://dti.gov.ph/archives/news-archives/dti-alerts-establishments-srps-bottled-water). This is desk research, not legal advice.
- **R1.** Local web dev talks to the production API, which will not return `policy.derived` until the backend ships. The web falls back to today's dropdown and flat checkboxes when the field is missing, so web can be verified against either backend. Backend ships first.
- **R2.** Existing drafts keep their saved `legal_bases` (possibly empty); nothing is back-filled. "Reset to suggested" covers them.
- **R3.** Web tests that find the detail under the table, or that select a reason from the dropdown, must be rewritten rather than patched around.

## Open questions for DTI (do not block the build)

1. Should the SCO sentence "constitutes a violation under…" cite only the violated law, or also DAO 6 s. 2007 and DO 18-122?
2. Should RA 7581 be printed "as amended by RA 10623", or with section numbers (Sec. 5 for SRP, Sec. 6-7 for ceilings)?
3. Is RA 7394 ever cited for a price-monitoring visit?

## Claudex roles and process

- Host and planner: Claude Code (this session, Opus 5.5). Plan reviewer: Codex CLI (its configured default model; reported as observed). Builder: Claude. Final inspector: fresh Codex session. Up to 5 review rounds, 2 fix rounds, inspection on.
- After this plan is approved here:
  1. Copy it to `docs/plans/legal-actions-basis/PLAN.md` and start `PLAN-REVIEW-LOG.md`.
  2. Apply the AGENTS.md Codex guard: back up `~/.codex/config.toml` outside the repo, record its SHA256, confirm every `[mcp_servers.*]` table and the listed write plugins are `enabled = false`, and restore byte-for-byte afterwards.
  3. `py -3.13 ~/.claude/skills/claudex-loop/scripts/runner.py review --host claude --repo C:\CAP101_DTI_SYS --plan docs/plans/legal-actions-basis/PLAN.md`; arbitrate findings, revise, resume until APPROVED or the round limit.
  4. Present the reviewed plan. Building starts only on the owner's go-ahead; backend first, then web.

## Verification

Backend (`cd backend`):

```
php artisan test --filter="Legal|RegulatoryDecisions|AdminDraftImmutability"
```

New or changed tests must prove:
- an SRP draft and a price-ceiling draft are each created with the matching reason and `legal_bases = ['RA 7581 (Price Act)']`;
- an escalated SCO draft is pre-filled the same way;
- saving a reason other than the derived one returns 422; saving any distinct subset of the four bases still succeeds;
- an SCO with all bases unticked is still refused at issue, and an LOI with none still issues;
- `detail()` returns `policy.derived` and `policy.basis_groups`.

Web (`cd web`): `npx vitest run` and `npm run build`. Tests must prove:
- the reason is read-only when `policy.derived` is present, and the dropdown appears when it is absent;
- bases render in three groups with RA 7581 ticked; unticking shows "Reset to suggested", which restores it;
- opening an issued notice replaces the list with the detail page; Back returns to the list with its status filter and page intact; a `popstate` to a URL without `source_notice` closes the detail;
- loading `?module=legal_actions&source_notice=41` opens the detail page directly;
- a draft saved with a reason that differs from `policy.derived.reason`, and one saved with no reason, each open showing the derived reason, are dirty, and save the derived reason; a draft whose saved reason already matches is not dirty (LAB-001);
- opening a notice from page 2 of the issued list requests no draft-queue page while the detail is open, and returning by the page's back button and by browser Back each shows page 2 again (LAB-002);
- with the detail request held pending (LAB-004): opening from the list applies the detail when it resolves; going Back before it resolves leaves the list showing after it resolves; opening notice A, then B, then resolving A after B shows B; and pushing `source_notice` causes no second `getLegalNotice` call for the same open.

Browser (preview dev server, 1440px and 1024px wide), with screenshots of all five screens shown to the owner:
1. Needs Review → Start notice → Section 2 shows the evidence table, locked reason and grouped bases.
2. Action Queue → Continue draft → same.
3. Issued & Responses → Open → detail page with the right rail beside the main column at 1440px and below it at 1024px (LAB-003: computed `grid-template-columns` of `.visit-review-layout` checked, not only the screenshot); browser Back returns to the list.
4. Close, remind and escalate still work from the detail page.
