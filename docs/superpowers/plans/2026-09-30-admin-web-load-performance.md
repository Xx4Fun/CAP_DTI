# DTI Admin web: faster module loading

## Context

User reports some Admin modules are very slow to load or show data. Audit (frontend, backend
endpoints, infra) plus live probes found the causes stack:

- **Server CPU**: Render service `CAP_DTI` is `plan: free`, CPU limit **0.15 vCPU** (Render metrics).
  Region singapore = Supabase `ap-southeast-1`, so no cross-region penalty. Live: `/up` ~330 ms,
  DB-backed public endpoints 0.45-1.2 s. Every query and every request is CPU-throttled, so query
  count per request dominates. Free plan also sleeps after ~15 min idle (30-60 s cold start).
- **Too many queries per request** (verified in source):
  - `GET /admin/reports` builds each row via `ReportReviewController::reportRow`: per item a
    duplicate SRP lookup (`TemporalSrpResolver` + `FieldReferenceResolver`) + emergency query, and
    per report `Storage::disk($asset->disk)->exists()` = HTTP HEAD to Supabase Storage (s3 driver)
    (`ReportReviewController.php:216-218`). ~300+ queries + ~20 HTTP calls per 20-row page.
  - `Schema::hasTable/hasColumns` catalog queries on hot paths (`AdminOverviewController.php:19`,
    `AuditTrailService.php:74`, `SrpCatalogService.php:20`). Out of scope: they back fail-closed contracts.
  - Sanctum writes `last_used_at` on every GET.
- **Frontend waste** (verified):
  - `FieldMonitoringRecords.tsx:8` statically imports exceljs, so that chunk is **1.0 MB**
    (`dist/assets/FieldMonitoringRecords-*.js`), needed only on Export click.
  - Dashboard fetches all stores + 20 full report rows (the expensive endpoint above) then `.slice(0, 4)`
    (`AdminPanels.tsx:57-58`).
  - `App.tsx:81` waits on `/health/ready` before `/admin/session` before any module fetch.
  - `AdminShell.tsx:177` fetches every emergency with relations just for a header badge.
  - No caching between module visits; `getStores()` refetched by 4 modules.
  - CORS `max_age => 0` (`config/cors.php:30`): every cross-origin API call pays an extra OPTIONS preflight.

## Approach (ordered by payoff per line changed)

### A. Frontend (web/)
1. Lazy exceljs: in `FieldMonitoringRecords.tsx` drop static import (line 8); at export handler use
   `const { exportMonitoringMatrixExcel } = await import('../../utils/monitoringExcelExport')`.
2. Dashboard: `AdminPanels.tsx:58` use `adminApi.getReportPage({ page: 1, per_page: 4 })` and store
   `page.data` (getReportPage returns `{data, meta}`, not an array; `adminApi.ts:154-171`); failure keeps
   the existing empty/catch behaviour. Stores: add `recent_stores` (4 rows, columns the card renders:
   id, store_name, dti_sec_number, address, is_active) to `/admin/overview`; stop calling `getStores()` there.
3. Header badge: `AdminShell.tsx:177` use a new `active_emergency` boolean (single `exists()` query) on a
   small endpoint or the overview payload, instead of full `getEmergencies()`. Keep the three states
   (active / normal / unavailable on error).
4. Boot: `App.tsx:81` stop chaining `/admin/session` behind `ensureApiReady()`; call it immediately.
   `ensureApiReady` is already a shared in-flight gate (`apiReadiness.ts` `createReadinessGate`), so the
   `App.tsx:58` probe stays (drives the cold-start toast) but now runs in parallel, not in series. On a
   network error (no `error.response`) await `ensureApiReady()` and retry the session call once.
   `Login.tsx:32` unchanged: it keeps awaiting the shared readiness gate before POST `/login`. No automatic
   login retry, because an ambiguous network failure may already have created a Sanctum token that a
   retry would orphan (`AuthController.php:55-59`, Codex R3-01). The gate is usually already resolved by
   the boot probe; during a cold start the wait is inherent.
5. Tiny promise cache in `adminApi.ts` (module-level, 60 s TTL) for `getStores` and `getAnalyticsOptions`.
   Invalidation is global, not per-method: an axios response interceptor in `api.ts` clears the whole
   cache after any non-GET request (covers `StoreOnboarding.tsx:247` direct `api.post`, SRP edits, store
   edits). Rejected promises are evicted immediately. Cache cleared on logout / `clearAdminSession`.
   No new dependency.
6. `StoreManager.tsx:64-78` wrap `filteredStores`/`counts` in `useMemo` (stops map markers rebuilding each keystroke).
7. Lazy `StoreDetailOverlay` (chart.js) from StoreManager inside its own local `<Suspense>` with a
   sidebar-sized skeleton fallback, so the map stays visible while the chart chunk loads (Codex R2-04); lazy `StoreOnboarding` fallback in `UserManagementPanel.tsx:27` (leaflet).

