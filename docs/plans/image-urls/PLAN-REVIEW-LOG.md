# Image URLs — Plan Review Log

Append-only. Claudex loop record for `docs/plans/image-urls/PLAN.md`.

## Setup (2026-10-03)

- Roles: host/planner/builder = Claude Code (Opus 5.5); plan reviewer + final inspector = Codex CLI 0.159.3 (model = CLI default, not pinned).
- Scope: fix customer PWA missing commodity images; unify public image handling (commodity + store); private evidence out of scope.
- Authorization: user approved plan and implementation. Commit/push/deploy, production migration and bucket upload need separate explicit approval.
- Limits: 5 review rounds, 2 fix rounds, 2 inspection rounds.
- Codex config: all `[mcp_servers.*]` and write plugins already `enabled = false` before the run; backup SHA256 `0f405f144b0729d370740e46a9478adcca2fe378216c83dfbd01c2c621018cc4`, verified unchanged after each call.

## Baseline image sweep (before changes, live 2026-10-03)

- `/public/commodities`: 168 items, 120 with `image_path`, 48 null. 115 unique URLs: 114 return HTTP 400 from Supabase (seed objects never uploaded), 1 returns 200 (admin-uploaded `78OSzUp6…webp`).
- Customer PWA masks the 114 by rewriting to bundled copies, and breaks the 1 real upload the same way.
- Supabase bucket `commodity-images`: public, 5 objects (all admin uploads).
- `/public/establishments`: 10 stores, all bundled `/stores/*.webp` paths (present in all four apps).

## Round 1 — Codex review (2026-10-03)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/r1/claudex-rw66tdlp/result.json`, session `01a0fdae-89d2-7e91-b44a-11728ed8212d`, plan SHA256 `b2a90a4a…`, 395 s, model = CLI default (not reported).
- Verdict: **REVISE**. "The main catalog fix is supported by the source, but the plan leaves comparison images and some legacy store paths unresolved."
- IMG-01 (medium) OCR/scan comparison product payload (ShelfTagComparisonService) lacks image_path. → accepted.
- IMG-02 (medium) MoreView fallback lookup by ID/name runs online, can show wrong bundled photo. → accepted (adapted: exact-name only, legacy entries only).
- IMG-03 (medium) unmapped legacy /stores/ paths would resolve to never-uploaded bucket keys. → accepted (preflight gate + leading-'/' passthrough).
- IMG-04 (medium) down() cannot tell migrated nulls from real nulls. → accepted (leave null).
- IMG-05 (medium) launch.json only has web-dev; field dev server has no SW. → accepted (launch entries + built preview).
- Revised plan SHA256: `206ea550…`.

## Round 2 — Codex review (resumed session)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/r2/claudex-wsric1u_/result.json`, session `01a0fdae-89d2-7e91-b44a-11728ed8212d`, plan SHA256 `206ea550…`, 226 s.
- Verdict: **REVISE**. Prior five dispositions confirmed addressed; three image-selection defects remain.
- R2-01 (medium) MoreView substitutes bundled photo for new comparisons with null image; names not unique. → accepted (lookup removed).
- R2-02 (medium) image borrowing in batchRevisions and public catalog crosses lineages (name-only). → accepted (lineageKey-scoped).
- R2-03 (medium) leading-'/' passthrough breaks absolute-or-null contract; image_path writes unvalidated. → accepted (strict publicUrl + write validation).
- Revised plan SHA256: `2869f953…`.

## Round 3 — Codex review (resumed session)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/r3/claudex-3rbypgzb/result.json`, plan SHA256 `2869f953…`, 170 s.
- Verdict: **REVISE**. Prior three addressed; two edge cases.
- R3-01 (medium) lineageKey slug can split keyless display-name history from keyed row → photo lost. → accepted (key, then exact name+unit+category).
- R3-02 (medium) syntax-only validation lets missing keys / arbitrary https URLs in via import. → accepted (exists() check; unchanged value allowed; new external URLs rejected).
- Revised plan SHA256: `2bf4d41f…`.

