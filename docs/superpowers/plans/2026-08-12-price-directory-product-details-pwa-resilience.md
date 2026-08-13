# Price Directory, Product Details, and PWA Resilience Implementation Plan

**Date:** 12 August 2026  
**Scope:** Customer PWA plus the public commodity response used by it  
**Execution:** Implement in the current working tree, without deployment  
**Requested model:** GPT-5.6 Sol, maximum reasoning effort. The runtime model label is controlled outside the repository and must be selected or verified by the host interface.

## Goal

Make the price directory and product-detail journey truthful, fast, and recoverable. Live, saved, and bundled data must be visibly distinct; list context must survive navigation; missing regulatory metadata must never be invented; and common offline, update, asset, cold-start, and performance failures must have calm recovery paths.

## Acceptance criteria

- Public commodity responses expose the bulletin `source_reference` while private creation metadata remains hidden.
- Search is instant and local after one full commodity fetch; typing does not issue a request per query.
- The existing result list remains visible while a background refresh is running.
- Search, classification, categories, sort, and scroll position survive product-detail navigation and tab changes for the browser session.
- Empty states accurately describe search-only, filter-only, combined, offline, and backend-unavailable conditions and offer the relevant reset or retry action.
- Product-card price labels reflect provenance: `Current SRP`, `Saved reference price`, or `Reference price`.
- Product details receive provenance and fetch time, use real nullable metadata, contain product images, expose the source reference, and avoid unsupported geographic, monitoring-state, and price-freeze claims.
- Scanner pages receive the same global offline warning as the other primary routes.
- Offline-banner dismissal resets after a successful reconnection and its controls meet mobile target and contrast requirements.
- Ordinary React crashes can reload without erasing application state; a separate confirmed reset clears only app-owned recovery data.
- Missing asset recovery automatically reloads at most once per session and falls back safely on repetition.
- Service-worker updates are prompted instead of interrupting the current task.
- API cold starts use staged, actionable messaging.
- Secondary routes are code-split, the primary font is local, and unused dependencies are removed.

## Task 1: Public source-reference contract

**Files**

- Modify `backend/tests/Feature/AdminSrpManagementTest.php`
- Modify `backend/app/Http/Controllers/PublicCommodityController.php`
- Modify `customer-pwa/src/api/client.ts`

**Steps**

1. Change the public-response feature test to require `source_reference` and continue rejecting `created_by` and `commodity_key`.
2. Run the focused backend test and confirm it fails for the missing field.
3. Add `source_reference` to the public transformation only.
4. Change `Commodity.effective_date` to `string | null` and add optional nullable `source_reference`.
5. Run the focused backend test again.

## Task 2: Central data-provenance presentation

**Files**

- Create `customer-pwa/src/app/priceDataPresentation.ts`
- Create `customer-pwa/src/app/priceDataPresentation.test.ts`
- Modify `customer-pwa/src/components/PriceProductCard.tsx`

**Steps**

1. Add failing tests for live, cached, and bundled labels.
2. Define `PriceDataSource = 'live' | 'cached' | 'bundled'` and a single label helper.
3. Pass the source into product cards and remove the fixed `Current SRP` text.

## Task 3: Local directory search and session restoration

**Files**

- Create `customer-pwa/src/app/priceDirectoryState.ts`
- Create `customer-pwa/src/app/priceDirectoryState.test.ts`
- Modify `customer-pwa/src/components/SrpSearch.tsx`
- Modify relevant `SrpSearch` tests

**Steps**

1. Add failing tests for state parsing, corrupt-data fallback, local matching, and conditional empty-state copy.
2. Fetch the full commodity collection once, then search normalized commodity name, formatted display name, category, unit/package text, and brand locally.
3. Keep prior results mounted during background revalidation and show an inline refresh state.
4. Persist search, classification, selected categories, sort, and scroll under `price-watch-price-directory-view-v1` in `sessionStorage`.
5. Restore list state before rendering and restore scroll after data/card layout is ready.
6. Add relevant Clear search, Clear filters, Clear all, and Retry actions.

## Task 4: Source-aware product cards and details

**Files**

