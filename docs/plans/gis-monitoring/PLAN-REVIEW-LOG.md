# Plan Review Log: GIS Monitoring

This log is append-only.

- **Roles.** Host and coordinator: Claude Code (Opus 5.5). Plan reviewer: Codex CLI 0.159.3, at its configured default model, read-only. Builder: none. Owner authorized plan review only; building needs separate approval.
- **Scope.** `docs/plans/gis-monitoring/PLAN.md`: turning GIS Monitoring into a layered, week-by-week map and folding temporal analytics into it.
- **Round limit.** At most 5 rounds.
- **Codex config guard.** `~/.codex/config.toml` was checked before the run, with SHA256 `cdfc059aa5a951be3588c26e89e91e9cea33fc8f168849c070d377a24f68bad8`.
  - Every `[mcp_servers.*]` table was already `enabled = false`.
  - So was every write or outbound plugin listed in AGENTS.md: gmail, sentry, vercel, build-web-apps, browser, chrome, computer-use, unified-computer-use and codex-app-tools.
  - No edit was needed. A backup is kept outside the repo, and the hash is re-verified after each call.
- **Owner decisions.** The 2026-10-03 answers are recorded in PLAN.md under Context.

## Round 1 — Codex — REVISE

- Codex session: `01a10045-9635-7523-9a2c-28f322e492d4`. Requested model: none (CLI default); observed model: not reported by the CLI.
- Plan sha256: `7d0bcc1d5f0a126a112b00d9121f471070d15fe4cff9bbde5e4c7696dfd88d26`.
- Elapsed: 287s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/f876e0c2-f5d6-4fed-9b7a-a6cbca99678d/scratchpad/claudex-r1/claudex-_1bvi7kz/result.json`.
- `config.toml` sha256 after the call matched the original.
- Summary: "The plan has concrete gaps in coverage classification, visit status, GPS access auditing, and request handling."
- Coverage reported: plan hash verified; knowledge index, project map, current status, product and monitoring rules read; GIS map and drawer components, API callers, store status logic, authorization, monitoring records and items, verification requests, week and period rules, field visit writes, temporal analytics and adjacent tests traced.
- Limitations reported: static review only; nothing run or edited.

Findings:
- **GIS-01 (high).** `has_prior_visit` counted any accepted visit before the week's end, but coverage counts routine visits only, so a store with only a verification visit would show Not monitored instead of Never monitored.
- **GIS-02 (medium).** One category per store, several visits per week: a distant visit could be hidden by a later accurate one.
- **GIS-03 (medium).** The endpoint returned visit GPS in bulk with no audit entry, against PRODUCT.md ("location evidence is private, authenticated, and audited").
- **GIS-04 (medium).** No request ordering: a late response for week A could render under week B.
- **GIS-05 (medium).** `StoreMap.test.tsx` mocks only `getStores` and `StoreDetailOverlay.test.tsx` asserts `getAnalytics(9)`; both would fail.
- **GIS-06 (low).** `lineageKey` is an instance method, not static.

Host dispositions (all verified in source, all accepted):
- GIS-01: prior coverage now from `routineMonitoringRecords` before the week's start; verification-only test added.
- GIS-02: store is `Location to review` if any visit in the week is; each popup keeps its own result; mixed-visit test added.
- GIS-03: coordinates only behind an opt-in `locations` flag sent by the Visit check layer, audited with `recordOrFail` (`gis.visit_locations_viewed`); no flag, no coordinates, no audit row. Officer names stay: the monitoring-record list already returns them to the same roles.
- GIS-04: one debounced effect with a cancelled flag; out-of-order test added.
- GIS-05: both existing tests listed for update.
- GIS-06: `SrpCatalogService` injected.

## Round 2 — Codex — REVISE

- Codex session: `01a10045-9635-7523-9a2c-28f322e492d4` (resumed). Observed model: not reported by the CLI.
- Plan sha256: `6983b1507be3fac41f6bbd6c46101e3d46cdaf67f870307b1e2e2fdd9a3a0489`.
- Elapsed: 198s.
- Result: under `.../scratchpad/claudex-r2/`.
- `config.toml` sha256 after the call matched the original.
- Summary: "The six prior findings are addressed in the revised plan. Four material gaps remain in week transitions, layer rendering, query encoding, and GPS response caching."
- Limitations reported: static review only.

Findings:
- **GIS-07 (high).** Discarding late responses is not enough: after selecting week B, week A's pins stay on screen under B's label until B loads.
- **GIS-08 (medium).** `StoreMap` rebuilds markers only on `[stores, selectedStoreId]`, so a layer or commodity switch would not redraw pins, and the popup always shows the Compliance status.
- **GIS-09 (medium).** Axios sends boolean `true` as `"true"`, which Laravel's `boolean` rule rejects.
- **GIS-10 (medium).** No cache policy on the coordinate-bearing GET.

Host dispositions (all verified in source, all accepted):
- GIS-07: `targetWeek` drives the fetch; the loaded payload's week drives label and pins; loading note while they differ; test added.
- GIS-08: marker effect depends on `pinOf` and `visitLinks`; `pinOf` memoized on `[layer, commodity]`; popup uses the `pinOf` result; tests added.
- GIS-09: wire value `locations=1`; tests for `1` and for `true` being 422.
- GIS-10: `Cache-Control: private, no-store` asserted in the endpoint test; client call not cached.

## Round 3 — Codex — REVISE

- Codex session: `01a10045-9635-7523-9a2c-28f322e492d4` (resumed). Observed model: not reported by the CLI.
- Plan sha256: `855eba95730843df5c6a8e2541a2b1741ad744f3c579a1d8f3b3dce4d7133d4a`.
- Elapsed: 191s.
- Result: `.../scratchpad/claudex-r3/claudex-_9c824ei/result.json`.
- `config.toml` sha256 after the call matched the original.
- Summary: "The prior findings are addressed. The revised plan still needs to handle the transition into Visit check and clarify three rendering and week-contract details."
- Limitations reported: static review only.

Findings:
- **GIS-11 (high).** Entering Visit check before the coordinate-bearing response arrives could show a false `At registered pin`; an audit failure would leave that state in place.
- **GIS-12 (medium).** `buildStorePopupContent` requires the full `getStoreStatusInfo` type, so the `pinOf` result (and grey) would not type-check.
- **GIS-13 (medium).** `MonitoringWeek::for` returns UTC instants (Sunday 16:00Z); the plan gave no common key for comparing or labelling Manila weeks.
- **GIS-14 (medium).** Prices has five categories but only four pin colours were defined.

Host dispositions (all verified in source, all accepted):
- GIS-11: payload states `locations`; Visit check never classifies without it; loading and unavailable states with Retry; tests added.
- GIS-12: popup parameter narrowed to `{ status: PinStatus; label }`; popup CSS for new statuses.
- GIS-13: `week.key` and `week.ends_on` as Manila date strings; client works on strings only; tests on both sides.
- GIS-14: five statuses (blue added for `Reference unavailable`); "Verification required" is a corner badge.

## Round 4 — Codex — REVISE

- Codex session: `01a10045-9635-7523-9a2c-28f322e492d4` (resumed). Observed model: not reported by the CLI.
- Plan sha256: `309247e4dda60fb627981859093df5a595074fb3fe3abba069e83b6c18efd07a`.
- Elapsed: 144s.
- Result: `.../scratchpad/claudex-r4/claudex-sgjss8xa/result.json`.
- `config.toml` sha256 after the call matched the original.
- Summary: "The four prior findings are addressed. Two edge cases remain in the revised plan."
- Limitations reported: static review only.

Findings:
- **GIS-15 (medium).** The "Verification required" badge had no path to the pin and no week context, so it could show on a historical week or not at all.
- **GIS-16 (low).** "Latest visit wins" had no tie-break for visits sharing a `finalized_at`.

Host dispositions (both verified in source, both accepted):
- GIS-15: `pinOf` gains `badge`; Coverage sets it only when the loaded week is current; callback depends on the loaded payload; test added.
- GIS-16: order by `finalized_at` then `id` defines "latest"; equal-timestamp test added.
- Housekeeping: acceptance criterion 14 moved back into numeric order.

## Round 5 — Codex — APPROVED

- Codex session: `01a10045-9635-7523-9a2c-28f322e492d4` (resumed). Observed model: not reported by the CLI.
- Plan sha256: `33955c4a128269aaddc4e7b641462a4a4b41d56fb08c140087dc6e5eaffd2083`.
- Elapsed: 59s.
- Result: `.../scratchpad/claudex-r5/claudex-utg13z8d/result.json`.
- Summary: "The supplied plan hash matches. Prior findings are resolved, and no material unresolved plan defects were found."
- Findings: none.
- Coverage reported: revised plan and prior dispositions; GIS components, week and coverage rules, price grouping, visit writer, audit path, adjacent callers and tests.
- Limitations reported: static review only; the endpoint and UI are not built, so runtime behaviour is unverified.
- Runner `check` against this result: "Approval matches the current plan."
- `config.toml` is byte-identical to the pre-run backup (`cmp`), sha256 unchanged.

## Outcome

- Rounds used: 5 of 5. Findings: 16 (3 high, 11 medium, 2 low), all accepted, none rejected.
- Approval is bound to PLAN.md at the sha256 above. Any edit to PLAN.md needs a new review.
- Nothing was built, committed, pushed, or deployed. Building needs the owner's separate approval.

## Build — Claude (host) — 2026-10-03

- **Authorization.** Owner said "build it" after the approved plan was presented. Builder: Claude Code (Opus 5.5), in this session. Inspector: a fresh Codex session. No commit, push, or deploy authorized.
- **Base.** Pre-build commit `f3d2d10737b36778b14818817aa91c1466257d82` on `main`. Untracked before the build and not part of it: `.claude/`, `image.png`, `mobile/`, `ref.png`, `scratch/`, `web/fm-preview.html`, `web/src/fm-preview.tsx`.
- **Changed.** Backend: new `GisMonitoringController` and route `GET /admin/gis/monitoring`; `weeks` range on `TemporalAnalyticsController`/`TemporalAnalyticsService`; new `GisMonitoringMapTest`, one case added to `GisStoreDetailTest`. Web: `storeMapUtils.ts` (layers), `StoreMap.tsx`, `StoreManager.tsx`, `StoreDetailOverlay.tsx`, `AdminPanels.tsx`, `AdminShell.tsx`, `admin.css`, `adminApi.ts`, `types/admin.ts`; new `storeMapUtils.test.ts` and `StoreManager.test.tsx`; `StoreMap.test.tsx` and `StoreDetailOverlay.test.tsx` updated. Docs: `DECISIONS.md` entry.
- **Proof, run by the host.**
  - `php artisan test --filter="GisMonitoringMapTest|GisStoreDetailTest"`: 15 passed, 97 assertions. Full backend suite: 751 passed.
  - `npx vitest run` on the four GIS files: 28 passed. Full web suite: 32 files, 235 passed.
  - `npm run build`: `tsc -b` clean, built. `npm run lint`: clean.
- **Browser check** against a throwaway local SQLite database (copied from an earlier local sweep database, plus demo visits; production was never contacted): Dashboard card opens GIS Monitoring; Coverage showed 4 monitored, 1 not monitored, 5 never monitored and one verification badge; Prices showed pin prices, five-category legend and the lowest/highest/spread line; the slider kept "Week of Sep 28 – Oct 4" beside "Loading week of Sep 14 – Sep 20" until the new week loaded; Visit check drew six visits, flagged the two stores with a distant visit, and a visit popup read "420 m from registered pin · GPS accuracy ±8 m"; `locations=1` was sent only in Visit check and wrote exactly two `gis.visit_locations_viewed` rows; returning to Compliance removed the lines and the slider; the drawer requested `weeks=12` and titled itself "12-Week Price History". No console errors.
- **Deviations from the plan, all minor.**
  - The first load is not delayed; the 300 ms wait applies to later week and layer changes.
  - `weeks` also contains the requested week when it has no visits, so the slider always has a position for the loaded week.
  - Chips wrap onto a second row instead of scrolling sideways (five categories no longer fit one row).
  - A commodity's unit is appended to its name only when the name does not already contain it ("Absolute (1L)").
  - `.claude/launch.json` (untracked, local) gained a `backend-gis` entry pointing at the throwaway database.

## Inspection 1 — Codex (fresh session) — REVISE

- Codex session: `01a10075-5e86-7443-a7f4-4c4c561876a8`. Observed model: not reported by the CLI. Elapsed: 414s.
- Result: `.../scratchpad/claudex-inspect1/claudex-n3xxuikv/result.json`. `config.toml` identical to the backup before and after.
- Summary: "The implementation has concrete price-selection, verification-marker, and narrow-layout defects."
- Coverage reported: plan hash, plan, review log, project index, status, decisions, product and monitoring rules; the GIS endpoint, route, models, schema, authorization, audit service, visit and verification writers, temporal analytics, web map components, API client, types, styling and tests.
- Limitations reported: static review only; unrelated pre-existing untracked files (`mobile/`, images, `scratch/`) were not individually inspected.

Findings:
- **GIS-IMPL-01 (medium).** Moving to a week without the chosen commodity silently switched the map to another commodity.
- **GIS-IMPL-02 (medium).** An inactive store lost its "Verification required" badge even though deactivation does not close the request.
- **GIS-IMPL-03 (medium).** In a narrow map the control panel sat under the open sidebar, hiding the first layer button.
- **GIS-IMPL-04 (low).** While Visit check had no coordinates, the legend and chips had no entry for the grey unloaded pins.

Host dispositions (all verified, all accepted and fixed by Claude):
- GIS-IMPL-01: the chosen commodity (and the default, once the slider moves) is kept with its label across weeks; a week without it shows grey pins, no summary, and "No price was recorded for this commodity in this week." Two tests added.
- GIS-IMPL-02: the badge is computed before the inactive branch. Test added.
- GIS-IMPL-03: the panel narrows beside the open sidebar and otherwise stacks above it (`z-index: 510`); layer buttons wrap. Checked in the browser at map widths of 647 px and 712 px: all four buttons are the top element at their centre.
- GIS-IMPL-04: legend and chips show "Visit locations not loaded (n)" until coordinates arrive. Test extended.
- Proof after fixes: four GIS web files 30 passed; full web suite 237 passed; backend GIS tests 15 passed; build and lint clean.

## Inspection 2, attempt 1 — Codex — FAILED PROCESS (not a verdict)

- Fresh session `01a1007e-ad2f-7833-9cc2-288dda51428e` stopped after 9s with exit code 1: "You've hit your usage limit ... try again at 3:32 PM." No review was produced.
- This is an operational failure, not an approval or a rejection, and does not use an inspection round. `config.toml` identical to the backup before and after.
- Next: one retry in a fresh session after the limit resets. The fixes for Inspection 1 remain uninspected until then.

## Inspection 2 — Codex (fresh session, retry at 15:35) — REVISE

- Codex session: `01a100b0-21b7-7000-89b0-f3c24932b522`. Observed model: not reported by the CLI. Elapsed: 378s.
- Result: `.../scratchpad/claudex-inspect2b/claudex-rb3wobrw/result.json`. `config.toml` identical to the backup before and after.
- Summary: "The GIS implementation follows the reviewed plan in the inspected paths, but the price-history drawer has two range-change defects. The new map controls also miss the product's touch-target requirement."
- It raised nothing against the four Inspection 1 fixes or the GIS endpoint, audit path, week handling or map layers.
- Limitations reported: static review only; unrelated pre-existing untracked files not individually inspected.

Findings:
- **GIS-IMPL-05 (medium).** After a failed range change the drawer kept the previous range's chart under the new heading.
- **GIS-IMPL-06 (medium).** A commodity chosen in a wider range stayed selected in a narrower one that lacks it, so the drawer said "no records" while another commodity had data.
- **GIS-IMPL-07 (low).** Layer buttons were 32 px high and the commodity select had no minimum; `PRODUCT.md` requires 44 px touch targets.

Host dispositions (all verified, all accepted and fixed by Claude):
- GIS-IMPL-05: rows are cleared when a range load starts, and the chart is not drawn while there is an error. New test failed before the fix and passes after.
- GIS-IMPL-06: the selected commodity is used only if the loaded results contain it; otherwise the first available one. New test failed before the fix and passes after.
- GIS-IMPL-07: 44 px minimum on the layer buttons, week slider, commodity select, Retry buttons and the drawer's Range select. Measured in the browser: layer buttons 105 x 44.
- Proof after fixes: full web suite 32 files, 239 passed; build and lint clean. Backend unchanged since its 15 GIS tests passed.

## Status after the inspection budget

- Inspections used: 2 of 2 (plus one failed process that produced no review). Neither returned APPROVED.
- **Not independently inspected:** the three fixes for GIS-IMPL-05/06/07 (`StoreDetailOverlay.tsx`, its test, and `admin.css` sizes). Everything else in the diff was covered by Inspection 2.
- Owner asked to commit only after the inspection passes. It has not passed, so nothing is committed. A further inspection or a commit without it is the owner's decision.
- **Owner decision (2026-10-03):** run a third inspection in a fresh session; commit only if it returns APPROVED.

## Inspection 3 — Codex (fresh session) — REVISE

- Codex session: `01a100e8-a38a-7601-a3d4-8ecc241b9fbc`. Observed model: not reported by the CLI. Elapsed: 672s.
- Result: `.../scratchpad/claudex-inspect3/claudex-vt03e68k/result.json`. `config.toml` identical to the backup before and after.
- Summary: "The implementation has two unresolved Visit check defects and two smaller UI specification gaps."
- It raised nothing against the fixes for GIS-IMPL-01 to 07, the endpoint, the audit path or week handling.
- Limitations reported: static review only; unrelated pre-existing untracked files not individually inspected; live API not inspected.

Findings:
- **GIS-INSP3-01 (medium).** Visits signed at the same GPS point overlapped, so only the top one's popup could be opened, and a point at the registered pin sat under the store pin.
- **GIS-INSP3-02 (medium).** After a good Visit check load, leaving and returning within the 300 ms wait kept the located payload; if the new request then failed, the old classification stayed with no error or Retry.
- **GIS-INSP3-03 (low).** In Compliance an inactive store without findings has no chip or legend entry, so category counts do not add up to All.
- **GIS-INSP3-04 (low).** Filter chips were 40 px high, under the 44 px touch-target rule.

Host dispositions (all verified):
- GIS-INSP3-01 ACCEPTED, fixed. One point per captured location, with every visit signed there listed in its popup; the points live in their own pane placed after the marker pane. The browser check showed why document order matters: `admin.css` forces every Leaflet pane to `z-index: 1`, so the pane is inserted right after the markers and before tooltips and popups. Verified live: pane order marker, gis-visits, tooltip, popup; all six points are the top element at their centre. Tests added.
- GIS-INSP3-02 ACCEPTED, fixed. Visit check uses coordinates only when the payload has them and no request is in flight or failed; otherwise it shows the loading or unavailable state with Retry. Test added for the leave-and-return failure.
- GIS-INSP3-03 REJECTED. This is the map's behaviour before the build (`StoreManager.tsx` at the base commit counts the same three categories), it is asserted by the existing test "keeps inactive stores under All and removes GIS invitation controls", and acceptance criterion 1 requires Compliance to stay unchanged. The inactive pin still carries its "Account Inactive" label in the list and popup. Changing it is an owner decision, not a build defect.
- GIS-INSP3-04 ACCEPTED, fixed. Chips have a 44 px minimum; measured 44 in the browser.
- Found by the host's browser check, not by the inspector, and fixed: after the Inspection 1 layout change the four layer buttons wrapped three-and-one at normal width. They are back in one row (75 x 44 each) and fall to two columns only when the panel is under 300 px.
- Proof after fixes: four GIS web files 34 passed; build and lint clean; backend GIS tests 15 passed. Full web suite: 241 passed in four runs at normal machine load. In four other runs made while the dev servers or a build were also busy, one to four tests in `AppSession.test.tsx` and `AdminSafeguards.test.tsx` timed out; both files are untouched by this build and pass on their own, so this reads as load-sensitive timing, but it was not investigated further.

## Status after Inspection 3

- Inspections: three completed, none APPROVED (4, 3, then 4 findings; no high severity in any; ten fixed, one rejected with reasons).
- **Not independently inspected:** the Inspection 3 fixes (`StoreMap.tsx` visit points and pane, `StoreManager.tsx` location readiness and chip height, `storeMapUtils.ts` popup, `admin.css` grid, and their tests) and the rejection of GIS-INSP3-03.
- The owner's condition for committing (an inspection that passes) is not met. Nothing is committed.
- **Owner decision (2026-10-03):** commit locally to `feat/gis-monitoring` with this status stated; no push. Merging to `main` remains gated on the owner's review or a later inspection.
