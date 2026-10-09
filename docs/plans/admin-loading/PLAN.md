# DTI Admin portal loading: findings and fix plan

Status: plan under independent review (claudex-loop, review mode). Revision 2, 2026-10-10. Nothing is built.

## Context

Request: find what still makes DTI Admin pages slow to show their content (Dashboard, Field Monitoring photos, others), explain why, and propose fixes.

This is a plan only. No code, config, deployment or production data was changed. The user approved a Codex plan review; building needs a separate go-ahead.

An earlier plan already covers the Field Monitoring module: `docs/superpowers/plans/2026-10-10-admin-field-monitoring-loading.md` (spec beside it). It is not implemented yet (`card_image_url` appears nowhere in `backend/app` or `web/src`). This plan does not rewrite it; it adds the portal-wide causes that plan does not touch, sequences both, and records one amendment to it (finding 4).

## Evidence

Measured 2026-10-10, read-only, from this machine (unauthenticated `curl`, Supabase read queries):

| What | Result |
| --- | --- |
| `dti-admin-1.vercel.app/assets/*.js, *.css` | `Cache-Control: public, max-age=0, must-revalidate` on every hashed file |
| `/branding/dti-logo.svg` (sidebar, every page) | 147 KB raw / 49 KB br, same no-cache header |
| `/stores/store.webp` (photo placeholder) | 93 KB, same no-cache header |
| API round trip on an already-open connection, 5 runs each | nginx static file 62 to 102 ms; Laravel CORS preflight 65 to 102 ms; Laravel `401` JSON 67 to 101 ms |
| API first request on a new connection | 159 to 551 ms (adds DNS and TLS) |
| API JSON compression | Brotli on (Cloudflare in front of Render) |
| Supabase `cap_dti` region | ap-southeast-1, same as Render (singapore) |
| Table sizes | 22 monitoring records, 482 items, 169 SRP rows, 45 reports, 2,302 audit events |
| `pg_stat_statements` | Admin read queries average 0.0 to 1.6 ms execution |
| Store photos (earlier authenticated run, `scratch/store-photos/performance-recheck/live-admin-performance.json`) | 10 photos = 4.28 MB, up to 2048 px shown at 260 x 195, `Cache-Control: no-cache`; directory API response 411 ms |

What the numbers say:

- **The database is not the problem**: tiny tables, sub-2 ms queries, same region. No index or SQL tuning is proposed.
- **A trivial Laravel response costs about the same as a static file** (both about one network round trip, 65 to 100 ms). Booting PHP is not the bottleneck for small requests.
- Time therefore goes to the **number of round trips** (requests per page, plus one preflight in front of each new URL), to **assets and photos that are re-checked or re-downloaded on every visit**, and to the work inside the heavier list endpoints (the one authenticated sample took 411 ms).

Not measured: authenticated per-page timings other than Field Monitoring, per-endpoint server time, real phone networks, cold start. Step 0 closes that gap before anything is built.

## Findings: what is slow, why, and the fix

### 1. Built files are never cached by the browser (all pages)
- **Why:** Vercel's default for non-Next static files is `max-age=0, must-revalidate`. Vite already gives every file in `/assets/` a content-hashed name, but `web/vercel.json` sets no headers, so each reload and each first open of a lazy module (Field Monitoring, Legal Actions, ...) makes one conditional request per chunk before any data request can start.
- **Fix:** add `headers` to `web/vercel.json`: `/assets/(.*)` gets `public, max-age=31536000, immutable`; `/branding/(.*)`, `/stores/(.*)`, `/favicon.svg` get `public, max-age=86400`. `index.html` stays uncached so new deployments are picked up.
- **Effort/risk:** one file, no code. Safe because hashed names change when content changes.

