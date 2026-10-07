# APC lookback: plan review log

Append-only.

## Run setup (2026-10-07)

- Host and planner: Claude Code (Opus 5.5). Plan reviewer: Codex CLI 0.160.1, model and effort left to the
  CLI default (none requested). Builder: Claude. Final inspector: fresh Codex session.
- Plan: `docs/plans/apc-lookback/PLAN.md`. Round limit: 5 plan reviews, 2 fix rounds, 2 inspections.
- Scope: APC preparation rule (backend service and controller, admin web panel, DECISIONS entry).
- Authorization: user approved the plan and building on 2026-10-07. No commit, push, deploy, migration or
  production data change is authorized.
- Codex config guard (AGENTS.md): `~/.codex/config.toml` backed up outside the repo before each call,
  SHA256 recorded, every `[mcp_servers.*]` table forced to `enabled = false`, restored and hash-checked after.
  `mcp_servers.node_repl` had no `enabled` key at the start of this run, so the guard had to add one.
  The write/outbound plugins named in AGENTS.md were already disabled.
- Runner artifacts: session scratchpad, outside the checkout.

## Round 1 (2026-10-07): REVISE

- Plan SHA256 `bd8e710c06577318aa75502f7514f966f062de1d2b7cbdc1575603246eed6440`. Codex session
  `01a1161f-1e30-73a3-b2fc-aa45e49c0259`, 164 s, model not reported by the CLI.
- Result: `<scratchpad>/round1/claudex-hkijqw3y/result.json` (status `completed`). The runner process itself
  exited 1 after writing it, because the Windows console codec could not print a peso sign; the review turn
  was complete and valid. Later rounds set `PYTHONUTF8=1`.
- Config guard: backup hash `6c239d5b...5080`, restored and matched.

Reviewer summary: "The plan hash matches the supplied SHA256. Four concrete defects remain in historical unit
handling, activation consistency, provenance storage, and client compatibility."

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| APC-001 | high | Lookback groups by `commodity_key` only; a revision may change `unit` under the same key, so an old per-kg price could become the ceiling for a 5 kg bag. | Accepted. Only observations whose bulletin unit matches the unit in effect on `starts_on` count; otherwise SRP fallback. Test added. |
| APC-002 | high | Activation verifies the hash, then reads coverage and fallback SRP again; a revision committed in between could write an unreviewed price. | Accepted. One `snapshot()` per activation supplies hash and fallback values. The mid-request simulation test was declined: no second read remains to race. |
| APC-003 | medium | Fallback `source_reference` concatenates free text into `varchar(255)`; overflow would surface as a misleading "overlapping emergency" error. | Accepted. Cite bulletin by id; `declaration_reference` gets `max:150`. Boundary tests added. Separate length-error handler declined as unreachable. |
| APC-004 | medium | Dropping `missing_commodity_keys` lets an old admin tab activate without showing fallbacks. | Accepted, staged option. Keep sending the field so old tabs stay blocked; remove later. Versioned contract declined as heavier than the problem. |

Reviewer coverage: plan and hash; docs index, PROJECT-MAP, CURRENT-STATUS, DECISIONS; APC preparation, emergency
payloads, activation, lifecycle updates, reference resolvers, models, schema; SRP revision, import and creation
writers; field monitoring acceptance and bootstrap, consumer price comparison, vendor SRP references;
EmergencyToggle, TypeScript contracts, EmergencyApcWorkflowTest, AdminRouteHardeningTest.

Reviewer limitations: static review only; production counts not independently inspected; other verification
suites named in the plan not fully inspected.

## Round 2 (2026-10-07): REVISE

- Plan SHA256 `337e4a43e9466bddb63cf9f752c2ff11af0c2894e2a6642db6e1e186ef16cc35`. Same Codex session resumed
  (`01a1161f-1e30-73a3-b2fc-aa45e49c0259`), 81 s. Result: `<scratchpad>/round2/claudex-fy3mf895/result.json`.
- Config guard: restored and matched.

