# Vendor offline workspace

Implemented on 2026-10-06. Scope covers the Vendor PWA and compatible Vendor API changes. Field monitoring is excluded. Local checks do not establish installed-device readiness; production release evidence is recorded separately below.

## Behavior

- Account-scoped IndexedDB stores encrypted resource snapshots, drafts, attachment bytes, submissions, acknowledgements, and the saved session. AES-GCM uses a restored non-exportable browser key; no PIN or biometric requirement is introduced.
- Saved overview, notices/history, SRP, advisories, preferences, and linked-store conversations hydrate before network refresh. Earlier downloaded message pages remain available. Background conversation preparation uses `mark_read=false`.
- Response and message drafts save text, progress, evidence bytes, and categories. Content edits invalidate response certification. Save failures stay visible and block navigation/update/sign-out until recovery.
- Explicit submission atomically captures immutable content and attachments before delivery. Cross-tab delivery locking, original UUID retries, backoff, and persisted acknowledgements recover interrupted uploads. Rejections remain reviewable with the server reason; authorization pauses work for same-account reauthentication.
- Official PDFs and message attachments save only after explicit online access. An unopened PDF requires connectivity. Offline preparation does not record legal receipt, extend deadlines, or mean DTI has received a queued response.
- Profile mutations require connectivity. Ordinary sign-out requires review or explicit discard of unresolved local work. Private API responses are excluded from service-worker caches; public images are bounded separately.
- Browser storage persistence is requested. Denial and failed saves are reported; browser eviction or manually cleared storage can still remove device-local work.

## Compatibility and release boundary

`vendor_submission_receipts` is additive. Message and response endpoints accept optional `client_uuid`, retaining older-client behavior. Business write, audit event, and acceptance receipt commit together. Identical retries return the accepted result; changed content/target returns `409 IDEMPOTENCY_CONFLICT`. Access is rechecked before replay, and accepted response receipts precede deadline/status rejection.

Backend compatibility must deploy before the Vendor client. The user authorized commit and production deployment after local implementation checks. Only the reviewed offline changes are included; unrelated checkout edits and production test-record creation remain excluded. Automatic delivery requires the app to be open or reopened; closed-app background delivery is not promised.

## Verification

- Vendor Vitest suite: **77 tests passed** in seven files, run serially with `npm.cmd run test -- --maxWorkers=1 --no-file-parallelism`.
- Laravel focused suites: VendorPortalTest, VendorAuthTest, and LegalNoticeTest under PHP 8.3 with an isolated in-memory SQLite database and array cache/session/mail: **44 tests, 235 assertions passed**.
- Vendor lint and production build passed locally. Generated-worker checks passed: 21 precache entries cover the shell/fonts/branding, with bounded public commodity-image caching separately.
- `vendor-pwa/tests/offline_browser.py` passed all six scenarios with no browser errors using Playwright Chromium, the production preview, and synthetic intercepted API fixtures. It verifies offline cold restart, saved tabs/profile/PDFs, blocked unopened PDF access, exact draft files/categories, certification invalidation, explicit offline queues, lost acknowledgements, reload/concurrent tabs, and absence of API responses in service-worker caches. Exactly one message and one response were accepted despite the simulated lost acknowledgement.
- Independent review found no remaining blocking defects after atomic conversion, quota recovery, snapshot ordering, guarded navigation, and transactional attachment-read fixes.

Production behavior, PostgreSQL concurrency under deployment, and installed Android/iOS airplane-mode tests remain unverified. Browser fixtures and SQLite tests do not prove those environments.

## Backend release evidence — 2026-10-06

- Commit `150722115f425178a011cd18020cc94ba98c7b26` is live through Render deployment `dep-db282qk9v7es7387cq30` on `CAP_DTI`, deploying `backend/` from `main`.
- The startup log records `2026_10_06_000001_create_vendor_submission_receipts_table ... DONE` at 05:07:14 UTC. Render marked the deployment live at 05:07:26 UTC.
- `/up` and `/api/health/ready` returned HTTP 200 at 05:08 UTC; readiness reported app and database `ok`. These checks establish backend release health, not authenticated legal-submission acceptance.
- The clean Vendor release copy excludes the pre-existing Profile, main entrypoint, and styling edits. All 77 tests passed with a single-thread Vitest pool after Windows fork-worker startup timeouts; lint and production build passed.

To repeat the browser checks, install Python Playwright and its Chromium browser, start `npm.cmd run preview -- --host 127.0.0.1 --port 5177` after building Vendor, and run `python vendor-pwa/tests/offline_browser.py` from the repository root. The test never creates production records.
