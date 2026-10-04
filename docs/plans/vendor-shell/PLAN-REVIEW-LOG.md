# Vendor shell plan review log (append-only)

## Run setup — 2026-10-04

- Host / planner / coordinator / builder: Claude Code (Opus 5.5)
- Plan reviewer: Codex CLI 0.159.3 (model: CLI default, unresolved until result)
- Final inspector: fresh Codex session
- Plan: `docs/plans/vendor-shell/PLAN.md`
- Limits: MAX_ROUNDS 5, MAX_FIX_ROUNDS 2, MAX_INSPECTION_ROUNDS 2, inspect on
- Scope: vendor-pwa shell follows the Field Officer PWA layout on all widths: sidebar account block,
  bell in the sticky header opening a derived alerts drawer, new Profile page owning notification
  settings, change password and sign out. No backend change.
- Authorization: user approved the plan; build is authorized once Codex approves it. No commit, push
  or deploy without a separate request.
- User decisions (2026-10-04): Profile opens from a header avatar on phones (bottom nav keeps 5 tabs);
  bell opens an alerts drawer and Notification Settings moves to Profile; Profile includes change
  password via the existing endpoint.
- Branch: `feat/vendor-shell` from `origin/main` at `2990643`.
- Plan SHA256 at round 1 submission: `fac35360b42b6a16433879a5fe50492c7884645d5d8af5be47bef75c81cb4299`
- Codex toolchain audit: every `[mcp_servers.*]` table and the plugins gmail, sentry, vercel,
  build-web-apps, browser, chrome, computer-use, unified-computer-use, codex-app-tools were already
  `enabled = false` in `~/.codex/config.toml`. No edit needed. Backup taken outside the repo,
  SHA256 `82f034350c7a11ce288df82d8a765ce55fb707c0189df7ea6f293822b2dc46db`.

## Rounds

### Round 1 — Codex CLI default model, session `01a1033e-e2cc-7a91-8a03-d09dd5e24306` — FAILED PROCESS

- Result: `scratchpad/claudex/r1/claudex-ol8j_h3b/result.json` (outside checkout), plan SHA `fac35360…`, 268 s.
- Runner status: **failed**, `Invalid limitations list.` The reply's `limitations` array ended with an
  empty string. Not counted as a verdict or an approval. `~/.codex/config.toml` hash unchanged
  (`82f03435…`).
- The reply body itself was otherwise well formed: verdict REVISE, "five material gaps in alert
  visibility, refresh behavior, Profile access, phone layout, and dialog focus."
  - VS-001 high — drawer lists only `canRespond` notices; a new portal notice has no receipt or
    deadline until first PDF open (`LegalNoticeController.php:54-72`, `rules.ts:60-64`) and no email
    is sent, so it would never alert. Fix: include issued notices awaiting first portal open.
  - VS-002 medium — core polling stops on the Communications tab (`App.tsx:155`);
    `MessagesView.tsx:63-78` refreshes overview only on a thread change. Other stores' alerts go
    stale. Fix: refresh overview and notices while Communications is open; test it.
  - VS-003 medium — `App.tsx:360-427` gates page content on an active store; a vendor with zero
    stores could not reach Profile, the only sign-out. Fix: render Profile outside the gate; test.
  - VS-004 medium — `vendor.css:1090` hides `.vendor-header-status` at 360px and below, against the
    plan's "status stays". Fix: keep a compact indicator; check 360px.
  - VS-005 medium — drawer has no focus containment; on a notice row, focus returned to the bell
    sits behind `NoticeDetailModal`, which has no initial focus. Fix: contain focus; move focus into
    the destination on row navigation.
- Coverage reported: plan hash; knowledge index, project map, decisions; vendor shell state,
  navigation, notices, messages, session handling, password API, CSS, tests; backend notice
  delivery, unread-message calculation, password behaviour; field drawer and shell.
- Limitations reported: read-only, no tests run, no browser layouts, no live API or deployment.
- Host verification: all five confirmed against the cited code.
- Dispositions: all five ACCEPTED; plan revised to revision 2, SHA
  `e2b760716ceac8fb13a24d0613eb6a86a72ada08923c07aec1d5bbd0c246aa9e`. The failed result cannot be
  resumed, so round 2 is a fresh session with the dispositions supplied as feedback
  (`scratchpad/claudex/feedback-r1.md`).

