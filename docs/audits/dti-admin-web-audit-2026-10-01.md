---
tags:
  - audit
  - admin
---

# DTI Admin portal (web/) audit — 2026-10-01

Evidence snapshot of `web/` at commit `e33eb1b` plus the uncommitted Field Monitoring/AdminShell edits present that day.
The plan was reviewed by Codex over 5 rounds (19 findings, all accepted). Line numbers are from before the fixes below.

## Clean areas

- Every `web/src/services/adminApi.ts` method matches a route in `backend/routes/api.php` by method and path.
- No UI action is shown to a role the backend rejects. Signatory editing is gated with `canEdit={user.role === 'super_admin'}`
  (`SettingsPanel.tsx:104`), which matches `LegalSignatoryController::authorizeChange`.
- `tsc -p tsconfig.app.json --noEmit` was clean before the fixes.

## Legal signatory: "Not set: issuing is disabled"

The e-signature feature already existed (Settings › Legal Signatories, plus "Apply this official's e-signature" when
issuing). It showed "Not set" because no LOI signatory name was saved, and editing was Super Admin only. The deployment
has no Super Admin account, so on 2026-10-01 editing was opened to DTI evaluators as well. The backend check is now
`AdminAuthorizationService::canManage`. The password re-check and audit trail are unchanged, and field officers are
still refused.

To enable issuing, a DTI evaluator:

1. Opens Settings › Legal Signatories.
2. Enters the LOI name and position, then saves. The portal asks for the password again.
3. Uploads a PNG or JPEG signature: 1 MB or smaller, at most 2400×1200 px.
4. Does the same for SCO if needed.

## Fixed in this change

| ID | Where | Problem | Fix |
|---|---|---|---|
| H1 | `services/api.ts`, `App.tsx` `handleLogout` | A re-authentication queue survived logout. A queued sensitive request could replay under the next user's token, and a stale 401 could log the next user out. | Every request carries a session epoch. Logout advances the epoch, rejects the queue, and blocks new requests except `/logout`. A 401 or 403 from an earlier epoch is ignored. Re-auth does not resume requests if the epoch changed while the password was being checked. |
| H2 | `StoreCommunications.tsx` `MessageImageAttachment` | Image blob URLs were never revoked. | The URL is revoked on cleanup. The lightbox closes on store/thread change, so it never shows a revoked URL. |
| H3 | `FieldMonitoringRecords.tsx` popstate | Browser Back from an establishment profile left the profile on screen. | The profile is cleared when the restored URL has no store, and kept for the same store. |
| H4 | `FieldMonitoringRecords.tsx` price history | Commodity switch had no error handling, no stale guard, and a selector that could disagree with the table. | One `historySeq` is shared by all history writers and checked against `navSeq`. Selector, table and URL are committed together on success. Switching is ignored during a profile reload. Unmount invalidates pending writes. |
| M13 | `LegalSignatoriesSettings.tsx` | The preview leaked object URLs, could show a stale image, and two saves finishing together overwrote each other. | Active flag and revoke on cleanup. A local revision counter refreshes the preview after each change. Functional `setRecords`. |
| — | `LegalSignatoriesSettings.tsx` | Evaluators saw "issuing is disabled" without being told who can fix it. | Read-only badge reads "Not set: ask a Super Admin". |

## Open findings (report only)

### Medium

- **Settings readable by field officers.** `AdminSettingsController::index` returns every `system_settings` row.
  `routes/api.php:106` admits `field_officer` tokens to the admin group, so a field officer can read all settings,
  including legal signature storage paths and hashes. The image endpoint itself is manager-only. Fix: `requireManager`
  or a response allowlist.
- **Emergency dates render as raw ISO.** `EmergencyToggle.tsx:135, 218` print `starts_on`/`ends_on`, which the `date`
  cast serializes as `2026-09-08T00:00:00.000000Z`. Fix: use `day()`.
- **Wrong APC source day.** `EmergencyToggle.tsx:334` takes `.slice(0, 10)` of a UTC timestamp, so a 07:30 Manila visit
  shows the previous day. Fix: format with `timeZone: 'Asia/Manila'`.
