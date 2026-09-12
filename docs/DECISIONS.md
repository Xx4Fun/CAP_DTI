---
tags:
  - decisions
  - architecture
---

# Durable Decisions

Only record choices that should constrain future work. Newest entries go first and should link to supporting evidence when available.

## 2026-09-12 — Receipt extraction consent and free-tier demonstration

- The PRICE-Watch capstone project team approves **privacy notice v1.2** — which names Google Gemini as the service that may read receipt
  photos for DTI **and states the free-plan terms** — as the notice whose reports may be sent to the extraction engine
  (`RECEIPT_EXTRACTION_CONSENT_VERSIONS=1.2`). v1.1 was superseded before any report consented to it: it described the paid-tier
  arrangement (processor status, storage off) that this project does not have.
- The project has **no paid Google project**. The demonstration runs on the free tier, where Google may use submitted content for
  product improvement and humans may review it. That is recorded as `GEMINI_BILLING_ATTESTED=free_tier_demo` and never as `paid`.
- **Scope: receipts belonging to the project team only.** No member of the public may have their receipt captured while the free-tier
  attestation is in force. Real customer receipts require a paid project and a fresh approval.
- The attestation is stored with every extraction (`processing_result_json.engine.billing_attestation`), so an audit can tell which
  claim allowed a given receipt to be sent.
- Approved by: the PRICE-Watch capstone project team (add member names when signing). This stands in for a DTI DPO sign-off **for
  capstone purposes only**; operating this for real DTI reports requires the DPO's decision.
- Evidence: `docs/plans/receipt-ocr/phase5-rollout-runbook.md`, `docs/plans/receipt-ocr/gemini-extraction-plan.md` §0 and §5.

## 2026-09-09 - APC preparation and immutable monitoring references

- San Jose APC preparation uses accepted routine records from the latest completed Manila monitoring week before the declaration; verification visits and post-declaration observations are excluded.
- For each Price Freeze-covered product, the computed APC candidate is the centavo-rounded midpoint of the observed minimum and maximum. The observed mean and counts remain supporting review statistics.
- A preparation remains a draft until DTI Admin reviews the source records and confirms its dataset hash. Only that confirmation creates separate official APC records and activates Price Freeze; arbitrary manual APC entry is not allowed.
- The backend issues per-product reference packages. During an effective Price Freeze, covered products use confirmed APC records and non-covered products continue using temporal SRP.
- Every new field line pins the issued reference value, type, source identity, effective date, and version. Sync validates the snapshot at the visit finalization time; historical views and analytics use the stored reference rather than recalculating it.
- Price Freeze end dates are inclusive. From the following Manila day, normal weekly cadence and the then-applicable temporal SRP resume without overwriting APC or monitoring history.

## 2026-09-08 - Cadence-aware routine monitoring and assigned additional visits

- Routine monitoring is limited to one accepted visit per active establishment and monitoring period: Monday-to-Monday in `Asia/Manila` normally, or one Manila calendar day while a systemwide Price Freeze is effective.
- A Price Freeze period requires an emergency-protocol routine visit. A standard routine visit from earlier that day does not satisfy the emergency daily requirement.
- Complaint verification and supervisor-directed work share the Additional Visits queue and never satisfy routine coverage. DTI Admin must assign an active Field Officer; officers cannot self-claim and may return untouched assignments to Admin for reassignment.
- The backend is authoritative for duplicate routine rejection. A rejected offline upload remains encrypted device-local work in Needs Attention; completed routine establishments remain visible but disabled in Choose Store.
- This entry supersedes the 2026-09-07 weekly-only cadence and unassigned verification-queue behavior while preserving its evidence and device-local status boundaries.

## 2026-09-07 - Weekly field monitoring status

- The monitoring week runs from Monday 00:00 in `Asia/Manila` to the following Monday 00:00, exclusive. Backend queries convert those boundaries to UTC.
- An establishment is Monitored This Week only when an accepted routine visit has a validated `finalized_at` inside that period. Verification visits, rejected records, and upload time do not satisfy routine monitoring.
- Weekly routine status and active verification requirements are independent; the same establishment may have both. Follow-up Required remains excluded until an explicit follow-up workflow exists.
- In Progress, Pending Sync, and Needs Attention remain encrypted device-local states and do not change backend weekly status before synchronization and acceptance.

## 2026-09-05 — Receipt evidence capture and OCR trust boundary

- New Customer receipt reports use one or more guided still images; continuous video remains supported only for historical evidence.
- Original source images are canonical evidence. Long receipts use ordered overlapping sections, and new captures do not create stitched evidence derivatives.
- New report sessions reject the legacy single-image submission path and prohibit Customer-supplied OCR payloads; stored originals must match their server-recorded SHA-256 when used or served.
- A section retake, added section, or full restart creates a new immutable evidence attempt and preserves prior attempts for Admin inspection.
- Customers may review evidence and system extraction but cannot edit any merchant, date, item, quantity, price, total, or other OCR-derived value. Customer correction columns remain unused for new reports and retained only for historical compatibility.
- Poor or incomplete images require recapture. Clear images with uncertain extraction proceed with warnings for DTI review. Technical OCR failures use processing retry against the same evidence.
- Admin review separates original evidence, raw OCR/system extraction, and DTI evaluator findings. Missing evidence is shown explicitly and never replaced by simulated receipt content.
- Customer review is photo-first with read-only structured results; raw OCR technical presentation is Admin-only. Unknown confidence remains unknown, and OCR continuity uncertainty alone does not prove missing guided-photo evidence.