### B. Backend (backend/)
1. `config/cors.php:30` `'max_age' => 7200`.
2. Reference resolution in `GET /admin/reports` (no container singletons; no binding changes, so each
   request gets fresh instances; verified `AppServiceProvider` binds only `ReceiptExtractor`):
   - `ReceiptPriceComparison::referenceFor` memoizes per instance, key = commodity_key + exact
     observation instant (ISO-8601 with time), not date. Same inputs within one request = same output.
   - `FieldReferenceResolver::effectiveEmergency` memoizes per instance keyed by exact instant
     normalized exactly like `MonitoringPeriod::effectiveEmergency` parses it:
     `CarbonImmutable::parse($at, MonitoringWeek::TIMEZONE)->utc()->toIso8601String()` (Asia/Manila for
     date-only strings), shared by `resolve()` and `protocolAt()` on the same instance. The
     `referenceFor` key uses the same normalization. Test: mixed date-only and timestamp inputs across a
     declaration `confirmed_at` get different results (Codex R2-01).
     Exact-instant key keeps two visits on either side of a same-day declaration distinct (Codex F1).
   - `FieldReferenceResolver::resolve` gains optional `bool $bulletinIsEffective = false`; when true it skips
     the re-query (the TemporalSrpResolver query is identical: same commodity_key, `whereDate <=`,
     order effective_date desc, id desc). Only `ReceiptPriceComparison` passes true.
3. Evidence availability without per-row Storage HEADs (Codex F2):
   - List rows (`index`) keep the exact, cheap legacy check (`Storage::disk('local')->exists(image_vault_path)`)
     but use DB asset presence for bundle/attempt assets, and add `evidence_verified: false`.
   - Detail/decision responses (`reportRow` caller at line 252) keep full file verification with
     `evidence_verified: true`. `AdminReceiptEvidenceTest` legacy-missing-file case stays false.
   - Web (`CitizenTipReview.tsx`): when `evidence_verified === false`, the Download button renders only
     after an asset has actually loaded; a failed manifest/asset load shows "Evidence file unavailable"
     instead of a blank pane. Real existence is still enforced at download (`ReportReviewController.php:492`).
   Dropped (Codex F3): removing `Schema::has*` checks. They back fail-closed availability contracts
   (`AdminSrpAvailabilityTest`, `AdminAuthorizationAndAuditTest`); saving 1-3 queries is not worth it.
4. Sanctum: custom `PersonalAccessToken` model skipping `last_used_at` save if updated < 60 s ago
   (idle timeout in `AppServiceProvider.php:69-92` still works at 60 s granularity).
5. `MonitoringRecordController.php:300-309`: derive complement counts (8 -> 6 queries);
   `UserManagementController.php:33-36`: 4 counts -> 1 `selectRaw ... filter (where ...)`.
6. `docker-entrypoint.sh:8-9` -> `php artisan optimize` (no `|| true`); opcache ini
   `validate_timestamps=0`; `LOG_LEVEL=warning` in render.yaml; queue worker `--sleep=5`.

### C. Hosting
User decision: stay on free plan. No billing or render.yaml `plan` change.

## Execution (user decisions 2026-09-30)

- Scope: A + B. Claudex loop: Codex reviews plan (copy at
  `docs/superpowers/plans/2026-09-30-admin-web-load-performance.md`), Claude builds, fresh Codex inspects.
- Codex config guard per AGENTS.md (backup + SHA256, disable MCP/write plugins, restore + verify) around every Codex call.
- TDD where logic changes (query-count test for reports, count derivations, token save skip).
- Commits local only after verification; no push (push = production deploy) without explicit approval.

Non-goals now: new indexes (tables tiny; advisor shows FK lints only), Vercel `/api` proxy,
conversation polling redesign, Font Awesome removal, react-query adoption.

## Verification

- `cd web && npx vitest run` (compare with the 4 known pre-existing failures) and `npx tsc -b --noEmit`;
  `npm run build`: FieldMonitoringRecords chunk drops from ~1.0 MB to <150 KB, exceljs in its own chunk.
- `cd backend && php artisan test` (ReportReview, Overview, MonitoringRecord, UserManagement, Srp, Audit tests).
- Query-count check (Codex F6): feature test seeding 20 reports x 5 items over varied commodities and
  dates, `DB::enableQueryLog()` around `GET /admin/reports`. Budget scales with unique keys, not a flat
  ~20: queries <= fixed overhead (eager loads + paginate + counts + auth, ~15) + up to 2 emergency
  lookups per distinct normalized instant (the controller's `protocolAt` resolver and the comparison's
  resolver are separate instances; Codex R2-02) + 1 SRP per distinct (commodity, instant) pair + 1 price
  record per emergency-governed pair.
  Assert the count is below the pre-change count measured in the same test fixture. Bundle-asset
  `exists()` must not be called in `index`: Mockery spy on the evidence disk, assert `exists` never
  received. Separate test: resolver returns different references for visits before/after a same-day
  declaration `confirmed_at`.
- After deploy (only with user approval; push to main auto-deploys Render + Vercel): re-run curl timings
  and Network tab on dti-admin-1.vercel.app for Dashboard, Consumer Reports, Field Monitoring.