- **Receipt checked against the wrong SRP revision.** `CitizenTipReview.tsx:202` and `ReportReviewController.php:253`
  derive `observed_at` in UTC. A receipt submitted before 08:00 Manila picks the previous day's SRP revision.
- **Downloads fail silently or are cancelled.** In `CitizenTipReview.tsx:845-855` and `LegalNoticeManager.tsx:484`, the
  async click handlers have no catch, and `revokeObjectURL` runs right after `click()`, which can cancel the download in
  Firefox and Safari. Fix: catch errors and revoke after a delay.
- **Issued documents are popup-blocked.** `LegalNoticeManager.tsx:343` calls `window.open` after an `await`. Safari, or
  a slow cold start, blocks it. Fix: open the window synchronously, as `openAttachment` does.
- **Calamity badge never refreshes.** `AdminShell.tsx:200-208` fetches the overview once, so activating or ending a
  price freeze is not reflected until a reload.
- **User table can show the wrong filter.** `UserManagementPanel.tsx:157-163` calls `loadUsers()` from a stale closure
  after resetting filters. Two requests race, and the stale one can win.
- **List loaders have no stale-response guard.** Affects CitizenTipReview, the FieldMonitoringRecords list loaders,
  StoreCommunications `loadList`, and StoreDetailOverlay. The pattern to copy is `SrpManagementPanel.tsx:873-899`.
- **Double submit.** EditUserDialog, PasswordDialog and the re-auth form have no busy state. A double click sends two
  password PUTs.
- **Sidebar click on the current module does nothing visible.** It clears `record`/`store`/`report` from the URL but
  does not remount the panel, so a later Back restores the wrong state.

- **Commodity not restored on Back/Forward.** In `FieldMonitoringRecords.tsx` popstate, Back/Forward between commodity
  URL entries for the same store and period does not restore `commodity`, so the selector/table and URL disagree.
  Found by the final Codex inspection.
- **Admin data stays visible during a slow logout.** `App.tsx` `handleLogout` hides AdminShell only after `/logout`
  settles. If the request stalls until the 30 s timeout, an inactivity lock leaves data on screen. New requests are
  already blocked. Fix: lock the UI at logout start.
- **Period change leaves stale figures.** `handlePeriodChange` / popstate update the period selector before
  `openProfile` finishes. A failed reload leaves the previous period's figures under the new label. Fix: commit filter
  and data together, or restore the prior filter on failure.

### Low

- **Heartbeat rejection.** `App.tsx:231` `api.get('/admin/session')` has no `.catch`, so it raises an unhandled
  rejection when offline.
- **"Custom range" fetches all-time data.** Choosing it fetches before dates are set, and the backend treats `custom`
  with no dates as all-time.
- **Monitoring periods computed in UTC.** `MonitoringRecordController.php:587-620` computes period windows in UTC
  (`app.timezone` is UTC), so "This week" is 8 hours off Manila time.
- **Signature modal blob leak.** The blob in `FieldMonitoringRecords.tsx` (~1807-1838) is revoked only on close, not
  on unmount.
- **Export shows Axios text.** The export error displays "Request failed with status code…" instead of the server
  message (`FieldMonitoringRecords.tsx:179`).
- **Duplicate fetch.** The scoped Additional Visits view fetches twice because `loadVerification` depends on
  `verificationStoreName`.
- **Dead fallback.** The findings fallback in `FieldMonitoringRecords.tsx:279-314` never runs: the index endpoint
  returns no `items`.
- **Missing CSS class.** `field-assign-dialog` is used but not defined in `admin.css`. The impact is cosmetic.
- **Stray preview harness.** `web/fm-preview.html` and `web/src/fm-preview.tsx` are labelled "TEMP visual harness —
  delete after review".
  - Not bundled, but `tsc -b` type-checks them and `vite dev` serves them.
  - They hardcode an officer name and email.
  - Keep them out of commits.
- **Public mockup images.** `web/public/*_mockup.jpg` and `dti_light_*.jpg` deploy publicly.
- **Unused components.** `Dashboard.tsx` and `TemporalVolatility.tsx` are not imported anywhere.
