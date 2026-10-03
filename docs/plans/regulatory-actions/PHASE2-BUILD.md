# Phase 1 fixes and Phase 2 build: inspection scope

- **Spec.** `PLAN.md` revision 7, section "Phase 2", plus the six findings from the Phase 1 inspection (R1–R6 in `PLAN-REVIEW-LOG.md`). The Phase 1 deliverables in `PHASE1-BUILD.md` are part of the same diff.
- **Authorization.** Built by explicit owner override: revision 7 never received a Codex APPROVED verdict.
- **Base commit.** `6a7609ef776e9d412ead35943a4eb9bf49d69989`. Builder: Claude (host). Inspect the whole diff against base.

## Phase 1 inspection fixes

| Finding | Fix |
|---|---|
| R1 | `LegalNoticeController::index` accepts `exclude_drafts`; the "All issued notices" view uses it. |
| R2 | A reload key is bumped after every mutation and the page is clamped to `last_page`. |
| R3 | The review card shows the selected period's state first; confirmed findings are a separate line. |
| R4 | Settings has a read-only "Price review threshold" note. |
| R5 | The visit item shows the type and the captured label. |
| R6 | List errors from stale requests are ignored, and the error clears when a current request succeeds. |

## Phase 2 changes

**Backend**
- **Migration** `2026_10_03_000002`: `legal_notices.outcome` and `outcome_reason`.
- **`Admin/LegalNoticeController`**
  - `createDraft` locks store, then visit.
  - Its 409 now returns `existing_notice_id`.
  - It returns `ITEM_ALREADY_DECIDED`, enforces the direct-SCO rule, and adds the extra snapshot fields and `prior_triage`.
  - The addressee comes from `owner_name`, with `registered_owner_name` recorded alongside.
- **`issue()`**
  - Portal only, with an active vendor; the vendor's own email is printed.
  - `FORM_LIMITS` is checked on the final payload; an over-long vendor email returns `RECIPIENT_EMAIL_TOO_LONG`.
  - Refuses if the owner changed, and re-checks the direct-SCO rule.
  - The email branch is removed.
- **Other notice endpoints**
  - `delivery()` returns `PORTAL_RECEIPT_ONLY` for portal notices.
  - `update` accepts only `portal` and adds `confirm_recipient`.
  - `close` takes an outcome plus `item_decisions`, writes findings (with the legacy-snapshot fallback), and recalculates recidivism; lock order is store, then notice.
  - `cancel` needs a reason once the notice has been issued.
  - `escalate` copies the LOI snapshot.
  - New: `reminder`.
- **`MonitoringRecordController`**
  - `review=pending` filter.
  - `attachReviewState`, adding `undecided_item_ids` and `open_notice`.
  - `show` returns notices and per-item findings; `findings` returns decision and notice per row.
  - New: `noAction`.
- **Models.** `MonitoringRecordItem::finding`, `scopeEligible`, `scopeUndecidedEligible`, `FINDING_SOURCE`; `MonitoringRecord::legalNotices`, `scopeHasUndecidedItems`; `RegulatoryFinding::decider`; `LegalNotice` gains the outcome fields.
- **`ReportReviewService`**
  - `lockForDecision` locks store, then report, and re-checks inside.
  - `confirmedCaseCount` groups one visit as one case.
  - `ReportReviewController` request/cancel/reopen of verification lock the store first.
- **`TemporalAnalyticsService`**: field findings are de-duplicated into their inspection row as `confirmed`; `recidivism_count` uses the grouped count.
- **Vendor payloads**: outcome, the per-item decision once closed, and `preceding_control_number`. The conversation payload carries the outcome.

**Web**
- `LegalNoticeManager`:
  - Needs review tab, now the default; `?view=` opens a list directly;
  - no-action dialog, close dialog with per-item decisions, withdraw dialog, reminder;
  - SCO gate; portal-only delivery; registered-owner addressee and recipient confirmation; prior triage;
  - the notice named in a 409 is opened directly.
- `FieldMonitoringRecords`: read-only `RegulatoryState` chips, decision text, and Prepare Notice hidden for decided products.
- Dashboard counts link to the matching list (`?view=`).
- `admin.css` grid fix: four tabs had overflowed the panel.

**Vendor PWA**: outcome wording in the status label, the detail modal, history and messages; per-product decision column; "Follows LOI"; "Response period ended"; "Not yet opened"; and a cancelled reason for a blocked response.

**Docs**: `docs/DECISIONS.md` entry for 2026-10-03.

## Deviations from the plan text

1. *(Resolved after inspection 1, R-04.)* An item cited by an open notice is no longer "undecided". The cited ids are read from the open notices' snapshots in PHP (`MonitoringRecordItem::citedByOpenNotices`, which works on SQLite and Postgres) and excluded with `whereNotIn`. A visit whose remaining products sit beside an open notice is still shown as "Waiting on …".
2. **Cancel reason.** It is required only for a notice that has been issued. Discarding a never-issued draft needs no reason, because nothing reached the vendor.
3. **Concurrency test.** Not written. The test DB is in-memory SQLite on one connection, which cannot interleave two transactions. Lock order is enforced in code: store, then visit or report, then notice.
4. **Email at issue.** The email branch is removed, because delivery is portal-only. `App\Mail\LegalNoticeAvailableMail` is now unused but left in place.
5. **Reminder throttling.** None; every send is audited.

## Out of scope: pre-existing untracked files

`.claude/`, `image.png`, `ref.png`, `mobile/`, `scratch/`, `web/fm-preview.html`, `web/src/fm-preview.tsx`.

## Proof run by the host

- Backend: `php artisan test` with in-memory SQLite, 735 of 735 passed. This includes 15 new tests in `RegulatoryDecisionsTest`.
- Web: `tsc -b` clean; vitest 219 of 219 passed; `vite build` OK.
  - One unrelated APC test timed out once under full-suite load and passed on reruns.
- Vendor PWA: `tsc -b` clean; vitest 30 of 30 passed; `vite build` OK.
- Browser check on a scratch SQLite stack:
  - Needs review lists the visits; a visit with an open notice shows "Waiting on…".
  - No action gives 200 and the visit leaves the queue.
  - Close with "Explanation accepted" gives 200 and shows the outcome.
  - Field Monitoring shows "Not confirmed by DTI" and the notice chip, and hides "Open Legal Actions".
  - `exclude_drafts=1` is used.
  - No console errors.

## Fixes after inspection 1 (R-01 to R-11)

- **R-01.** A notice with no mappable products cannot close with a confirmed outcome.
- **R-02.** The snapshot `srp_id` must match the visit item, and the finding uses the item's `srp_id`.
- **R-03.** The findings chip shows the newest notice that cites that product.
- **R-04.** Products cited by an open notice are excluded from "undecided".
- **R-05.** A verification request re-checks the locked report's status.
- **R-06.** Stale Needs review requests are ignored.
- **R-07.** Choosing the blank outcome resets the close dialog.
- **R-08.** Dashboard counts open their own status (`?status=`).
- **R-09.** Findings return and show who decided and when.
- **R-10.** Warning for an addressee that is too long for the printed form.
- **R-11.** Portal wording for the vendor's blocked-response message.

Proof after these fixes: backend 740 of 740 (5 new), web 221 of 221 (2 new), vendor PWA 30 of 30; both builds OK.