Reviewer summary: "The revised plan matches the supplied SHA256. The activation snapshot and bounded provenance
changes address APC-002 and APC-003. Two concrete gaps remain in the unit guard and old-client protection."

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| APC-005 | high | The eager-load selects `bulletin:id,commodity_key` but the unit guard reads `bulletin.unit`, so every observation would look incompatible and fall back to SRP. | Accepted. Projection now includes `unit`; matching-unit assertion added. |
| APC-004 | medium | Fallback keys alone do not block an old tab when all products are observed but some in earlier weeks. | Accepted. `missing_commodity_keys` keeps its original meaning (no observation in the cutoff week), so it lists fallbacks plus earlier-week candidates. Test added. Versioned contract still declined. |

Reviewer limitations: static review only; production counts, unit consistency and declaration lengths not
independently verified; implementation needs a later diff review.

## Round 3 (2026-10-07): APPROVED

- Plan SHA256 `9fa1038500647b6a07cdc4f14049e30649faee844ca50a2f09328a176c734358`. Same Codex session
  (`01a1161f-1e30-73a3-b2fc-aa45e49c0259`), 51 s. Result: `<scratchpad>/round3/claudex-4h82dx5p/result.json`.
- Config guard: restored and matched.
- No findings. Rounds used: 3 of 5.

Reviewer summary: "The on-disk plan matches the supplied SHA256. All prior findings are addressed, including
loading bulletin.unit and blocking old clients for earlier-week candidates. No material unresolved plan defects
were identified."

Reviewer limitations: approval covers the plan only; no tests run; production data counts, unit consistency and
live deployment behavior not independently verified. Zero findings is not proof of exhaustive correctness.

## Build start (2026-10-07)

- Approval check passed against plan SHA256 `9fa10385...4358`.
- Pre-build commit `f20b8168ecb0bd367cc768c73a011cdda1700879`. Builder: Claude (host), in the live checkout.
- The checkout already carried unrelated uncommitted work (legal notices, vendor PWA, admin API). Of the files
  this build edits, `web/src/types/admin.ts`, `web/src/components/admin/admin.css` and `docs/DECISIONS.md`
  already had such edits. Pre-build copies of every file this build touches were saved to the scratchpad so
  this build's own diff can be separated from that work.

## Build result (2026-10-07), builder: Claude

Files changed by this build: `EmergencyApcPreparationService.php`, `EmergencyAdminController.php`,
`EmergencyPriceResolver.php`, `EmergencyApcWorkflowTest.php`, `web/src/types/admin.ts`, `EmergencyToggle.tsx`,
`LegalNoticeAndEmergency.test.tsx`, `docs/DECISIONS.md`. No migration, no CSS change.

Proofs run by the host in the live checkout:

- `php artisan test --filter="EmergencyApcWorkflowTest|AdminRouteHardeningTest|FieldNotificationTest|FieldEmergencyRulesTest|CapstoneMonitoringSeederTest|AdminRegulatoryWorkflowTest"`:
  41 tests passed, 2133 assertions. The five new APC tests failed before the implementation for the expected
  reasons and pass after it.
- `npx vitest run src/components/admin/LegalNoticeAndEmergency.test.tsx src/components/admin/AdminSafeguards.test.tsx`:
  23 tests passed. `npx tsc -b`: exit 0. `oxlint` on the two changed web files: no findings.
- Read-only simulation of the new rule on production data for a start date of 2026-10-07: 124 covered
  products, 123 candidates (5 from the cutoff week, 116 from the week of Aug 31, 2 from the week of Sep 7),
  1 SRP fallback, none without a valid SRP.

Deviation from the plan: the detail payload derives `srp_fallbacks` from the stored candidates (covered
bulletins minus stored candidate keys) instead of calling `snapshot()`. Reason: the payload is built for every
declaration in the list, and the stored candidates are what the stored hash describes. Activation still writes
fallback records from its single snapshot, as planned.

