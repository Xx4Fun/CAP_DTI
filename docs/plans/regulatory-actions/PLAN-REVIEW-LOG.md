# Plan Review Log: Regulatory Actions

This log is append-only.

- **Roles.** Host and coordinator: Claude Code (Opus 5.5). Plan reviewer: Codex CLI 0.159.3, at its configured default model, read-only. Builder: none. Owner authorized plan review only; building needs separate approval.
- **Scope.** `docs/plans/regulatory-actions/PLAN.md`: completing the Field Monitoring → Legal Actions → Vendor Portal regulatory flow.
- **Round limit.** At most 5 rounds.
- **Codex config guard.** `~/.codex/config.toml` was checked before the run, with SHA256 `cdfc059aa5a951be3588c26e89e91e9cea33fc8f168849c070d377a24f68bad8`.
  - Every `[mcp_servers.*]` table was already `enabled = false`.
  - So was every write or outbound plugin listed in AGENTS.md: gmail, sentry, vercel, build-web-apps, browser, chrome, computer-use, unified-computer-use and codex-app-tools.
  - No edit was needed. A backup is kept outside the repo, and the hash is re-verified after each call.
- **Owner decisions.** The 2026-10-03 answers are recorded in PLAN.md §3.

## Round 1 — Codex — REVISE

- Codex session: `01a0ff9a-85b0-7050-af81-4d1024fe6c02`.
- Plan sha256: `b80f36156d668af549716093774a03ec6b0ed50284335ee10f083571a5974c4b`.
- Elapsed: 392s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r1/claudex-enf6j3iy/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R-01 (high).** The deadline is anchored at issue, but the printed form says the period runs from receipt.
- **R-02 (high).** The direct-SCO rule is enforced only at create, not at issue.
- **R-03 (high).** No-action has no locked eligibility recheck.
- **R-04 (high).** A reminder could reach a vendor who is not the notice's recipient.
- **R-05 (medium).** Snapshots drafted before the change lack the fields findings need.
- **R-06 (medium).** A confirmed field finding would be plotted twice and labelled "Validated receipt".
- **R-07 (medium).** The conversation payload has no outcome.
- **R-08 (medium).** The banner and IssueResult would show the wrong state under the issue anchor.
- **R-09 (medium).** The status filter accepts a single value only.
- **R-10 (medium).** There is no recalculation when a holiday is proclaimed after issue.
- **R-11 (low).** `AdminTypographyIntegrity.test.ts` still imports TemporalVolatility as raw source.

Dispositions:
- **Owner decisions taken during this round.** The receipt anchor stays (first portal open). The work is phased.

Round 1 dispositions (host: Claude). Plan revised to revision 2.

R-01 ACCEPTED. The owner was asked and chose to keep the receipt anchor: the vendor's first portal open, matching the printed form. D2 is updated. The anchor change is removed and is now a non-goal.
R-02 ACCEPTED. 2.5: issue() re-applies the direct-SCO rule to every SCO with a null preceding_notice_id, which covers drafts that already exist. A test is added.
R-03 ACCEPTED. 2.8: the no-action transaction locks the visit and re-checks status, item eligibility, notices and findings, returning 409 on conflict. createDraft already takes the same visit lock.
R-04 ACCEPTED. 2.9: reminders are limited to portal notices with a non-null vendor_user_id that are unanswered and either unopened or overdue. They run under the store→vendor→notice lock and require the current link to equal the frozen vendor.
R-05 ACCEPTED. 2.1: a legacy snapshot falls back to the immutable matching item, cross-checking the values the snapshot does carry, or returns 409 SNAPSHOT_REVIEW_REQUIRED. srp_bulletin_id is always set.
R-06 ACCEPTED. 2.1: forStore no longer pushes monitoring-item findings as "Validated receipt". It marks the matching TemporalInspection row as confirmed instead.
R-07 ACCEPTED. 2.1: the outcome is added to the VendorMessageController conversation notice payload and to the vendor types.
R-08 MOOT. The deadline anchor is unchanged. The IssueResult delivery prompt for portal notices is still removed (2.4), and ActiveNoticeBanner is covered for the "Response period ended" label (2.10).
R-09 ACCEPTED. Phase 1 1.1: one paginated request per status, and an "All non-draft" view made of per-status requests. The single-value status param is unchanged.
R-10 MOOT. The deadline is still computed at receipt, as today. Late-holiday behaviour is unchanged and declared out of scope (A2).
R-11 ACCEPTED. 1.6: the ?raw import and its array entry are removed from AdminTypographyIntegrity.test.ts.

Also new: the owner chose phasing (D11). Phase 1 is web-only with existing APIs; Phase 2 is backend, web and vendor. Please review both phases.