## Round 4 — Codex review (resumed session)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/r4/claudex-q8j42_yl/result.json`, plan SHA256 `2bf4d41f…`, 111 s.
- Verdict: **REVISE**. Prior two addressed.
- R4-01 (high) metadata edit with null current image wipes photo references across the lineage (pre-existing bug, confirmed). → accepted (omitted = unchanged).
- R4-02 (medium) migration down() alone breaks store photos under new code. → accepted (coordinated rollback documented).
- Revised plan SHA256: `e6791a95…`.

## Round 5 — Codex review (resumed session)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/r5/claudex-kv89u3xu/result.json`, plan SHA256 `e6791a95b45e818c958d7966fc1692864861976739b834d0f18074f79bdbce19`, 66 s.
- Verdict: **APPROVED**. No findings. Limitations: static read-only review; production data, bucket objects and deployed behaviour not inspected by the reviewer.
- Approval bound to the plan hash above. Codex config SHA256 unchanged after all five rounds.

## Build (Claude) — base commit `413baaa`

### Baseline browser sweep (production customer PWA, before changes)

- Prices list: 168 cards, 120 `<img>` loaded (all rewritten to bundled `/storage/commodity_images/…`), 49 placeholders = 48 null-image items + 1 uploaded item whose rewritten bundle path 404s (the reported bug; failed img removed by `onError`, so it never appears as a broken `<img>`).

### Build status (paused 2026-10-03, usage limit)

- Done: backend (`CommodityImageStorage::publicUrl/assertWritable`, Store accessor, store key migration + seeder, lineage-scoped image inheritance, metadata-edit photo-wipe fix, comparison/scan image URLs, import/create validation); customer resolver + recent comparisons; admin thumbnail; vendor/field store images + field runtime image cache; bundles removed from web/vendor/field; vault notes (DECISIONS, CURRENT-STATUS, PROJECT-MAP, customer-pwa-api).
- Proof: backend `php artisan test` 717/717; new `PublicImageRuleTest` 9/9 (4 of them fail against the pre-change controllers); vitest + build pass in customer-pwa (419), web (215), field-officer-pwa (157), vendor-pwa (27).
- Local API sweep (throwaway SQLite loaded from the live catalog, local public disk): 168 commodities + 10 stores; 119 + 5 image URLs, all 200 `image/*`; 49 + 5 null; no malformed URLs. The one production-only upload was nulled locally because its file exists only in the bucket.
- Not yet run: local browser sweep per app, field offline check, fresh Codex inspection of the diff, production bucket upload (needs owner go), deploy + production sweep.

### Local browser sweep (2026-10-03, throwaway SQLite + local public disk)

| App / screen | Result |
|---|---|
| Customer › Prices (168 items) | 119 `<img>` from backend URLs, 49 placeholders = 49 null-image items, 0 broken, 0 image 4xx, 0 bundled rewrites |
| Admin › Price Regulation (17 pages, 168 items) | 119 thumbnails loaded, 49 placeholders, 0 broken |
| **Reported bug, end to end** | Admin › Add SRP Item with a newly uploaded PNG → upload 201, create 201, admin thumbnail loads; Customer › Prices card and product detail `/prices/169` load the same backend URL (previously rewritten to a missing bundled file) |
| Customer › Compare (store selection) | 5 store photos from backend, 0 broken |
| Admin › GIS map, Field Monitoring | 5 store photos from backend, 5 placeholder `/stores/store.webp`, 0 broken |
| Vendor › dashboard (vendor linked to Gaisano) | store photo from backend, 0 broken |
| Field Officer (built preview, service worker active) | 5 store photos load; `public-images` cache holds all 5; backend stopped + reload → 5/5 still load from cache |
| Customer offline fallback (API down, storage cleared) | 167 fallback cards, 133 bundled photos, all loaded |

Not exercised in the browser: the Customer recent-comparisons thumbnail after a fresh comparison. This is covered by `PublicImageRuleTest` (comparison `product.image_path`) and the unchanged `recentComparisons.ts` reader.

