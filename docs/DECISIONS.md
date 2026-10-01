---
tags:
  - decisions
  - architecture
---

# Durable Decisions

Only record choices that should constrain future work. Newest entries go first and should link to supporting evidence when available.

## 2026-10-01 — Field Officer device PIN change

- Profile lets an unlocked officer change this device's four-digit PIN offline after entering the current PIN and confirming a new one. The change rewraps the existing vault key so encrypted work and biometric enrollment remain available; it does not change the server password or lock the workspace.

## 2026-09-28 — Store Communications and the LOI/SCO issuance policy

- **Legal policy approved (supersedes the 2026-08-29 "drafts only" state).** The project owner approved the values printed on the DTI forms:
  - LOI: 3 working days from receipt.
  - SCO: 48 hours from receipt.
  - Control numbers: `{type}-{year}-{id}`.
  - Reasons and legal bases: exact-value lists in `backend/config/legal_policy.php`.
  - Signatory names are set per type by DTI staff (evaluator or Super Admin; changed 2026-10-01 because the deployment has no Super Admin account) in DTI Admin › Settings › Legal Signatories. `LEGAL_LOI_SIGNATORY_NAME` / `LEGAL_SCO_SIGNATORY_NAME` are only fallbacks. Each notice type can be issued once its own name is set.
  - **E-signature (owner-approved 2026-09-28).** DTI staff (evaluator or Super Admin) may upload a PNG/JPEG signature image per type. It is kept on the private disk, and every upload, replacement, or removal needs a fresh password check and is audited. The image is stamped only when the issuing evaluator explicitly ticks "Apply e-signature" for that notice. `signatory_snapshot` records the name, the position, whether the image was applied, and the image's SHA-256. Issued PDFs embed the image bytes, so a later replacement never changes an issued notice. DTI legal acceptance of image signatures on LOIs/SCOs is the owner's responsibility.
  - The stated reason must match the evidence: SRP items give "Prices above SRP" and price-ceiling items give "Prices above price ceiling". One notice covers one kind of reference.
  - The holiday list is best-effort and must be checked against each year's proclamation. The 3-working-day LOI becomes unavailable from 2027-12-23 unless the calendar is extended.
- **Issuance flow.** An LOI or SCO still starts only from an accepted monitoring visit with flagged items. Escalating to an SCO goes through `POST /admin/legal-notices/{id}/escalate`, which closes the LOI and drafts the SCO in one transaction. `store()` no longer accepts `preceding_notice_id`. An unanswered LOI can be escalated only after its deadline, and only while its vendor is still linked and active.
- **Audience and frozen rules.** At issue, a notice records its vendor (`legal_notices.vendor_user_id`) and its deadline rules (`deadline_rules`). Vendors see only notices addressed to them, so a re-linked store never exposes a previous vendor's notices or responses. Notices issued before this change have neither field. They stay out of the portal and are handled offline.
- **Portal receipt.** For portal delivery, the vendor's first authenticated PDF open records `received` and starts the deadline; it is audited as `via: portal_open`. A recorded receipt or refusal cannot be overwritten. Unlinking or deactivating a vendor is refused while one of their notices is open.
- **Calendar and withdrawals.** A working-day deadline is never computed past the known holiday calendar. Portal receipt is then not recorded, and admin delivery answers `CALENDAR_REVIEW_REQUIRED` until the calendar is extended. Holidays proclaimed after issue are added to a notice's frozen dates (holidays are facts, not policy). A cancelled issued notice stays visible to its vendor as "Withdrawn by DTI" and cannot be answered.
- **Manual delivery and offline responses.** A hand-copy delivery is recorded with its actual receipt time, bounded by the issue time and now. Because the printed forms tell vendors to reply by email, DTI can record an emailed or paper reply after delivery is recorded (`POST /admin/legal-notices/{id}/offline-response`). The received email or scan is required and kept as an `offline_response` attachment, and the reply is audited with its channel (`response_channel`). It counts as answered, and the vendor sees it labelled as recorded by DTI. Printed field lengths are capped to what fits the forms (`LegalNoticeController::FORM_LIMITS`).
- **Store Communications.** There is one conversation per store (`store_messages`). Each message records the vendor it was exchanged with. Messages are text plus one private attachment (PDF/JPEG/PNG/WebP, 5 MB). Both apps poll every 10 seconds; there is no websocket. Chat is informal and never issues documents or starts deadlines.
- **Official documents.** dompdf cannot draw the forms' inline SVG, so issued PDFs were previously loose text. The official pages are now the blank forms rendered once to `backend/resources/notices/*.png`, with values positioned over them in points. The SCO's complaint wording is filled from the inspection, and "RA XXXX" is replaced by the selected legal bases.
- Evidence: `docs/plans/store-communications/PLAN.md` and `PLAN-REVIEW-LOG.md` (six Codex rounds; built from the final revision without independent approval, by explicit owner override), `backend/tests/Feature/StoreCommunicationsTest.php`, `LegalNoticeLifecycleTest.php`.

