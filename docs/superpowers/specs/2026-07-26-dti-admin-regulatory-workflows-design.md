# DTI Admin Regulatory Workflows Design

Date: 2026-07-26
Status: Approved for implementation
Scope: PRICE-Watch DTI Admin only, except required Vendor Portal invitation acceptance integration

## Objective

Extend the existing React and Laravel PRICE-Watch DTI Admin module with auditable vendor onboarding, append-only temporal SRP management, formal receipt review, temporal analytics, emergency controls, safe legal draft previews, and an immutable audit trail.

The implementation must preserve current authentication, public API response formats, Customer PWA behavior, field synchronization routes, Vendor Portal behavior, and existing database records.

## Existing implementation to reuse

- React 19 and Vite Admin shell in `web/src/App.tsx`
- Existing `Dashboard`, `StoreOnboarding`, `VendorPortal`, and `Login` components
- Leaflet map and current San Jose de Buenavista map defaults
- Chart.js and `react-chartjs-2`
- Axios client and Sanctum bearer-token authentication
- Laravel models for users, stores, SRP bulletins, inspections, consumer reports, report status history, legal notices, and citizen tips
- Formal receipt records in `consumer_reports`
- Private receipt vault paths in `consumer_reports.image_vault_path`
- DomPDF and the existing LOI/SCO Blade templates as future official-template inputs
- Existing Vendor Portal notice and response component
- Existing regulatory and historical price resolver concepts

## Verified role names and authorization

Role names present in application code are `super_admin`, `dti_evaluator`, `field_officer`, `vendor`, and `consumer`.

The configured database currently contains `dti_evaluator`, `field_officer`, `vendor`, and `consumer` users. No live `super_admin` account was found.

Authorization will therefore reuse the current names:

- `dti_evaluator`: full DTI Admin workflow access in this implementation
- `super_admin`: same access plus future compatibility where already recognized
- `field_officer`: existing synchronization access and read-only Admin analytics
- `vendor`: invitation acceptance for its own email and existing Vendor Portal access
- `consumer`: no Admin access

Every `/api/admin/*` controller performs server-side authorization. The React UI is not the security boundary.

## API architecture

Add authenticated `/api/admin/*` routes without changing existing route paths:

- `/api/admin/overview`
- `/api/admin/stores`
- `/api/admin/stores/{store}`
- `/api/admin/stores/{store}/invitations`
- `/api/admin/invitations/{invitation}/cancel`
- `/api/admin/srp`
- `/api/admin/srp/import/preview`
- `/api/admin/srp/import`
- `/api/admin/reports`
- `/api/admin/reports/{report}`
- `/api/admin/reports/{report}/decision`
- `/api/admin/reports/{report}/evidence`
- `/api/admin/analytics/stores/{store}`
- `/api/admin/emergencies`
- `/api/admin/emergencies/{emergency}`
- `/api/admin/emergency-prices`
- `/api/admin/legal/draft-preview`
- `/api/admin/legal/dispatch`
- `/api/admin/audit-events`

Add one public invitation-acceptance route that is token protected:

- `/api/vendor-invitations/{token}/accept`

Existing public Customer PWA routes and response payloads remain unchanged.

## Proposed migration

Create one additive, conditional Laravel migration file. It is a proposal only and must not be run against the configured database without approval.

The migration adds:

### Store controls

- `stores.vendor_user_id`, nullable foreign key to users
- `stores.is_active`, only when absent
- `stores.is_verified`, only when absent
- `stores.is_public`, default false
- `stores.verified_at`, nullable
- `stores.verified_by`, nullable foreign key to users

### Vendor invitations

Create `vendor_invitations`:

- store, email, token hash, status, expiration
- invited, accepted, cancelled timestamps
- inviting and accepting user references
- no plaintext token or password column

### Temporal SRP identity

Add to `srp_bulletins`:

- `commodity_key`, nullable and indexed
- `source_reference`, nullable
- `created_by`, nullable foreign key to users

Existing `effective_date` remains the temporal start. Versions are appended and never overwritten.

