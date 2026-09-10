# Capstone Monitoring Data Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed one realistic, completed September 1, 2026 routine monitoring form for every active establishment so weekly history, anomaly detection, temporal references, and APC preparation can be demonstrated safely.

**Architecture:** Add one explicit Laravel seeder that reuses the current models, `FieldReferenceResolver`, evidence disk, and APC preparation service. It creates deterministic demo officers, records, item snapshots, temporal mirrors, signature evidence, and append-only audit entries in one transaction. It is not added to `DatabaseSeeder`, so ordinary database seeding cannot create regulatory-looking demo evidence accidentally.

**Tech Stack:** Laravel 12, Eloquent, Carbon, PHPUnit, existing private evidence storage.

**Spec:** `docs/dti-monitoring-rules.md`

## Global Constraints

- Treat September 1, 2026 as a Manila-time Tuesday in the completed weekly period August 31 through September 6, 2026.
- Seed all active establishments discovered at execution time; do not hard-code database IDs.
- Create routine records only: `status=accepted`, `protocol_mode=standard`, and `field_verification_request_id=null`.
- Preserve immutable history. Never update or delete an existing monitoring record or monitoring item.
- Abort before writing if a store already has a non-demo accepted routine record in the target week.
- Use deterministic UUIDs and exit as a no-op when the complete matching demo dataset already exists.
- Clearly label every synthetic officer, representative, client version, signature image, and audit event as capstone demo data.
- Do not add the seeder to `DatabaseSeeder`; it must require the explicit command `php artisan db:seed --class=CapstoneMonitoringSeeder --force`.
- Do not execute the seeder against production until implementation tests pass, a preflight summary is reviewed, and the user separately approves the production data change.
- No new packages, admin endpoints, UI controls, or schema migrations.

---

## Task 1: Make SRP commodity identities complete and stable

**Files:**
- Modify: `backend/database/seeders/SrpMasterListSeeder.php`
- Test: `backend/tests/Feature/CapstoneMonitoringSeederTest.php`

- [ ] Add a failing test proving every current price-freeze-covered bulletin imported from the official master list receives a non-null `commodity_key`.
- [ ] Derive a key only when the row does not already have one, using the existing catalog convention: `Str::slug($itemName.' '.$unit)`.
- [ ] Preserve any existing key so rerunning the master-list seeder cannot rewrite regulatory lineage.
- [ ] Before saving, detect a derived-key collision with a different commodity name/unit and throw a descriptive exception rather than merging products.
- [ ] Run the focused test.

Core change:

```php
$attributes['commodity_key'] = $existing?->commodity_key
    ?: Str::slug(trim($itemName.' '.$unit));
```

The capstone seeder must still preflight all effective covered bulletins and abort with their IDs/names if any key remains missing or duplicated. It must not silently repair catalog identity while creating monitoring evidence.

---

## Task 2: Create deterministic demo signatures and monitoring records

**Files:**
- Create: `backend/database/seeders/CapstoneMonitoringSeeder.php`
- Create: `backend/database/seeders/assets/capstone-demo-officer-signature.png`
- Create: `backend/database/seeders/assets/capstone-demo-representative-signature.png`
- Test: `backend/tests/Feature/CapstoneMonitoringSeederTest.php`

- [ ] Add two small PNG fixtures visibly stamped `CAPSTONE DEMO - NOT A REAL SIGNATURE`.
- [ ] Add a failing feature test that seeds official stores and SRP rows, runs `CapstoneMonitoringSeeder`, and expects one accepted standard routine form per active store on September 1, 2026.
- [ ] Create three inactive synthetic users named `CAPSTONE Demo Field Officer 1` through `3`, with `.invalid` emails and unusable random passwords. Reuse them by email on reruns.
- [ ] Resolve all active stores at runtime in stable `store_name`, then `id` order. Fail if none exist or any lacks usable coordinates.
- [ ] Use deterministic visit slots between 08:15 and 16:30 Manila time, distributed across the three demo officers so the ten visits are plausible within one day.
- [ ] Set location coordinates to each store's saved coordinates plus a deterministic tiny offset, accuracy between 5 and 12 metres, and capture time during the visit.
- [ ] Set representative fields to `CAPSTONE DEMO Representative` and `Store Representative`.
- [ ] Use deterministic UUIDv5-style values derived from `capstone-monitoring-v1|2026-09-01|store:{id}`. Use `client_version=capstone-seed-2026-09-01` and `sync_source=online`.
- [ ] Copy the demo PNG fixtures into the existing private evidence disk under the normal `field-monitoring/{record_id}/...` paths; store the actual SHA-256 hashes.

Record shape:

```php
[
    'status' => 'accepted',
    'finalized_at' => $visitAt,
    'received_at' => $visitAt->copy()->addMinutes(2),
    'protocol_mode' => 'standard',
    'protocol_reference' => null,
    'field_verification_request_id' => null,
    'client_version' => 'capstone-seed-2026-09-01',
]
```

- [ ] Wrap preflight, records, items, temporal mirrors, and audit inserts in a transaction. If evidence storage fails, delete only files written by this attempted run and roll back the database transaction.
- [ ] Append one `monitoring.capstone_demo_seeded` `AuditEvent` per created record with `synthetic=true`, dataset version, target date, store name, item count, and anomaly count.
- [ ] On a second run, validate the deterministic records, item counts, hashes, and temporal mirrors, then report `already complete` without adding rows or audit events.

---

## Task 3: Populate realistic product coverage and prices

**Files:**
- Modify: `backend/database/seeders/CapstoneMonitoringSeeder.php`
- Test: `backend/tests/Feature/CapstoneMonitoringSeederTest.php`

