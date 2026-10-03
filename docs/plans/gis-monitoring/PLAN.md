# GIS Monitoring: from store locator to spatio-temporal monitoring

Claudex loop. Host/planner: Claude (this session). Plan reviewer: Codex CLI 0.159.3 (model = CLI default, reported as observed). Builder: none authorized. Max review rounds: 5. Final repo paths: `docs/plans/gis-monitoring/PLAN.md` and `PLAN-REVIEW-LOG.md`.

## Context

The owner asked where "Temporal" and "GIS map monitoring" live, whether they qualify as main features, and how to make GIS monitoring genuinely useful.

**Where they are today**

| Feature | Location | What it does |
|---|---|---|
| GIS Monitoring | `web/src/components/admin/StoreManager.tsx`, `StoreMap.tsx`, `storeMapUtils.ts` (sidebar module `gis_monitoring`) | Leaflet pins for every store, coloured by one store-level flag (`recidivism_index`, `is_verified`, `is_active`), plus search, 4 filter chips, and a detail drawer. Data: `GET /admin/stores`. |
| Temporal analytics | Backend `TemporalAnalyticsService::forStore`, `TemporalAnalyticsController` (`/admin/analytics/stores/{store}`); UI only in `StoreDetailOverlay.tsx` "Price Trends" tab | One store, one commodity, fixed 4 weeks, a 200px chart inside the drawer. Backend is sound and tested (`GisStoreDetailTest`): it plots the reference captured at the time, never a re-resolved one. |
| Related | Field Monitoring price-history table and weekly matrix (`MonitoringRecordController::priceHistory`, `matrix`) | Temporal data in table form. |

**Verdict.** Neither is a main feature as shipped. The map answers only "where is this store and is it flagged": no layers, no time, no coverage, no use of visit GPS. Temporal has no screen of its own; the Dashboard card says "Open Temporal Analytics" and links to Field Monitoring, and the legacy `analytics` alias points there too.

**Data already stored but never mapped:** visit GPS and accuracy (`monitoring_records.latitude/longitude/location_accuracy_meters`), per-item price with its captured reference (`monitoring_record_items.recorded_price/reference_value/reference_status/variance_percent/is_anomaly`), weekly visit history, open verification requests.

**Owner decisions (2026-10-03):** add three layers (monitoring coverage, commodity price map with week slider, visit GPS check); fuse temporal into GIS rather than a separate module; after Codex approves, stop for sign-off. Barangay boundaries declined.

**Outcome:** one defensible main feature. The map shows, for any monitoring week, which stores were visited, what a commodity cost at each store against the reference in force, and whether each visit was signed at the store.

## Acceptance criteria