### 2. Dashboard fires 7 API requests and waits on one of them (Dashboard)
- **Why:** `OverviewPanel` (`web/src/components/admin/AdminPanels.tsx:70-91`) calls `/admin/overview`, `/admin/reports?per_page=4`, `/admin/monitoring-records?per_page=10` (uses 5), and `/admin/legal-notices` three times (one per status, 20 full notices each with `source_snapshot` and `draft_payload`, to show 5 rows and a total). The shell also calls `/admin/overview`. Each distinct URL adds a preflight round trip on first use. The whole page stays a skeleton until `/admin/overview` returns (`if (!summary)`), even when other cards are ready. The reports card downloads full review rows (OCR JSON, per-item reference comparison) to print four reference numbers, and a failed reports request is shown as "No receipt reviews pending" (`AdminPanels.tsx:63,71,197`).
- **Fix, backend:** `AdminOverviewController::show` returns the existing overview fields plus three dashboard sections when asked with `?dashboard=1`. Plain `/admin/overview` is unchanged.
  - `recent_reports`: 4 rows of `report_reference`, `store_name`, `submitted_at`, `status`. Same eligibility and order as the review queue: `whereNotIn('status', ReportReviewController::UNREVIEWABLE_STATUSES)`, `latest()` (created_at), and `submitted_at ?? created_at` for the date, as `reviewQuery()` and `reportRow()` do today (`ReportReviewController.php:116-120,175`).
  - `recent_visits`: 5 newest accepted visits with the columns the table shows (store name and address, officer name, `finalized_at`, `protocol_mode`, `items_count`, `anomaly_count`), same filter and order as `MonitoringRecordController::index`.
  - `open_legal_notices`: `total` across `draft`, `issued`, `response_received`, and the 5 most recently updated rows with only displayed fields (id, type, control number, status, store name and address, cited item count, `issued_at`, `due_date_timestamp`).
  - Each section is computed inside Laravel's `rescue()` and is `null` when it fails, so one failing section cannot blank the others or the metric cards.
- **Fix, frontend:** a separate `adminApi.getDashboard()` calls `/admin/overview?dashboard=1` under its own cache key. It must not share the `'overview'` key that `getOverview()` uses (`adminApi.ts:341`), or the shell's cached light response would be handed to the dashboard. `OverviewPanel` uses only `getDashboard()`; the shell keeps `getOverview()`.
- **Empty versus unavailable:** every dashboard section has three states: rows, empty array (the existing "none yet" copy), and `null` or absent (a "could not be loaded" notice with a link to the module). Reports gains the unavailable state it lacks today. An absent field from an older backend is treated as unavailable, never as empty.
- **Result:** 7 requests become 2; the skeleton clears on one response. Backend ships first (standing rule in `docs/DECISIONS.md`).

### 3. Every new API URL pays a CORS preflight (all pages)
- **Why:** the Admin site (Vercel) and API (Render) are different origins and every request carries `Authorization`, so the browser sends `OPTIONS` first. Browsers cache a preflight per exact URL including the query string (the API already sends the 2-hour maximum), so each new page number, search term, store id or record id costs one extra round trip, 65 to 100 ms on an open connection.
- **Fix in this plan:** none directly. Finding 2 removes five of the dashboard's preflights by removing the requests.
- **Rejected after measuring:** answering `OPTIONS` in nginx instead of Laravel. On an open connection the Laravel preflight (65 to 102 ms) is no slower than an nginx static file (62 to 102 ms), so the shortcut would save nothing and would duplicate `config/cors.php`.
- **Owner decision, not built:** proxying `/api` through Vercel makes it same-origin and removes preflights entirely, but changes upload limits, timeouts and the client IP the login throttle sees.

### 4. Field Monitoring photos are large and re-checked every visit (Field Monitoring)
- **Why:** measured above: 4.28 MB of photos for 10 cards, originals up to 2048 px drawn at 260 x 195, served `no-cache`. The profile view also waits for both its requests (`Promise.all` in `FieldMonitoringRecords.tsx:270`) before showing the header.
- **Fix:** execute the existing plan: Task 1 (640 px WebP card copies with immutable cache, optional `card_image_url`), Task 2 (profile header shows without waiting for the visit table), Task 3 (15-second session-scoped reuse of monitoring reads). Its production upload step keeps its own approval gate.
- **Amendment to Task 1 (stale thumbnail after a same-key replacement):** the manifest maps a thumbnail by the original's object key, so it is only correct while that key's bytes never change. That holds in application code today: uploads get a new random key (`CommodityImageStorage::store`), and `stores:import-photos` writes only when the key is absent and aborts on different bytes (`ImportStorePhotos.php:50-52,72`). Task 1 therefore adds: (a) the thumbnail importer compares the stored original's SHA256 with the manifest's `source_sha256` and refuses to publish on mismatch; (b) a test that `stores:import-photos` still refuses a conflicting object, named so its purpose (protecting thumbnail mappings) is clear; (c) one sentence in `docs/DECISIONS.md` under the public-image rule: public image keys are write-once, and replacing a photo means a new key or a regenerated thumbnail manifest. No storage check is added to normal API reads.