## Inspection 1 — fresh Codex session (2026-10-03)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/inspect1/claudex-mpz_azq3/result.json`, session `01a0fdd7-fe3e-7722-affa-09c716db2f5b`, 446 s, base `413baaa`, builder Claude.
- Verdict: **REVISE**.
- IMG-IMP-01 (high): the Admin edit form resubmits the current row's image_path, which overwrote different historical photos across the lineage. → accepted. Fixed in the backend (one place for every client): a resubmitted unchanged value is no change. Regression test added.
- IMG-IMP-02 (medium): import rejected an unchanged stored legacy URL. → accepted. A reference already stored on a bulletin may be resubmitted.
- IMG-IMP-03 (medium): Customer PWA does not precache bundled fallback photos. → rejected as out of scope. The  exclusion predates this change and is unaffected by it. Recorded as a known limit in CURRENT-STATUS.
- IMG-IMP-04 (low): non-string import image_path caused a TypeError. → accepted. Now a 422.
- Proof after fixes: `PublicImageRuleTest` 11/11; full backend 719/719.

## Inspection 2 — fresh Codex session (final permitted inspection)

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/00107c6d-bcf3-4cfa-97f1-45286ea1438c/scratchpad/claudex/inspect2/claudex-9k8yn76v/result.json`, session `01a0fde1-e490-7b03-914e-2eb0fd72b33d`, 450 s.
- Verdict: **REVISE**.
- IMG-INS2-01 (medium): the identity fallback could lend a keyed (renamed) lineage's photo to another item. → accepted. The name+unit+category fallback now uses keyless history only.
- IMG-INS2-02 (medium): import accepted any bulletin's stored URL. → accepted. Only the same commodity_key's stored reference counts as unchanged.
- IMG-INS2-03 (medium): Admin current list and scan-tag candidates did not inherit the lineage photo the way the customer catalog does. → accepted. Both use the shared resolver; history view shows each revision's own photo.
- IMG-INS2-04 (low): false/0 image_path slipped past filter(). → accepted. Every non-null value is validated.
- IMG-INS2-05 (low): `.claude/launch.json` entries differ from the plan wording. → rejected. It is an untracked local harness file and not part of the shipped change; sweep entries point at the throwaway DB on purpose.
- Proof after fixes: `PublicImageRuleTest` 12/12; full backend 720/720. Frontend code unchanged since its last green run.
- **Unreviewed edits:** the inspection-2 fixes above (SrpCatalogService::imageResolver, SrpManagementController::index, SrpImportService::preview, PublicPwaController::scanTag, new tests) were made after the final inspection. No independent Codex inspection covers them; inspection budget (2) is exhausted.

## Production bucket upload (2026-10-03, owner-approved)

- Uploaded 124 objects to `commodity-images` with no overwrite: 119 `commodity_images/*.webp` + 5 `store_images/*.webp`. Result: 124 uploaded, 0 existing, 0 failed.
- Verified before deploy: all 115 live commodity URLs + 5 store keys → 200 `image/webp` (was 114 × 400).

## Production verification (2026-10-03, after deploy of `1983857`)

- Backend (Render) live: `/public/establishments` returns `store_images/` bucket URLs; migration applied.
- API sweep (`--prod`): 168 commodities (118 photo, 50 null) + 10 stores (5 photo, 5 null). All 120 unique URLs 200 `image/*`. No relative, `http://` or localhost URLs.
- Photo coverage 120 → 118. Both losses were cross-lineage borrowing, now blocked by design:
  - #314 Argentina (170g) Beef Loaf had shown #300 Meat Loaf's photo.
  - #242 Refresh (500mL) Mineralized Water had borrowed from #230 Refresh (500mL) Purified Water. #230 holds `mineralized_water_refresh_500ml.webp`, a seed-mapping error (the photo belongs to #242), left for the owner to correct.
- Customer PWA (fresh session, caches cleared): 168 cards, 118/118 photos load, 0 broken, 0 bundled rewrites. The reported item #338 "Spicy Noodles Beef" (admin upload `78OSzUp6…webp`) shows on the card and the detail page. Compare › store selection shows 5/5 store photos.
- Admin, vendor and field bundles redeployed: no URL rewrite or name guessing; bundled store photos removed (`/stores/robinsons.webp` 404); admin and vendor keep the `store.webp` placeholder; field `sw.js` has the `public-images` runtime cache.
- Not browser-checked in production: authenticated Admin, Vendor and Field screens (no signed-in session in the agent browser; production passwords are not entered by the agent). These screens use the same API URLs verified above and were browser-checked locally.