### Round 2 — Codex CLI default model, fresh session `01a10344-538c-7383-9cf5-8112e1f581c4`

- Result: `scratchpad/claudex/r2/claudex-lknggv9h/result.json`, status completed, plan SHA `e2b76071…`, 338 s.
  `~/.codex/config.toml` hash unchanged (`82f03435…`). Observed model keys: none returned.
- Verdict: **REVISE** — "a cross-store navigation path that can mark unseen messages as read. Three
  smaller alert and verification gaps also need clarification."
  - VS-006 medium — a notice row selects its store without a tab change; with Communications open,
    `MessagesView` fetches the new store's thread and the GET marks DTI messages read
    (`VendorMessageController.php:20-27`, `StoreMessage.php:37-49`). Fix: switch to Notices first; test.
  - VS-007 medium — badge and rows use `canRespond` (current time) but nothing re-renders `App` at
    a deadline; offline the poll does not run. Fix: local clock or timer for the nearest deadline; test.
  - VS-008 low — "row disappears when the vendor reads the thread" is wrong past 100 unread
    (`StoreMessage.php:31-49` vs `VendorPortalController.php:31-44`). Fix: state it or test it.
  - VS-009 low — acceptance requires 320px but browser verification stops at 360px. Fix: add 320px.
- Coverage reported: plan hash; index, project map, status, decisions; vendor shell state,
  navigation, notices, messages, profile dependencies, CSS, tests; backend notice visibility and
  delivery, unread counting and read writes, password endpoint; field shell and drawer.
- Limitations reported: read-only, no tests run; no browser viewport, live API or deployment.
- Dispositions: VS-006, VS-007, VS-009 ACCEPTED; VS-008 ACCEPTED AS WORDING (no extra test: the row
  derives only from the server count, pagination is unchanged). Plan revised to revision 3.
  Feedback: `scratchpad/claudex/feedback-r2.md`.
- Plan SHA256 at round 3 submission: `2a2c9e62eea0eb3e24d34618dc2b4ec32a537e3d26552f3585d5b75f83794733`

### Round 3 — resumed session `01a10344-538c-7383-9cf5-8112e1f581c4`

- Result: `scratchpad/claudex/r3/claudex-h14me4iz/result.json`, status completed, plan SHA `2a2c9e62…`, 241 s.
  `~/.codex/config.toml` hash unchanged (`82f03435…`).
- Verdict: **REVISE** — "Revision 3 resolves VS-001 through VS-009, but the new message-alert
  navigation exposes retained cross-store thread state."
  - VS-010 high — a messages row can change the store while Communications stays mounted;
    `MessagesView` has no store key and keeps draft and file (`MessagesView.tsx:39-57`), so a draft
    or attachment for store A can be sent to store B, and late responses can merge threads
    (`:94-111`). Fix: remount on store change or reset state and reject stale results; test.
  - VS-011 low — "load earlier" marks messages read on the server but does not call `onRead`
    (`MessagesView.tsx:106-111`), so the bell keeps the old count until the next poll. Fix: refresh
    the overview after it; test.
- Limitations reported: read-only; no browser viewport, live API, deployment or implemented diff.
- Host verification: both confirmed in `MessagesView.tsx`.
- Dispositions: both ACCEPTED. Plan revised to revision 4. Feedback: `scratchpad/claudex/feedback-r3.md`.
- Plan SHA256 at round 4 submission: `38a58340fec6d9271d94b8657aec71041272fc7bb9d85fa631e03ec7148745d7`

### Round 4 — resumed session `01a10344-538c-7383-9cf5-8112e1f581c4`

- Result: `scratchpad/claudex/r4/claudex-08adushk/result.json`, status completed, 74 s.
  `~/.codex/config.toml` hash unchanged (`82f03435…`).
- Verdict: **APPROVED** — "Revision 4 addresses VS-001 through VS-011. No material unresolved plan
  defects were found." Zero findings.
- Approval is bound to plan SHA256 `38a58340fec6d9271d94b8657aec71041272fc7bb9d85fa631e03ec7148745d7`;
  runner `check` passed against that hash.
- Coverage reported: plan hash; revised navigation, deadline, unread-count and 320px requirements
  against source; message state and read/write behaviour through PWA callers and Laravel
  controllers; planned CSS removals checked for other uses.
- Limitations reported: read-only; no tests run; no browser, live API, deployment or completed
  implementation inspected.