Not verified: the panel was not opened in a browser. The local admin build talks to the production API and
needs an admin sign-in, which the host does not perform. The component test covers the rendered output.

Inspection setup: the live checkout holds unrelated uncommitted work, so this build's changes were copied onto
a clean worktree of the pre-build commit (`.claude/worktrees/apc-lookback-inspect`) and inspected there.

## Inspection 1 (2026-10-07): not a valid result; findings taken on their merits

- Fresh Codex session, 383 s, against snapshot `c1c5bdbc...4bfe` (diff `aef4577c...3457`) in the worktree.
  Artifacts: `<scratchpad>/inspect1/claudex-msaz9rgg/`. Config guard: restored and matched.
- The runner rejected the reply (`Invalid limitations list.`: the list ended with an empty string), so the run
  is recorded as failed and is **not** an approval. The reply itself was complete and carried verdict REVISE
  with three findings; the host read `reply.txt` and arbitrated them rather than spend a retry on the format.

| Id | Severity | Finding | Disposition |
|---|---|---|---|
| APC-006 | high | `prepare()` checks draft status in the controller, outside the lock. A refresh admitted before activation commits could then delete the confirmed candidates (and null `source_candidate_id` on official records) and overwrite the hash. Pre-existing race. | Accepted. `prepare()` now locks the emergency row and rechecks draft status inside its transaction; the controller check moved there. Test: refresh of an activated declaration returns 422 and leaves candidates. A true concurrency test was declined: the suite runs on SQLite with one connection. |
| APC-007 | high | A product held at SRP has no monitoring item, so `SrpManagementController::updateMetadata` lets its unit (and so its commodity key) change; the official record keeps the old key and the freeze reference becomes unavailable. | Accepted. Metadata edits that change a commodity key are refused while an official price record for that key can still apply (emergency active or ended, `effective_until` not passed). This also closes the same gap for a plain rename of an APC product, which existed before this build. Test added. This file is outside the plan's list; DECISIONS updated. |
| APC-008 | medium | `max:150` only binds new declarations; a pre-upgrade draft with a 200+ character reference would overflow `source_reference` with the longer SRP suffix. | Declined. Production holds two declarations, both with a 12-character reference (read 2026-10-07), and no other environment carries real declarations. After deploy the state cannot be created. A guard for it would be code for a case that does not exist. |

Reviewer limitations as written: static review only; test results in this log not independently verified;
production counts, declaration lengths, deployment behavior and concurrency not exercised.

## Fix round 1 (2026-10-07), author: Claude

- Changed: `EmergencyApcPreparationService::prepare`, `EmergencyAdminController::prepare`,
  `SrpManagementController::updateMetadata` (new to this build), `EmergencyApcWorkflowTest`, `docs/DECISIONS.md`.
- Proof rerun, with `AdminSrpManagementTest|AdminSrpAvailabilityTest|PublicImageRuleTest` added to the filter
  because the SRP metadata endpoint changed: 80 tests passed, 2369 assertions.
- The two new assertions were written together with their fixes; they were not observed failing first.
- These edits postdate inspection 1, so a second fresh inspection follows.

## Inspection 2 (2026-10-07): REVISE. Inspection budget exhausted (2 of 2)

- Fresh Codex session `01a1163a-4f5b-7ea1-808d-dc0a6d886f61`, 272 s, snapshot `c85a9613...7229`. Valid result:
  `<scratchpad>/inspect2/claudex-4c3_m3ol/result.json`. Config guard: restored and matched.
- The three inspection-1 items were not raised again.

Reviewer summary: "The plan hash matches. Two unresolved defects can invalidate confirmed Price Freeze
references through SRP changes."

