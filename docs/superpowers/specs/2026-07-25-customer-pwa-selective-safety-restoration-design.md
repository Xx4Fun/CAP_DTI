# Customer PWA Selective Safety Restoration

**Status:** Approved in conversation on 2026-07-25

## Goal

Keep the customer PWA's restored legacy appearance exactly as it is while restoring the nonvisual correctness, safety, accessibility-semantic, routing, test, and install-package fixes that were removed by the broad rollback.

## Immutable visual boundary

- Preserve the current `index.css`, inline style values, card composition, colors, typography, spacing, icons, header, bottom navigation, scanner viewport, report screens, and responsive layout.
- Do not introduce the price-strip redesign, new dashboard layout, new component styling, or new visual tokens.
- New error or unavailable states must reuse existing banner, panel, button, and form classes or equivalent existing inline styling.

## Behavioral requirements

1. Formal report capture-session failure must not create a fake session or open a success path.
2. Camera failure must not create or imply a captured receipt.
3. Formal report submission failure must keep review visible, say that nothing was filed, and never generate a reference/token.
4. Tracking failure must never return a mock timeline.
5. Scanner and report store lists must not inject synthetic default or recent stores when the API fails.
6. Scanner camera tracks must stop on close, state exit, facing-mode change, and unmount; torch UI must depend on actual track capabilities.
7. Configuration failure must remain unknown rather than becoming normal monitoring.
8. Browser paths and Back/Forward must represent Home, Prices, Scan, Reports, and Tracking without changing their visual navigation.
9. Non-sensitive product/store/comparison context must pass between flows; images and secret tokens must remain in memory.
10. Existing dialogs and forms gain correct roles, labels, focus handling, announcements, and keyboard behavior without visual redesign.
11. Manifest metadata and icons must be valid while the header continues using the current legacy logo.
12. Regression tests must prove every failure-path rule.

## Verification

- Full Vitest suite, lint, and production build pass.
- Production source contains no fake capture-session, fake report-success, or mock-tracking branches.
- A rendered legacy Home screenshot is compared against the restored baseline to detect unintended visual redesign.