## Round 2 — Codex — REVISE

- Codex session: `01a0ff9a-85b0-7050-af81-4d1024fe6c02` (resumed).
- Plan sha256: `424ddc754223e8efe90e341f7dc4d927824d045328c8d595a88050504063e00a`.
- Elapsed: 339s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r2/claudex-qgaeb4z0/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R2-01 (high).** Admin `delivery()` can still start a portal deadline by hand.
- **R2-02 (high).** A later notice's closure could overwrite an earlier confirmed finding.
- **R2-03 (high).** `recidivism_index` can race between concurrent closures for the same store.
- **R2-04 (high).** Partial no-action would hide undecided items from Needs review.
- **R2-05 (medium).** A stale `recipient_email` survives a vendor re-link.
- **R2-06 (medium).** `source_notice` is used for chips that have no notice.
- **R2-07 (low).** `record.store_id` does not exist on the client type.

Round 2 dispositions (host: Claude). Plan revised to revision 3. All 7 findings were accepted and verified against the source.

R2-01 ACCEPTED. 2.4: admin delivery() returns 409 PORTAL_RECEIPT_ONLY for portal notices and the UI hides the control. Manual delivery stays for legacy notices. A test is added.
R2-02 ACCEPTED. 2.1: createDraft refuses items whose finding is confirmed or not_confirmed (409 ITEM_ALREADY_DECIDED). Only a no_action row is replaceable, so a closure upsert never overwrites another closure.
R2-03 ACCEPTED. 2.1: per-store serialization. Every finding-writing path (legal close, no-action, consumer-report decisions) locks the store row before reading findings and holds it through recalculateRecidivism. Legal close locks store then notice, matching issue/escalate. Consumer paths keep report then store. There is no shared row pair, so no lock cycle. A concurrency test is added.
R2-04 ACCEPTED. 2.8: no-action has no item_ids and always covers every eligible item, so there is no partial triage and review=pending stays truthful.
R2-05 ACCEPTED. 2.4: issue() overwrites recipient_email with the active linked vendor's email under the lock, and confirm_linked_vendor refreshes it. A test covers escalation followed by a re-link.
R2-06 ACCEPTED. 2.7: only notice chips use source_notice. "No action" shows its reason inline; "Not reviewed" uses source_record.
R2-07 ACCEPTED. 1.1 uses record.store.id.

## Round 3 — Codex — REVISE

- Plan sha256: `06b37243f1dfbb9149578c41ddfc41bffe76af1fd11b1720af0c933b84645e90`.
- Elapsed: 343s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r3/claudex-cqeoy3gx/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R3-01 (high).** Lock order is inverted between `createDraft` and no-action, a deadlock risk on PostgreSQL.
- **R3-02 (high).** One closure outcome is applied to multi-item notices.
- **R3-03 (medium).** The no-action history is lost on upsert.
- **R3-04 (medium).** A replaced vendor email can bypass `FORM_LIMITS`.
- **R3-05 (medium).** A registered-owner change after drafting is not detected.

Round 3 dispositions (host: Claude). Plan revised to revision 4. All 5 findings were accepted.

R3-01 ACCEPTED. 2.1: one lock order everywhere: store, then visit, then notice. createDraft now locks the store first on the direct path; on escalate it is already held. A concurrent draft and no-action test is added.
R3-02 ACCEPTED. 2.1: close requires item_decisions for every snapshot item, and that is the source of truth for findings. The overall outcome must agree: explanation_accepted and no_violation are all not_confirmed, violation_confirmed is all confirmed, and partially_confirmed is mixed. Otherwise 422.
R3-03 ACCEPTED. 2.8: the no-action audit metadata carries the reason, item_ids and decided_at. createDraft freezes any no_action rows into source_snapshot.prior_triage, which Legal Actions shows, so the upsert loses nothing.
R3-04 ACCEPTED. 2.4: FORM_LIMITS is validated on the final payload after the email is replaced. An oversized vendor email gives 422 RECIPIENT_EMAIL_TOO_LONG and is fixed in User Management (the existing UserManagementController.php:93 edit). There is no truncation.
R3-05 ACCEPTED. 2.6: registered_owner_name is recorded at draft time. issue() refuses with 409 RECIPIENT_REVIEW_REQUIRED if the store owner changed. confirm_recipient (an alias of confirm_linked_vendor) refreshes the markers without overwriting an evaluator's correction.

## Round 4 — Codex — REVISE