- Rounds used: 4 of 5 (round 1 was a failed process, three completed reviews).

## Build

- Builder: Claude Code (Opus 5.5). Pre-build commit: `2990643` (`origin/main`).
- Changed: `vendor-pwa/src/App.tsx`, `App.test.tsx`, `app/types.ts`, `app/rules.ts`, `app/rules.test.ts`,
  `components/layout/VendorSidebar.tsx`, `components/layout/VendorNavbar.tsx`,
  `components/messages/MessagesView.tsx`, `components/notices/NoticeDetailModal.tsx`,
  `styles/vendor.css`, `docs/DECISIONS.md`. Added: `components/alerts/AlertsDrawer.tsx`,
  `components/profile/VendorProfile.tsx`.
- Proof (host-run, 2026-10-04): `npm test` 45/45 passed (2 files); `npm run build` passed;
  `npm run lint` (oxlint) exit 0.
- Browser (local `vendor-sweep` + `backend-sweep`, seeded vendor, one store, no notices):
  - 1366x800: sidebar ends with the account block; toolbar shows title, online chip, bell; drawer
    opens with the empty state, Escape closes it and focus returns to the bell; Profile opens from
    the sidebar; a wrong current password returns the server's 422 message; no horizontal scroll.
  - 820x1180: 76px rail ends with the avatar only; toolbar unchanged; Profile in two columns.
  - 375x812, 360x740, 320x640: header shows brand, status, bell, avatar; bottom nav keeps five tabs;
    no horizontal scroll. A multi-store selector injected for inspection at 320px fits (wordmark hides).
  - 320x640: Profile from the header avatar, cards in one column, Sign out returns to the login screen.
- Deviations from the plan:
  - Side-by-side comparison with `field-preview` was not run (it needs a Field Officer session and
    device PIN). The layout was compared against `FieldAppShell.tsx` and its CSS instead.
  - Populated drawer rows, the multi-store paths and the successful password change were verified
    by tests only; the local test vendor has one store and no notices, and its seeded password was
    left unchanged.
  - Phone header buttons are 38px, reduced to 34px at 360px and below so the header fits at 320px.
  - `NoticeDetailModal` now focuses its close button whenever it opens, not only from the drawer.

## Inspection

### Inspection 1 — fresh Codex session `01a1035c-97d0-7e61-a9b1-ddbbc9e6aee3`

- Result: `scratchpad/claudex/i1/claudex-sha8ltcm/result.json`, status completed, 374 s, base `2990643`.
  `~/.codex/config.toml` hash unchanged (`82f03435…`).
- Verdict: **REVISE** — "The shell follows the plan in the main navigation paths, but the alerts
  drawer has two unresolved modal behavior defects and one labeling mismatch."
  - VS-012 medium — `AlertsDrawer.tsx`: a focused row that expires or disappears after a poll takes
    focus out of the open dialog; the trap only reacts on the next Tab.
  - VS-013 medium — `vendor.css`: `.alerts-backdrop` and `.pwa-update-prompt` share `z-index: 120`
    and the prompt renders later, so it paints above the modal drawer and stays clickable.
  - VS-014 low — delivered, respondable notices are not labelled "Response due" as the plan says.
- Coverage reported: plan hash; tracked vendor diff, added drawer and Profile components; alert
  counts, navigation, deadline updates and message read state through App, MessagesView, API calls
  and Laravel controllers; shell CSS, modal stacking, tests; field shell reference.
- Limitations reported: read-only, no tests, browser or live API; pre-existing untracked files excluded.
- Dispositions (fix round 1 of 2), all ACCEPTED and fixed by the host (Claude):
  - VS-012: the drawer moves focus to its close button whenever focus is found outside it after a
    render; new test covers a focused notice expiring while the drawer is open. Poll-driven removal
    takes the same re-render path and has no separate test.
  - VS-013: `.alerts-backdrop` raised to `z-index: 130`, above the update prompt, so the backdrop
    covers it; the existing Tab containment keeps the keyboard inside the drawer.
  - VS-014: each notice row shows `noticeStatusLabel` ("Response due" / "Not yet opened") after the
    store name; the drawer test asserts both labels.
- Proof after fixes: `npm test` 46/46 passed; `npm run build` passed; oxlint exit 0.

### Inspection 2 — fresh Codex session `01a10363-a70e-7270-9847-490a9fcff076`