### Inspection validation

Add to `temporal_inspections`:

- `validation_status`, default `pending`
- `validated_at`, nullable
- `validated_by`, nullable foreign key to users

### Regulatory findings

Create `regulatory_findings` to represent human-confirmed or rejected findings from a formal receipt or field inspection:

- store, SRP version, source type and source identifier
- observed price and observed date
- decision, reason, responsible evaluator, decision timestamp
- unique source constraint to prevent duplicate findings

The legacy `stores.recidivism_index` remains for compatibility but is synchronized only from the count of confirmed findings.

### Emergency declarations and authoritative prices

Create `regulatory_emergencies`:

- location, start and end dates, declaration reference
- status, confirmation timestamp, responsible Admin

Create `regulatory_price_records`:

- emergency, commodity key, price type (`PRICE_FREEZE` or `APC`)
- authoritative price, effective dates, location
- declaration and source references, creator

### Audit trail

Create `audit_events`:

- actor, action, subject type and identifier
- structured metadata, IP address, user agent, creation timestamp

No update or delete Admin API will exist for audit events.

## Vendor onboarding and invitation flow

Store creation and updates reuse the current Leaflet coordinates and store model.

The Admin controls verified, active, and public visibility independently. A store is visible in public establishment APIs only when all required visibility states are true after the migration is approved and run. Until then, existing compatibility behavior remains.

Invitation creation:

1. Generate at least 32 random bytes.
2. Persist only a SHA-256 token hash.
3. Set an explicit expiration.
4. Return the raw invitation URL once in the creation response.
5. Render or log mail only through `array` or `log` mail drivers.
6. Record invitation creation in the audit trail.

Acceptance:

1. Hash the supplied token and find a pending, unexpired invitation.
2. Accept a user-selected permanent password and hash it through the User model.
3. Create or link the vendor user without storing a temporary plaintext password.
4. Link the store through `vendor_user_id`.
5. Mark the invitation accepted and audit the event.

Cancellation and expiration are status transitions and audit events.

## Temporal SRP management

The Admin imports the existing JSON structure used by `DTI_SRP_Master_List_2026-05-11.json`.

Import is two-step:

1. Preview validates metadata, effective date, source reference, item keys, prices, and duplicate versions.
2. Confirmed import inserts new SRP rows in one transaction.

The importer uses the metadata effective date. It does not trust spreadsheet serial values embedded in individual item rows.

`TemporalSrpResolver` resolves the newest version with the same commodity key whose effective date is on or before the receipt or inspection date.

No API updates historical price or effective date fields in place. Management actions append a new version or deactivate future selection while preserving old rows.

## Formal receipt review queue

The queue queries only `consumer_reports`.

It never queries shelf-tag scan sessions or generic `citizen_tips`.

The response exposes:

- report reference and status
- store display name
- submitted and receipt dates
- raw OCR product and price fields
- consumer-confirmed values
- evaluator-confirmed values
- whether private evidence is available

It does not expose vault paths, hashes, owner details, registration details, IP addresses, or user agents.

Decision actions:

- `validate`: store corrected human values in `evaluator_confirmed_json`, preserve `raw_ocr_json`, and create or update a confirmed regulatory finding
- `correct`: same preservation rule, with an explicit correction reason
- `reject`: preserve evidence and OCR, record a rejected finding and report history
- `dismiss`: close without a confirmed finding and record report history

Evidence access is authorized, streamed from private storage, and audited.

## Temporal analytics

`TemporalAnalyticsService` returns a four-week store/product series.

Included price observations:

- formal receipt findings with decision `confirmed`
- field inspections with validation status `verified`

Excluded observations:

- shelf-tag scans
- pending, rejected, or dismissed reports
- unverified or unsigned inspections
- synthetic fallback values

Each observation resolves its SRP version using its own receipt or inspection date. The Chart.js response contains a solid price series and a dashed SRP reference series plus an accessible table representation.

Recidivism equals the count of confirmed regulatory findings for the store. Creating a notice, entering emergency mode, or viewing evidence never changes it.