- Plan sha256: `07d96ce5a12ebe19cb072afe645c2c1ae6ed36c437bf34b81936c3f1131e5c86`.
- Elapsed: 375s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r4/claudex-8dx0a1rj/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R4-01 (high).** Review is tracked per visit, so it hides undecided items.
- **R4-02 (medium).** The vendor cannot see per-item decisions.
- **R4-03 (medium).** The consumer-decision lock order conflicts with field sync.
- **R4-04 (medium).** An owner name over 70 characters cannot be printed.

Round 4 dispositions (host: Claude). Plan revised to revision 5. All 4 findings were accepted. This is the final review round (5 of 5).

R4-01 ACCEPTED. 2.8: review is tracked per item. An undecided item has no finding and is not cited by an open notice. Pending means at least one undecided item, and the row shows only those items. No-action covers every currently undecided item and is allowed after a prior notice closes; the undecided set is recomputed under the visit lock. Tests are added.
R4-02 ACCEPTED. 2.1: after close, the vendor flagged_items payload carries each item's id and final decision, rendered beside the commodity. A mixed-outcome vendor test is added.
R4-03 ACCEPTED. 2.1: consumer decision paths lock store, then verification request, then report, the same as field sync. The report is reloaded and its status and active verification re-checked inside the transaction; the pre-transaction checks at ReportReviewController.php:379-389 move inside. A race test is added.
R4-04 ACCEPTED. 2.6: an owner_name over 70 characters prefills in full and blocks readiness. The evaluator enters an explicit form representation (audited draft edit). registered_owner_name keeps the full name in the draft and snapshot. There is no silent truncation, and issue still enforces 70 characters.

## Round 5 (final) — Codex — REVISE

- Plan sha256: `794b8ebe36dd28aeaff46be079d7de274ce808c9bce4c23827ffa3aef2ef53d9`.
- Elapsed: 338s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r5/claudex-ca9qkvfo/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R5-01 (medium).** `requestVerification` locks the report before the store, which can deadlock against the new decision order.
- **R5-02 (medium).** Needs review offers actions that are blocked while another notice on the same visit is open.
- **R5-03 (medium).** Store Communications eligibility ignores per-item decisions.
- **R5-04 (low).** "No observations" and "Within Reference" misstate prices that are inside the tolerance.

Host dispositions: all accepted, giving **revision 6**.
- **R5-01.** `requestVerification`, cancel and reopen lock the store first, then reload and re-check the report. A race test is added.
- **R5-02.** "Waiting on {notice}" label. Actions are disabled until that notice ends. The API returns `has_open_notice` and `open_notice_id`.
- **R5-03.** One undecided-item helper is shared by `review=pending`, no-action and `StoreConversationController::eligibleRecords`. `source_record` preselects undecided items only.
- **R5-04.** The card states are keyed to the counted condition: not monitored, no flagged observations, or observations noted.

**Outcome.** The round limit (5) was reached without APPROVED. Revision 6 has not been reviewed, and approval is NOT claimed.
- Owner options: extend the review by one round, or proceed on an explicit unreviewed-plan override.
- **Trend.** Severity has been falling: round 1 had 4 high findings, rounds 2–3 had 2–4, round 4 had 1, round 5 had none.

## Round 6 (owner-extended)

- On 2026-10-03 the owner asked for one more Codex round on revision 6.
- It resumes the same Codex session, with the round-5 dispositions as feedback.

### Round 6 result — Codex — REVISE

- Plan sha256: `900821d726668472974ffa2ed15af95baaf92a523195cd1c4f0ac415d33ef1f6` (revision 6).
- Elapsed: 142s.
- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-r6/claudex-9xb5_toc/result.json`.
- `config.toml` sha256 after the call matched the original.
- Codex confirmed that revision 6 resolves all four round-5 findings.

Finding:
- **R6-01 (medium).** The subtitle "Prices at or below the review threshold" is unsupported when a reference is unavailable, because `is_anomaly` is always false without a reference.

Host disposition: ACCEPTED, giving **revision 7**.
- The card makes no threshold claim; it shows the number of visits and points to Price History.
- It shows unavailable references for the latest visit, because the API does not report them for the whole period.
- A period-level count is deferred to Phase 2.

**Outcome.** No APPROVED verdict in 6 rounds. Revision 7 changes only Phase 1 §1.4 wording relative to the reviewed revision 6, and is not independently reviewed.
- Severity trend by round: 4 high, then 4 high, 2 high, 1 high, 0 high (3 medium), and 1 medium.

## Phase 1 build — Claude (host)

- On 2026-10-03 the owner said "build phase 1". Base commit: `6a7609e`. Builder: Claude.
- Scope, deviations and proof are recorded in `PHASE1-BUILD.md`.
- Proof:
  - `tsc -b`: clean.
  - vitest: 214 of 214 passed.
  - `vite build`: OK.
  - Browser check on a local scratch SQLite stack: passed.
- During the browser check, one read-only `artisan tinker` query (a column list and counts) ran without the scratch environment and reached the default `.env` database, which is remote Postgres. It wrote nothing. Every later command used a wrapper that refuses to run unless the connection is SQLite.
- Inspection: a fresh Codex session, running now.

## Phase 2 authorization

- On 2026-10-03 the owner said "build phase 2". This is an **explicit owner override**: plan revision 7 never received a Codex APPROVED verdict, and the plan is not described as approved.
- Builder: Claude (host).
- The finished code still gets a fresh Codex inspection.
- Code edits wait until the Phase 1 inspection snapshot is complete.

### Phase 1 inspection 1 — fresh Codex session — REVISE

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-inspect1/claudex-h0tzfm38/result.json`.
- `config.toml` sha256 after the call matched the original.

