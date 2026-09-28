# Store Communications: DTI Admin ↔ Vendor PWA messenger + LOI/SCO flow

## Context

`web/` "Store Communications" (`web/src/components/admin/AdminPanels.tsx:341-356`) is a placeholder with no API and no threads. The vendor PWA only sees issued notices and can submit one formal response. DTI and vendors cannot otherwise talk, and the backend has no message model.

The LOI/SCO machinery already exists, so this plan **reuses it, not rebuilds it**:
- `POST /admin/legal-notices` drafts only from an **accepted** monitoring record, using only items with `is_anomaly` and an available SRP/ceiling reference (`backend/app/Http/Controllers/Admin/LegalNoticeController.php:34-72`). An LOI therefore requires an inspection anomaly, and this is already enforced.
- Lifecycle:
  - draft → preview → issue: dompdf renders a PDF from `resources/views/notices/official-{loi,sco}.blade.php`. These are Blade copies of the two root HTML forms, plus a `_schedule` price-table page.
  - delivery: received starts the deadline.
  - vendor response: `vendor-pwa` `RebuttalWizard`.
  - close/cancel.
- Admin UI: `web/src/components/admin/LegalNoticeManager.tsx`. Field monitoring "Prepare Notice" hands off via `?source_record=` (`FieldMonitoringRecords.tsx:479-495`).
- Blocker: `backend/config/legal_policy.php` has `approved => false` with empty rules, so `issue` returns 422 `LEGAL_POLICY_UNAVAILABLE` (`LegalPolicyService::availability`).

Goal: a messenger-style Communications workspace, one conversation per **store**. It holds text and attachment messages, with the notice lifecycle shown as timeline cards. LOI/SCO are launched from the thread but go through the existing gated Legal Actions flow, and issuing works end to end.

## Decisions (user-confirmed 2026-09-28)
- **D1 Legal policy: use the form values, approved.**
  - LOI: 3 working days from receipt.
  - SCO: 48 hours from receipt.
  - Anchor: `received` for both.
  - Control pattern: `{type}-{year}-{id}`.
  - Signatory office: LOI "Provincial Director, DTI Antique"; SCO "Director, Fair Trade Enforcement Bureau".
  - Signatory names from env (`LEGAL_LOI_SIGNATORY_NAME`, `LEGAL_SCO_SIGNATORY_NAME`). If a name is blank, availability stays UNAVAILABLE, which is a safe failure.
- **D2 SCO blanks are filled from the inspection.**
  - Complainant: "DTI Price Monitoring — inspection of {monitoring_date}".
  - "RA XXXX": the notice's selected `legal_bases`, joined.
  - The schedule page is labelled "Annex A".
- **D3 Portal delivery:** when `intended_delivery_method = portal`, the vendor's first PDF open records `received`, starts the deadline, and writes an audit event. Hand copies are still recorded manually.
- **D4 Chat:** text plus attachments, in-app only, no email/SMS for chat.

## Enforcement flow (target)
1. Visit → sync → record `accepted`. Items over SRP +10% or over the ceiling get `is_anomaly` (`Field/FieldMonitoringController.php:221-225`). UI wording stays "For review".
2. Evaluator opens the store thread or Field Monitoring › Findings, then **Prepare LOI** and selects the flagged items.
3. Draft → preview → issue (policy-gated, re-auth, PDF, control number). The card appears in the store thread and in vendor-pwa Notices.
4. Delivery: portal first-open (D3) or a manual hand copy. This starts the deadline.
5. The vendor clarifies in chat (informal) and/or submits the formal response (oath and evidence).
6. The evaluator either **closes** (satisfactory) or **escalates to SCO**. Escalation is allowed when the LOI is `response_received`, or `issued` with the deadline passed. One transaction closes the LOI and creates an SCO draft with the same record, same items, and `preceding_notice_id`.
7. SCO issue → delivery → response → close.

Chat never issues documents or starts deadlines.

