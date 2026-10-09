# Admin Field Monitoring Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native implementation is recommended because the tasks share the existing monitoring component and API contract; preserve unrelated work throughout.

**Goal:** Reduce Field Monitoring's photo transfers and repeated requests while letting profile information appear without waiting for its visit table.

**Architecture:** Preserve the current local two-request profile design and existing Laravel endpoints. Add packaged, immutable photo thumbnails only to Admin monitoring summaries through the shared image URL service, then load profile and visits independently and reuse session-scoped reads briefly through the existing response cache.

**Tech Stack:** Laravel 13 / PHP 8.3, configured Flysystem public image disk, React 19 / TypeScript, Axios, Vitest / Testing Library, PHPUnit, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-admin-field-monitoring-loading.md`

## Global constraints

- Plan only as of 2026-10-10. No application code or production configuration was changed to create this plan.
- Start from the existing local Field Monitoring work; do not replace it with deployed `09742cf` source. Preserve all unrelated dirty changes.
- Admin Field Monitoring only. All ten original photos, store assignments and other client API contracts remain unchanged.
- Card copies: maximum width 640 pixels, no upscaling, original aspect ratio, no new crop, no removal of storefront signs or watermarks.
- Thumbnail keys: `store_images/<store-slug>-card-<output-sha256-prefix>.webp`, at least 12 hash characters. Cache header: `public, max-age=31536000, immutable`.
- Monitoring cache: 15 seconds, memory-only, maximum 100 entries, session plus full parameter keys, no cached private evidence or audited reads.
- No schema migration, full seeder, new query library, paid storage transformation, hosting upgrade or additional CDN.
- Commits, push, deployment and production asset writes require explicit approval for this optimization release. The previous photo release approval is not blanket authorization for this work.

## Review focus

- Slow/failed visits: profile remains usable; table shows its own loading/error and Retry (Task 2).
- Fast store/filter navigation: late responses cannot replace newer data (Tasks 2 and 3).
- New or replaced photos: an unmapped image uses its original; a failed thumbnail falls back without loops (Task 1).
- Logout, writes and regulatory changes: cached responses cannot cross sessions or conceal a required fresh read (Task 3).
- Backend/frontend deployment order: old clients ignore the optional field, new clients handle it being absent, and missing objects never block the directory (Tasks 1 and 4).

## Task 1: Smaller immutable directory photos

**Files:**
- Modify `backend/app/Services/CommodityImageStorage.php` to resolve optional card-photo URLs using a reviewed manifest and existing `publicUrl()`.
- Modify the establishment summary only in `backend/app/Http/Controllers/Admin/MonitoringRecordController.php`.
- Create `backend/app/Console/Commands/ImportMonitoringThumbnails.php`.
- Create `backend/database/seeders/monitoring-store-thumbnails.json` and `backend/database/seeders/monitoring-store-thumbnails/` containing ten generated WebPs.
- Create `scripts/generate-monitoring-store-thumbnails.py` for reproducible offline generation using the already installed Pillow 11.3.0; no production Python dependency.
- Create `backend/tests/Feature/ImportMonitoringThumbnailsTest.php`; extend `backend/tests/Feature/PublicImageRuleTest.php`.
- Modify `web/src/types/admin.ts`, `web/src/components/admin/FieldMonitoringRecords.tsx` and its adjacent test.

**Interfaces:**
- Consume `Store::getRawOriginal('image_path')` and `CommodityImageStorage::publicUrl(?string $stored): ?string`.
- Produce `CommodityImageStorage::storeCardUrl(?string $stored): ?string` and optional `MonitoringEstablishmentSummary.card_image_url?: string | null`.
- Produce `stores:import-monitoring-thumbnails`, preview by default, `--apply` for upload only; no store or audit-table writes.
- Manifest schema: `version: 1`, `images: [{store_name, source_key, source_sha256, thumbnail_key, thumbnail_sha256, width, height, bytes}]`. All paths must match the existing flat `store_images/` key rule.

- [ ] **Step 1 — Write failing import/API tests.** Fake the configured image disk. Assert preview writes nothing; apply verifies all ten bytes and correct WebP/cache metadata; repeated apply performs no writes; missing/duplicate stores, wrong original key/hash, invalid/oversized files and conflicting objects fail before writes. Failed upload/readback must not advertise success. Snapshot every store attribute and audit count before/after.

  API regression example:

  ```php
  $store = Store::create([
      'store_name' => 'CPT Mart- Antique Branch', 'address' => 'Existing address',
      'latitude' => 10.747, 'longitude' => 121.9422,
      'image_path' => 'store_images/cptmart.jpg',
  ]);
  $url = app(CommodityImageStorage::class)->storeCardUrl($store->getRawOriginal('image_path'));
  $this->assertNotNull($url);
  $this->assertSame('store_images/cptmart.jpg', $store->fresh()->getRawOriginal('image_path'));
  $this->assertNull(app(CommodityImageStorage::class)->storeCardUrl('store_images/new-upload.jpg'));
  ```

- [ ] **Step 2 — Confirm the intended red result.** From `backend/`, run `php artisan test --filter="ImportMonitoringThumbnailsTest|PublicImageRuleTest"`. The new command/method should be missing before implementation.

- [ ] **Step 3 — Prepare ten reviewed assets.** Five supplied JPGs are in `backend/database/seeders/store-source-images/`. The older five WebPs are absent from that source directory: acquire their exact bytes through the currently assigned public URLs into an ignored scratch directory, record source SHA256, and verify names/keys against current production. Do not substitute lookalike files or overwrite originals. Use Pillow 11.3.0 (verified locally) only in the offline generation script; record its version in the manifest. Local PHP does not currently load GD/Imagick, so generation must not depend on those extensions. Preserve aspect ratio and inspect signs/watermarks on phone and desktop. Aim for <=100 KiB each and <=1 MiB combined; revise encoding if quality fails rather than silently removing detail. Name each committed WebP using its output hash and generate the manifest from actual bytes.

  ```python
  from PIL import Image, ImageOps
  with Image.open(source_path) as source:
      image = ImageOps.exif_transpose(source).convert('RGB')
      scale = min(1.0, 640 / image.width)
      size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
      image = image.resize(size, Image.Resampling.LANCZOS)
      image.save(output_path, format='WEBP', quality=82, method=6)
  ```

  The generation script accepts the verified source manifest and output directory as explicit arguments. Validate source hashes and resulting dimensions/bytes with assertions, hash the encoded output for its filename, and retain existing originals. Use the actual quality-82 results as the first visual review candidate, adjusting quality only when size/readability evidence warrants it.

- [ ] **Step 4 — Implement the narrow importer.** Preflight all files and exact store names/raw original keys before writes. On apply, reuse identical objects, reject conflicting keys, upload with these existing adapter options, then verify readback SHA256. Report partial uploads honestly; retain matching objects for safe retry. Do not run an establishment seeder or change `image_path`.

  ```php
  $disk->put($entry['thumbnail_key'], $bytes, [
      'ContentType' => 'image/webp',
      'CacheControl' => 'public, max-age=31536000, immutable',
  ]);
  ```

- [ ] **Step 5 — Add the optional summary URL.** `storeCardUrl()` finds an exact original-key match in the packaged manifest and calls `publicUrl($entry['thumbnail_key'])`; otherwise it returns null. Read the manifest once per application request/process, not per store. Do not add storage HEAD/GET calls to summary rendering. Keep the profile's original image contract unchanged.

  ```php
  'card_image_url' => app(CommodityImageStorage::class)
      ->storeCardUrl($store->getRawOriginal('image_path')),
  ```

- [ ] **Step 6 — Consume the field in cards and list only.** Prefer `card_image_url`, then original `image_path`, then `/stores/store.webp`. Keep the original for the large profile hero. Reset image failure state when either URL changes; a failed thumbnail tries the original exactly once, then renders the existing facade. Retain `loading="lazy"`, `decoding="async"` and current media dimensions. Add tests for optional field absent, unknown store photo, broken thumbnail, broken original, and image change after refresh.

  ```ts
  const candidates = [...new Set([store.card_image_url, store.image_path]
    .filter((url): url is string => Boolean(url)))];
  // Advance through these candidates once on error; then use the existing facade.
  ```

- [ ] **Step 7 — Verify both halves.** Run the focused backend suite above and `npm.cmd test -- --run src/components/admin/FieldMonitoringRecords.test.tsx --maxWorkers=1 --no-file-parallelism` from `web/`. Review all ten generated images at actual list/card sizes. No production upload at this step.

## Task 2: Independent profile and visit loading

**Files:** `web/src/components/admin/FieldMonitoringRecords.tsx`, `web/src/components/admin/FieldMonitoringRecords.test.tsx`; use `admin.css` only if existing status styles are insufficient.

**Interfaces:** Preserve `openProfile(storeId, updateHistory, targetPeriod, targetFrom, targetTo)`, `navSeq`, `recordsSeq`, existing API signatures and current local profile/visit layout. Introduce separate profile-read and profile-record loading/error state inside the existing component; no new page framework.

- [ ] **Step 1 — Add a deferred-response test.** Resolve the profile and leave its records pending. Expect the store header, original hero, period controls and Back button to be usable; the records area alone displays `Loading visits…`. Reject records and expect its own error/Retry, while the profile stays visible. Reversing the responses must also work. A profile failure must not display the previous store as the requested one.

  ```ts
  let resolveVisits!: (page: MonitoringRecordPage) => void;
  vi.mocked(adminApi.getMonitoringRecords).mockReturnValueOnce(
    new Promise((resolve) => { resolveVisits = resolve; }),
  );
  // Resolve getMonitoringEstablishment independently, open the store,
  // then assert its heading before calling resolveVisits(emptyRecords).
  ```

- [ ] **Step 2 — Verify red.** Run the focused FieldMonitoringRecords test command from Task 1. The current `Promise.all()` behavior must fail the profile-before-visits assertion.

- [ ] **Step 3 — Launch both reads, publish their states independently.** Capture one navigation generation and one records generation before starting. The profile fulfillment updates `profile` and URL independently; the visits fulfillment updates `profileRecords` only for matching navigation/store/filter generations. Handle and finish each error/loading state separately. Retain current period/search rules. On a new store, clear that store's previous visit table while it loads; on a same-store refresh, retain visible rows with a refreshing indicator.

  ```ts
  const seq = ++navSeq.current;
  const rowsSeq = ++recordsSeq.current;
  // Start both promises immediately. Each handler checks its captured
  // generations before updating its own state; neither waits for the other.
  const profileRead = adminApi.getMonitoringEstablishment(storeId, periodParams);
  const visitsRead = adminApi.getMonitoringRecords({ store_id: storeId, ...periodParams, per_page: 10 });
  ```

- [ ] **Step 4 — Guard directory/list refreshes too.** Add request generations for directory, standalone records and additional visits so changed filters/pages cannot be overwritten by older results. Use existing 300 ms search debounce; do not add another debounce or reintroduce history/findings requests removed by the local work. Add reordered Store A/B, period, search, pagination, Back/Forward and deep-link tests. Retry targets only the failed section.

- [ ] **Step 5 — Verify green.** Run the focused component tests, then check keyboard navigation, existing export/visit-review/legal-action links and phone/desktop layouts. Confirm photo decoding never gates profile state.

## Task 3: Short session-scoped read reuse with authoritative refresh

**Files:** `web/src/services/responseCache.ts`, its existing test, `web/src/services/adminApi.ts`, create `web/src/services/adminApi.monitoringCache.test.ts`, and extend the existing FieldMonitoringRecords test. Modify `web/src/services/api.ts` only to type its existing session-epoch methods. Reuse `adminSession.ts` and `regulatoryRefresh.ts`; preserve their existing callers.

**Interfaces:** Extend `cached<T>(key, ttlMs, load, force = false): Promise<T>` compatibly. Add optional `options: { force?: boolean } = {}` as the second argument of `getMonitoringEstablishments`, `getMonitoringEstablishment` (third argument after existing filters), and `getMonitoringRecords`. Existing calls remain valid. Cache only these three reads; signatures, location reads and mutation endpoints remain uncached.

- [ ] **Step 1 — Write failing cache/API tests.** Cover identical concurrent reads, reuse before 15 seconds, expiry, forced replacement, failure eviction, parameter differences, Manila day/week rollover, 100-entry limit and logout/write invalidation. Ensure an old forced-out request's rejection cannot evict its replacement. Simulate two session epochs and ensure old-session completion never supplies new-session data.

  ```ts
  const load = vi.fn().mockResolvedValue('current');
  await cached('monitoring:list', 15_000, load);
  await cached('monitoring:list', 15_000, load);
  expect(load).toHaveBeenCalledTimes(1);
  await cached('monitoring:list', 15_000, load, true);
  expect(load).toHaveBeenCalledTimes(2);
  ```

- [ ] **Step 2 — Verify red.** From `web/`, run `npm.cmd test -- --run src/services/responseCache.test.ts src/services/adminApi.monitoringCache.test.ts --maxWorkers=1 --no-file-parallelism`.

- [ ] **Step 3 — Implement bounded reuse in the existing helper.** Honor `force`, prune expired entries when inserting, enforce maximum 100 entries by evicting the oldest, and preserve rejection eviction's identity check. Use stable parameter serialization that drops undefined values and sorts keys; include the existing Admin session epoch and endpoint in every monitoring key.

  ```ts
  const normalized = Object.fromEntries(Object.entries(filters)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b)));
  const manilaDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const key = JSON.stringify(['monitoring', api.getAdminSessionEpoch(), manilaDay, endpoint, normalized]);
  return cached(key, 15_000, load, options.force === true);
  ```

  Declare the existing epoch methods in the client typing rather than inventing a second session counter. Keep cached objects read-only in consuming components.

- [ ] **Step 4 — Connect refresh and invalidation.** Normal navigation may reuse data. Refresh buttons, Retry, visible-online regulatory refresh and reconnect/foreground reads pass `force: true`. Reuse `regulatoryRefresh()` and unsubscribe on unmount. Coalesce overlapping background refresh triggers while one refresh is pending; an explicit mutation-triggered refresh must not be satisfied by an older in-flight read. Existing Axios write and logout handlers already clear the read cache: preserve and test them. Increment request generations on a write/regulatory refresh before launching fresh reads.

- [ ] **Step 5 — Keep freshness honest.** Show `Refreshing…` while retaining existing data; record `Last refreshed` only after success. Failure retains rows, adds the relevant error, and retains the previous success time. Revalidate after returning to the foreground and on the existing regulatory event so monitoring week/day/protocol changes are not hidden by the short cache. Preserve server validation for regulatory actions.

- [ ] **Step 6 — Verify green and compatibility.** Run the helper/API/component tests together, plus `src/services/api.test.ts` and `src/services/adminSession.test.ts`. Existing cached stores/overview behavior must remain compatible. Then run `npm.cmd test -- --run --maxWorkers=1 --no-file-parallelism`, `npm.cmd run build` and `npm.cmd run lint` from `web/`; distinguish unrelated failures before changing their files.

## Task 4: Measure, review and stage the authorized rollout

**Files:** Add the results/readiness note at `docs/plans/field-monitoring-loading/README.md` during implementation. Keep browser measurements under ignored/untracked `scratch/field-monitoring-loading/`. Update the compact vault indexes/decisions only when implemented facts actually change.

- [ ] **Step 1 — Capture repeatable local before/after measurements.** Adapt the existing `scratch/store-photos/check-monitoring-performance.py` against a local build with the same test account/data. Keep credentials and private response bodies out of artifacts. Record request start phase, downloaded image bytes, decode completion, profile header readiness and visit table readiness independently. Use 1440 x 900 and 390 x 844. Collect at least five warm-backend runs with fresh browser caches and five repeat-navigation runs. Add Chromium throttling at 1.6 Mbps down / 750 Kbps up / 150 ms latency; label it simulation, not real-device proof.

- [ ] **Step 2 — Apply acceptance gates.** Confirm all ten card copies are readable; target at least 70% less photo transfer than the 4.28 MB baseline. Verify the profile appears during a deliberately delayed/failed visit request, cached repeat navigation reduces request count, explicit Refresh fetches, and no failed refresh falsely advances freshness. Compare medians under the same conditions; report the actual improvement without a fixed latency promise.

- [ ] **Step 3 — Profile SQL only if warm data remains slow.** Measure query count, SQL duration and response payload locally using the real endpoint/controller code. Inspect the existing full-item fetch followed by commodity deduplication and summary count queries. Do not infer database cost from total network time. Propose a separate measured query/index change only if profiling identifies one; no automatic production migration.

- [ ] **Step 4 — Prepare the exact release diff for approval.** Backend helper/manifest/import command/assets and tests are one slice; Admin loading/cache changes and tests are another. Shared dirty files already contain unrelated work: construct reviewed hunks or an isolated checkout without resetting them, and ensure the approved local profile redesign's dependency is accounted for. Do not use `git add .`. Review staged diff, focused suites, Admin build and the browser report before asking for publishing approval.

- [ ] **Step 5 — After explicit release approval, deploy compatibility first.** Commit/push only the reviewed backend slice. Old Admin clients ignore `card_image_url`. Preview `php artisan stores:import-monitoring-thumbnails`, then apply its uploads. Verify every new public URL returns the expected SHA256, WebP type and immutable cache header. No database data application or seeder is needed. If header behavior differs from the adapter options, stop the frontend rollout and correct the supported storage upload path without weakening conflict checks.

- [ ] **Step 6 — Publish the Admin slice and verify live.** Commit/push the reviewed frontend slice; git-connected Vercel builds may also trigger other apps, but no changes to those apps are part of this work. Verify exact deployed commit and authenticated Field Monitoring: all ten photos, list/card switching, independent profile/table readiness, refresh, permissions, sign-out and error/fallback behavior. Measure repeat loads with normal browser caching; validate headers on fresh requests without leaving DevTools' Disable cache enabled.

- [ ] **Step 7 — Record remaining infrastructure limits and rollback.** The app work does not eliminate Render free-tier wake-up. An optional always-on instance requires its own cost approval. Roll back the Admin slice if needed; original photos/keys remain intact, the optional API field is compatible, and derived objects need not be deleted. Do not roll back unrelated releases or restore a whole database.

## Completion checklist

- [ ] Ten immutable directory thumbnails; source/sign/watermark and fallback checks passed.
- [ ] Profile and visit loading/error states independent; navigation/filter races tested.
- [ ] 15-second bounded per-session cache; manual/regulatory refresh and invalidation tested.
- [ ] Focused backend/Admin tests, build and before/after browser measurements passed.
- [ ] Publishing and storage approval obtained for this scope, exact commits deployed, live checks recorded.
- [ ] No migration, store metadata change, private evidence caching or unrelated frontend edits shipped.
