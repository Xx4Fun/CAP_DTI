# Regulatory Actions: Field Monitoring → LOI/SCO → Establishment Response

Status: revision 7. Codex reviewed 6 rounds (the 6th was owner-extended); its only round-6 finding (R6-01, wording) is addressed here, but revision 7 has not been independently reviewed. Nothing has been built yet.
Source audit: HEAD `6a7609e` on 2026-10-03, read from source.

## 1. Goal

Complete the existing Field Monitoring → Legal Actions → Vendor Portal flow so that every regulatory decision is recorded, visible and attributable to a DTI user. The system gathers facts and prepares documents. It never decides that something is a violation, and it never issues a notice on its own.

The work is delivered in **two phases, built and inspected separately**:
- **Phase 1** changes only `web/` and uses only existing API behaviour.
- **Phase 2** changes `backend/`, `web/` and `vendor-pwa/`.

`field-officer-pwa/` and `customer-pwa/` are untouched.

**Non-goals**
- A new Regulatory Review module. *Legal Actions* (`web/src/components/admin/LegalNoticeManager.tsx`) is that workspace.
- Turning Field Monitoring into an enforcement module.
- Changing the flag rule. SRP is flagged above ×1.10 and the ceiling above ×1.00.
- Changing the deadline anchor.
- SMS or email delivery.
- An approval or second-signer step.
- Notices that span multiple visits.

## 2. What already exists and stays

- **Visit evidence.**
  - Each visit item pins its reference: `reference_status/type/label/value/source/effective_date/source_id/version`.
  - The server validates any device snapshot against its own resolution (`backend/app/Http/Controllers/Field/FieldMonitoringController.php:493-524`).
  - `is_anomaly` is stored once at sync (`:281-285`).
  - No app code updates or deletes `monitoring_record_items`.
- **Legal notices** (`backend/app/Http/Controllers/Admin/LegalNoticeController.php`).
  - Drafts come only from accepted visits, from flagged items with an available reference, and from one reference type. One open notice is allowed per visit.
  - `source_snapshot` is frozen at draft time, and the PDF is rendered from it once at issue, with its SHA-256 stored.
  - `signatory_snapshot`, `deadline_rules`, `policy_version` and `vendor_user_id` are frozen at issue.
  - Issue requires re-authentication and confirmation. The reason must match the evidence, and the recipient is re-checked if the vendor link changed.
  - Other actions: escalate an LOI to an SCO, record an offline response, close or cancel. Every write is audited fail-closed.
- **Deadline.** LOI 3 working days and SCO 48 hours, anchored at `received`. For portal delivery, receipt is the vendor's first authenticated PDF open (DECISIONS 2026-09-28). This matches the printed form ("within three (3) working days from upon receipt of this letter"), and **stays unchanged**.
- **Vendor PWA.** Notices with a countdown, a sworn response with up to 5 attachments, response history and a messages timeline. It uses non-legal wording.
- **Store Communications.** One informal thread per store. It never issues documents and never starts deadlines.
- **`regulatory_findings`.** Columns `decision`, `reason`, `decided_by`, `decided_at`, the reference snapshot columns, and `unique(source_type, source_id)`. Today only consumer reports write to it.

## 3. Owner decisions (2026-10-03)

| # | Decision |
|---|---|
| D1 | A direct SCO without a preceding LOI is allowed **only during an emergency price freeze**. Otherwise an SCO comes only through LOI escalation. |
| D2 | The LOI gives 3 working days and the SCO 48 hours. The clock starts at **receipt, meaning the vendor's first portal open**, as printed on the form. This was reconfirmed after the review raised the conflict, and replaces an earlier "starts at sending" answer. |
| D3 | Signatory: keep the current per-type name and optional e-signature in Settings. |
| D4 | The addressee is the name on the registered establishment (`stores.owner_name`). |
| D5 | Closure records an outcome. "Explanation accepted" closes the case and does **not** count toward recidivism. |
| D6 | When a vendor has not answered, DTI follows up with a reminder. Escalation or closure remains a human choice. |
| D7 | One notice covers one visit. |
| D8 | The DTI Admin (any manager) records no-action triage, and must give a reason. |
| D9 | **Delivery is through the portal only** for new notices. |
| D10 | Tolerance is unchanged. |
| D11 | The work is phased: web-only first, then backend + admin + vendor. |