## Execution order (claudex-loop)
0. Copy this plan to `docs/plans/store-communications/PLAN.md`, and start `PLAN-REVIEW-LOG.md` beside it. Record roles: host/builder = Claude (Opus 5.5); reviewer/inspector = Codex CLI 0.157.1 on the config default model (gpt-6-sol, xhigh), with the model reported as observed.
1. Back up `~/.codex/config.toml`, then set `enabled = false` on the supabase, render, firebase, node_repl, playwright and wps-office MCP servers (user-approved). Run `py -3.13 <skill>/scripts/runner.py review --host claude --repo <worktree> --plan docs/plans/store-communications/PLAN.md`. Arbitrate the findings, revise, and resume, up to 5 rounds. Restore the config byte-for-byte afterward and verify with a hash.
2. After approval, run `check`, record the pre-build commit, and have Claude build in this worktree on branch `claude/dti-admin-communication-ae8882`.
3. Run the proof commands. Codex inspects in a fresh `inspect` session with `--base`. Fix the findings, then run one fresh re-inspection.
4. No commit, push, deploy, or migration against live data without explicit approval.

## Approach

### Backend (`backend/`)
- **Migration `store_messages`:**
  - Columns: `id, store_id FK cascade, vendor_user_id FK users (audience: the store's linked vendor at send time), sender_id FK users, sender_side enum(dti,vendor), body text nullable (≤2000), attachment_path/name/mime/size/sha256 nullable, read_at nullable, timestamps`.
  - **Audience (SC-01):** vendors read only rows where `vendor_user_id` = themselves, so a newly linked vendor never sees a previous vendor's messages or files. DTI sees the full store history, with each message labelled by vendor. DTI cannot send to a store with no linked vendor (422).
  - **Send lock (R2-02):** admin send runs in a transaction that locks the store row, reads `vendor_user_id` under the lock, rejects if null, and writes the message with that audience before commit. Vendor send uses the same lock-then-recheck pattern.
  - Index `(store_id, id)`.
  - The thread is implicit per store, so there is no threads table.
  - Each message has either a body or an attachment.
  - One attachment per message: pdf/jpeg/png/webp, max 5 MB. Chat has its own allowlist constant in both backend and vendor-pwa (`CHAT_ATTACHMENT_TYPES`); the formal-response limits in `rules.ts` are unchanged (SC-10). Stored on the private `LegalNotice::DOCUMENT_DISK` at `store-messages/{store}/{uuid}.{ext}`.
- **`app/Models/StoreMessage.php`**, plus `Store::messages()`.
- **`Admin/StoreConversationController`**, using `AdminAuthorizationService::requireManager` and `AuditTrailService`:
  - `GET /admin/conversations?search=&page=`: stores that have a linked vendor **or** any message or notice history (R2-03), with last message, unread-from-vendor count, open notice count, and a `linked` flag. Unlinked stores show a label and a disabled composer.
  - `GET /admin/conversations/{store}?after_id=`: messages; the timeline derived from `legal_notices` (issued/delivered/response_received/closed/cancelled timestamps, read-time only); and `eligible_records`, meaning accepted records with anomaly items and no open notice. Marks vendor messages read.
  - `POST /admin/conversations/{store}/messages` (multipart).
  - `GET /admin/conversations/{store}/messages/{message}/attachment`.
- **`Vendor/VendorMessageController`** (`ResolvesVendor`, scoped by `stores.vendor_user_id` under the same store row lock pattern as `LegalNoticeController::response`):
  - `GET /vendor/conversations/{store}?after_id=` returns messages and the timeline of vendor-visible notices only. Marks DTI messages read.
  - `POST /vendor/conversations/{store}/messages`.
  - `GET …/messages/{message}/attachment`.
  - `/vendor/overview` gains per-store `unread_messages`.
- **Hardening:** `throttle:30,1` on message POSTs. The body is plain text, escaped on render. Attachment MIME is validated by content (`mimes:`) and served with `Content-Disposition: attachment` except for images.
- **Escalation:** `POST /admin/legal-notices/{id}/escalate`. Extract the draft-creation block from `store()` into a private `createDraft($record, $items, $type, $precedingId, $request, $audit)` so that both paths share it. Add the audit event `legal.notice_escalated`.
- **Portal receipt (D3)** in vendor `LegalNoticeController::document`:
  - One transaction. Lock the **store row first** and recheck `vendor_user_id` = the caller (403 if not), then lock the notice, matching `response()` (SC-03).
  - When status is `issued`, `intended_delivery_method = portal` and `delivery_state` is `not_recorded` **or `failed`** (R5-03): set `received`, `delivered_at = now`, and `due_date_timestamp` computed from the notice's frozen `deadline_rules`. Write the audit event `legal.delivery_recorded` with `{via: portal_open}`.
