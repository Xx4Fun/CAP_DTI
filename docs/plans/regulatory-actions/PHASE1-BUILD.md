# Phase 1 build: inspection scope

- **Spec.** `PLAN.md` revision 7, section "Phase 1: DTI Admin web only" (§1.1–§1.6). Phase 2 is **not** part of this build: do not report its absence as a defect.
- **Base commit.** `6a7609ef776e9d412ead35943a4eb9bf49d69989`.
- **Builder.** Claude (host). No backend or vendor-pwa file was changed.

## In-scope changes (all under `web/src/components/`)

- `admin/LegalNoticeManager.tsx` (§1.1, §1.2):
  - server-paged queue (`status=draft`);
  - Issued view with a status filter, plus an "All issued notices" view;
  - search;
  - `source_store` filter with a "Show all" chip;
  - the 409 fallback pages `getLegalNotices({ store_id: record.store.id, page })`;
  - "Open visit #id in Field Monitoring" via the new `onNavigate` prop.
- `admin/AdminPanels.tsx`:
  - `LegalDraftPanel` and `StoreMonitoringPanel` pass `onNavigate` (§1.2, §1.6);
  - the dashboard "Active Legal Actions" card shows live counts (§1.5).
- `admin/AdminShell.tsx`: help-modal copy (§1.5).
- `admin/FieldMonitoringRecords.tsx` (§1.3, §1.4):
  - wording;
  - the review-status card;
  - visit items show reference label/type, source, effective date and previous price.
- `admin/StoreManager.tsx` and `admin/StoreDetailOverlay.tsx`: GIS Legal Audit rows get "Open in Legal Actions" (§1.6).
- `admin/admin.css`: list-control styles; the unused `.non-compliant` rules are removed (§1.6).
- Deleted: `components/Dashboard.tsx`, `admin/TemporalVolatility.tsx` and its test. The `?raw` import is removed from `AdminTypographyIntegrity.test.ts` (§1.6).
- Tests updated or added:
  - `LegalNoticeAndEmergency.test.tsx`: 409 lookup on page 2, server paging and status filter, store filter, visit back-link;
  - `LegalNoticeResponseReview.test.tsx`: status-aware mocks;
  - `FieldMonitoringRecords.test.tsx`: reference detail and previous price, renamed tab;
  - `AdminVisualIntegrity.test.tsx`: live counts;
  - `AdminSafeguards.test.tsx`: unavailable-counts state.

## Deviations from the plan text

1. **§1.1 "All non-draft".** The plan said "one paginated request per non-draft status". Built instead as **one unfiltered paginated request with drafts left out of the rows**.
   - Every non-draft notice still appears on exactly one page.
   - A page may show fewer than 20 rows.
   - No total is shown in this view, because the server total includes drafts.
   - Reason: merging per-status pages has no coherent page boundary.
2. **§1.6 Settings.** `anomaly_threshold_percent` is not exposed anywhere in the web Settings UI; it already shows "regulatory thresholds are unavailable". No change was needed.
3. **Additional wording fixes found during browser verification**, all in the spirit of §1.4:
   - Price History shows "Above reference · within tolerance" and "Reference unavailable" instead of "Within Permissible Reference" for those cases.
   - "REGULATORY STATUS" becomes "REVIEW STATUS" on the establishment cards and the profile card.
   - The reference effective date is trimmed to `YYYY-MM-DD`, because the record API serializes the date cast as a full ISO timestamp.

## Out of scope: pre-existing untracked files, do not inspect

`.claude/`, `image.png`, `ref.png`, `mobile/`, `scratch/`, `web/fm-preview.html` and `web/src/fm-preview.tsx` predate this build. The `docs/plans/regulatory-actions/` files are the plan and log.

## Proof already run by the host

- `cd web && npx tsc -b`: clean.
- `npx vitest run`: 30 files, 214 tests passed. Baseline before the build was 31 files and 215 tests; the difference is the 6 deleted TemporalVolatility tests, and 5 new tests were added.
- `npx vite build`: OK.
- Browser check against a local backend on a scratch SQLite DB:
  - the queue and Issued views page and filter on the server;
  - the visit back-link opens the visit;
  - visit items show reference detail and previous price;
  - the dashboard counts match;
  - no console errors.