---

## Phase 1: DTI Admin web only (no backend or vendor change)

### 1.1 Legal Actions queue completeness
- The Queue view loads `GET /admin/legal-notices?status=draft&page=n` and adds a pager. The Issued & Responses view gets a status sub-filter: All non-draft, Issued, Response received, Closed, Cancelled.
  - "All non-draft" issues one paginated request per non-draft status. The existing `status` param takes one value.
  - A search box uses the existing `search` param.
  - Page size stays 20, the server default.
- **409 fallback** (`LegalNoticeManager.tsx:160`): instead of scanning page 1, it requests `getLegalNotices({ store_id: record.store.id })` (`MonitoringRecordRecord` has `store.id`, not `store_id`) and pages until it finds the open notice for `monitoring_record_id`. The `store_id` filter already exists. Phase 2 replaces this with the server returning `existing_notice_id`.
- The `source_store` URL param, sent by Field Monitoring "Prepare Notice", pre-filters the queue by `store_id`.

### 1.2 Navigation back to Field Monitoring
- `LegalDraftPanel` (`web/src/components/admin/AdminPanels.tsx:365`) passes `onNavigate` into `LegalNoticeManager`.
- "Monitoring record #id" in Case Reference becomes a link to `field_monitoring` with `record=id`. `FieldMonitoringRecords` already opens `VisitReview` from that param.

### 1.3 Visit detail completeness
`VisitReview` (`FieldMonitoringRecords.tsx:1914-1958`) also shows each item's `reference_label`, `reference_type`, `reference_source` and `previous_price`. `GET /admin/monitoring-records/{id}` already returns the full item model.

### 1.4 Wording: facts stay, legal conclusions go
Changes in `FieldMonitoringRecords.tsx`:
- `:1209` "Status Under Price Act" becomes "Comparison with reference".
- `:1211` "Within Permissible Reference" becomes "Within reference".
- `:1276-1282`: the Regulatory Status card is keyed to what was actually counted. `periodObservations` counts only visits with `is_anomaly` items (`MonitoringRecordController.php:331-337`).
  - With no visits in the period: "Not monitored this period".
  - With visits but no flagged items: heading "No flagged observations", subtitle "{n} visit(s) recorded · see Price History for each comparison".
    - It makes **no threshold or "within reference" claim**. An item with an unavailable reference is never flagged (`FieldMonitoringController.php:283-285`), and the profile API reports unavailable references only for the latest visit (`MonitoringRecordController.php:344`), not for the whole period.
    - When `latest_record.unavailable_reference_count > 0`, an extra line reads "Reference unavailable for {k} item(s) on the latest visit".
    - A period-level unavailable count is deferred to Phase 2: add `period_unavailable_reference_count` next to `period_records_with_observations_count` at `:337`. The subtitle may then say "compared against available references" only when that count is 0.
  - With flagged visits: the existing "Observations Noted" wording stays.
- `:914` "Compliance status" becomes "Monitoring status".
- `:1279` "Repeat (n) · 0% tolerance on escalation" becomes "{n} confirmed finding(s)", without the tolerance claim.
- The "Findings & Anomalies" tab and "Findings Recorded" become "Observations". The word "finding" is reserved for DTI decisions, as in GIS "Confirmed Finding".
- "Above SRP · within 10%" becomes "Above reference · within tolerance". It reads `reference_type`; ceiling references never reach this state.

### 1.5 Stale copy
- The dashboard "Active Legal Actions" card (`AdminPanels.tsx:311-313`) shows live counts from `GET /admin/legal-notices?status=…` (Drafts, Issued, Response received), each linking to Legal Actions.
- Help modal (`AdminShell.tsx:465,471-472`): replace "LOI/SCO dispatch are unavailable" with current, accurate guidance, and fix the module names.

### 1.6 Settings and cleanup
- `anomaly_threshold_percent` in Settings is shown read-only with the note "Fixed by policy: SRP +10%, price ceiling 0%." It is not used by the flag rule.
- Delete `web/src/components/admin/TemporalVolatility.tsx` with its own test. **Also remove its `?raw` import and its array entry from `web/src/components/admin/AdminTypographyIntegrity.test.ts:2`.**
- Delete `web/src/components/Dashboard.tsx`, which nothing imports.
- Delete the unused `.non-compliant` CSS rules (`admin.css:1079,1396`) after grepping to confirm nothing uses them.
- GIS `StoreDetailOverlay` "Legal Audit" rows link to Legal Actions (`source_notice`).