- Modify `customer-pwa/src/components/SrpSearch.tsx`
- Modify `customer-pwa/src/components/ProductDetail.tsx`
- Add or modify product-detail tests

**Steps**

1. Route to details with commodity, data source, and data-fetch timestamp.
2. Remove invented effective date, Nationwide scope, and default Normal monitoring state.
3. Use `object-fit: contain` for uploaded images and the same neutral fallback used by the directory.
4. Render the public source reference when available and clearly mark unavailable metadata.
5. Show price-freeze treatment only when the returned item fields support it. Remove hardcoded duration, penalty, or scope claims not carried by the source.
6. Preserve the existing exact Back-to-Prices and device-Back behavior.

## Task 5: Offline banner and network truthfulness

**Files**

- Modify `customer-pwa/src/App.tsx`
- Modify `customer-pwa/src/components/OfflineBanner.tsx`
- Modify or add tests for both

**Steps**

1. Reuse `useConnectivity` as the single online-state source.
2. Display the banner on Scan as well as the other primary screens.
3. Reset dismissal when the browser reconnects so a later outage is announced.
4. Increase the close target to at least 44 pixels, improve contrast, and retain an accessible label.
5. Distinguish browser offline, saved data, bundled data, and online backend failure in directory status text.

## Task 6: Safe crash, asset, and update recovery

**Files**

- Modify `customer-pwa/src/components/ErrorBoundary.tsx`
- Modify `customer-pwa/index.html`
- Modify `customer-pwa/src/main.tsx`
- Create `customer-pwa/src/components/PwaUpdatePrompt.tsx`
- Modify `customer-pwa/src/App.tsx`
- Modify or add focused tests

**Steps**

1. Make the primary crash action a normal reload that preserves caches and state.
2. Add a secondary, confirmed reset that clears only app-owned caches/session recovery keys and then reloads.
3. Guard asset recovery with a session key: one automatic reload maximum, a static recovery page on repeat failure, and removal of the guard after React mounts successfully.
4. Replace automatic service-worker update behavior with `virtual:pwa-register/react` update detection.
5. Present a compact update prompt with Later and Update now actions; apply the update only after explicit confirmation.

## Task 7: Cold-start and loading communication

**Files**

- Modify `customer-pwa/src/api/client.ts` or its readiness helper
- Modify affected directory/report loading surfaces
- Add timer-driven tests

**Steps**

1. Expose staged readiness state rather than one generic loading string.
2. Show ordinary loading before three seconds, `Starting the service...` after three seconds, and `This is taking longer than usual` plus Retry after fifteen seconds.
3. Preserve the user’s filters or form state throughout retries.

## Task 8: Bundle and font performance

**Files**

- Modify `customer-pwa/src/App.tsx`
- Modify `customer-pwa/vite.config.ts`
- Modify `customer-pwa/src/index.css`
- Modify `customer-pwa/package.json` and lockfile

**Steps**

1. Lazy-load Price Directory, Scanner, Formal Report, and Track Report; keep Home eager.
2. Provide a small accessible route-loading fallback.
3. Remove API runtime caching for public commodities, establishments, and config so verified application caching remains the sole API freshness authority.
4. Use prompt-based service-worker registration.
5. Add `@fontsource-variable/outfit`, import it locally, and remove the blocking Google Fonts import.
6. Remove confirmed-unused `idb`, `leaflet`, `react-leaflet`, `workbox-window`, and `@types/leaflet` dependencies.

## Task 9: Verification

1. Run focused frontend tests after every red-green checkpoint.
2. Run the focused backend public-commodity feature test.
3. Run all Customer PWA tests serially in stable groups if the Windows runner cannot complete them in one process.
4. Run Customer PWA lint and production build.
5. Confirm route chunks are emitted and record the resulting initial-chunk size.
6. Inspect the scoped diff and ensure no Admin UI, Flutter, deployment, migration, or unrelated dirty-tree work was changed.

## Explicitly out of scope

- Repairing Scan or Report product-detail handoff data
- Implementing receipt OCR or changing the reporting evidence model
- DTI Admin changes
- Database migrations
- Legal-policy decisions not represented by existing API fields
- Committing, pushing, or deploying

