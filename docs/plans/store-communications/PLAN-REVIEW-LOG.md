# Store Communications — Plan Review Log (append-only)

- Started: 2026-09-28
- Host / planner / builder: Claude Code (Opus 5.5)
- Plan reviewer / final inspector: Codex CLI 0.157.1, model from config default (requested: none; config: gpt-6-sol xhigh; observed: see results)
- Plan: docs/plans/store-communications/PLAN.md
- Rounds: max 5 review, 2 fix, 2 inspection
- Authorization: user approved plan + build; no commit/push/deploy/live migration without explicit approval
- Codex MCP write-capable servers temporarily disabled for review (user-approved), restored after

## Round 1 — NOT RUN (2026-09-28)
- Disabled 6 config MCP servers (firebase, wps-office, render, playwright, node_repl, supabase).
- `cua_repl` (computer-use, plugin-provided) stayed enabled; `[mcp_servers.cua_repl] enabled=false` rejected by Codex ("invalid transport"); reverted.
- Auditing plugin tables (gmail, vercel, sentry, computer-use, chrome...) blocked by host permission (config contains credentials).
- Config restored from backup; sha256 ae425a8a...6dfb matches original. Backup deleted.
- Status: review not run; plan NOT approved.

## Round 1 — REVISE (2026-09-28)
- MCP/plugins disabled with user approval (option B): 6 MCP servers + 9 write-capable plugins. `codex mcp list` confirmed all disabled.
- Result: C:/Users/noych/AppData/Local/Temp/claudex-znuui0re/result.json; session 01a0e3b2-3c2a-7e50-9eb6-e0b9b9ea257c; codex-cli 0.157.1; observed model: not returned; plan sha a0963821...d655; 313s.
- Findings: SC-01..SC-04 high (vendor re-link message leak; delivery overwrite; portal receipt unlink race; deadline calc tied to current policy availability), SC-05..SC-09 medium (comma-split legal bases; stale vendor modal; portal issue without vendor; preceding_notice_id bypass; SCO slot overflow), SC-10 low (webp allowlist mismatch).
- Dispositions: all accepted; plan revised (sha 7d58ffc1...be55).

## Round 2 — REVISE (2026-09-28)
- Result: C:/Users/noych/AppData/Local/Temp/claudex-pdqxgkef/result.json; same session 01a0e3b2-...; plan sha 7d58ffc1...be55.
- Findings: R2-01 high (notice/response visible to re-linked vendor), R2-02 high (no store lock on send/issue), R2-03 medium (unlinked history dropped from admin list), R2-04 medium (complainant wording drift), R2-05 medium ("RA XXXX" phrase + unbounded bases), R2-06 low (actual calendar cutoff).
- Dispositions: all accepted; plan revised.

## Round 3 — REVISE (2026-09-28)
- Result: C:/Users/noych/AppData/Local/Temp/claudex-eq9jq3na/result.json; plan sha 7e0ecc4d...0b7b.
- Findings: R3-01 high (legacy backfill could assign old notices to replacement vendor), R3-02 medium (seeder/fixtures lack audience), R3-03 medium (issue email to current not frozen vendor), R3-04 medium (legacy deadline fallback to current rules).
- Dispositions: all accepted; plan revised.

## Round 4 — REVISE (2026-09-28)
- Result: C:/Users/noych/AppData/Local/Temp/claudex-jnujo8_v/result.json; plan sha 6632e9d4...f7f8.
- Findings: R4-01 high (absence of unlink audit not proof; pre-e7be510 accept overwrote links), R4-02 high (unlink strands open notice respondent), R4-03 medium (version string ≠ same rules), R4-04 medium (legacy notice lacks complete manual path).
- Dispositions: all accepted; host simplified: no legacy backfill (offline handling), unlink blocked by open audience notices, overdue escalation guarded.

## Round 5 — REVISE (2026-09-28) — review budget exhausted
- Result: C:/Users/noych/AppData/Local/Temp/claudex-klrdavw7/result.json; plan sha b86f8cc2...c173.
- Findings: R5-01 high (deactivate/reactivate vendor bypasses escalation guard), R5-02 medium (stale draft recipient after re-link), R5-03 medium (portal open after `failed` delivery).
- Host position: all accepted and applied (deactivation guard, RECIPIENT_CHANGED on issue, auto-receipt from failed). Revised plan NOT independently re-reviewed; NOT approved.
- User authorized one extra review round (6), 2026-09-28. Codex MCP/plugins stay disabled until final inspection (user choice).