- **Deadline rules frozen at issue (SC-04):** add a `legal_notices.deadline_rules` JSON column, written by `issue()` with `{response_period, deadline_anchor, timezone, working_weekdays, non_working_dates}`. Add `LegalPolicyService::deadlineFrom(Carbon $from, array $rules)`, which does not check current availability. Both the admin `delivery()` and portal receipt use it. **Legacy notices without `deadline_rules` (R3-04, R4-03):** portal auto-receipt is skipped and admin `delivery()` returns 409 `LEGACY_POLICY_REVIEW_REQUIRED`. A deadline is computed only from rules frozen on the notice at issue, never from current config or a matching version string.
- **Delivery immutability (SC-02):** the admin `delivery()` may write only while `delivery_state` is `not_recorded` or `failed`. Once `received` or `refused` is recorded (by the portal or by hand), it returns 409 `DELIVERY_ALREADY_RECORDED`. Corrections are out of scope for v1.
- **Portal issuance guard (SC-07, R2-02):** `issue()` locks the store row before the notice and reads the link under that lock. It returns 422 when `intended_delivery_method = portal` and the store has no linked, active vendor.
- **Notice audience (R2-01):** add a `legal_notices.vendor_user_id` column, set by `issue()` from the locked store link (null when there is none).
  - Every vendor-side notice read filters on `legal_notices.vendor_user_id = caller` as well as the store link: `LegalNoticeController` index/show/document/response, the conversation timeline, and `VendorPortalController::overview` counts and compliance status.
  - **Legacy notices (R3-01, R4-01, R4-04): no inferred backfill.** Any issued notice without `deadline_rules`, meaning one issued before this change, keeps `vendor_user_id = null`. The legacy policy was never approved, so the only such rows are the old-engine rows and seeded data.
    - These notices are **hidden from the portal** and handled offline: a hand copy, the response on paper, then DTI close/cancel.
    - Admin detail shows a "Legacy notice: offline handling" banner.
    - There is no automated receipt, deadline, or portal response for them. `delivery()` returns 409 `LEGACY_POLICY_REVIEW_REQUIRED` for them, and close/cancel still work.
  - **Other notice writers (R3-02):** `VendorPwaVerificationSeeder` and the fixtures in `LegalNoticeTest`, `VendorPortalTest` and `LegalActionsWorkflowTest` set `vendor_user_id` to the intended vendor **and** a `deadline_rules` snapshot, because without it they count as legacy and are hidden. Fixtures that are deliberately unlinked or legacy keep both null.
  - **Email (R3-03):** the post-issue `LegalNoticeAvailableMail` goes to the notice's frozen audience user, not the store's current vendor. It is suppressed when that user is no longer the store's linked vendor or is inactive at queue time.
  - A notice issued while no vendor is linked is never shown in the portal. It is served as a hand copy only, and that limit is recorded. A re-linked vendor therefore never sees an earlier vendor's notices or responses.
- **Open notices vs. unlink (R4-02):** `VendorInvitationService::unlink` returns 409 `OPEN_NOTICES_BLOCK_UNLINK` while any notice with status `issued` or `response_received` has `vendor_user_id` = the linked vendor. It checks this under the store lock it already takes. DTI must first close or cancel those notices, which are both audited dispositions. Re-linking to a different vendor requires unlink first (`VendorInvitationService.php:101`), so the same guard covers reassignment.
- **Open notices vs. deactivation (R5-01):** `UserManagementController` deactivation of a vendor returns 409 `OPEN_NOTICES_BLOCK_DEACTIVATION` while any `issued` or `response_received` notice has that user as its audience. This is the same disposition-first rule as unlink, so an open response period can never be interrupted.
  - **Lock serialization (R6-01):** `issue()` locks the store, then the linked vendor's user row (`lockForUpdate`), rechecks `is_active` under that lock, and holds both locks through the status change. Deactivation checks for open notices inside its existing user-row lock. The two operations therefore serialize, and the lock order is store before user, with no cycle, because deactivation takes no store lock.
