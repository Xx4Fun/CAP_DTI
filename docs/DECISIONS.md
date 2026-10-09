---
tags:
  - decisions
  - architecture
---

# Durable Decisions

Only record choices that should constrain future work. Newest entries go first and should link to supporting evidence when available.

## 2026-10-09 — Emergency Protocol summary and detail refresh

- Admin declaration summaries retain all official references; only the selected declaration loads APC preparation sources and current SRP fallbacks. The opt-in summary contract preserves legacy list/detail/write responses.
- Background refresh preserves visible records. Separate read guards and authoritative write responses prevent older requests from replacing current state; activation and ending require verified current data. Review confirmation follows selection and preparation hash.
- Expandable monitoring sources remain part of APC review. Local verification and release boundary: [[plans/emergency-loading/README]].

## 2026-10-09 — Consumer receipt store validation and private viewing

- A confidently detected merchant mismatch blocks both review confirmation and the locked submission write. Missing or uncertain merchants remain eligible for DTI review.
- Ready, unsubmitted drafts may correct their selected store using saved extraction without another AI request. Audit the correction; preserve original capture store context, evidence hashes, receipt values, and credentials.
- Submitted receipt viewing uses the saved tracking credential and the shared review layout with mutation controls removed. Show saved system extraction separately from evaluator findings; historical item snapshots that are missing remain unavailable. Contract: [[customer-pwa-api]]. Implementation and verification are local until an authorized release.

## 2026-10-09 — Consumer report assessment and confirmed findings

- Reliable clean receipt reports resolve automatically after consumer submission. Unidentified/uncertain lines, unavailable references, extraction warnings, and unverified originals prevent automatic clean resolution. A reliable overpriced line takes precedence over other uncertain lines and enters Violations for DTI checking.
- System assessment snapshots remain separate from evaluator decisions and create no confirmed regulatory findings. Confirmed Findings requires an actual DTI-confirmed finding; field verification completion alone is not confirmation. Manual insufficient evidence stays For Review.
- New submissions and existing undecided reports use the same assessment. An explicit preview/apply batch preserves past decisions and active referrals. Local implementation and release boundary: [[plans/consumer-report-assessment/README]].

## 2026-10-08 — Gemini receipt processing recovery

- Keep Gemini 3.8 Flash primary; a transient provider failure selects Gemini 3.5 Flash-Lite for subsequent attempts on the same immutable evidence. The saved choice survives manual retries; a new capture starts with primary.
- Fallback retains consent, schema validation, original integrity, and usage caps, and requires DTI review while preserving warnings. Status and retry share current allowance checks; retry writes recheck under a row lock.
- Operational contract and release acceptance: `../backend/docs/receipt-ocr-remediation.md` (Gemini recovery). Verification is local until an explicitly approved release and real-receipt acceptance.

## 2026-10-08 — Manual Price Freeze ending

- Manual ending records a nullable UTC `ended_at` with microsecond precision. A declaration applies only to observation instants strictly before this cutoff; scheduled end dates remain inclusive through the Manila day.
- The authenticated, password-reconfirmed update is serialized with declaration activation and commodity editing, and is idempotent after a saved manual cutoff. Effective legacy `ended` declarations without a cutoff can be ended manually. No historical backfill is performed; cancellation is unchanged.
- Current status, references and cadence switch immediately; pre-cutoff signed/queued evidence retains its historical references. Admin displays the server's actual Manila ending time and refreshes open views after success. Local verification and release boundary: [[plans/manual-price-freeze-end/README]].

## 2026-10-07 — Price Freeze synchronization

- Public configuration, legacy calamity reads and Admin's effective-emergency indicator use `MonitoringPeriod::effectiveEmergency`; the legacy cache flag has no regulatory authority. Shelf-tag and manual comparisons use the same formal reference resolver as Field and Vendor. Missing official ceilings stay unavailable; SRP remains separately labelled context and history.
- Visible online clients refresh regulatory data every 60 seconds, on foreground return and reconnect. Admin activation/status writes also refresh open views immediately. Request guards and serialized Field bootstrap writes prevent older data from replacing newer data.
- Unfinished Field visits retain entered prices and captured references until explicit review. Refreshing changed references clears both signatures and signer confirmation. Finalized and queued evidence stays unchanged. Evidence and local-only release boundary: [[plans/price-freeze-sync/README]].

## 2026-10-07 — APC source lookback and SRP fallback