1. GIS Monitoring has a layer switch: Compliance (today's behaviour, unchanged), Coverage, Prices, Visit check.
2. A week slider lists every Manila monitoring week that has accepted visits, plus the current week. Changing it reloads the three new layers for that week. Compliance ignores it.
3. Coverage: each active store is `Monitored` (an accepted routine visit finalized in the selected week), `Never monitored` (no routine visit in the week and none before the week's start), or `Not monitored` (none in the week, at least one before it); inactive stores are grey. Verification visits never count as routine coverage. In the current week, stores with an open or claimed verification request carry a "Verification required" marker.
4. Prices: with a commodity selected, each store visited that week shows the recorded price on its pin, coloured `At or below reference`, `Above reference`, `Flagged` (`is_anomaly`), or `Reference unavailable`; stores without that price are grey. A summary line shows lowest, highest, and spread with store names.
5. Visit check: each visit in the week is drawn at its captured GPS point with an accuracy circle and a line to the store's registered pin; each visit's popup states its own distance, accuracy, and result. A visit is `Location to review` when distance minus accuracy exceeds 150 m. The store's category is `Location to review` if any visit in the week is, `At registered pin` if it has visits and none is, and `No visit` otherwise, so a later accurate visit never hides an earlier distant one.
6. Legend, filter chips, pin colour, and list badge all follow the active layer.
7. Drawer "Price Trends" offers 4, 12, or 26 weeks; the backend returns that range.
8. Dashboard "Monitoring Activity" card and the `analytics` alias lead to GIS Monitoring; no copy mentions a nonexistent "Temporal Analytics" screen.
9. Prices always show the reference captured on the visit item. Nothing re-resolves history (rule in `docs/dti-monitoring-rules.md`).
10. Wording stays neutral: a flagged price or a distant visit is "to review", never a violation (`PRODUCT.md`, `docs/CURRENT-STATUS.md`).
11. Field officers get 403 from the new endpoint, as with `/admin/stores`.
12. Visit coordinates leave the API only when the Visit check layer asks for them, and each such response writes an audit event (`PRODUCT.md`: location evidence is private, authenticated, and audited). If the audit trail is unavailable, the coordinates are not returned.
13. The map never shows one week's pins under another week's label. The "Week of ..." label, pins, legend, and counts all come from the loaded payload; while a different week is being fetched the slider shows "Loading week of ..." beside the still-labelled loaded week, and a superseded request's response is discarded.
14. Switching layer, commodity, or loaded week redraws every pin (colour, price text, badge, popup label) and removes visit lines and circles when leaving Visit check.
15. Visit check classifies and draws only from a payload that carries coordinates for the loaded week. Until that response arrives the layer shows "Loading visit locations" with every pin grey; if it fails (including an unavailable audit trail) it shows "Visit locations unavailable" with a Retry button. It never reports `At registered pin` without coordinates.
16. Pin statuses and their colours: green, yellow, red, blue, grey. Prices uses green (`At or below reference`), yellow (`Above reference`), red (`Flagged`), blue (`Reference unavailable`), grey (no price that week). Coverage uses green, yellow (`Not monitored`), red (`Never monitored`), grey (inactive), with "Verification required" as a corner badge on the pin, not a colour. The badge appears only when the loaded week is the current week and the store has an open or claimed request; a historical week never shows it, because the flag describes today, not that week. Every colour is paired with a text label in the legend, chip, list badge, and popup.

## Approach

### Backend

**New `backend/app/Http/Controllers/Admin/GisMonitoringController.php`**, route `GET /admin/gis/monitoring` in `backend/routes/api.php` (inside the existing `admin` group).

- `AdminAuthorizationService::requireManager`. Inject `SrpCatalogService $catalog` and `AuditTrailService $audit` as method arguments, as `MonitoringRecordController` does.
- Query `week`: optional `date_format:Y-m-d`; the week is `MonitoringWeek::for()` of that date in `Asia/Manila` (reuse `backend/app/Support/MonitoringWeek.php`); default current week.
- Query `locations`: optional, validated with Laravel's `boolean` rule and read with `$request->boolean('locations')`. The client sends `locations=1` or omits it, never Axios's `true` (which serializes to the string `"true"` and fails that rule). The coordinate-bearing response carries `Cache-Control: private, no-store`, as `MonitoringRecordController::signature` sets for signature evidence. Only when true does each visit carry `latitude`, `longitude`, and `accuracy_meters`, and the request first calls `$audit->recordOrFail($request, 'gis.visit_locations_viewed', 'gis_monitoring', ['week' => <Monday date>, 'record_ids' => [...]])`, the pattern `MonitoringRecordController::signature` uses for signature evidence. Without the flag the response has no coordinates and writes no audit row, so ordinary map use does not flood the trail.
- One query for the week's accepted `MonitoringRecord`s with `officer:id,name` and `items.bulletin:id,commodity_name,unit,commodity_key`, ordered by `finalized_at` then `id`, grouped by store. That order is the single definition of "latest": `visits[]` is listed in it, and for each commodity the last visit in it supplies the price, so two visits with the same `finalized_at` resolve to the higher `id`.
- Stores: all, ordered by name, full attributes (so the drawer's `StoreRecord` still works), with `withExists` on `Store::routineMonitoringRecords` finalized before the week's **start** (`has_prior_routine_visit`) and on `Store::verificationRequests` with status open or claimed (`verification_required`). `routineMonitoringRecords` already limits to accepted visits without a verification request.
- Response `data`:
  - `week` `{key, ends_on, starts_at, ends_at, timezone, is_current}`. `key` is the week's Manila Monday as `Y-m-d` and `ends_on` its Manila Sunday as `Y-m-d`; `starts_at`/`ends_at` are the UTC instants from `MonitoringWeek::for()` (Sunday 16:00Z for a Manila Monday) and are informational only. The client compares and labels weeks by `key`/`ends_on` strings, formatting from the date parts, and never converts an instant in the browser's timezone.
  - `locations`: boolean, whether this payload's visits carry coordinates.
  - `weeks`: ascending week `key`s (Manila Monday `Y-m-d`) having an accepted visit, plus the current week. Derived in PHP from `pluck('finalized_at')` so it behaves the same on SQLite (tests) and Postgres (production). `ponytail:` comment naming the ceiling: full timestamp scan, move to SQL grouping at tens of thousands of visits.
  - `stores[]`: store attributes plus `has_prior_routine_visit`, `verification_required`, `visits[]` `{id, finalized_at, officer_name, is_routine, protocol_mode}` (every accepted visit in the week, routine or verification; plus the three location fields when `locations` is true), and `prices[]` `{commodity, commodity_name, unit, monitoring_record_id, recorded_price, reference_value, reference_type, reference_status, variance_percent, is_anomaly}`.
  - `commodity` is `$catalog->lineageKey($bulletin).'|'.lower(unit)`, the same like-with-like grouping `MonitoringRecordController::matrix` uses, so different units never share a row. When a store has several visits in the week, the latest visit's price wins, as in the matrix.
- Read-only apart from that audit row. No migration.

**Temporal range.** `TemporalAnalyticsController::show` validates `weeks` in `[4, 12, 26]` (default 4) and passes it to `TemporalAnalyticsService::forStore(..., int $weeks = 4)`, replacing the hard-coded `-4 weeks`.

### Frontend (`web/`)

No new dependencies: Leaflet 1.9 for polylines, circles and `distanceTo`; native `<input type="range">` for the slider; chart.js already present.

- `src/types/admin.ts`: `GisStoreRecord extends StoreRecord`, `GisMonitoringPayload`.
- `src/services/adminApi.ts`: `getGisMonitoring(week?, locations?)` sending `params: { week, locations: locations ? 1 : undefined }` and not wrapped in the file's `cached()` helper, so coordinates are never kept in the client cache; `getAnalytics(storeId, commodityKey?, weeks?)`.
- `src/components/admin/storeMapUtils.ts`: one `MAP_LAYERS` config. Each layer has `id`, `label`, `categories[] {id, label, status}` and `categoryOf(store, ctx)`. The Compliance layer wraps the existing `getStoreStatusInfo`. Add `visitDistanceMeters(store, visit)` via `L.latLng().distanceTo()` and `VISIT_REVIEW_METERS = 150` with a `ponytail:` comment (fixed threshold because store pins are hand-placed; promote to a `system_settings` `gis` key if DTI needs to tune it).
- `StoreMap.tsx`: optional `pinOf(store)` prop returning `{status, label, text?, badge?}` (default: current behaviour, so `StoreOnboarding` and existing tests are untouched); add `blue` and `grey` statuses and an optional corner badge; optional price text on the pin; optional `visitLinks` that draws polyline, accuracy `L.circle`, and popup per visit, cleared with the markers. The marker effect's dependencies grow from `[stores, selectedStoreId]` to include `pinOf` and `visitLinks`, so a layer or commodity change rebuilds pins even though the store array is unchanged. The popup receives the `pinOf` result in place of the hard-wired `getStoreStatusInfo` (`buildStorePopupContent` already takes the status object as a parameter; its type narrows from `ReturnType<typeof getStoreStatusInfo>` to the two fields it reads, `{ status: PinStatus; label: string }`, with `PinStatus = 'green' | 'yellow' | 'red' | 'blue' | 'grey'`).
- `StoreManager.tsx`: load `getGisMonitoring` instead of `getStores`, in one effect keyed on `[week, layer === 'visit_check']` that waits 300 ms before fetching and whose cleanup clears the timer and sets a `cancelled` flag, the pattern `StoreDetailOverlay.tsx` already uses. A dragged slider therefore sends one request, and a late response for an earlier week is ignored. `locations` is sent only while Visit check is active. Two pieces of week state, both week `key` strings: `targetWeek` (slider thumb, drives the fetch) and the loaded payload's `week.key` (drives the label and everything drawn). Visit check reads visits only when the loaded payload has `locations: true` for the loaded week; otherwise its `categoryOf` returns grey and no lines are drawn, with the loading or unavailable note from criterion 15. A failed fetch keeps the previous payload for the other layers but never satisfies Visit check. `pinOf` is a `useCallback` on `[layer, commodity, payload]` (the loaded payload object, which carries `week.is_current` and `locations`), so `StoreMap` redraws exactly when the layer, commodity, or loaded week changes. Each layer's `categoryOf(store, ctx)` receives `ctx = { commodity, week: payload.week, locations: payload.locations }`; the Coverage layer sets `badge: 'Verification required'` only when `ctx.week.is_current && store.verification_required`. Add the layer switch, week slider with a visible "Week of ..." label, commodity select (Prices only), and the price summary line. Replace the four hand-written chip buttons and the hard-coded legend with a map over the active layer's categories (net deletion of duplicated JSX).
- `admin.css`: blue and grey variants, the price text, and the corner badge beside the existing `.store-photo-pin-container.status-*` rules, and matching `.leaflet-store-status.status-blue` / `.status-grey` popup rules.
- `StoreDetailOverlay.tsx`: weeks select beside the commodity select; heading reads `{weeks}-Week Price History`.
- `AdminPanels.tsx` (dashboard card copy and button target), `AdminShell.tsx` (`gis_monitoring` description; `analytics` alias to `gis_monitoring`).

### Docs

Add a 2026-10-03 entry to `docs/DECISIONS.md`: temporal analytics is the time dimension of GIS Monitoring, not a separate module; Coverage counts any accepted routine visit in the week.

## Key decisions and trade-offs

- **Dedicated endpoint, not the matrix.** `matrix` lacks coordinates and captured references and groups weeks with the app timezone instead of Manila weeks. A small read endpoint is cleaner than widening a 700-line controller's export contract.
- **Coverage counts routine visits of any protocol.** Field Monitoring's weekly counter counts standard-protocol visits only, so it ignores daily Price Freeze visits. For a historical week slider that would show freeze weeks as unmonitored. In normal weeks both agree; a test pins that.
- **Distance on the client.** Display-only, one Leaflet call, unit-tested with fixed coordinates. Move server-side only if it ever feeds a decision.
- **Coordinates behind a flag, audited.** One endpoint with an opt-in `locations` flag instead of a second endpoint. Auditing every map load would bury the trail; never auditing would break the product's location-evidence rule.
- **One week per request.** Switching commodity is instant (client-side); switching week refetches a small payload.

## Non-goals

Barangay boundaries or choropleth, clustering, heatmaps, routing, live officer tracking, a standalone Temporal module, migrations, new npm or composer packages, changes to the consumer, field, or vendor PWAs, commit, push, or deploy.

## Assumptions and risks

- Store count is small (`CapstoneMonitoringSeeder` expects 3 to about 10), so no clustering and a per-week payload stays tiny. Source: `backend/database/seeders/CapstoneMonitoringSeeder.php`.
- Registered pins are hand-placed (`StoreOnboarding.tsx`), so "Location to review" may reflect a wrong pin, not a wrong visit. Mitigation: neutral wording, accuracy subtracted, popup shows both numbers.
- Seeded visits may sit exactly on the store pin, making Visit check look uniform in demos.
- `VITE_CARTO_BASEMAP_KEY` must be set for tiles (existing behaviour).
- Coverage will differ from Field Monitoring's weekly counter during Price Freeze weeks, by design.

## Verification

```bash
cd backend && php artisan test --filter="GisMonitoringMapTest|GisStoreDetailTest"
```
New `tests/Feature/GisMonitoringMapTest.php`: week resolves in Manila time (visit at Monday 01:00 Manila lands in that week, and `week.key` is that Monday while `starts_at` is the preceding Sunday 16:00Z); `locations` is false without the flag and true with it; monitored / not monitored / never monitored, including a store whose only visit is a verification visit (never monitored, in that week and later ones) and agreement with `weekly_routine_status` in a normal week; verification flag; without `locations` no visit has coordinates and no audit row is written; with `locations=1` coordinates are present, one `gis.visit_locations_viewed` row exists, and the response header is `Cache-Control: private, no-store`; `locations=true` is 422; two visits with the same `finalized_at` and different prices resolve to the higher `id`; price row carries the captured `reference_value` after the bulletin is revised; latest visit wins; `weeks` list; invalid `week` is 422; field officer is 403. `GisStoreDetailTest` gains a case where `weeks=12` returns a 10-week-old row that `weeks=4` omits, and `weeks=5` is 422.

```bash
cd web && npx vitest run src/components/admin/storeMapUtils.test.ts src/components/admin/StoreMap.test.tsx src/components/admin/StoreManager.test.tsx src/components/admin/StoreDetailOverlay.test.tsx
```
```bash
cd web && npm run build
```
```bash
cd web && npm run lint
```
New `storeMapUtils.test.ts` (category per layer; 150 m rule with accuracy subtracted; a week with one distant and one accurate visit is `Location to review`) and `StoreManager.test.tsx` (layer switch changes chips and legend; slider refetches with the chosen week; `locations` is requested only in Visit check; the request carries `locations: 1`, not `true`; when week A's response resolves after week B's, B's stores stay on screen; after selecting week B and before its response, the label still names week A beside a loading note, and reads "Week of" the Manila Monday from `week.key` whatever the browser timezone; entering Visit check shows the loading note with grey pins until the `locations` payload arrives; a rejected `locations` request shows the unavailable note and Retry, never `At registered pin`). `storeMapUtils.test.ts` covers all five Prices categories mapping to five distinct statuses, and the same store with `verification_required` getting the badge in the current week and none in a historical week. `StoreMap.test.tsx` adds: after a layer switch the pin class and price text change and the popup shows the active layer's label; leaving Visit check removes the lines and circles.

Existing tests to update: `StoreMap.test.tsx` renders `StoreManager` with only `adminApi.getStores` mocked, so its mock and fixtures move to `getGisMonitoring` (same stores, wrapped in the new payload). `StoreDetailOverlay.test.tsx` asserts `getAnalytics(9)`; it becomes `getAnalytics(9, undefined, 4)` and gains a case for choosing 12 weeks. Expected: all pass, `tsc -b` clean.

Manual, in the browser preview against a seeded local backend: switch all four layers, drag the slider across weeks, pick a commodity and confirm pin prices match the Field Monitoring matrix for that week, open a visit popup and check distance, change the drawer range to 12 weeks, follow the Dashboard card to GIS Monitoring.

## Steps after this plan is approved

Plan mode blocks these now; approval of this file authorizes steps 1 to 4 only.

1. Copy this plan to `docs/plans/gis-monitoring/PLAN.md`; start `PLAN-REVIEW-LOG.md` (roles, scope, authorization, round limit).
2. Per `AGENTS.md`: back up `~/.codex/config.toml` outside the repo, record SHA256, set `enabled = false` on every `[mcp_servers.*]` table and the listed write/outbound plugins.
3. Run the claudex runner in `review` mode with `py -3.13` (PATH `python` is 3.9; the runner needs 3.10+), `--host claude --repo C:\CAP101_DTI_SYS --plan docs/plans/gis-monitoring/PLAN.md`, artifacts in the session scratchpad. After each call, restore the config byte-for-byte and confirm the SHA256. Arbitrate findings, log dispositions, resume the same session, up to 5 rounds; run `check` on the final plan hash.
4. Stop and present the reviewed plan, changes made, and remaining limits for sign-off. No build, commit, push, or deploy.
