# Price Freeze synchronization — implementation and verification

Implemented and locally verified 2026-10-07. No schema changes or new dependencies. Synthetic acceptance used an isolated database; no regulatory production data was edited.

Public status, legacy calamity reads and Admin's indicator now use the existing effective formal declaration rule. Consumer directory responses include the existing reference package. Manual comparison and shelf-tag comparison resolve the same references as Field and Vendor: confirmed APC or official SRP-held ceilings for covered goods, ordinary SRP for uncovered goods, unavailable when an official ceiling is missing. SRP history is retained.

Each visible online app refreshes regulatory data every 60 seconds and on foreground return/reconnect. Admin writes also trigger immediate refresh. Latest-request guards reject older responses. Field serializes encrypted bootstrap writes, preserves unfinished prices until explicit reference review, clears signatures/confirmation on review, and preserves finalized/queued evidence. Vendor retains the open catalog on refresh failure and labels it stale.

## Verification

Backend transition regressions cover draft, unconfirmed, future, cancellation, inclusive Manila expiry, weekly/daily cadence and missing ceilings. Frontend regressions cover immediate Admin refresh, Consumer reference presentation/cache recovery, Field explicit review and overlapping cache writes. Existing offline/signature/outbox suites remain part of verification.

Independent review identified two issues, both reproduced with failing regressions and fixed: Consumer cache populated after mount was not applied on failure; overlapping Field cache encryption could persist an older response. Review changes also exposed an existing reconnect ordering issue, now guarded so queue synchronization waits for lease renewal.

Authenticated Chromium acceptance uses the local Laravel API on `127.0.0.1:8097`, four Vite clients, and a disposable SQLite database at `scratch/price-freeze-sync/acceptance.sqlite`. Synthetic fixtures only: APC 45 against SRP 50, official SRP-held ceiling 40, uncovered SRP 30. Harness, logs, JSON result and screenshots are retained under `scratch/price-freeze-sync/`. Browser timer acceleration was discarded because it also advanced request timeouts; the final run uses real time.

Final backend suite: **775 tests passed, 5,963 assertions** (`php artisan test`, PHP 8.3, SQLite in-memory). Logs: `scratch/price-freeze-backend-tests.log`.

Browser acceptance **passed**: immediate Admin UI activation; existing foreground Consumer/Field/Vendor refresh; Field explicit review preserves entered 48; APC 45 / official SRP-held 40 / uncovered SRP 30 agree across client APIs and manual comparison; daily cadence; cancellation returns existing Admin/Vendor views and public status to normal. `scratch/price-freeze-sync/result.json` records the six checks; `browser.log` and `{admin,consumer,field,vendor}-active.png` retain evidence. This exercised development clients against a real isolated Laravel backend, not production service workers.

Admin: full suite **264 passed** across 34 files; after correcting the selected declaration card's scheduled/expired label, the complete emergency/legal-notice test file **19 passed** (including two new effective-state regressions). Both new regressions failed against the old label before the fix. Admin production build passed; its existing large-chunk warning remains.

Consumer: **421 passed** across 57 files; production build passed, including generated PWA service worker.

Field: **178 passed** across 15 files; production build and `verify-offline-build.mjs` passed. This includes lease-before-reconnect synchronization and the latest encrypted-bootstrap-write regression.

Vendor: **77 passed** across 7 files; production build passed, including generated PWA service worker.

All frontend suites used `npm.cmd run test -- --maxWorkers=1 --no-file-parallelism`; builds used `npm.cmd run build`. Final logs are `scratch/price-freeze-{web,customer-pwa,field-officer-pwa,vendor-pwa}-{tests,build}.log`; the last Admin correction uses `scratch/price-freeze-admin-effective-state.log`. Temporary browser/API/dev-server processes started for acceptance were stopped.

Release preparation also exported the exact staged app sources, excluding unrelated local changes. All four production builds passed from that snapshot, as did 37 Admin shell/emergency transition tests across two files. Logs are `scratch/price-freeze-release-{app}-build.log` and `scratch/price-freeze-release-admin-tests.log`. Backend compatibility commit: `b03928a`.

## Release boundary

The user authorized commit and push on 2026-10-07. Release backend compatibility before client updates and preserve unrelated edits. GitHub push and live deployment require separate verification; passing local checks do not prove either. Local browser acceptance does not verify authenticated production workflows.