- **Why.** Requiring every Price Freeze-covered product to have an accepted routine observation in the one completed week before the declaration made activation impossible outside the seeded week: a real week covers about five of 124 covered products.
- **Each product uses its own latest week.** The APC candidate of a covered product comes from its most recent completed Manila monitoring week that has accepted routine observations, at or before the cutoff week (the completed week before the declaration). This supersedes the single-week rule in the first bullet of the 2026-09-09 entry. The formula, the qualifying records and the exclusion of declaration-week and later observations are unchanged. There is no lookback age limit; the admin sees each product's source week before confirming.
- **Units are compared, not converted.** An observation counts only when its bulletin's unit is the unit in effect on the declaration date, because a revision keeps the commodity key and may change the unit.
- **A never-observed product is held at SRP.** On activation it gets an official price record of type `SRP` equal to its SRP in effect on the declaration date. It is therefore judged as a price ceiling (0% tolerance) during the freeze, not at SRP +10%.
- **One reviewed snapshot.** The preparation hash covers the candidate rows and the SRP fallbacks. Activation takes one snapshot, checks the hash against it and writes official records from it.
- **A frozen product keeps its identity.** SRP metadata edits that would change a commodity key (name or unit) are refused while an official Price Freeze reference for that product can still apply, because the reference is found by commodity key and an SRP-held product has no monitoring item to trigger the existing unit rule. For the same reason an SRP revision, which keeps the key, is refused when its unit differs (ignoring case and surrounding spaces) from the unit in effect on the declaration date; a price-only revision is still accepted. "Can still apply" is defined once, in `RegulatoryPriceRecord::scopeStillApplicable`. Preparation, activation, SRP metadata edits and SRP revisions take the same PostgreSQL advisory lock first (`EmergencyApcPreparationService::lock`), so these checks cannot interleave with an activation.
- **Old admin tabs.** `missing_commodity_keys` is still sent, meaning "no observation in the cutoff week", only so a tab on the previous build stays unable to activate. Remove it once that build is out of use.
- Evidence: `docs/plans/apc-lookback/PLAN.md` and its review log; `backend/tests/Feature/EmergencyApcWorkflowTest.php`.

## 2026-10-07 — Legal notice reason and legal basis follow the evidence

- **One owner for the mapping.** `backend/config/legal_policy.php` `findings` maps each captured reference kind (`standard_srp`, `emergency_ceiling`) to the reason and legal bases it supports. `LegalPolicyService::derive` reads it and returns only values the notice type's policy permits. Draft creation, escalation, save and issue all use it.
- **The reason is locked; the bases are a suggestion.** A draft starts with the derived reason and bases. A save or an issue with any other reason is refused. The evaluator may tick, add or clear legal bases within the approved list. The system still never selects the notice type and never issues on its own.
- **The four approved legal-basis strings are unchanged** and are shown in three groups (`basis_groups`):
  - Applicable law: RA 7581 (Price Act). The only basis derived, because monitoring records price comparisons only.
  - Penalty and procedure: DAO No. 6, s. 2007 (schedule of administrative fines) and DO No. 18-122 (monitoring and enforcement procedure).
  - Other law: RA 7394 (Consumer Act). The system records no price-tag or deceptive-sale finding that would support it.
- The grouping comes from desk research on DTI sources, not legal advice. DTI still needs to confirm what the SCO sentence should cite, whether to include "as amended by RA 10623" or section numbers, and whether RA 7394 is ever cited for a monitoring visit.
- **An issued notice is its own page** in Legal Actions, in the Field Monitoring visit layout. The open notice is in the URL (`source_notice`), so reload and browser Back follow it. All detail fetches go through one loader with one request counter.
- Evidence: `backend/tests/Feature/LegalNoticeLifecycleTest.php` and `web/src/components/admin/LegalNoticeBasisAndDetail.test.tsx`.

## 2026-10-06 — Vendor offline work and legal delivery

- Vendor saves private account-scoped resources and unfinished work in encrypted IndexedDB with an automatically restored browser key. Existing sign-in and token expiry remain; no Field PIN or offline lease is added.
- Only explicit submissions enter the durable delivery queue. A queued response is received by DTI only after server acceptance; offline preparation never extends a deadline or records notice receipt.
- Official PDFs are saved after explicit online access, never prefetched. Background conversation preparation opts out of marking DTI messages read.
- Vendor message/response retries use account-scoped UUID receipts committed with business writes and audit events. Backend compatibility must precede any client release. Automatic delivery requires an open or reopened app.
- Implementation and local-only verification: [[plans/vendor-offline/README]]. Field monitoring changes are outside this task.

## 2026-10-04 — Vendor Portal shell follows the Field Officer shell