## 2026-09-14 — Vendor Portal PWA and vendor account management

- Vendors use the separate `vendor-pwa/` app. The DTI Admin web portal no longer serves vendors: `/api/login` answers `VENDOR_PWA_REQUIRED`, and old `/vendor-invitation` links forward to the PWA.
- Vendor sessions use `/api/vendor/login` and a Sanctum token named `vendor-portal-pwa` that expires (default 720 hours, `VENDOR_TOKEN_HOURS`). Vendor routes check the token **name**, because Sanctum's `can()` also accepts legacy `['*']` tokens; those legacy vendor tokens were deleted by migration.
- Vendor access to a store comes only from `stores.vendor_user_id`, which only an accepted invitation sets. The old owner-name fallback was removed **without** a name-based backfill, because a namesake would otherwise gain another store's notices. Unlinked vendors regain access through a new invitation.
- Every writer of the vendor link (invite, accept, cancel, unlink) and the vendor notice response locks the store row before the invitation or notice row. A store with a linked vendor cannot be invited again until it is unlinked, and unlinking cancels pending invitations.
- Legal notice PDFs and attachments are written to the private `legal_documents` disk (S3 in production, `LEGAL_DOCUMENTS_*` falling back to `RECEIPT_EVIDENCE_*`). Files previously written to the container's `local` disk were never durable across deploys and are not recoverable; their rows keep `disk = local` and return 404.
- Vendor compliance status, advisories, and price references are derived from existing notices, emergencies, SRP bulletins, and `FieldReferenceResolver` at one Manila instant; no separate vendor tables. The self-check uses the field rule (standard SRP reviewed above +10%, emergency ceiling reviewed above the ceiling) and provisional wording only.
- Notification preferences are stored in `users.preferences.vendor_notifications`; SMS/email delivery is not implemented.
- Evidence: `docs/plans/vendor-pwa/PLAN.md` (Codex-approved revision 3), `docs/plans/vendor-pwa/PLAN-REVIEW-LOG.md`, `backend/tests/Feature/VendorAuthTest.php`, `VendorPortalTest.php`, `VendorInvitationFlowTest.php`, `LegalNoticeTest.php`.

## 2026-09-12 — Receipt extraction consent and free-tier demonstration

- The PRICE-Watch capstone project team approves **privacy notice v1.2** — which names Google Gemini as the service that may read receipt
  photos for DTI **and states the free-plan terms** — as the notice whose reports may be sent to the extraction engine
  (`RECEIPT_EXTRACTION_CONSENT_VERSIONS=1.2`). v1.1 was superseded before any report consented to it: it described the paid-tier
  arrangement (processor status, storage off) that this project does not have.
- The project has **no paid Google project**. The demonstration runs on the free tier, where Google may use submitted content for
  product improvement and humans may review it. That is recorded as `GEMINI_BILLING_ATTESTED=free_tier_demo` and never as `paid`.
- **Scope: no restriction on whose receipts are captured during the demonstration.** An earlier version of this entry limited capture to the
  project team's own receipts; the team **deliberately removed that limit** (2026-09-12) once notice v1.2 shipped, on the basis that the
  notice itself discloses the free-plan terms to whoever accepts it. The control is therefore the disclosure, not a scope rule.
- **Residual risk accepted with that decision:** on the free plan Google may use submitted photos to improve its services and its staff may
  review them, and nothing can retract a photo once sent. Anyone submitting relies on having read the notice. Moving to real, ongoing DTI
  operations still requires a paid project and a fresh approval.
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
- Consumer report item findings default from the SRP comparison (above reference = confirmed violation, otherwise no violation). A "no violation" line with no SRP commodity records no regulatory finding; a confirmed violation must cite a commodity.
- The legacy Flutter client remains out of normal feature scope unless the user explicitly includes it.

See `../PRODUCT.md` for the fuller product contract.