- Result: `scratchpad/claudex/i2/claudex-eqzpekhf/result.json`, status completed, 313 s, base `2990643`.
  `~/.codex/config.toml` hash unchanged (`82f03435…`).
- Verdict: **REVISE** — "The alert and account flows match most of the plan, but two concrete focus
  and narrow-screen defects remain." VS-012 to VS-014 were not raised again.
  - VS-015 medium — closing a notice dialog opened from an alert removes the focused Close button
    and leaves focus on the document body. Fix: move focus to a stable element in the Notices
    content; keep focus inside the notice dialog while it is open.
  - VS-016 low — `vendor.css`: at 360px and below a multi-store account hid the PRICE-Watch
    wordmark, against the plan's "brand header kept". Fix: a compact wordmark that fits.
- Limitations reported: read-only; no tests, builds, lint or browser checks.
- Dispositions (fix round 2 of 2), both ACCEPTED and fixed by the host (Claude):
  - VS-015: `NoticeDetailModal` traps Tab while open and, on close, returns focus to its opener or,
    when the opener no longer exists, to the `<main>` content region. The Tab trap moved to
    `components/common/focus.ts` and is shared with `AlertsDrawer`. The drawer test now asserts
    Tab containment in the notice dialog and focus on `<main>` after closing it.
  - VS-016: at 360px and below a multi-store header keeps the wordmark at 0.86rem and hides only
    the "Vendor Portal" sub-line; the establishment selector shrinks instead.
- Proof after fixes: `npm test` 46/46 passed; `npm run build` passed; oxlint exit 0. Browser, with a
  selector injected for inspection: 360px wordmark visible, selector 94px; 320px wordmark visible,
  selector 54px; no horizontal overflow at either width.

## Outcome

- Inspection budget (2) and fix budget (2) are used. **The round-2 fixes for VS-015 and VS-016
  (`NoticeDetailModal.tsx`, `components/common/focus.ts`, `AlertsDrawer.tsx`, `vendor.css`,
  `App.test.tsx`) have not been inspected by Codex.** Everything before them was covered by
  inspection 2. A further inspection is the user's decision.
- No unresolved findings are known. Nothing is committed.

## Shipping with the representative feature — 2026-10-04

- After the build above, Codex (with the user) made further changes in the same working tree:
  a sidebar restyle closer to the Field Officer sidebar (`VendorSidebar.tsx`, `vendor.css`: brand
  header without the flag bar, no category labels), and a separate feature, "current establishment
  representative" (backend, field, admin and a `RepresentativeCard` in the vendor Profile). The shell
  commit therefore has mixed authorship: Claude (build and fixes above) and Codex (sidebar restyle).
- User decision: ship both to production now, backend first.
- Claude review of Codex's representative feature (read-only, whole diff plus new files). No high or
  medium findings. Checked: vendor writes only a store linked to the caller, store-first lock order,
  audit inside the transaction with rollback; the three columns are hidden from generic `Store`
  serialization and absent from public payloads; additive, reversible migration; new backend is
  compatible with installed older clients (extra JSON key, bootstrap schema bump forces a full
  download); the new field client falls back to saved details when the endpoint is missing or slow;
  `canFinalizeVisit` gains its new requirements only before finalization, so queued visits still sync.
  - Low, fixed by Claude: `VendorPortalController::updateRepresentative` compared
    `vendor_user_id === id` without the `(int)` casts every other link check uses.
  - Low, fixed by Claude: `RepresentativeCard` heading had no icon tile, unlike the other Profile cards.
  - Noted, not changed: the saved representative stays on the establishment when its vendor is
    unlinked or replaced; field officers still confirm who is present before signing.
  - Noted, not changed: signing waits for the online representative check, up to the 25 s client
    timeout on a sleeping server, then uses saved details.
- Proof (host-run): backend `php artisan test` 757/757; vendor-pwa 50/50; field-officer-pwa 176/176;
  web 245/245; `npm run build` and oxlint clean in all three apps (one existing unused-import
  warning in `field-officer-pwa/src/App.tsx`).
- The two round-2 shell fixes (VS-015, VS-016) and Codex's later sidebar restyle ship without a
  Codex inspection of the shell diff.
- Commits: backend representative; vendor shell (shared files staged without the representative
  hunks); representative clients. Backend is merged and deployed before the clients.