- **One shell pattern.** The Vendor PWA uses the Field Officer layout on every width: a sidebar that ends with an account block (76px rail on tablets), a sticky header carrying the online indicator and the bell, and a phone header with a five-tab bottom bar. On phones Profile opens from the header avatar, not a sixth tab.
- **Profile owns the account.** Sign out, notification settings and change password live in Profile. Profile renders even when no establishment is linked, because it is the only sign-out control.
- **Profile cards use two rows.** Tablet and desktop show Establishment and Representative above Notification settings and Password in a 2x2 grid. Phones stack the four cards; an unlinked account keeps a representative placeholder.
- **The bell is derived, not stored.** Alerts list notices that still need the vendor (`needsVendorAction`: an unopened portal notice or a response that is due) and unread DTI messages, across every linked establishment. There are no stored notifications or read receipts; a row goes when the underlying fact changes.
- **Changing establishment never carries thread state.** `MessagesView` is keyed by store, and a notice alert leaves Communications before switching establishment, because loading a thread marks its DTI messages read.
- Plan and review record: `plans/vendor-shell/`.

## 2026-10-04 — Current establishment monitoring representative

- Linked active vendors can immediately save an Owner or Manager for each establishment from Vendor Profile. The transaction rechecks the vendor link and rolls back if the existing audit service cannot record the previous and new details.
- This operational contact is private: authorized Vendor, Field and Admin APIs expose it explicitly; public payloads and generic Store serialization omit it. Registered owners, legal addressees and account links remain separate.
- Field visits prefill the configured contact, then the registered owner as Owner, then empty details. Review and Sign checks the current contact online and stores it in the encrypted establishment cache. Only untouched unsigned prefills refresh automatically; manual and legacy drafts require an explicit choice. Officers confirm the actual signer, and approved identity changes clear both signatures. Finalized evidence never follows subsequent profile changes.
- Source: `backend/tests/Feature/StoreRepresentativeTest.php`, `field-officer-pwa/src/components/RepresentativeReview.test.tsx`, `vendor-pwa/src/components/profile/RepresentativeCard.test.tsx`.
- Delivery: released 2026-10-04, backend first. The additive migration `2026_10_04_000001_add_current_representative_to_stores` runs in the Render entrypoint on deploy (backend, PR 13); the Vendor, Field (bootstrap schema 3) and Admin clients followed in PR 14. Any later change to this contract keeps that order: backend before clients.

## 2026-10-03 — Temporal analytics is the time dimension of GIS Monitoring

- **One feature, not two.** GIS Monitoring carries the layers Compliance, Coverage, Prices and Visit check, with a week slider over Manila monitoring weeks. There is no separate Temporal Analytics module; the store drawer keeps the per-store price history (4, 12 or 26 weeks).
- **A week is its Manila Monday.** `GET /admin/gis/monitoring` identifies a week by `week.key` (`Y-m-d`). Clients compare and label weeks by that string and never convert the UTC bounds in the browser.
- **Coverage counts accepted routine visits of any protocol** finalized in the week; verification visits never count. Field Monitoring's weekly counter counts standard-protocol visits only, so the two differ during Price Freeze weeks by design.
- **Prices show the reference captured on the visit item.** Nothing is re-resolved against a later SRP.
- **Visit coordinates are audited evidence.** They leave the API only with `locations=1` (sent by the Visit check layer), each response writes `gis.visit_locations_viewed`, carries `Cache-Control: private, no-store`, and is refused when the audit trail is unavailable.
- **"Location to review" is not a finding.** It means a visit was signed more than 150 m from the registered pin after subtracting its GPS accuracy. Registered pins are placed by hand, so the pin may be the one that is wrong.
- Plan and review record: `plans/gis-monitoring/`.

## 2026-10-03 — Regulatory decisions are recorded; notices are portal-only

- **Owner rules.**
  1. An SCO starts by escalating an LOI. A direct SCO is allowed only for a price-freeze visit citing price ceilings; the rule is enforced at create and at issue.
  2. The response period still runs from receipt. For a portal notice, receipt is the vendor's first open, matching the printed "upon receipt" form. Staff cannot record delivery of a portal notice (`PORTAL_RECEIPT_ONLY`).
  3. New notices are delivered **only through the vendor portal**. Issue needs an active linked vendor, and it prints that account's email. Hand-copy and email delivery, and manual delivery recording, remain only for notices issued before this rule. No email is sent at issue.
  4. The addressee is the store's registered owner (`stores.owner_name`). The name is never invented, and issue refuses if the owner changed after drafting until the evaluator confirms the recipient.
  5. Closing a notice records an outcome and a decision for each cited product. "Explanation accepted" is not a confirmed finding.
  6. DTI may send a reminder for an unanswered portal notice. A reminder is a message only; it creates no document and changes no deadline.
  7. A DTI Admin can record "no action needed", with a reason, for a visit's undecided flagged products.
  8. The review tolerance is unchanged: SRP +10%, price ceiling 0%.
