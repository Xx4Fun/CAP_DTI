# APC preparation: per-product lookback + SRP fallback

## Context

Preparing an APC for a Price Freeze starting 2026-10-07 shows "Activation is blocked: no qualifying
source-week observation for ..." with 119 product keys.

This is the rule working as written, not a defect:

- `EmergencyApcPreparationService::snapshot()` (backend/app/Services/Admin/EmergencyApcPreparationService.php:56)
  only reads accepted, standard-protocol, non-verification routine items finalized inside **one** week:
  the completed Manila week before `starts_on`.
- `EmergencyAdminController::activate()` (backend/app/Http/Controllers/Admin/EmergencyAdminController.php:152)
  rejects activation unless **every** Price Freeze-covered key has a candidate.
- Production (Supabase `cap_dti`, read 2026-10-07): 124 covered keys. Draft #2 (start 2026-10-07) has source
  week Sep 28 to Oct 4, which holds 5 accepted routine visits, 8 items, 5 covered keys. The other 119 are the
  list in the message. Full coverage exists only in the seeded week Aug 31 to Sep 6 (123 keys).
  `refresh-500ml-bottled-water-purified-water` has no routine observation in any week.
- The strictness has a reason: during a freeze a covered product without a price record resolves to
  "Emergency reference unavailable" (backend/app/Services/FieldReferenceResolver.php:56).

Real weekly coverage is about 5 products, so the single-week, all-or-nothing rule can only ever activate
against the seeded week. Decision taken with the user on 2026-10-07: **per-product lookback, with SRP held as
the ceiling for products never observed**. This supersedes the first bullet of DECISIONS 2026-09-09.

## Goal and acceptance criteria

1. Each covered product's APC candidate comes from its own most recent completed Manila week that has
   qualifying observations, at or before the cutoff week (the completed week before `starts_on`).