## State of Calamity controls

Only `dti_evaluator` and `super_admin` may create, confirm, end, or cancel an emergency declaration.

Confirmation requires:

- location
- start date
- optional end date
- declaration reference
- responsible Admin from the authenticated user
- an explicit confirmation flag

Emergency regulatory price resolution uses matching authoritative `regulatory_price_records`.

If no matching record exists, the service returns:

```json
{
  "status": "REGULATORY_PRICE_UNAVAILABLE"
}
```

Normal SRP values are never relabeled as frozen prices or APC ceilings.

## Legal draft preview and dispatch

`LegalPolicyService` reads dedicated configuration. The default configuration has no approved policy and is unavailable.

Actual LOI/SCO generation and dispatch always return:

```json
{
  "status": "LEGAL_POLICY_UNAVAILABLE"
}
```

while no approved policy is configured.

Draft preview:

- uses a separate draft-only view
- displays a persistent `DRAFT - NOT AN OFFICIAL NOTICE` watermark
- uses placeholder data
- does not render or persist an official legal notice
- does not write a PDF to storage
- does not create a deadline
- does not notify a vendor
- does not update recidivism or any report state
- records only the preview access audit event

The existing LOI/SCO Blade templates remain unchanged as future inputs until DTI approves their legal wording.

## Audit trail

Audit events cover:

- store creation and status changes
- invitation creation, expiry, acceptance, and cancellation
- SRP import and version state changes
- receipt evidence access
- report decisions and human corrections
- inspection validation
- emergency changes
- authoritative emergency price changes
- legal draft preview and blocked dispatch attempts
- notice actions after a policy is approved in the future
- vendor responses

Ordinary users cannot update or delete audit records. Audit metadata excludes raw invitation tokens, passwords, private vault paths, and full evidence content.

## Admin UI

Preserve the current Admin shell and expand its navigation:

- Overview
- Stores
- SRP
- Receipt review
- Emergency
- Notice drafts
- Audit

Visual direction:

- preserve the current dark PRICE-Watch identity and amber accent
- replace unsupported glass classes with a complete semantic token system
- dense but readable tables and forms
- visible keyboard focus
- minimum 44 pixel interactive targets
- responsive single-column fallbacks
- inline field errors and `aria-live` feedback
- no decorative motion; only short state feedback transitions
- Chart.js series differentiated by both color and dash style
- accessible chart data table

The signature design element is a regulatory provenance strip showing source, effective date, validation state, and responsible actor. It encodes regulatory truth and is not decorative.

No new component framework is introduced. Existing Leaflet and Chart.js dependencies remain.

## Tests

Backend tests are written before implementation and run against PHPUnit's configured in-memory SQLite database.

Required backend coverage:

- Admin role authorization
- store status and invitation lifecycle
- invitation hashing and one-time raw token response
- append-only SRP import and date resolution
- consumer-report-only queue
- OCR correction preservation
- evidence authorization and audit
- validated analytics filtering
- recidivism from confirmed findings only
- emergency confirmation and authoritative-price unavailable behavior
- legal policy unavailable and side-effect-free draft preview
- immutable audit API

The Admin frontend currently has no test framework. Add Vitest, jsdom, and React Testing Library as development dependencies, then write tests before UI implementation.

Required frontend coverage:

- role-aware navigation
- formal report queue rendering
- original and corrected value presentation
- store status and invitation link UI
- SRP import preview
- emergency confirmation
- unavailable legal-policy state
- audit table
- loading, empty, error, and keyboard-accessible states

Run Admin frontend lint and build after each frontend feature. Run related backend feature tests after each backend feature. Run shared Customer PWA or Vendor Portal regression tests only when integration code changes.

## Operational constraints

- Do not stage, commit, push, deploy, or send real email.
- Do not run the proposed migration against the configured database.
- Do not migrate production data.
- Do not modify public Customer PWA behavior unless required for the approved Admin integration.
- Do not expose private store, owner, registration, evidence, or storage fields in public responses.
- Do not create official notices until a DTI-approved legal policy is configured.