## 2026-09-01 — Admin establishment publication

- Establishments created by a DTI manager are active, verified by that manager, and public immediately; there is no separate store-verification step.
- Registration numbers and owner names remain null when the official source does not provide them. The system must not invent identifiers or proprietor data.
- Stores without supplied artwork use `/stores/store.webp`.

## 2026-09-01 — Field Officer visit shell and store changes

- Choose Store uses the normal authenticated shell with Add active and a `New Visit` toolbar; Record Prices and Review & Sign use the fullscreen workspace.
- Returning to Choose Store from later steps requires an explicit continue, save, or delete choice. Save and delete both open a separate blank draft so visit evidence is never reassigned to another store.
- Leaving an untouched Choose Store draft through shell navigation removes that blank draft; preselected and resumed visits still open at their derived step.

## 2026-08-30 — Field Officer task guidance

- Preserve the existing compact tablet navigation rail; UX guidance belongs in page content, onboarding, and the visit workflow rather than a tablet navigation redesign.
- Home keeps the operational dashboard with readiness summaries, nearby establishments, and recent local activity. Activity contains encrypted unfinished drafts and finalized visits awaiting synchronization; registered-store selection lives in the visit workflow.
- First-use guidance is device-local, officer-scoped, optional, and replayable from Profile or Help.
- The visit sequence is Choose Store, Record Prices, then Review and Sign. Resuming derives the earliest incomplete step from the existing draft rather than persisting separate step state.
- Client-side price comparisons use provisional wording such as Within reference and For review; they do not label an observation as a violation or legal compliance finding.

## 2026-08-29 — DTI Admin regulatory integrity

- Field Officer accounts use the dedicated Field Monitoring PWA and cannot open the DTI Admin portal or Admin analytics routes.
- Legal notices remain watermarked, non-effective drafts while approved policy rules are unavailable; the Admin must not simulate dispatch, legal deadlines, or compliance findings.
- Regulated writes and private evidence access fail closed when their audit event cannot be stored. Dashboard, store, report, emergency, and analytics views display only API-confirmed facts and explicit unavailable states.
- Admin modules load on demand, and consumer report queues are server-paginated.

## 2026-08-28 — Field Officer authenticated navigation

- The authenticated Field Officer PWA uses one adaptive shell: an official-DTI-SVG phone header with five-item bottom navigation, and a persistent DTI Admin-palette sidebar on tablet and desktop.
- The five destinations are Home, Activity, Add, History, and Profile. Add is an action rather than a page; if unfinished drafts exist it opens Activity, where the officer can resume one or explicitly start another without replacing existing work.
- Home owns readiness summaries, Activity owns active and pending local work, History contains accepted server records only, and Profile owns biometric enrollment plus Lock now and Sign out.
- The visit wizard and its evidence workflow remain behaviorally unchanged by the shell redesign.

## 2026-08-28 — Field Officer device unlock and authorization

- Admin-created and reset Field Officer passwords are final credentials; successful legacy login normalizes `must_change_password` to false.
- The device workspace uses a four-digit PIN and may additionally use a platform biometric authenticator with WebAuthn PRF; PIN remains the fallback. The unlock surface accepts only four digits, treats missing PIN-length metadata as four digits, and submits automatically when the fourth digit is entered.
- A refresh in the same browser/PWA session restores the workspace through a session-scoped encrypted data-key wrapper. Explicit lock, logout, revocation, corrupt state, 60 seconds in the background, or a new browser session requires PIN or biometric unlock; foreground monitoring has no inactivity lock.
- Field access tokens end only on logout, password reset, or deactivation. The 24-hour offline lease renews online without replacing the lease attached to completed queued visits.
- Unresolved drafts or queued evidence must be preserved when authorization is revoked. Local evidence is cleared only after a clean online logout.

## 2026-08-27 — Documentation is a selective context index

- The `docs/` directory is the Obsidian vault.
- Compact index notes route people and agents to focused evidence.
- Detailed plans, audits, and specifications remain in their existing directories.
- Agents should not ingest the full vault by default.
- Obsidian workspace settings are local and excluded from Git.

## Product-level decisions

- PRICE-Watch has separate Consumer PWA, Field Officer PWA, Admin, and shared Laravel API surfaces.
- Regulatory evidence integrity takes priority over convenience.
- Anomalies and OCR uncertainty are not legal findings.
- Finalized field evidence must not be silently changed.
- The legacy Flutter client remains out of normal feature scope unless the user explicitly includes it.

See `../PRODUCT.md` for the fuller product contract.