**Phase 1 verification**
- `cd web && npx vitest run && npx tsc -b --noEmit` (or the repo's build script) passes.
- Updated tests for: queue pagination and the status filter, the 409 fallback using `store_id`, the back-link, the new labels, and the TypographyIntegrity import removal.
- Browser check: Legal Actions shows more than 20 notices across pages; the visit link round-trips; the dashboard counts match the API.

---

## Phase 2: backend + DTI Admin + Vendor PWA

### 2.1 Closure outcome and findings (D5)

**Schema and actions**
- **Migration.** Add `legal_notices.outcome` (string, nullable) and `outcome_reason` (text, nullable).
- **Close** requires:
  - an overall `outcome` and an `outcome_reason` of 10 to 2000 characters;
  - **`item_decisions`**: one entry `{item_id, decision: confirmed|not_confirmed}` for every snapshot item. No item may be missing or extra, and each item id must appear once.
- The per-item decision is the source of truth for findings, because one notice can cite several commodities. The overall `outcome` must agree with the per-item decisions:

  | Outcome | Required item decisions |
  |---|---|
  | `explanation_accepted` | all `not_confirmed` |
  | `no_violation` | all `not_confirmed` |
  | `violation_confirmed` | all `confirmed` |
  | `partially_confirmed` | at least one of each |

  Any mismatch returns 422.
- The admin UI pre-fills every item's decision from the chosen outcome, and the evaluator can change an item's decision. Changing an item switches the outcome to `partially_confirmed`.
- **Cancel** requires `outcome_reason` and writes no finding.
- **Escalate** sets `outcome='escalated_to_sco'` on the LOI and writes no finding.

**Finding rows.** On close, in the same transaction, one `regulatory_findings` row per snapshot item is upserted, with `decision` taken from that item's `item_decisions` entry:
- `source_type='monitoring_record_item'` and `source_id = item id`;
- `decided_by` = the user closing it.

Field values:
- **New snapshots** (2.3) supply `srp_id`, `observed_price`, `monitoring_date`, and the full reference including `reference_source_id` and `reference_version`.
- **Legacy snapshots** (drafted before 2.3, missing those keys): the missing fields are read from the matching `monitoring_record_items` row, by the snapshot item `id` and the same `monitoring_record_id`. This is safe because visit items are immutable.
  - The values the snapshot does contain (observed price, reference value and type) must equal that row.
  - Otherwise close is refused with 409 `SNAPSHOT_REVIEW_REQUIRED`, and nothing is written.
- `srp_bulletin_id` is always set (`= item.srp_id`), so commodity-filtered analytics include the finding.

**Recidivism**
- `ReportReviewService::recalculateRecidivism` gains a `monitoring_record_item` branch that groups to `monitoring-record:{visit id}`, so one visit counts once.
- `TemporalAnalyticsService.php:93` (`recidivism_count`) uses the same grouping instead of a raw row count. The grouping helper is extracted once and shared, not duplicated.
- `recalculateRecidivism` runs after the upsert.
- **Per-store serialization.**
  - Every path that writes `regulatory_findings` and recalculates recidivism first takes `Store::lockForUpdate()` on the affected store inside its transaction, and holds it through the recalculation. That covers legal close, no-action, and consumer-report decisions.
  - **Legal close** locks the store, then the notice. This is the same order as `issue()` and `escalate()`; `terminal()` today locks only the notice.
  - **Every visit-locking path** locks the store first, then the visit, then the notice. That includes `createDraft` for direct create; today it locks the visit first. The escalate path already holds the store, so `createDraft` re-locking the same store row is a no-op within the transaction. With the same order everywhere, a draft and a no-action request cannot deadlock on PostgreSQL through the `legal_notices.store_id` foreign-key check.
  - **Consumer-report decision paths** (`ReportReviewController.php:276,330,358,379-389`, then `ReportReviewService:104,206`) use the same order as field sync (`FieldMonitoringController.php:198-201,310`): **store, then verification request, then report**.
    - The decision transaction locks the store first, then locks and **reloads the report**.
    - It then re-checks, inside the lock, the report status and the absence of an active verification. The checks currently done before the transaction (`ReportReviewController.php:379-389`) move inside it.
    - A stale decision gets 409.
  - **`requestVerification`** (`ReportReviewController.php:276-283`) follows the same order. Its insert of `field_verification_requests` needs the store row through the `store_id` foreign key.
    - It locks the store first, then locks and reloads the report.
    - It re-checks the report status inside the lock before inserting.
    - The verification cancel and reopen paths (`:327-358`) also lock the store first.
  - With store first everywhere, no two paths can hold rows in opposite order. A test covers a decision racing a verification request.
  - `recalculateRecidivism` documents that the caller must hold the store lock.
- **One final decision per item.** `createDraft` refuses, with 409 `ITEM_ALREADY_DECIDED`, any item that already has a `regulatory_findings` row whose decision is `confirmed` or `not_confirmed`. Only a `no_action` row may be replaced by a later notice. A closure's upsert therefore never overwrites another closure's decision.

**Analytics de-duplication** (`TemporalAnalyticsService::forStore`)
- Every field item already appears there as a `TemporalInspection` (`FieldMonitoringController.php:297-303`, with `monitoring_record_item_id`).
- A confirmed finding whose `source_type='monitoring_record_item'` is therefore **not** pushed as a separate "Validated receipt" row. Instead it marks the matching inspection row `confirmed: true`.
- The "Validated receipt" label stays for consumer-report findings only.

**Where the outcome is shown**
- Admin: in `LegalNoticeManager`, "Close notice" opens an outcome select with a reason and a confirm step. "Cancel" asks for a reason.
- Vendor:
  - `outcome` and `outcome_reason` are added to vendor `vendorData` (`backend/app/Http/Controllers/LegalNoticeController.php:158-177`) **and** to the conversation notice payload (`backend/app/Http/Controllers/Vendor/VendorMessageController.php:33-39`), plus the vendor `types.ts`.
  - After close, each `flagged_items` entry in `vendorData` gains its item `id` and final `decision` (Confirmed or Not confirmed), from the closure's per-item findings. `NoticeDetailModal` shows the decision beside each commodity.
  - `RebuttalHistory`, `NoticeDetailModal` and `MessagesView` show for example "Closed: explanation accepted". Withdrawn notices show "Withdrawn by DTI" and no longer reuse "Notice closed".

### 2.2 Notice lookup
The 409 from `createDraft` returns `existing_notice_id` in its JSON body. The UI opens that notice directly; this replaces the Phase 1 fallback.

### 2.3 Snapshot completeness and escalation integrity
- `createDraft` adds the following to each snapshot item: `srp_id`, `reference_source_id`, `reference_version`, and `previous_price` (context only; not printed).
- `createDraft` adds `store.owner_name` to the snapshot.
- **`escalate` no longer rebuilds from live data.**
  - The SCO draft copies the LOI's `source_snapshot` verbatim and checks that every item id still exists on that visit with `is_anomaly`.
  - It also copies the LOI's reviewed recipient fields from `draft_payload`. `legal_bases` stays empty, and `linked_vendor_user_id` is set to the store's current link.
  - The "one open notice per visit" guard still applies.

### 2.4 Portal-only issue (D9), keeping the receipt anchor (D2)
- `issue()` requires `intended_delivery_method='portal'` and an active linked vendor (the existing check at `:169` becomes unconditional).
- The `update` validation for `intended_delivery_method` accepts only `portal`. Legacy rows keep their stored values.
- **Unchanged:** `deadline_anchor='received'`, first-open receipt, and the response, escalation and calendar logic.
- **Only the vendor's open starts a portal deadline.**
  - Admin `delivery()` returns 409 `PORTAL_RECEIPT_ONLY` when `intended_delivery_method='portal'`.
  - `LegalNoticeManager` hides "Record delivery" for portal notices.
  - Manual `delivery` stays for legacy hand-copy and email notices.
  - `offline-response` stays for emailed or paper replies; it needs the receipt already recorded, as today.
- **The recipient email is always the audience's.** At issue, `draft_payload.recipient_email` is overwritten inside the lock with the email of the active linked vendor, which becomes `vendor_user_id`. A stale email copied from an escalated LOI or kept across a vendor re-link can therefore never print.
  - `confirm_linked_vendor` also refreshes `recipient_email` to the newly linked vendor's email.
  - The recipient name and title stay as the evaluator reviewed them.
  - **`FORM_LIMITS` runs on the final payload**, after the email is replaced and before the PDF is rendered.
    - A vendor email longer than 60 characters refuses issue with 422 `RECIPIENT_EMAIL_TOO_LONG`: "The vendor account email is too long for the printed form. Update it in User Management, then issue." That edit already exists (`UserManagementController.php:93`). Nothing is truncated.
    - Draft save warns early using the same check.
- UI:
  - the delivery select shows only "Vendor portal";
  - a store with no linked active vendor shows "Invite a vendor account before issuing", with a link to User Management;
  - `IssueResult` no longer prompts to record delivery for portal notices.

### 2.5 SCO entry rule (D1), enforced at both create and issue
- `store()` refuses `notice_type='SCO'` with 422 unless the visit's `protocol_mode='emergency'` and every selected item is `emergency_ceiling`.
- **`issue()` re-applies the same check** to every SCO with a null `preceding_notice_id`, re-reading the visit under the existing lock. This covers SCO drafts created before this change.
- An escalated SCO (with `preceding_notice_id` set) is exempt.
- UI: the SCO radio is disabled unless the conditions hold, with the hint "SCO is issued by escalating an LOI, or directly during a price freeze."

### 2.6 Addressee (D4)
- `createDraft` prefills `recipient_name` from `store.owner_name` and leaves `recipient_title` null.
- A null `owner_name` leaves the field blank, and the readiness checklist blocks issue until it is entered. Nothing is invented (DECISIONS 2026-09-01).
- The representative stays in the snapshot as visit evidence.
- **Owner name too long for the form.** `stores.owner_name` allows 255 characters; the printed field holds 70 (`FORM_LIMITS`).
  - When `owner_name` is longer than 70, the draft still prefills it in full, but readiness shows "Registered owner name is too long for the printed form; enter the form representation".
  - The evaluator then types the printed form, for example a shortened legal name. It is an explicit, audited `legal.draft_saved` edit.
  - `registered_owner_name` keeps the full registered name in the draft and the snapshot, so the official record keeps both.
  - Nothing is truncated silently. `issue()` continues to enforce 70 on the printed `recipient_name`.
- **Change detection.**
  - `draft_payload.registered_owner_name` records `owner_name` at draft time.
  - `issue()` compares it with the store's current `owner_name` under the store lock. If they differ, issue refuses with 409 `RECIPIENT_REVIEW_REQUIRED`: "The registered owner changed after this draft was prepared."
  - The existing review action, `confirm_linked_vendor`, now `confirm_recipient`, with the old name still accepted, refreshes both markers to the current store values. A recipient name the evaluator deliberately corrected is kept: confirming does not overwrite `recipient_name`.
  - The UI's existing "review recipient" banner covers both triggers.

### 2.7 Visits and notices linked both ways
- Backend:
  - add a `MonitoringRecord::legalNotices()` relation;
  - `MonitoringRecordController::show` and `findings` include a compact `notices` list (id, notice_type, status, control_number, outcome) and, per item, any `regulatory_findings` decision.
- `VisitReview` and the Findings rows show a chip:
  - **Notice chip**, e.g. "LOI-2026-000012 · Issued": links to Legal Actions with `source_notice`.
  - **"No action"**: shows the reason, the deciding user and the date inline (a tooltip or expandable row), with no link.
  - **"Not reviewed"**: links to Legal Actions › Needs review with `source_record`. That opens the visit in Prepare with its undecided items.

### 2.8 Needs review queue and no-action triage (D8)
**Review is tracked per item.** An eligible item (`is_anomaly`, reference available) is **undecided** when both of these hold:
- it has no `regulatory_findings` row;
- no open notice (`draft`, `issued`, `response_received`) cites it in `source_snapshot.items`.

An item in a closed notice is decided by that notice's per-item finding (2.1). An item in a cancelled notice, or not cited at all, stays undecided.

**Pending filter.** `GET /admin/monitoring-records?review=pending` returns accepted visits with **at least one undecided eligible item**. A visit whose notice cited only some of its items therefore stays in the queue for the rest. The row shows only the undecided items.

This becomes the default Legal Actions tab, replacing `VisitPicker` with its rows plus "Start LOI". Start LOI preselects only the undecided items. `createDraft` already refuses decided items (409 `ITEM_ALREADY_DECIDED`), and its "one open notice per visit" guard stays.

**Visits waiting on an open notice.**
- A visit with undecided items that also has an open notice (on other items) stays listed. It is labelled "Waiting on {control number or Draft}", with a link to that notice.
- Both "Start LOI" and "No action" are disabled there until the notice is closed or cancelled.
- The API returns `has_open_notice` and `open_notice_id` per row for this.

**One eligibility rule everywhere.**
- The undecided-item computation lives in one backend helper, used by `review=pending`, no-action and `StoreConversationController::eligibleRecords` (`:110-124`).
- Store Communications therefore offers "Prepare notice" only for visits that have undecided items and no open notice.
- `LegalNoticeManager` opened with `source_record` preselects only the undecided items (today `:94` preselects every flagged item). The backend returns the undecided item ids in the monitoring-record `show` payload.

**No-action endpoint.** `POST /admin/monitoring-records/{id}/no-action`:
- Accepts `reason` (10 to 2000 characters) only.
- It always covers **every currently undecided** eligible item on the visit. Partial triage within the undecided set is not allowed, so pending stays truthful.
- It is allowed after an earlier notice on the visit closed, for the items that notice did not cite.
- Requires a manager role.
- Runs **in one transaction that locks the visit row (`lockForUpdate`)**, then:
  - re-checks `status='accepted'`;
  - re-checks that no open notice exists on the visit (`draft`, `issued`, `response_received`);
  - recomputes the undecided set under the lock and requires it to be non-empty.

  Any conflict returns 409 and writes nothing.
- Lock order: store, then visit. The store lock is the per-store serialization described in 2.1.
- Writes `decision='no_action'` per item.
- Audits `monitoring.no_action_recorded` fail-closed.

**Interaction with drafts.** `createDraft` takes the same store-then-visit locks, so the two cannot interleave. A notice may still be drafted for items that have a `no_action` row.

**No-action history is never lost.**
- The audit entry `monitoring.no_action_recorded` stores `reason`, `item_ids` and `decided_at`; the actor is captured by audit.
- When `createDraft` cites items that have `no_action` rows, it copies those rows (reason, `decided_by` id and name, `decided_at`, item ids) into `source_snapshot.prior_triage`. The snapshot is frozen.
- Legal Actions Case Reference shows "Previously triaged: no action by {name} on {date}: {reason}".
- A later closure upsert may then replace the `no_action` row, because its history survives in both the audit log and the notice snapshot. The `confirmed` filters in recidivism and analytics ignore `no_action`.

### 2.9 Send reminder (D6)
`POST /admin/legal-notices/{id}/reminder` is allowed only when all of these hold:
- `status='issued'`, `deadline_rules` is present, `intended_delivery_method='portal'`, and `vendor_user_id` is not null;
- no response has been recorded;
- either delivery has not yet been received (the vendor has not opened it) or `due_date_timestamp` has passed.

**Execution**
- Lock order is store, then vendor, then notice, matching `issue()`.
- It requires the store's current `vendor_user_id` to equal the notice's frozen `vendor_user_id`, and that vendor to be active; otherwise 409.
- It then creates one `StoreMessage` from the acting DTI user, giving type, control number, issue date, due date or "opens your response period", and "respond in Notices".
- Audits `legal.reminder_sent` with the notice id.
- Status and deadline are unchanged.

UI:
- the Issued view shows "Send reminder" when the notice is eligible;
- the response is visible as a message in Store Communications and in the vendor's thread.

### 2.10 Vendor polish
- An "Escalated to Show Cause Order" note on the LOI. The SCO shows "Follows LOI {control}": `preceding_notice_id` and its control number are added to `vendorData`.
- A "Response period ended" label replaces "Response due" for an expired, unanswered notice, in `rules.ts` `noticeStatusLabel` and in `ActiveNoticeBanner`.
- `rules.ts` gets a `cancelled` blocked-reason.
- "Reason: Not recorded" is hidden for offline replies.

**Phase 2 verification**

Backend (`cd backend`):

```
php artisan test --filter="Legal|FieldMonitoringRecord|StoreCommunications|VendorPortal|ReportReview|TemporalAnalytics"
```

The new tests must prove:
- close requires an outcome;
- close writes one finding per item for a new snapshot, and for a legacy snapshot via fallback;
- a legacy snapshot that disagrees with its item gives 409 and writes nothing;
- grouped recidivism counts a visit once, and `explanation_accepted` does not raise it;
- a confirmed field finding appears once in `forStore`, with no "Validated receipt" duplicate;
- escalation copies the LOI snapshot verbatim even after the store's name or address is edited;
- a direct SCO is refused at create for a standard visit, and a pre-existing direct SCO draft from a standard visit is refused at issue;
- an escalated SCO is unaffected by the direct-SCO rule;
- issue refuses non-portal delivery and a store with no vendor;
- legacy hand-copy notices keep delivery and response behaviour;
- `review=pending` excludes a visit only when all its eligible items are decided or in an open notice;
- a visit whose closed notice cited one of two items stays pending for the other; no-action then covers only that item and the visit leaves the queue;
- a decision on a consumer report racing a linked field sync: no deadlock, and the status re-check inside the lock rejects the stale decision;
- a vendor sees per-commodity decisions on a `partially_confirmed` notice;
- an owner name over 70 characters creates a draft with a readiness block. After the evaluator enters a fitting form name, issue succeeds and the snapshot keeps both names;
- no-action is refused when a notice exists, including one created just before the request;
- the reminder is refused when the store's vendor differs from the notice's vendor, and when the notice is not eligible;
- the reminder posts one message and changes no deadline;
- the 409 from create includes `existing_notice_id`;
- admin `delivery` returns 409 for a portal notice, and an admin cannot start a portal deadline;
- `createDraft` returns 409 `ITEM_ALREADY_DECIDED` for an item with a confirmed or not_confirmed finding, and a `no_action` item can still be drafted;
- after a vendor re-link, an escalated SCO prints the new vendor's email and never the copied one;
- a vendor email over 60 characters returns 422 at issue, and nothing is stored;
- a registered-owner change after drafting returns 409 at issue until the recipient is confirmed;
- close with mixed `item_decisions` writes per-item findings, a mismatched outcome returns 422, and a missing or extra item returns 422;
- `prior_triage` is frozen into the snapshot and survives the closure upsert;
- concurrent `createDraft` and no-action on one visit: one succeeds and the other gets 409, with no deadlock;
- a concurrency test: two confirmed closures on different visits of one store, run on two DB connections, leave `recidivism_index = 2`. Alternatively, assert that the store lock is acquired before findings are read, if parallel connections are impractical in the test DB;
- the outcome appears in both the vendor notice payload and the conversation payload.

Web: `cd web && npx vitest run`. Vendor: `cd vendor-pwa && npx vitest run`, covering the `rules.ts` labels and gates and the outcome rendering in history, the modal and messages.

**Manual pass** (dev servers and browser):
1. A flagged visit appears in Needs review; record No action and confirm it leaves the queue with a chip in Field Monitoring.
2. On a second visit, start an LOI. The addressee is `owner_name`. Issue it to the portal. The vendor opens it, the deadline starts, and the vendor responds.
3. The Admin closes with "explanation accepted". The vendor sees the outcome in Notices and Messages, and recidivism is unchanged.
4. On a third visit, send a reminder for an unopened LOI. Once it is overdue, escalate it and issue the SCO. The vendor sees "Follows LOI …", and the SCO snapshot equals the LOI's.

## 4. Risks and assumptions

- **R1: some stores cannot be served.** With portal-only issue, a store with no vendor account cannot receive a notice until a vendor is invited. This is accepted by D9.
- **R2: an unopened notice has no deadline.** Under the receipt anchor, a portal notice the vendor never opens has no deadline, so it cannot be escalated as unanswered. Reminders (2.9) are the follow-up, and DTI may close or cancel with a reason. Escalation stays as it is today.
- **R3: per-item finding rows.** These need the grouping and de-duplication in 2.1, or recidivism and charts would over-count.
- **A1: `protocol_mode`.** Its values are `standard` and `emergency` (`backend/app/Support/MonitoringPeriod.php:30,49`).
- **A2: holiday recalculation.** Late-proclaimed holidays for already-computed deadlines are unchanged by this plan. Deadlines are still computed at receipt, as today. Any recalculation behaviour is out of scope.
- **A3: DECISIONS.md must change.** The 2026-09-28 entry (hand-copy and email delivery for new notices) is superseded by D9, and an entry is added for D1, D4, D5, D6 and D8 when Phase 2 is built.