- [ ] Select the bulletin revision effective on September 1, 2026 for each stable commodity key.
- [ ] Assign every active price-freeze-covered commodity to three establishments using a deterministic rotation. This supplies at least three observations per covered product for useful min/max/average APC preparation while keeping forms to a plausible size.
- [ ] Add 6-10 deterministically selected non-covered SRP products to each form so testing can confirm they remain on SRP during a later Price Freeze.
- [ ] Use exactly two anomaly establishments: `HARO MART` and `Unitop General Merchandise`. Fail preflight if either cannot be found, rather than silently choosing different stores.
- [ ] For six covered products at each anomaly store, use deterministic factors of `1.12`, `1.15`, or `1.18` against the resolved September 1 SRP. This guarantees those observations exceed the current standard-mode `>10%` anomaly rule.
- [ ] For every other line, use deterministic factors of `0.96`, `0.98`, or `1.00`. This keeps the other eight establishments clean while ensuring most prices are not identical to SRP.
- [ ] Round like store shelf prices: nearest PHP 0.05 below PHP 10, PHP 0.25 from PHP 10-99.99, and PHP 0.50 from PHP 100 upward.
- [ ] If rounding makes all observations for one commodity identical, move one clean observation down by one valid price tick without crossing zero.
- [ ] Resolve every item's historical reference with `FieldReferenceResolver::resolve($bulletin, $visitAt)` and persist the full snapshot plus `FieldReferenceResolver::version(...)`.
- [ ] Calculate `variance_percent` and `is_anomaly` with the same current backend rules used by `FieldMonitoringController`.
- [ ] Create one verified `TemporalInspection` for each monitoring item and link both `monitoring_record_id` and `monitoring_record_item_id`.

Minimal shared formulas:

```php
$variance = (($recorded - $reference['value']) / $reference['value']) * 100;
$isAnomaly = $reference['type'] === 'emergency_ceiling'
    ? $recorded > $reference['value']
    : $recorded > $reference['value'] * 1.10;
```

Do not invent APC rows or mark min/max/average as official. This task creates source observations only.

---

## Task 4: Prove history, anomaly, and APC-source behavior

**Files:**
- Modify: `backend/tests/Feature/CapstoneMonitoringSeederTest.php`
- Reference only: `backend/tests/Feature/EmergencyApcWorkflowTest.php`

- [ ] Assert there is exactly one accepted standard routine record per active establishment in the August 31-September 6 week.
- [ ] Assert all item snapshots have `reference_type=standard_srp`, reference value/source/effective date/source ID/version, and retain those values if the current SRP is later revised.
- [ ] Assert every active covered commodity has observations from at least three distinct stores.
- [ ] Assert only `HARO MART` and `Unitop General Merchandise` contain anomaly items, with exactly six anomaly items each; all other stores have zero.
- [ ] Assert some prices equal SRP but most do not, and no clean-store price exceeds its historical SRP.
- [ ] Assert every monitoring item has exactly one verified temporal mirror with matching store, bulletin, price, timestamp, officer, and anomaly flag.
- [ ] Create a draft emergency declared September 9, 2026 and invoke the existing APC preparation service.
- [ ] Assert its source week is August 31-September 6, all source record IDs come from this seed, and each covered candidate contains minimum, maximum, observed average, and computed midpoint APC.
- [ ] Assert APC preparation creates candidates only; no `RegulatoryPriceRecord` exists until the existing DTI Admin confirmation workflow is used.
- [ ] Assert non-covered products are absent from APC candidates.
- [ ] Run:

```powershell
cd C:\CAP101_DTI_SYS\backend
php artisan test --filter=CapstoneMonitoringSeederTest
php artisan test --filter=EmergencyApcWorkflowTest
php artisan test
```

---

## Task 5: Review and seed the deployed backend

**Files:**
- No additional source files unless verification finds a defect.

- [ ] Review the final diff and confirm only the SRP key preservation change, capstone seeder, demo assets, tests, and this plan are included.
- [ ] Run Laravel Pint on changed PHP files and repeat the focused/full backend tests.
- [ ] Commit and push only the approved backend seed implementation after explicit user authorization; allow the existing Render backend service to deploy it.
- [ ] Verify `/up` and `/api/health/ready` return healthy responses before changing production data.
- [ ] Execute the explicit production command through a Render shell/one-off job:

```bash
php artisan db:seed --class=CapstoneMonitoringSeeder --force
```

- [ ] If the Render service tier has no shell/one-off execution, stop and get approval for a separately reviewed one-deploy startup hook. Do not add a public/admin seed endpoint.
- [ ] Capture the command summary: store count, record count, item count, temporal count, anomaly stores/counts, source week, evidence hashes, and whether the run created or merely verified data.
- [ ] Verify through DTI Admin that all ten September 1 forms render with their historical SRP snapshots and only the two intended stores show anomalies.
- [ ] Start an APC preparation with a September 9 declaration and verify min/max/average/midpoint are built from the September 1 dataset, remain unconfirmed, and require DTI Admin confirmation.
- [ ] Activate the confirmed Price Freeze in the normal workflow, verify covered products switch to APC while non-covered products remain SRP, then end it and verify normal temporal SRP resumes. Do not leave the demo emergency active after acceptance testing.

## Expected Seed Result

- 10 completed routine monitoring forms: one per currently active establishment.
- Roughly 43-47 lines per store: about 37 covered-product observations plus 6-10 non-covered observations.
- At least three observations for every covered commodity.
- Exactly two stores with flagged overpricing: HARO MART and Unitop General Merchandise.
- Exactly six flagged items in each anomaly store; all other establishments clean.
- Full immutable historical reference snapshots and matching temporal history rows.
- APC preparation data for the August 31-September 6 source week, but no automatically official APC.