## Round 6 (extra, user-authorized) — REVISE (2026-09-28)
- Result: C:/Users/noych/AppData/Local/Temp/claudex-16qsmk44/result.json; plan sha 4515422a...20e9.
- Findings: R6-01 high (issue vs deactivation race: no shared lock), R6-02 medium (recipient_email misused as identity).
- Host position: both accepted and applied (issue locks store→user row; captured linked_vendor_user_id + confirm flow). Revised plan NOT re-reviewed; NOT approved.

## Override (2026-09-28)
- User explicitly chose to build from unreviewed plan sha 352d5279...041f (post-R6 fixes). Plan is NOT approved; standalone unreviewed-spec path.
- Pre-build commit: d5819579811191e7e74aa4536f0bc7b95b14141c. Builder: Claude (Opus 5.5). Inspector: fresh Codex session.

## Build (2026-09-28) — builder: Claude (Opus 5.5), host
- Base: d5819579811191e7e74aa4536f0bc7b95b14141c. Plan built: sha 352d5279...041f (unreviewed, owner override).
- Proof: backend `php artisan test` 608/608 (baseline 587 + 21 new); web `npx vitest run` 138/138 + `npm run build` + oxlint (only pre-existing Dashboard.tsx warnings); vendor-pwa `npx vitest run` 24/24 + `npm run build`.
- Live E2E (scratch copy of vendor-e2e.sqlite, local tokens, ports 8000/5273/5277; torn down): DTI↔vendor chat both ways with polling and unread badges; Prepare LOI handoff → draft → issue (portal) → vendor PDF open recorded receipt, deadline Mon+3 working days → vendor response → Escalate → SCO issued; stored SCO PDF inspected visually.
- Deviations from plan (host decisions):
  1. Official PDFs rebuilt: dompdf drops inline SVG, so issued LOI/SCO PDFs were loose text (pre-existing defect). Now blank-form PNG backgrounds (150 dpi, `backend/resources/notices/`) + positioned text in points; SCO slots re-set as full paragraphs. Visually verified.
  2. Pre-existing bugs fixed because the flow depends on them: deadline stored as Manila wall-clock read back as UTC (+8h); calendar-window check compared Manila date to UTC `valid_until`; issued PDF printed blank issue date (issued_at set after render); ₱ rendered "?" and schedule table overflowed.
  3. `after_id` polling cursor dropped: clients re-fetch the latest 100 messages so read receipts stay current.
  4. Escalate lives in Legal Actions detail; thread notice cards link there (`?source_notice=`). `source_store` stays unused (source_record carries the store).
  5. Vendor bottom nav now fits six tabs; `.sr-only` added to vendor-pwa (was referenced but undefined).

## Inspection 1 — REVISE (2026-09-28), fresh Codex session 01a0e4c4-f122-7d02-8886-cbe5d875536b
- Result: C:/Users/noych/AppData/Local/Temp/claudex-g3n9ssww/result.json (base d5819579).
- Findings / dispositions (all accepted, fixed by Claude):
  - IR-01 high: manual delivery used click time → datetime-local actual time + server bounds [issued_at, now] + confirm.
  - IR-02 high: forms instruct emailed replies but only portal responses counted → audited `offline-response` endpoint + UI; such a reply counts as answered, so escalation is gated as for portal responses.
  - IR-03 high: issue/preview used saved draft while form showed unsaved edits → blocked while dirty.
  - IR-04 medium: unproclaimed 2027 Eid dates removed; config comment says add once proclaimed.
  - IR-05 medium: long fields overflowed → FORM_LIMITS (name 70, title 40, email 60, address 140, store name 75) enforced at update and issue; per-field auto-fit font; worst-case LOI/SCO renders inspected visually.
  - IR-06 medium: only latest 100 messages, all marked read → `before_id` paging with `has_more`, read receipts only for returned messages, "Load earlier" in both apps.
  - IR-07 medium: vendor notice card could not open unseen notice → refresh on notice-signature change and on card open.
  - IR-08 medium: store list stuck at page 1 → "Load more stores".
  - IR-09 low: admin DTI bubbles now show "sender → vendor".
  - IR-10 low: file inputs visually hidden but focusable.
- Proof after fixes: backend 613/613; web 141/141 + build + oxlint; vendor-pwa 25/25 + build + oxlint.