| Id | Severity | Finding | Host position |
|---|---|---|---|
| APC-009 | high | `SrpRevisionService` still lets a revision change the unit under the same commodity key. Published during a freeze, the resolver picks the new revision but applies the official ceiling confirmed for the old unit. | Valid, **unresolved**. Not introduced by this build: the same happens today with an APC record. Fix is small (refuse a unit-changing revision while an official reference for that key can still apply). |
| APC-010 | high | The metadata guard added in fix round 1 is not serialized with activation. A rename committed between activation's snapshot and its inserts leaves the new official record under the old key. | Valid, **unresolved**. Narrow window (two admin actions at the same moment); before fix round 1 the same edit was unguarded at any time. Fix is to take the existing APC advisory lock in activation and in SRP identity changes. A PostgreSQL concurrency test cannot run in this suite. |

Stopped here per the round limits rather than editing again without an inspection to cover it. Nothing in this
build has an APPROVED inspection: inspection 1 was format-invalid and inspection 2 is REVISE.

Final proof state (host, live checkout): full backend suite 772 tests passed, 5902 assertions; the two web
test files 23 passed; `tsc -b` exit 0.

## Fix round 2 (2026-10-07), author: Claude (a later session)

Scope: the two findings left open by inspection 2. The round limits above were already used up; this round and
the inspection after it were requested separately by the user's coordinating session. Nothing is committed.

Changed: `RegulatoryPriceRecord.php` (new scope), `EmergencyApcPreparationService.php` (lock helper),
`EmergencyAdminController::activate`, `SrpManagementController::updateMetadata`, `SrpRevisionService.php`,
`EmergencyApcWorkflowTest.php`, `docs/DECISIONS.md`. `SrpRevisionService.php` and `RegulatoryPriceRecord.php`
are new to this build.

- **APC-009.** `SrpRevisionService::preview` now refuses a revision whose unit differs (trimmed,
  case-insensitive) from the unit the official reference was confirmed for, while a reference for that
  commodity key can still apply. `create()` runs `preview()` inside its transaction, so the single-revision
  endpoint, the preview endpoint and batch revisions share the one check.
  - Compared against the bulletin in effect on the reference's `effective_from` (the declaration date), not
    against the row being revised. A lineage can already hold two units, and revising the older row "unchanged"
    would otherwise republish the other unit under the frozen key. The new test covers that case.
  - "Can still apply" now lives once in `RegulatoryPriceRecord::scopeStillApplicable` and is used by this check
    and by the metadata guard from fix round 1. It includes an active declaration that has not started yet.
  - `create()` rereads the revised row after taking the lock, so the check uses the key and unit as committed.
- **APC-010.** `EmergencyApcPreparationService::lock()` wraps the existing `pg_advisory_xact_lock(20260901)`.
  It is the first statement of the transaction in `prepare()` (as before), `activate()`, `updateMetadata()` and
  `SrpRevisionService::create()`. Lock order is the same everywhere: advisory lock, then rows (the declaration
  row in `prepare()` and `activate()`, the bulletin lineage rows in `updateMetadata()`). Preparation and
  activation take no bulletin row locks and the SRP paths take no declaration row lock, so no cycle is added.
  `EmergencyAdminController::store` creates the draft row and then calls `prepare()`; that order is unchanged
  and the new row is invisible to other transactions until commit. `batchRevisions` only reads before its
  first `create()` call takes the lock. Under PostgreSQL's default READ COMMITTED each statement after the
  lock sees what the previous holder committed: an activation that waited on a rename recomputes a different
  hash and returns `APC_PREPARATION_STALE`; a rename or unit-changing revision that waited on an activation
  finds the official record and is refused.

Proof (host, live checkout):

- The new test `test_revision_cannot_change_the_unit_of_a_frozen_product` was run before the fix and failed at
  the post-activation preview (expected 422, got 200). It passes after the fix.
- `php artisan test` in `backend/`: 773 tests passed, 5921 assertions (772 before, plus the new test).

Not verified, stated plainly:

- **No concurrency test.** The suite runs on SQLite with one connection, where `lock()` does nothing. No test
  executes the advisory lock statement or the interleavings described above; they are argued from the code.
