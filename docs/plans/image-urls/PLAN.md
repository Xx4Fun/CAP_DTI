# Plan: one image rule for all public images — fix consumer product images

Repo copy after plan mode: `docs/plans/image-urls/PLAN.md` (+ `PLAN-REVIEW-LOG.md`), matching existing `docs/plans/*` convention.

## Context

DTI Admin › Price Regulation › Add item uploads a photo. Admin shows it; customer PWA shows "No image". User also wants one consistent way all images work.

Root cause (verified in code + live 2026-10-03):
- Upload: `POST /admin/srp/upload-image` → `CommodityImageStorage::store()` saves `commodity_images/<random40>.webp` on disk `COMMODITY_IMAGE_DISK`. Production disk = public Supabase bucket `commodity-images` (live URLs `https://rvatqhywtgyehigslyox.supabase.co/storage/v1/object/public/commodity-images/<key>`).
- `GET /public/commodities` (`PublicCommodityController::formatImageUrl`) correctly returns that absolute URL in `image_path`.
- `customer-pwa/src/api/client.ts:261` `resolveImageUrl` (commit 26a0d9a) regex-rewrites **any** value containing `commodity_images/<file>` — including absolute URLs — to bundled `/storage/commodity_images/<file>`. Only 119 seed files are bundled; uploaded hashed names 404 → placeholder.
- Admin works because `CommodityThumbnail` (`web/src/components/admin/SrpManagementPanel.tsx:91`) tries server `image_url` first, then the bundle.
- Why 26a0d9a existed: bucket holds only 5 objects (admin uploads). The 114 seeded keys the DB references were never uploaded (Supabase 400). Live HEAD check: 114×400, 1×200 (`78OSzUp6…webp`, the user's new item).

Store images (live DB, 10 rows): all point to bundled `/stores/*.webp` (5 real photos, 5 generic `/stores/store.webp`). Bundled copies duplicated across 4 apps; admin upload would instead save an absolute Supabase URL (different convention); vendor app guesses photos by store name; each app has its own resolver.

User decisions (2026-10-03): backfill bucket; unify stores too; keep customer bundles only for its offline fallback data; delete admin commodity bundle; no "replace store photo" feature now.

## The rule (→ DECISIONS.md)

1. **Bucket is source of truth for public images** (commodity + store photos): disk `COMMODITY_IMAGE_DISK` (prod Supabase public bucket `commodity-images`). DB stores the object key (`commodity_images/<file>`, `store_images/<file>`); legacy absolute URLs stay valid.
2. **Backend builds URLs, once**: `CommodityImageStorage::publicUrl()`. Every API field a client renders as `<img src>` is a browser-loadable URL or `null`.
3. **Clients never rewrite URLs**: render as given; `null`/error → placeholder (`/stores/store.webp` for stores, icon for commodities). Bundled files are UI placeholders only, except the customer PWA's offline fallback data (`srpFallback.ts`, fallback stores in `client.ts`).
4. **Private evidence unchanged**: receipts, signatures, legal docs, message attachments stay private keys + authenticated streams. Never public URLs.

## Steps

### 0. Upload missing objects to production bucket (owner-approved prod storage write; before any deploy)
- Commodity: `customer-pwa/public/storage/commodity_images/*.webp` → key `commodity_images/<filename>` (keys DB already holds).
- Store: `customer-pwa/public/stores/{gaisano-grand,licandas-branch-1,licandas-branch-2,merrymart,robinsons}.webp` → key `store_images/<filename>`.
- Scratch script outside repo (scratchpad): Supabase Storage REST `POST /storage/v1/object/commodity-images/<key>`, `Content-Type: image/webp`, no upsert (existing keys skipped, nothing overwritten/deleted). Service key read from an env var the user sets; never written to files/logs. Fallback: user uploads via Supabase dashboard.
- Preflight (IMG-03): `select image_path, count(*) from stores group by 1` on the target DB. Every distinct `/stores/...` value must be in the migration map below (prod 2026-10-03: exactly `/stores/store.webp`×5 and the 5 mapped photos). Any unmapped value blocks rollout until it is added to the map and its photo uploaded.
- Verify: HEAD every live commodity `image_path` + the 5 store keys → 200. Gate for deploying steps 1–3 (backend migration runs on boot via `docker-entrypoint.sh`).

### 1. Backend
- `app/Services/CommodityImageStorage.php`: add `publicUrl(?string $stored): ?string` — empty → null; `http(s)://` → as-is; else strip leading `/` and `storage/`, disk `url()`; upgrade `http://`→`https://` when request secure / `X-Forwarded-Proto: https` / production (logic moved from `PublicCommodityController::formatImageUrl` and `StoreAdminController::publicImageUrl`, which are deleted/reduced).
- `publicUrl` accepts only (a) an object key matching `CommodityImageStorage::KEY_PATTERN` = `#^(commodity_images|store_images)/[A-Za-z0-9._-]+$#` (legacy `/storage/` or `storage/` prefix stripped first) and (b) absolute `http(s)` URLs. Anything else (e.g. unmapped `/stores/...`, `/products/x.png`) → `null`, so the API contract is strictly absolute-URL-or-null and clients show their placeholder (IMG-03, R2-03).
- Write validation (R2-03, R3-02): `image_path` on `SrpManagementController` store / updateMetadata / validateRevision and each `SrpImportService` item must be (a) null, (b) unchanged from the stored value of the row/lineage being edited or revised (legacy absolute URLs survive resubmission), or (c) a `KEY_PATTERN` key that `exists()` on the configured disk (checked once per distinct key). New external URLs are rejected. Otherwise 422 / import ValidationException. One helper `CommodityImageStorage::assertWritable(?string $new, ?string $current)` used by all four writers.
- `updateMetadata` (R4-01): when the request omits `image_path`, the lineage update excludes `image_path` entirely (no change); only an explicit value (key or explicit `null` to clear) is written. Today `$data['image_path'] ?? $srp->image_path` writes null across the whole lineage when the edited row has no photo but history does. Regression test: null current image + photographed historical revision, metadata-only edit keeps every stored reference and the public catalog still inherits the photo. Prod rows checked during preflight (all current values are `commodity_images/...` keys).
- **Stores — one choke point**: `app/Models/Store.php` accessor on `image_path` → `publicUrl(raw)`. All emitters (`PublicPwaController::formatPublicStore`, `FieldDataController:96`, `VendorPortalController:40`, `MonitoringRecordController:361,505`, `StoreAdminController::index/update`) use `getAttribute`/`only`/`toArray` → get URLs automatically. Verify no read-modify-write of `stores.image_path` exists (none found).
- `StoreAdminController::store`: save the stored **key** (not URL); default `null` (was `/stores/store.webp`); keep fail-closed check that `publicUrl(key)` is an absolute non-localhost URL in production.
- Migration `…_store_image_paths_to_bucket_keys`: `/stores/{gaisano-grand,licandas-branch-1,licandas-branch-2,merrymart,robinsons}.webp` → `store_images/<file>`; `/stores/store.webp` → `null`; other values untouched. `down()` maps the five `store_images/<file>` keys back to `/stores/<file>` and leaves `null` unchanged (cannot tell migrated rows from genuinely photo-less ones; placeholder renders the same) (IMG-04). `down()` is only valid together with reverting this change's code (R4-02): rollback = revert the commit(s) (restores old resolvers and bundled `/stores/` assets in all apps), redeploy backend + apps, then `migrate:rollback --step=1`. Documented in DECISIONS entry.
- `OfficialEstablishmentSeeder`: same keys / null.
- **Commodities** (explicit calls; no accessor because lineage copy paths read `image_path` raw): `PublicCommodityController` uses `publicUrl`; `Admin/SrpManagementController::index` uses `publicUrl` (+ `image_url` on `store()`/`updateMetadata()` responses); every comparison `product` payload gains `image_path` via `publicUrl` — manual compare-price in `PublicPwaController` (~line 696) **and** `Services/Ocr/ShelfTagComparisonService::compare()` (~line 47; used by OCR auto and scan comparison routes, `PublicPwaController:393,628`) (IMG-01); customer recent comparisons already read `product.image_path` (`recentComparisons.ts:80`); scan-tag `candidates` mapped through `publicUrl`.
- Image inheritance stays inside one commodity lineage (R2-02): `SrpManagementController::batchRevisions:217-224` and `PublicCommodityController` borrow map (lines 23-49) both resolve the fallback image in two exact steps instead of `commodity_key OR commodity_name` (R3-01): (1) newest row with an image and the same non-null `commodity_key`; (2) else newest row with an image and identical `commodity_name` + `unit` + `category` (covers keyless history such as master-list display names, without crossing category-split lineages). `lineageKey()` slugging is not used (keyless display names can slug differently from the keyed row). Removes the precedence bug and cross-lineage photo borrowing (e.g. Argentina 150g corned beef vs meat loaf; same-name rows with different units). Tests cover duplicate names with different units/categories, null keys, and a mixed keyless-history → keyed-current lineage that must inherit the photo. Verification compares API image coverage before/after; any item that loses a photo must be explained (expected: only wrongly borrowed ones).

### 2. Customer PWA
- `src/api/client.ts` `resolveImageUrl`: absolute `http(s)` first → as-is; remove URL-rewrite regex; relative `commodity_images/<file>` (offline fallback catalog only) → `/storage/commodity_images/<file>`; keep static-prefix and API-origin branches.
- Keep `public/storage/commodity_images/` and `public/stores/` (offline fallback data); comment why.
- `components/MoreView.tsx:401` recent comparisons (IMG-02, R2-01): render the saved `item.imagePath` only; remove the `fallbackCommodities` lookup entirely (fallback IDs are not live IDs and names are not unique). Comparisons saved before this change have no image and show the placeholder; new ones carry the API URL.
- `client.test.ts`: absolute Supabase/Render URLs unchanged; relative key → bundle; static paths unchanged.

### 3. DTI Admin web
- `SrpManagementPanel.tsx`: delete `resolveCommodityImageUrl`; `CommodityThumbnail` renders `imageUrl` only, icon on error.
- Delete `web/public/storage/commodity_images/` and store photos in `web/public/stores/` except `store.webp` placeholder.
- `FieldMonitoringRecords.tsx:589-597,674`: placeholder check becomes `!store.image_path`. `StoreDetailOverlay`, `StoreMap`, `UserManagementPanel` already `image_path || placeholder` — unchanged.
- Update tests: `SrpManagementPanel.test.tsx:128` (no bundle fallback), store fixtures using `/stores/robinsons.webp` → absolute URLs.

### 4. Field Officer + Vendor PWAs
- Vendor `src/app/storeImage.ts`: `resolveStoreImage` → `store?.image_path?.trim() || '/stores/store.webp'`; delete name guessing. Delete bundled store photos except `store.webp`.
- Field `App.tsx:1453` unchanged (renders URL, hides on error). Delete bundled store photos except `store.webp` if referenced, else all. Add workbox `runtimeCaching` CacheFirst for `/storage/v1/object/public/commodity-images/` (cache `public-images`, maxEntries 100, 30 days, statuses [0,200]) so seen store photos work offline.
- Update fixtures in `AppSecurity.test.tsx`.

### 5. Docs (Obsidian vault)
- `docs/DECISIONS.md`: top entry "2026-10-03 — One public image rule" (rule, root cause, upload prerequisite).
- `docs/CURRENT-STATUS.md`: prod public images in Supabase bucket `commodity-images` (public, webp/jpeg/png, 2 MB); seed commodity + store photos must be uploaded for any new environment (source folders named); disk chosen by Render dashboard `COMMODITY_IMAGE_DISK` (not in `render.yaml`); local dev copies files into `backend/storage/app/public/{commodity_images,store_images}`.
- `docs/customer-pwa-api.md`: `image_path` in commodities, compare-price product, scan-tag candidates, stores is an absolute URL or null.
- `docs/PROJECT-MAP.md`: backend line → `CommodityImageStorage::publicUrl` owns public image URLs.
- `docs/plans/image-urls/PLAN.md` + `PLAN-REVIEW-LOG.md`.

### Non-goals
- No `image_path`→`image_url` rename in public APIs. No replace-store-photo feature. No change to private evidence. No customer runtime image cache (needs network for live catalog anyway).

## Verification
- Backend: `cd backend && php artisan test --filter="AdminSrpManagementTest|StoreAdmin|PublicPwa|PublicCommodity|FieldData|VendorPortal"` then full `php artisan test`. New/extended tests: `publicUrl` (null, key, absolute, https upgrade); public catalog key→URL; Store accessor emits URL for key, passes absolute, null stays null; store create saves key; migration up/down rewrites only listed values; compare-price product has `image_path`; batchRevisions inherits lineage image.
- Frontends: `npx vitest run` + `npm run build` in `customer-pwa`, `web`, `field-officer-pwa`, `vendor-pwa`.
- Live after upload: HEAD all commodity `image_path` URLs and 5 store keys → 200.

### Image sweep — "every image still shows, no image errors"
Run three times: **baseline** (before any change, record current broken count), **local** (after build, before deploy), **production** (after deploy). Results tabled in `docs/plans/image-urls/PLAN-REVIEW-LOG.md`.

1. **API sweep** (scratch script, scratchpad, not committed): fetch `GET /public/commodities`, `GET /public/establishments`; collect every non-null `image_path`; HEAD each (GET fallback if HEAD refused). Pass = every URL `200` with `Content-Type: image/*`, zero relative/localhost/`http://` URLs in production. Also report items with `image_path: null` (expected: the 48 commodities with no photo, stores with no photo) so "no photo" is distinguished from "broken photo".
2. **Browser sweep per app** (in-app browser): on each screen, scroll to the end so lazy images load, then run in page
   `[...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src)` → must be `[]`;
   `read_network_requests` → no image request with status ≥ 400; `read_console_messages` (errors) → no image-load errors.
   Also count placeholders shown (`srp-commodity-thumb-fallback`, "No image" fallback) and match them to the null-image list from step 1 — any placeholder for an item that has a URL = failure.
   Screens:
   - Customer PWA: Prices list (all items), product detail of the newly added item + one seeded item, store selection, recent comparisons, offline fallback (DevTools offline / API blocked → fallback catalog still shows bundled photos).
   - DTI Admin: Price Regulation (every page, current + history views), Add/Edit item modal after uploading a test image locally, store map popups, store detail overlay, Field Monitoring Records, User Management store list.
   - Field Officer PWA: assigned store list; then offline reload → previously seen store photos still show (runtime cache).
   - Vendor PWA: compliance scorecard store photo.
3. **Where each sweep runs**:
   - Local: backend `php artisan serve` with local public disk (seed files copied into `storage/app/public/{commodity_images,store_images}`). Add `.claude/launch.json` entries (IMG-05): `backend-dev` (`php artisan serve --port 8000`), `customer-dev` / `field-dev` / `vendor-dev` (`npm --prefix <app> run dev -- --port <p> --strictPort`) beside existing `web-dev`, each pointed at the local API via `VITE_API_BASE_URL`. Field offline check runs on a **built preview** (`npm --prefix field-officer-pwa run build && npm --prefix field-officer-pwa run preview -- --port 4175 --strictPort`, launch entry `field-preview`) because the dev server has no service worker. Authenticated apps use seeded local test accounts.
   - Production: API sweep + customer PWA (public) by Claude. Admin/Field/Vendor production screens need a signed-in session: Claude runs the same page script only in a browser tab where the user is already signed in; Claude never enters production passwords.
4. **Pass criteria**: zero broken images in every app, zero image 4xx/5xx, placeholders only where API `image_path` is null, new item photo visible in both admin and customer. Any failure blocks "done" and is logged with URL + screen.

## Claudex loop
- Host Claude coordinates; Codex reviews `docs/plans/image-urls/PLAN.md` (runner `review`, ≤5 rounds); Claude builds; fresh Codex `inspect` of diff.
- Before each Codex call: back up `~/.codex/config.toml` outside repo + SHA256; disable `[mcp_servers.*]` and listed write plugins; restore byte-for-byte after, verify SHA256 (AGENTS.md).
- No commit/push/deploy/migrate-prod without explicit approval. Bucket upload (step 0) needs explicit go at run time.