### 5. Other uploaded images are also `no-cache` (Price Regulation, User Management, GIS overlay)
- **Why:** store and commodity images come from the same public bucket and are uploaded without a `CacheControl` option, so the browser revalidates each one on every view (20 commodity images per Price Regulation page).
- **Fix:** pass `CacheControl: public, max-age=86400` in the options of `CommodityImageStorage::store()` (`backend/app/Services/CommodityImageStorage.php:20`). One day rather than immutable: keys are write-once in application code, but the bucket can still be edited outside it. Applies to new uploads only; rewriting metadata on existing objects is a production asset write and is listed under owner decisions.

### 6. Render-blocking third-party styles on first visit (all pages)
- **Why:** `web/index.html` loads Font Awesome's full `all.min.css` from cdnjs (blocks first paint on a second host, then an icon font) for 25 `fa-solid` icons in four files, while `lucide-react` is already installed and used in 15 files. `web/src/index.css:1` loads Google Fonts through a CSS `@import`, which the browser only discovers after the main stylesheet arrives (a chained request), and requests three families although the styles use Plus Jakarta Sans almost exclusively.
- **Fix:** replace the 25 Font Awesome icons with lucide equivalents in `App.tsx`, `AdminPanels.tsx`, `StoreDetailOverlay.tsx`, `StoreManager.tsx` and delete the cdnjs `<link>`. Move the Google Fonts request from `@import` to `<link rel="preconnect">` plus `<link rel="stylesheet">` in `index.html`, and drop families that `--font-primary` and the stylesheets do not use (verify with grep before removing).
- **Effort/risk:** small visual diff; update `AdminVisualIntegrity.test.tsx` and any test asserting `fa-` classes.

### 7. Opening a module is a waterfall (all modules)
- **Why:** each panel is `lazy()` in `AdminPanels.tsx:8-17`. A click downloads the chunk, then mounts, then starts the data request. Leaving a module unmounts it, so coming back shows the skeleton and refetches.
- **Fix:** fetch a module's chunk on navigation intent: when a sidebar item receives `pointerenter` or keyboard `focus`, call the same `import()` its `lazy()` uses (a small `ModuleId` to importer map in `AdminPanels.tsx`, used by both). One module per intent, nothing at startup, so it cannot compete with the first page's data or images. With finding 1 fixed each chunk is fetched once and cached. Touch devices have no hover and simply keep today's behavior. Data reuse on return stays limited to what finding 4's Task 3 defines; no general query cache is added.
- **Rejected:** warming every lazy chunk at idle after first paint. It would download and evaluate unused modules (GIS pulls Leaflet) while the dashboard is still loading on a slow connection.

### 8. Cold start (all pages, first visit after idle)
- **Why:** the Render free instance sleeps after 15 idle minutes and takes about a minute to wake. No code change removes this.
- **Fix:** none in this plan. Owner decision below.

### Checked and left alone
- SQL and indexes: sub-2 ms, tiny tables.
- nginx preflight shortcut: measured, no gain (finding 3).
- php-fpm pool size: unmeasured under burst; raising it on 512 MB alongside the queue worker and scheduler risks out-of-memory. Finding 2 lowers the burst instead.
- Main CSS (235 KB raw, 49 KB br) and JS (287 KB raw, 87 KB br): fine once cached; no splitting.
- Excel export chunk (939 KB): already loaded only when Export is clicked.
- Shell polling (60 s overview, 4 min session heartbeat), Store Communications polling, Audit Trail (200 rows): no measurable issue.
- Heavier list endpoints (Consumer Reports rows carry full OCR JSON; the monitoring directory runs about 25 queries): Step 0 records their duration and size. A change is proposed only for an endpoint that measures slow, as a separate reviewed step. One unverified candidate if query round trips dominate: emulated prepares on the pooled Postgres connection.