- **Imports are not covered by the unit check**, and do not go through `SrpRevisionService`.
  `SrpImportService` derives the key from the slug of name plus unit, so a row with a different quantity gets a
  different key. A row can reuse a frozen key with a unit string that differs only in punctuation, or in where
  the name ends and the unit begins. Left as is: the quantity is the same, and refusing a whole bulletin import
  over it would do more harm than the label difference.
- **Open, not fixed in this round: a unit-changing revision scheduled before activation.** A revision created
  while no reference existed, effective after the declaration date, takes effect during the freeze with another
  unit, and the resolver then applies the ceiling confirmed for the old unit. The revision-time check cannot
  see it and activation does not look past the declaration date. Same class as APC-009, older than this build,
  outside the two findings this round was asked to fix. Needs a decision: refuse activation, or warn in the
  review panel.

## Inspection 3 (2026-10-07): REVISE

- Fresh Codex session `01a1164e-9793-7280-9d34-948ff70a383c`, 278 s, Codex CLI 0.160.1, model and effort left
  to the CLI default (not reported back). Valid result: `<scratchpad>/inspect3/claudex-otv3whz9/result.json`.
- Inspected an isolated copy, not the live checkout: `git archive` of the pre-build commit `f20b8168...` as the
  base (isolated base commit `5ba9709e...`), with only this build's 13 files on top. `web/src/types/admin.ts`
  and `docs/DECISIONS.md` carry other sessions' uncommitted edits in the live checkout, so they were rebuilt as
  base plus this build's hunks; the rebuilt `admin.ts` has the same SHA256 as the one inspection 2 saw. Snapshot
  `f9c0a756...d43a`, diff `e674d28c...7d5c`. The copy held the log up to and including "Fix round 2".
- Config guard: `~/.codex/config.toml` SHA256 `6c239d5b...5080` before and after, restored byte-for-byte, backup
  deleted. During the call every `[mcp_servers.*]` table was `enabled = false` (`node_repl` again had no key and
  got one); the write/outbound plugins named in AGENTS.md were already disabled.
- APC-009 and APC-010 were not raised again. Two new findings, both high.

Reviewer summary: "The plan SHA256 matches. The core lookback and SRP fallback flow is implemented, but two
unresolved SRP writer paths can invalidate confirmed freeze references."

| Id | Severity | Finding | Host position |
|---|---|---|---|
| APC-011 | high | A unit-changing revision published before activation, effective inside the declaration window, is not seen by `ensureFrozenUnitKept()` (no official record yet) or by activation (it reads only bulletins effective by the declaration date, and the hash does not cover later ones). When it takes effect the resolver applies the ceiling confirmed for the old unit. Reviewer's fix: under the activation lock, look at revisions effective during the window and refuse activation when a covered key changes unit; show such conflicts in the preparation review and hash; add a regression. | Valid, **unresolved**. This is the case recorded as open under "Fix round 2". Older than this build. Not fixed here: it adds a new activation refusal and review-panel state that the approved plan does not describe, so it needs a decision first. |
| APC-012 | high | `SrpImportService::import` takes no lock and has no freeze check. `preview()` defaults `price_freeze_applicable` to false, so importing a later-dated row for a frozen key without that flag publishes a non-covered revision; `FieldReferenceResolver` then skips the official record and returns the standard SRP (+10% tolerance instead of the ceiling). Reviewer's fix: imports take the activation lock and keep identity and coverage of existing frozen keys; add an import regression. | Valid, **unresolved**. Older than this build (the same happened with an APC record). The "Fix round 2" note above judged imports only for unit changes and missed the coverage flag; that note is wrong on this point. Not fixed here: outside the two findings this round covered. |

Reviewer limitations as written: static review only, no tests run; production counts, deployment behavior and
PostgreSQL concurrency not independently verified; recorded test results are repository claims; other
verification suites named in the plan were not fully inspected.

State: nothing in this build has an APPROVED inspection (inspection 1 format-invalid, inspections 2 and 3
REVISE). Fix round 2 itself drew no finding. APC-011 and APC-012 are open and no edits were made after
inspection 3. Nothing is committed.
