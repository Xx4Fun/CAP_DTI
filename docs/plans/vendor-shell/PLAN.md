# Vendor PWA shell: follow the Field Monitoring layout (claudex-loop)

Revision 4 (2026-10-04): addresses Codex findings VS-001 to VS-011; see `PLAN-REVIEW-LOG.md`.

## Context

The vendor wants the Vendor Portal to use the same layout as the Field Officer PWA ("Field
Monitoring"), on every screen size, without cloning it. Recon shows the vendor shell already copies
the field shell at 600px and up (76px icon rail on tablet, full gradient sidebar at 1024px+, sticky
white content toolbar; see comments in `vendor-pwa/src/styles/vendor.css:81,147,1162`). What still
differs:

| Area | Field (`field-officer-pwa/src/components/FieldAppShell.tsx`) | Vendor today |
|---|---|---|
| Sidebar bottom | Account block: initials, name, role, opens Profile | "System Online" pill, Alerts button, Log Out button |
| Sticky toolbar (600px+) | Title, online chip, bell with count | Title, online chip only |
| Phone header | Brand, online status, bell with count, one account action | Brand, status, store select, bell (opens settings), logout icon |
| Bell | Opens notifications drawer | Opens Notification Settings modal |
| Profile | Own page; owns Sign out | None; logout lives in nav |

User decisions (asked 2026-10-04):

1. Phone: Profile opens from an **avatar button in the header**; bottom nav keeps its 5 tabs.
2. Bell opens an **alerts drawer** built from data already loaded; Notification Settings moves to Profile.
3. Profile includes **Change password** using the existing `POST /api/vendor/password`.

Outcome: one shell pattern across both PWAs. Online status lives only in the header/toolbar, the
bell lives in the sticky header, and sign-out lives in Profile.

## Claudex roles and flow

- Host, planner, builder: Claude Code (Opus 5.5). Plan reviewer and final inspector: Codex CLI
  0.159.3 (model: CLI default, reported as observed). Max 5 review rounds, 2 fix rounds, 2 inspections.
- Plan mode blocks file writes, so the loop starts after approval:
  1. `git switch -c feat/vendor-shell origin/main` (current branch is already merged).
  2. Write this plan to `docs/plans/vendor-shell/PLAN.md`, start `PLAN-REVIEW-LOG.md` beside it
     (repo convention, see `docs/plans/vendor-pwa/`).
  3. Codex guard from `AGENTS.md`: back up `~/.codex/config.toml` outside the repo, record SHA256,
     set `enabled = false` on every `[mcp_servers.*]` and the listed plugins if any are on, run the
     review, restore byte-for-byte, verify the hash.
  4. Review with `py -3.13 ~/.claude/skills/claudex-loop/scripts/runner.py review --host claude
     --repo C:\CAP101_DTI_SYS --plan docs/plans/vendor-shell/PLAN.md` (artifacts in the scratchpad).
     Arbitrate findings, revise, resume the same session until APPROVED or round 5; run `check`.
  5. Build (below), run proof commands, then a fresh Codex `inspect` against the pre-build commit.
- Approving this plan authorizes the build once Codex approves the plan. No commit, push, or deploy
  without a separate request.

## Design (vendor-pwa only; no backend, no new dependency)

Kept vendor-specific on purpose: PRICE-Watch brand header with the flag bar, "Portal Modules" /
"Reference & Advisories" grouping, vendor colour tokens, 5-tab bottom nav, store switcher.

1. **`app/types.ts`**: `ActiveTab` gains `'profile'`.
2. **`components/layout/VendorSidebar.tsx`**: replace the whole `sidebar-footer` (status pill,
   Alerts, Log Out) with a field-style account block: initials avatar, vendor name, "Vendor
   account"; one button, `aria-label="Open profile"`, `aria-current` when active. On the tablet rail
   it collapses to the avatar only. Drop props `online`, `hasPendingNotices`,
   `onOpenNotifications`, `onLogout`; add `userName`.
3. **`App.tsx` sticky toolbar** (`.vendor-content-toolbar`, 600px+): title, online chip pushed
   right, then bell button with count badge (`aria-label="Alerts"` / `"Alerts, N new"`).
   `TAB_TITLES.profile = 'Profile'`.
4. **`components/layout/VendorNavbar.tsx`** (phone header, hidden at 600px+): bell opens the alerts
   drawer and shows the count; the logout icon becomes an initials avatar button that opens
   Profile. Online status and the store select stay. Delete the `vendor-desktop-nav` block: the
   header is `display:none` at 600px+ and that nav is `display:none` below it, so it never renders.
5. **`components/alerts/AlertsDrawer.tsx`** (new, modelled on
   `field-officer-pwa/src/components/NotificationDrawer.tsx`: right-side `role="dialog"`,
   `aria-modal`, Escape closes, focus returns to the bell). Rows, derived in `App.tsx` from
   `notices` and `overview.stores` across all linked stores:
   - each notice where the new `needsVendorAction(notice)` in `app/rules.ts` is true: status
     `issued` and either `canRespond(notice)` ("Response due", with `CountdownBadge`) or a portal
     notice not yet opened (`intended_delivery_method === 'portal'` and `delivery_state` neither
     `received` nor `refused`), labelled "Open the official document to start your response
     period". A new portal notice has no receipt and no deadline until its PDF is first opened and
     no email is sent at issue, so it must alert. Row shows type, control number and store; click
     switches to the Notices tab first, then selects that store and opens `NoticeDetailModal`.
     The tab switch is required: if Communications stayed open, changing the store would make
     `MessagesView` fetch that store's thread, and that GET marks its DTI messages read
     (`VendorMessageController.php:20-27`) behind the modal;
   - each store with `unread_messages > 0`: "N new messages from DTI"; click selects the store and
     opens Communications. This is the first path that changes the store while Communications
     stays mounted (the store switcher always goes to Dashboard), and `MessagesView` keeps its
     draft, chosen attachment and pending requests across a `storeId` change, so a draft written
     for store A could be sent to store B. `App.tsx` therefore renders
     `<MessagesView key={store.id} …>`: a store change remounts it with empty state, and late
     responses for the old store land on the unmounted instance.
   Badge count = notices needing vendor action + total unread messages. Empty state when zero. No
   read/unread state is stored in the PWA: a notice row goes when the vendor responds or the
   deadline passes, and a messages row stays for as long as the server reports unread messages for
   that store (opening a thread reads only the latest page of 100, so older unread messages keep
   the row until "load earlier" reaches them). `MessagesView.loadEarlier` marks that page read on
   the server but does not refresh the overview today; it now calls `onRead()` on success so the
   bell count follows at once.

   Deadlines: `canRespond` compares against the current time, but nothing re-renders `App` at a
   deadline, and the 30-second poll does not run offline. `App.tsx` schedules one timer for the
   nearest future `due_date_timestamp` among issued notices (delay clamped to the 32-bit timeout
   limit) and bumps a state counter when it fires, so the badge, the drawer rows and the existing
   "respond" affordances drop an expired notice without a network round trip.

   Focus: Tab and Shift+Tab stay inside the drawer while it is open. Dismissing it (close button,
   Escape, backdrop) returns focus to the bell that opened it. A row click does not return focus to
   the bell: a notice row moves focus into `NoticeDetailModal` (which gains initial focus on its
   close button whenever it opens), and a messages row moves focus to the `<main>` content region
   (`tabIndex={-1}`).

   Freshness: `App.tsx:156-161` skips the 30-second core poll while Communications is open, and
   `MessagesView` refreshes the overview only when the open thread changes, so alerts for another
   linked store would go stale. Remove the `activeTab !== 'messages'` condition so overview and
   notices refresh on every tab.
6. **`components/profile/VendorProfile.tsx`** (new), field Profile structure (identity banner, card
   grid, sign-out row). `App.tsx` renders it outside the `!store` gate (`App.tsx:360`), because a
   vendor whose store was unlinked still signs in with zero stores and Profile is now the only
   sign-out control; the Establishment card then shows "No establishment is linked to this
   account.":
   - Identity: avatar, `overview.user.name`, email, "Vendor account".
   - Establishment: active store name, address, DTI/SEC number, last inspected (`formatDate`).
   - Notifications: button opening the existing `NotificationSettingsModal` (unchanged).
   - Change password: current, new, confirm (`type="password"`, `autocomplete`
     `current-password` / `new-password`). Client checks: new is 12+ characters and matches
     confirm. Calls `vendorApi.changePassword`; errors shown with `apiError` (422 "current password
     is incorrect"); a revoked session goes through the existing `guard` sign-out. On success clear
     the fields and toast "Password changed." The server keeps this session and ends the others.
   - Sign out: outlined red button at the bottom, full width on phones; calls the existing `logout`.
7. **`app/rules.ts`**: `initials(name)` helper, used by sidebar, header and profile.
8. **`styles/vendor.css`**: delete `.sidebar-footer*`, `.connectivity-pill*`,
   `.sidebar-utility-btn*`, `.footer-*`, `.utility-btn-text`, `.vendor-desktop-nav`,
   `.desktop-nav-*` and the tablet rules for the hidden header. Add account block, toolbar bell and
   count badge, header avatar, drawer, and profile page rules, sized like the field shell (42px
   icon buttons, 38px in the phone header, 2-column profile grid collapsing to 1 below 600px).
   Remove `.vendor-header-status { display: none }` from the `max-width: 360px` block
   (`vendor.css:1090`) so the icon-only status stays visible; let the store select shrink
   (`min-width: 0`) to make room.
9. **`VendorBottomNav.tsx`**: unchanged. No tab is highlighted while Profile is open.
10. **`docs/DECISIONS.md`**: short entry (vendor shell follows the field shell; Profile owns sign
    out, notification settings and password; bell is a derived alerts drawer, not stored
    notifications).

Non-goals: stored/server notifications, read receipts, merging SRP Guide and Advisories, a lock
feature, sign-out confirmation dialog, shared component package between the two PWAs.

## Acceptance criteria

- No "System Online", "Alerts" or "Log Out" control in the sidebar at any width.
- 1024px+: sidebar ends with the account block; sticky toolbar shows title, online chip, bell.
- 600-1023px: 76px rail ends with the avatar; same toolbar.
- Below 600px: header shows brand, status, store select (multi-store only), bell, avatar; bottom
  nav still has Dashboard, Notices, Messages, SRP Guide, Advisories.
- Bell count equals notices needing vendor action (unopened portal notice or response due) plus
  unread messages across all linked stores; drawer rows navigate as described and move focus into
  the destination.
- With Communications open, a new notice or message for another linked store reaches the bell
  within one 30-second poll.
- A vendor with zero linked stores can open Profile and sign out.
- The phone header still shows the online/offline indicator at 360px and 320px.
- Profile reachable from sidebar and phone header; Sign out returns to the login screen and clears
  the stored session; change password succeeds and reports the server's validation error.
- No horizontal scroll at 360px, 768px, 1366px.

## Verification

- `vendor-pwa/src/App.test.tsx`: update the sign-out test (line 128) to go through Profile; add
  tests for (a) sidebar has no status pill, Alerts or Log Out, (b) bell count and a drawer row
  opening the notice dialog with focus inside it, (c) change password calls
  `vendorApi.changePassword` and shows the 422 message, (d) Profile shows name, email and store,
  (e) an unopened portal notice counts and is listed, (f) zero linked stores: Profile opens and
  Sign out works, (g) with Communications open, the 30-second poll calls `vendorApi.overview`
  again and a second store's unread messages reach the bell, (h) Escape closes the drawer and
  focus returns to the bell, (i) with Communications open on store A, clicking a store B notice
  row lands on Notices with the dialog open and never calls `vendorApi.conversation` for store B,
  (j) while offline, a notice whose deadline passes leaves the bell count without any new
  `vendorApi` call (fake timers), (k) with Communications open on store A holding a typed draft
  and a chosen attachment, a store B messages row opens store B's thread with an empty composer,
  and sending then posts only the new text to store B, (l) "load earlier" triggers an overview
  refresh and the bell count drops to the server's new unread total.
- `vendor-pwa/src/app/rules.test.ts`: `needsVendorAction` for unopened portal, response due,
  expired, responded, closed and withdrawn notices.
- In `vendor-pwa/`: `npm test`, `npm run build`, `npm run lint`. All must pass.
- Browser (`vendor-sweep` + `backend-sweep` from `.claude/launch.json`, seeded vendor) at
  1366x800, 820x1180, 375x812, 360x740 and 320x640 (at the two narrowest: status indicator
  visible, bell and avatar fully inside the header and clickable, no horizontal scroll): read computed layout, click bell, open Profile from sidebar and
  header avatar, submit change password with a wrong current password (expect the error; do not
  change the seeded password), sign out. Screenshot each width.
- Compare side by side with `field-preview` (field-officer-pwa) at the same three widths.
- Fresh Codex inspection of the final diff; findings and dispositions logged in
  `docs/plans/vendor-shell/PLAN-REVIEW-LOG.md`.