Findings:
- **R1 (medium).** "All issued notices" pages over every status, so a page holding only drafts shows empty.
- **R2 (medium).** The list is not refetched after a mutation, so it keeps stale filter contents and page totals.
- **R3 (medium).** The Review Status card shows the all-time recidivism count ahead of the selected period's state.
- **R4 (low).** Settings has no read-only threshold note.
- **R5 (low).** The visit detail hides `reference_type` whenever a label exists.
- **R6 (low).** A stale failed list request can set an error that is never cleared.

Host dispositions: all accepted.
- **R1.** Add a server filter `exclude_drafts=1` in `LegalNoticeController::index`, which needs a backend change, so it ships with the Phase 2 backend work. The issued view uses it.
- **R2.** A reload key is bumped after each mutation, and the page is clamped to `last_page`.
- **R3.** The card shows the period state first; confirmed findings move to a separate line.
- **R4.** Add a read-only policy note to Settings.
- **R5.** Show the type label and the captured label together.
- **R6.** Ignore failures from stale requests, and clear the error when a current request succeeds.

**Re-inspection.** One fresh Codex inspection of base `6a7609e` against the final tree will cover the Phase 1 fixes and Phase 2 together.

## Phase 2 build (with Phase 1 fixes) — Claude (host)

- Scope, deviations and proof are recorded in `PHASE2-BUILD.md`.
- Proof:
  - Backend: 735 of 735 tests passed.
  - Web: 219 of 219 passed.
  - Vendor PWA: 30 of 30 passed.
  - Builds: OK. Browser check: passed.
- Fixed during the browser check: four Legal Actions tabs overflowed the admin panel at 1024px width. `legal-workspace` now uses `grid-template-columns: minmax(0, 1fr)`.
- Inspection: one fresh Codex session over base `6a7609e` against the final tree, running now.

### Build inspection 1 — fresh Codex session — REVISE

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-inspect2/`.
- Elapsed: 701s.
- `config.toml` sha256 after the call matched the original.
- 11 findings: R-01 (high); R-02 to R-08 (medium); R-09 to R-11 (low).
- All 11 accepted and fixed; see `PHASE2-BUILD.md`.
- R-04 overturned the build's "undecided" deviation, now solved portably.
- Proof after the fixes: backend 740 of 740, web 221 of 221, vendor PWA 30 of 30. Builds OK.
- Next: a second fresh Codex inspection, the last allowed by the inspection budget.

### Build inspection 2 (final) — fresh Codex session — REVISE

- Result: `C:/Users/noych/AppData/Local/Temp/claude/C--CAP101-DTI-SYS/697c808d-c7b8-41c2-af57-b08e755e1154/scratchpad/claudex-inspect3/`.
- Elapsed: 522s.
- `config.toml` sha256 after the call matched the original.

Findings:
- **P2-01 (high).** Confirming the recipient after an owner change kept the former owner's printed name.
- **P2-02 (high).** First open after the end of holiday-calendar coverage served the PDF but recorded no receipt, so the notice was stuck.
- **P2-03 (medium).** Vendor wording for an unopened portal notice still said "after delivery".
- **P2-04 (low).** No unavailable-reference count for the period.

Host fixes, all accepted:
- **P2-01.** Confirming refreshes an addressee that still shows the former owner, and keeps an evaluator's deliberate form representation.
- **P2-02.** The vendor's document open returns 409 `CALENDAR_REVIEW_REQUIRED` and does not serve the PDF unreceived. Once coverage is extended, the first open records receipt and deadline together.
- **P2-03.** `CountdownBadge` and the detail modal use portal wording.
- **P2-04.** `period_unavailable_reference_count` is added and shown on the review card.

Proof: backend 740 of 740, web 221 of 221, vendor PWA 30 of 30. Builds OK.

**The inspection budget (2 rounds) is exhausted. The P2-01 to P2-04 fixes have not been independently inspected.**