- **Stale draft recipient (R5-02, R6-02):** `store()` captures `draft_payload.linked_vendor_user_id` (the store's link at draft time). `recipient_email` stays independently editable, because it is a contact, not an identity. Under the store lock, `issue()` compares the captured id with the current link and returns 409 `RECIPIENT_REVIEW_REQUIRED` on mismatch. `update()` accepts `confirm_linked_vendor: true` to re-capture the current link after the evaluator reviews the recipient fields. The admin editor shows a "Vendor link changed, review recipient" banner with a confirm button.
- **Escalation guard (R4-02):** escalating an **overdue unanswered** LOI requires that its audience vendor is still the store's linked vendor and is active. That proves the portal response path stayed open for the whole period. An LOI with status `response_received` can always be escalated. A null-audience (offline) LOI is escalated only through the DTI's manual SCO drafting.
- **Preceding-LOI rule (SC-08):** remove `preceding_notice_id` from `store()` validation. SCOs linked to an LOI are created only through `escalate`, which checks eligibility. `store()` can still create a standalone SCO with no predecessor, as today.
- **`config/legal_policy.php` (D1):**
  - Top-level values: `approved true`, `policy_version '2026-09-28'`, `working_weekdays [1..5]`, and `non_working_dates` with the PH regular and special non-working holidays for 2026–2027.
  - Calendar window: `calendar_valid_from 2026-01-01`, `calendar_valid_until 2027-12-31`.
  - Per type:
    - `reasons`: ["Prices above SRP", "Prices above price ceiling"].
    - `legal_bases`: ["RA 7581 (Price Act)", "RA 7394 (Consumer Act)", "DAO No. 6, s. 2007", "DO No. 18-122"].
    - `required_fields`: LOI `[recipient_name, address, reason]`; SCO adds `legal_bases`.
  - Tests that assert UNAVAILABLE must set config explicitly: existing `LegacyLegalPolicyGuardTest` and `LegalActionsWorkflowTest` cases.
- **SCO Blade (D2, SC-09, R2-04, R2-05):** the complainant and law slots are too narrow (about 68 SVG units, `official-sco.blade.php:3496-3506`).
  - Keep the approved complainant wording exactly: "DTI Price Monitoring — inspection of {monitoring_date}" (date as `F j, Y`).
  - Replace the whole phrase "Article(s) of the RA XXXX" with the neutral "the following legal basis/bases: {bases joined with '; '}", because the bases include DAO and DO issuances.
  - Server-side, `update()` validates `legal_bases` as `array|max:4`, `distinct`, with each value `Rule::in(policy legal_bases)`. `issue()` rechecks for duplicates.
  - Draw a wider whiteout box and wrapped multi-line `<text>`/`<tspan>` lines, using a fixed max characters per line and a smaller font.
  - Add the "Annex A" label on the schedule page.
  - Verify by rendering the LOI and SCO PDFs with the longest permitted values to PNG and inspecting them visually.

### DTI Admin (`web/`)
- Replace `CommunicationsPanel` with `StoreCommunications.tsx`, a two-pane messenger:
  - Store list with unread badges and search.
  - Thread with bubbles, attachment chips/thumbnails, notice cards, and a composer with an attach button.
  - Follow the list/detail layout of `CitizenTipReview.tsx`, `admin.css` tokens, and new `.comms-*` classes.
- Thread actions:
  - **Prepare LOI/SCO** lists `eligible_records` and navigates to `legal_actions?source_record=`, the existing handoff.
  - **Escalate to SCO** on eligible LOI cards.
  - Notice cards open the Legal Actions detail.
- Polling: the thread every 10 s and the list every 30 s, only while `document.visibilityState === 'visible'`. There is no broadcasting in the repo.
- `adminApi.ts`: `getConversations`, `getConversation`, `sendStoreMessage`, `getMessageAttachment`, `escalateLegalNotice`. Types go in `types/admin.ts`.
- Legal bases and reasons (SC-05): replace the comma-joined free-text field in `LegalNoticeManager` (lines 60/77) with exact-value checkboxes (bases) and a select (reason), both populated from the permitted lists. `detail().policy` gains `reasons` and `legal_bases` for the notice type.
- Fix in passing, because this flow depends on them:
  - `LegalNoticeManager` ignores `source_store`.
  - The Close button lacks busy and error handling.
  - Add an Escalate action in the issued detail.
- Update the `AdminShell.test.tsx:112-120` placeholder assertion.

### Vendor PWA (`vendor-pwa/`)
- A new `messages` tab (the `types.ts:145` union, `VendorNavbar`, `VendorBottomNav`) with an unread badge.
- The thread for the selected store has bubbles, attachments, notice cards ("View notice" opens the Notices tab), a composer with an attach button using the `rules.ts` file limits, and a 10 s poll while visible.
- `vendorApi.ts`: `conversation`, `sendMessage`, `messageAttachment`.
- `NoticeDetailModal`: show the DTI `reason` and `legal_bases`. Add these to `vendorData()`.
- Stale modal (SC-06): after a successful PDF fetch, reload notices. Store `selectedNoticeId`, not the object, and derive the modal's notice from the refreshed `notices` state, so the deadline and the Respond button update immediately.

## Non-goals (v1)
Email, SMS, or push alerts for chat; websockets; group or cross-store threads; message edit/delete; multiple attachments per message.

## Risks
- Policy values are DTI's legal call. The user approved form values, and the signatory name must be set in env.
- The holiday list must be maintained. `availability()` requires calendar coverage through today + 3×period days, so with `calendar_valid_until 2027-12-31` a 3-working-day LOI becomes UNAVAILABLE from **2027-12-23** (R2-06). SCO (hours) is unaffected. A unit test pins that boundary. Extend the calendar before December 2027.
- The portal first-open starts a legal deadline, so the audit trail and timestamp must be exact.
- Separate from this work: `sms_config.md` (PhilSMS token) and `AGENTS.md` (Genspark token) are plaintext secrets in git. Rotate them.

## Verification
- `cd backend && php artisan test`, including new `StoreConversationTest` and `VendorMessageTest` covering:
  - Cross-vendor denial.
  - Unlinked-store denial.
  - read_at transitions.
  - The `after_id` cursor.
  - Attachment scope and MIME rejection.
  - Throttle.
- Also `LegalEscalationTest`: eligibility, atomic close+draft, no double-open, and `store()` rejecting `preceding_notice_id`. Also `PortalReceiptTest`:
  - The first open sets the deadline once, and hand-copy notices are unchanged.
  - An unlinked vendor cannot trigger receipt.
  - Admin delivery after receipt returns 409.
  - The deadline uses the frozen rules even when the current policy is unavailable.
  - Portal issue without a linked vendor returns 422.
  - Audience: after a vendor re-link, the new vendor sees none of the old messages.
  - Notice audience: after a re-link, the new vendor gets 404 on the old notice's index/show/document/response, and the old notice is excluded from overview counts.
  - Unlinked stores with history stay in the admin list with a disabled composer.
  - `legal_bases` rejects duplicates, more than 4 entries, and unlisted values.
  - Policy boundary: LOI available on 2027-12-22 and unavailable on 2027-12-23.
  - Legacy handling: a notice without `deadline_rules` stays audience-null, is hidden from the vendor, returns 409 on delivery, and can still be closed or cancelled. The email goes to the frozen audience and is suppressed after a re-link.
  - Unlink returns 409 while an audience notice is open, and succeeds after it is closed.
  - Overdue escalation is refused when the audience vendor is inactive or unlinked.
  - Deactivation returns 409 while an audience notice is open.
  - Issue returns 409 `RECIPIENT_REVIEW_REQUIRED` after a re-link, and succeeds after `confirm_linked_vendor`. A hand-copy draft with a custom recipient_email still issues.
  - Portal open after a `failed` delivery records receipt. And policy-approved LOI and SCO issue producing PDFs, with the SCO containing the complainant/law text.
- `cd web && npm test && npm run build`, with a new `StoreCommunications.test.tsx` and the updated AdminShell test.
- `cd vendor-pwa && npm test && npm run build`, with an App.test case for the messages tab.
- Manual end to end: seed with `VendorPwaVerificationSeeder`.
  1. The admin sends text and an image, and the vendor sees them within about 10 s and replies.
  2. The unread badges clear.
  3. The admin prepares an LOI from the thread and issues it via portal. The vendor opens the PDF, and the deadline appears.
  4. The vendor responds, and the admin escalates to SCO, issues it, and the SCO PDF has the filled blanks.
- Claudex: Codex plan review before the build, and a fresh Codex inspection after it.