## Inspection 2 — REVISE (2026-09-28), fresh Codex session 01a0e4db-e1dd-7d40-bd1f-855f48887753 — inspection budget exhausted
- Result: C:/Users/noych/AppData/Local/Temp/claudex-xgz7_6h2/result.json.
- Findings (host verified all as valid; NOT yet fixed):
  - SC-INS2-01 high: stated reason not checked against evidence reference type (ceiling evidence can be issued as "above SRP").
  - SC-INS2-02 high: offline response allowed before delivery recorded; no stored channel/evidence; vendor sees DTI summary as "Your response".
  - SC-INS2-03 medium: mail queue failure after commit returns error for an already-issued notice.
  - SC-INS2-04 medium: vendor visibility scope does not exclude legacy (no deadline_rules) notices; VendorPortalTest fixture lacks deadline_rules.
  - SC-INS2-05 medium: vendor unread badge not refreshed outside the Messages tab.
  - SC-INS2-06 medium: thread shows one card per notice, not per lifecycle event.
  - SC-INS2-07 medium: docs say both signatory names gate issuing; code gates per type.
- Status: awaiting owner decision (fix + extra inspection, fix unreviewed, or stop).
- Owner decision (2026-09-28): fix all 7 and run one extra fresh inspection; Codex MCP/plugins stay disabled until then.
- Fixes (Claude): INS2-01 reference_type frozen per item, single-kind notices, reason prefilled and enforced at issue; INS2-02 offline response requires recorded delivery + evidence file (`offline_response` attachment), stores `response_channel`, vendor sees "Your email/paper reply, as recorded by DTI"; INS2-03 mail queue failure caught after commit → `notification: failed` + admin warning; INS2-04 `visibleToVendor` and `authorizeNotice` exclude notices without deadline_rules, VendorPortalTest fixture fixed; INS2-05 vendor overview refreshes every 30 s on other tabs while visible; INS2-06 per-event timeline entries (delivery, response, close, cancel) in both apps; INS2-07 docs/config/.env.example now state per-type activation (matches code).
- Proof: backend 616/616; web 141/141 + build + oxlint; vendor-pwa 25/25 + build + oxlint.

## Inspection 3 (extra, owner-authorized) — REVISE (2026-09-28), fresh Codex session 01a0e552-1b45-7fc2-9dd4-3890440a964d
- Result: C:/Users/noych/AppData/Local/Temp/claudex-5ql0o_i0/result.json.
- Findings (host verified all valid; not yet fixed): RV-01 high portal receipt after calendar coverage counts unlisted holidays as working days; RV-02 medium cancelled issued notices vanish from the vendor; RV-03 medium vendor response path lacks the legacy guard; RV-04 medium LOI readiness wrongly requires a legal basis; RV-05 medium a stale poll can drop a just-sent message; RV-06 low vendor Messages badge counts only the selected store; RV-07 low LegalActionsWorkflowTest depends on env signatory names.
- Codex config restored from backup; sha256 ae425a8a...6dfb matches original; backup deleted.
- Owner decision (2026-09-28): fix all 7, no further inspection. Fixes below are UNREVIEWED by Codex.
- Fixes (Claude): RV-01 `calendar_valid_until` frozen with rules; deadlines never computed past known coverage (CalendarNotCoveredException → portal receipt skipped, admin delivery 409 CALENDAR_REVIEW_REQUIRED); later-proclaimed holidays merged in; RV-02 cancelled issued notices visible to their audience ("Withdrawn by DTI", event entry), not answerable; RV-03 legacy guard in response transaction; RV-04 LOI readiness no longer requires a legal basis (policy required_fields drive it); RV-05 messages merged by id in both apps; RV-06 vendor tab badge sums all linked stores; RV-07 test sets approved=false explicitly.
- Final proof: backend 620/620; web 142/142 (AdminSafeguards intermittently times out under full parallel load; passes in isolation and on rerun; file untouched by this diff) + build + oxlint; vendor-pwa 26/26 + build + oxlint.
- Final state: not committed; plan never independently approved; inspections 1–2 findings fixed and inspection 3 findings fixed without re-review.

## Follow-up feature (2026-09-28): Legal Signatories in Settings — owner request, not Codex-reviewed
- Owner chose "name + signature image". Built by Claude: `LegalSignatoryService` (system_settings keys, config/env fallback) feeding `LegalPolicyService`; `LegalSignatoryController` (super_admin + re-auth for changes, audited; managers can read/preview); private image on legal_documents disk (PNG/JPEG ≤1 MB, ≤2400×1200); issue `apply_signature` opt-in, `signatory_snapshot` column; image placed above the name (LOI) / on the signature line (SCO), visually checked; Settings › Legal Signatories tab; issuance panel checkbox + "Signed by" fact.