2. Observations from the declaration week or later stay excluded. Verification visits, non-accepted records
   and non-`standard` protocol records stay excluded. APC formula is unchanged (centavo-rounded midpoint of
   that week's min and max).
3. A covered product with no qualifying observation at all no longer blocks activation. On activation it gets
   an official price record equal to its effective SRP, so field, consumer and vendor references keep working.
4. The admin sees, before confirming: each candidate's own source week, and the list of products that will be
   held at SRP. Both are covered by the preparation hash, so a change in either forces a refresh.
5. Activation still fails when there are no covered products at all (`APC_SOURCE_WEEK_EMPTY`).
6. No schema migration. No production data written by this change.

## Approach

### Backend

`backend/app/Services/Admin/EmergencyApcPreparationService.php`

- `snapshot()`: keep `$sourceWeek` as the cutoff. Replace the 124 per-key queries with one query for all
  covered keys: same `record` filters, but only the upper bound `finalized_at < $sourceWeek['ends_at']`;
  eager-load `bulletin:id,commodity_key,unit` (unit is read by the guard below, review finding APC-005) and
  `record:id,store_id,finalized_at`. Group by commodity key in PHP.
  For each key take the latest `finalized_at`, compute `MonitoringWeek::for()` of it, and keep only the items
  inside that week. Feed them to the existing `candidateAttributes()` unchanged.
- Unit guard (review finding APC-001): a revision keeps `commodity_key` but may change `unit`
  (`SrpRevisionService::proposedAttributes`), and items carry no unit of their own. Before grouping, drop every
  item whose own bulletin `unit` differs (trimmed, case-insensitive) from the unit of the bulletin in effect on
  `starts_on`. A product left with no compatible observation becomes an SRP fallback. Production has no key
  with more than one unit today (checked 2026-10-07), so this changes no current result.
- `snapshot()` becomes public and is the single source of truth. It returns `cutoff` (the week), `rows`,
  `fallbacks` and `hash`. `fallbacks` holds, for each covered key with no candidate row,
  `commodity_key, commodity_name, unit, srp_id, srp_price` from the bulletin in effect on `starts_on`. Reuse
  the query already in `coveredCommodityKeys()` (return the bulletins, pluck keys from them) rather than
  writing a second "effective bulletin" lookup.
- Hash: append `[commodity_key, srp_id, srp_price]` for each fallback to the hashed payload. Existing drafts
  become stale once and need "Refresh preparation"; the existing 409 `APC_PREPARATION_STALE` path handles it.
- New `candidateWeeks(Collection $candidates)`: one query on each candidate's first source item, returning the
  Manila week per candidate id. Used by the payload and by activation so both show the same week.

`backend/app/Http/Controllers/Admin/EmergencyAdminController.php`

- `detailPayload()`: add `source_week` (`starts_on`, `ends_on`) to each candidate and add `srp_fallbacks`
  (from `snapshot()['fallbacks']`). Emergency-level `source_week` stays and now means the cutoff.
- Old-client safety (review finding APC-004): keep sending `missing_commodity_keys` with its original
  meaning, "covered keys with no observation in the cutoff week". That is every fallback key **plus** every
  candidate whose own source week is earlier than the cutoff week, so a draft where all products were observed
  but some in earlier weeks is blocked too. An admin tab still running the old build then keeps its activate
  button disabled and shows its old
  "blocked" text until reloaded, so nobody can confirm a preparation without seeing the fallback list. The new
  build ignores the field. Remove it in a later change once the new web build is the only one in use.
- `activate()` (review finding APC-002): take **one** `snapshot()` inside the transaction. Compare the
  submitted hash and the stored `preparation_hash` against `snapshot['hash']`; on mismatch return the existing
  409. Everything written afterwards comes from that same snapshot or from the stored candidates the stored
  hash was computed for. There is no second SRP or coverage read, so a revision committed mid-request cannot
  put an unreviewed price into an official record.
- Block only when the snapshot has neither rows nor fallbacks (`APC_SOURCE_WEEK_EMPTY`) or a fallback has
  `srp_price <= 0` (`APC_COVERAGE_INCOMPLETE`, listing those keys).
- For candidates, `source_reference` uses the candidate's own week instead of the emergency-level week.
- For each fallback create a `RegulatoryPriceRecord` with `price_type = 'SRP'`,
  `authoritative_price = srp_price`, `source_candidate_id = null`, and
  `source_reference = "<declaration> | SRP bulletin #<srp_id>, no routine observation on record"`.
- Length bound (review finding APC-003): `regulatory_price_records.source_reference` is `varchar(255)`. The
  fallback text cites the bulletin by id, not by its free-text reference, so the suffix is at most 60
  characters. `store()` validation gains `max:150` on `declaration_reference`, which also bounds the existing
  "Monitoring week" suffix (43 characters). The two production declarations are 12 characters long.
- Add `srp_fallback_count` to the `emergency.confirmed` audit metadata.

`backend/app/Services/Admin/EmergencyPriceResolver.php:24`: label `'SRP'` records "SRP held as Price Freeze
ceiling" instead of "Frozen prevailing price".

No change to `FieldReferenceResolver`: it already returns `emergency_ceiling` for any price record and labels
non-APC records "Official frozen price reference". `price_type` is a free string column and
`source_candidate_id` is already nullable.

### Admin web

`web/src/types/admin.ts`: candidate gains `source_week?: { starts_on: string; ends_on: string }`; record gains
`srp_fallbacks?: { commodity_key; commodity_name; unit; srp_id; srp_price }[]`; drop
`missing_commodity_keys` from the type (the backend still sends it for old tabs; the new build does not read it).

`web/src/components/admin/EmergencyToggle.tsx`

- `completePreparation`: true when there is at least one candidate or one fallback.
- Header line becomes "Observations up to <cutoff end> · Asia/Manila".
- Candidate table gets a "Source week" column; a row whose week is older than the cutoff week gets a short
  "earlier week" note so stale sources are visible.
- Replace the red "Activation is blocked" alert with a collapsed `<details>` list: "No routine observation on
  record. SRP will be held as the Price Freeze ceiling for N products", each with name, unit and price.
- Update the empty-table row and the form helper sentence to describe the new rule. Keep the review checkbox
  wording ("source week" still matches the existing test regex).

### Docs

`docs/DECISIONS.md` (already has unrelated uncommitted edits; add only): new entry `2026-10-07 - APC source
lookback and SRP fallback`, stating the rule, that it supersedes the single-week bullet of 2026-09-09, and
that no lookback age limit exists.

## Decisions and trade-offs

- **SRP fallback is an official record, not a resolver fall-through.** Keeps the 2026-09-09 rule that the
  freeze only uses confirmed, immutable records, and needs no resolver or PWA change. Consequence: a
  never-observed covered product is judged at 0% tolerance against SRP during a freeze, not SRP +10%.
- **No lookback age limit.** A product last observed months ago still yields a candidate. The per-row source
  week and the "earlier week" note are the safeguard; the admin confirms it. Add a limit if DTI asks for one.
- **One query, grouped in PHP.** Fine at current volume (about 470 items). Mark with a `ponytail:` comment;
  move the "latest week per key" step into SQL if history grows large.
- **`missing_commodity_keys` stays for now as an old-client block.** Backend deploys before web and an open
  tab can outlive the deploy. Sending the field keeps old builds unable to activate; it is client-side only,
  which matches the threat (a stale tab, not an attacker: activation already needs manager role, recent
  re-authentication and a current hash). A versioned confirmation contract was considered and not taken: it
  adds a request field and a rejection path for a problem the existing field already solves.
- **Units are compared, not converted.** Observations under a different unit are ignored rather than rescaled.

## Non-goals

- Seeding or collecting monitoring data for Sep 28 to Oct 4.
- Changing the APC formula, the cutoff week, or which records qualify.
- Editing the capstone paper in `documents/`. If it describes the single-week rule, that is a follow-up.
- Commit, push, deploy. Each needs separate approval.

## Execution order (after this plan is approved)

1. Copy this plan to `docs/plans/apc-lookback/PLAN.md`; start `docs/plans/apc-lookback/PLAN-REVIEW-LOG.md`.
2. Codex plan review via the claudex runner (`py -3.13`, host `claude`, up to 5 rounds). Before each call apply
   the AGENTS.md guard: back up `~/.codex/config.toml`, record SHA256, disable MCP servers and write plugins,
   restore byte-for-byte after and verify the hash.
3. Revise the plan per accepted findings until APPROVED or rounds run out; report unresolved findings.
4. Build (Claude), test-first for the backend changes.
5. Fresh Codex inspection of the diff; fix accepted findings; rerun proofs.

## Verification

Backend, from `backend/`:

```bash
php artisan test --filter="EmergencyApcWorkflowTest|AdminRouteHardeningTest|FieldNotificationTest|FieldEmergencyRulesTest|CapstoneMonitoringSeederTest|AdminRegulatoryWorkflowTest"
```

Tests to add or change in `backend/tests/Feature/EmergencyApcWorkflowTest.php`:

- Existing first test: `milk` moves from `missing_commodity_keys` to `srp_fallbacks` (price 40); rice candidate
  reports `source_week` 2026-08-31 to 2026-09-06.
- New: product observed two weeks before the cutoff and again in the declaration week gets a candidate from
  the older week only; a product observed in both an older week and the cutoff week uses the cutoff week only.
- New: activation with one observed and one never-observed covered product succeeds; creates one `APC` and one
  `SRP` record; `FieldReferenceResolver` returns `emergency_ceiling` with the SRP value for the second.
- New: revising the fallback product's SRP after preparation makes activation return `APC_PREPARATION_STALE`
  and writes no price record. A mid-request revision is not simulated: with one snapshot per activation there
  is no second read for it to land between.
- New: a covered product observed under one unit, then revised to another unit before `starts_on`, gets no
  candidate and appears in `srp_fallbacks` at the revised SRP.
- New: `declaration_reference` of 151 characters is rejected with 422; one of 150 characters activates with a
  fallback record whose `source_reference` is at most 255 characters.
- Changed first test also asserts `missing_commodity_keys` is still `['milk']`.
- The lookback test asserts `missing_commodity_keys` lists the product whose candidate came from an earlier
  week while `srp_fallbacks` is empty (the all-observed, mixed-week draft an old tab must not activate), and
  that a product with a matching non-empty unit (`kg` on both the observation's bulletin and the effective
  bulletin) keeps its candidate.
- `AdminRouteHardeningTest` keeps expecting `APC_SOURCE_WEEK_EMPTY` when there are no covered products.

Web, from `web/`:

```bash
npx vitest run src/components/admin/LegalNoticeAndEmergency.test.tsx src/components/admin/AdminSafeguards.test.tsx
npx tsc -b
```

Add one test: a draft with one candidate and one `srp_fallbacks` entry lists the fallback, shows the candidate
source week, and enables "Confirm and activate" after the review checkbox.

Manual, after deploy approval: open draft #2 in DTI Admin, click "Refresh preparation", expect 123 candidates
(5 from Sep 28 to Oct 4, 118 marked earlier week) and 1 SRP fallback, with the activate button enabled after
review. Do not activate in production without the user's go-ahead: activation switches field monitoring to the
daily emergency cadence.