- **Decisions are findings.**
  - A closure writes one `regulatory_findings` row per cited product, with `source_type=monitoring_record_item` and the reference copied from the notice snapshot, using `confirmed` or `not_confirmed`.
  - No-action writes `no_action`. A later notice may cite such an item, and its triage history is frozen into the notice snapshot (`prior_triage`) and the audit log.
  - An item with a final decision cannot be cited again (`ITEM_ALREADY_DECIDED`).
  - The recidivism index and analytics count one confirmed visit once (`ReportReviewService::confirmedCaseCount`). A confirmed field product is plotted once, as its inspection.
- **Integrity.**
  - Draft snapshots carry the reference version, source id and previous price.
  - Escalation copies the LOI snapshot rather than rebuilding it from live data.
  - Closing a notice drafted before full snapshots existed reads the missing fields from the immutable visit item, and only when the values it does hold agree (`SNAPSHOT_REVIEW_REQUIRED`).
  - Every finding writer locks the store first: legal close, no-action, draft creation, consumer-report decisions and verification requests, in the same order as field sync.
- **Where it lives.**
  - Legal Actions › Needs review lists visits with undecided products. A visit with an open notice waits on it.
  - Field Monitoring shows notices and decisions read-only, with links into Legal Actions.
  - The vendor portal shows the outcome, a decision per product, and the LOI an SCO follows.
- This supersedes the 2026-09-28 entry's hand-copy and email delivery for new notices.
- Evidence: `docs/plans/regulatory-actions/PLAN.md` (revision 7, built by explicit owner override after 6 Codex review rounds), `PLAN-REVIEW-LOG.md`, `backend/tests/Feature/RegulatoryDecisionsTest.php`, `LegalNoticeLifecycleTest.php`.

## 2026-10-03 — One rule for public images

- **Why.** An item photo added in DTI Admin › Price Regulation showed in Admin but not in the Customer PWA. The customer app rewrote every URL containing `commodity_images/` to a copy bundled in the app, and uploads are never bundled. That rewrite existed because the 114 seeded product photos were never uploaded to the production bucket, so both apps hid the gap with bundled copies. Store photos had a third arrangement: copies bundled into all four apps, and the vendor app guessed photos from store names.
- **Rule.**
  1. Public catalog images (commodity and store photos) live on the `COMMODITY_IMAGE_DISK` disk. In production that is the public Supabase bucket `commodity-images`. The database stores the object key (`commodity_images/<file>`, `store_images/<file>`). Legacy absolute URLs stay valid.
  2. `App\Services\CommodityImageStorage::publicUrl()` is the only code that turns a stored value into a URL. Every API field rendered as `<img src>` is an absolute URL or `null`. Stores get this through a `Store::image_path` accessor. Commodity endpoints call it explicitly: public catalog, admin list, every comparison `product`, scan-tag candidates.
  3. Clients render the URL as given. On `null` or a load error they show a placeholder. Bundled image files are placeholders only. The one exception is the Customer PWA's offline fallback data (`srpFallback.ts` and the fallback stores in `client.ts`), which keeps its bundled copies.
  4. Private evidence is unchanged and never gets a public URL: receipts, signatures, legal documents and message attachments.
- **Writes.** A new `image_path` must be an uploaded key that exists on the disk; resubmitting the unchanged stored value is allowed. This applies to SRP create, metadata edit, revision and import. A metadata edit that omits `image_path` changes no photo, which fixed a bug that wiped photos across a lineage. A revision without its own photo inherits only from the same commodity: same key first, otherwise identical name + unit + category.
- **Environment prerequisite.** Every environment's bucket must contain the seed photos before this code is deployed:
  - `customer-pwa/public/storage/commodity_images/*.webp` → `commodity_images/`
  - the five store photos in `customer-pwa/public/stores/` → `store_images/`
  - Migration `2026_10_03_000001_store_image_paths_to_bucket_keys` rewrites `stores.image_path` to those keys and sets the generic `/stores/store.webp` to null.
- **Rollback.** Revert the code first, which restores the bundled `/stores/` files and the old resolvers. Then redeploy and run `migrate:rollback --step=1`. The migration's `down()` on its own leaves new code with no store photos.
- Evidence: `docs/plans/image-urls/PLAN.md`, `PLAN-REVIEW-LOG.md` (Codex approved at round 5), `backend/tests/Feature/PublicImageRuleTest.php`.

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
- The backend is authoritative for duplicate routine rejection. A rejected offline upload remains encrypted device-local work in Needs Attention; completed routine establishments remain visible in Choose Store but open only as a view-only copy of the period's accepted routine visit (any officer's, signature views audited); they cannot start a new routine visit.
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