## Build order (after separate build approval)

| Step | Change | Files |
| --- | --- | --- |
| 0 | Baseline: authenticated timings per module (request count, bytes, per-request duration, time to content) by adapting `scratch/store-photos/check-monitoring-performance.py`; 1440 x 900 and 390 x 844; warm backend; fresh browser cache and repeat visit; 5 runs each | `scratch/admin-loading/` (untracked) |
| 1 | Asset cache headers (finding 1) | `web/vercel.json` |
| 2 | Dashboard single request (finding 2), backend first | `backend/app/Http/Controllers/Admin/AdminOverviewController.php`, new `backend/tests/Feature/AdminOverviewDashboardTest.php`, `web/src/services/adminApi.ts`, `web/src/types/admin.ts`, `web/src/components/admin/AdminPanels.tsx`, `AdminShell.test.tsx` and the dashboard tests |
| 3 | Upload `CacheControl` (finding 5) | `backend/app/Services/CommodityImageStorage.php`, `backend/tests/Feature/PublicImageRuleTest.php` |
| 4 | Font Awesome removal, font link, intent prefetch (findings 6, 7) | `web/index.html`, `web/src/index.css`, the four icon files, `AdminPanels.tsx`, `AdminShell.tsx` |
| 5 | Field Monitoring plan Tasks 1 to 3 with the finding 4 amendment | see that plan |
| 6 | Re-measure with Step 0's script; record before/after in `docs/plans/admin-loading/README.md`; update `docs/DECISIONS.md` only for facts that changed |

Steps 1 to 4 are independent of each other. Each ships backend before clients. Unrelated dirty files in the working tree (emergency, legal, monitoring work) are preserved; no `git add .`.

## Owner decisions (not part of the build)

1. **Cold start:** paid always-on Render instance, or an external keep-warm ping, or accept it.
2. **Existing bucket objects:** rewrite `Cache-Control` metadata on images already uploaded (production asset write).
3. **Same-origin API proxy** through Vercel, only if preflights remain a top cost after Step 6.

## Verification

- `curl -sI https://dti-admin-1.vercel.app/assets/<file>` shows `immutable`; `index.html` still `max-age=0`.
- Backend: `php artisan test --filter="AdminOverviewDashboardTest|AdminRouteHardeningTest|PublicImageRuleTest"`. The new test covers: plain `/admin/overview` unchanged; dashboard fields and row limits; a newer `Processing receipt` report does not appear while an eligible older one does; a report with null `submitted_at` returns its `created_at`; the legal total counts only open states; role guard; one section forced to throw leaves the others populated and itself `null`.
- Web: `npm.cmd test -- --run --maxWorkers=1 --no-file-parallelism`, `npm.cmd run build`, `npm.cmd run lint` from `web/`. New cases: shell and dashboard mounted together request both `/admin/overview` and `/admin/overview?dashboard=1` and each receives its own shape; for each section, rows, empty array and null/absent render three different states; a null section does not hide the metric cards; hovering or focusing a sidebar item imports only that module.
- Browser (preview pane, local build): Dashboard network panel shows 2 API requests instead of 7; no request to cdnjs; icons render at 1440 x 900 and 390 x 844; with a throttled fresh cache, time to dashboard content is no worse than the Step 0 baseline and no module chunk is requested before a hover, focus or click.
- Step 6 report compares medians under the same conditions and states actual gains; no fixed-seconds promise.

## Review record

`docs/plans/admin-loading/PLAN-REVIEW-LOG.md`. Roles: host and planner Claude Code (Opus 5.5); plan reviewer Codex CLI (default model); up to 5 rounds; no build or inspection in this run.
