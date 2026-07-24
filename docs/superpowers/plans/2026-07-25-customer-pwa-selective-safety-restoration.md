# Customer PWA Selective Safety Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore nonvisual correctness and safety fixes while preserving the currently restored legacy customer-PWA UI.

**Architecture:** Retain all existing screen JSX and CSS structure, adding small pure helpers and state guards around the existing workflows. Add Vitest/RTL regression coverage first, then change only event handlers, async transitions, accessibility attributes, route synchronization, and PWA configuration.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest, React Testing Library, jsdom, jest-axe, vanilla CSS.

## Global Constraints

- Do not replace `src/index.css` or redesign any screen.
- Do not change existing visual tokens, inline color values, spacing, card hierarchy, or navigation appearance.
- No synthetic production success, store, tracking, OCR, or capture-session data.
- Formal reports require a real live-camera blob and a server-confirmed response.
- Images and tracking tokens are not persisted in local storage.
- Write and run a failing regression test before each behavior change.

---

### Task 1: Design-neutral foundations

**Files:** `package.json`, `vitest.config.ts`, `src/test/setup.ts`, `src/app/*`, `src/hooks/*`

- [ ] Restore Vitest/RTL dependencies and test scripts.
- [ ] Restore tested typed route, handoff, regulatory-status, and connectivity helpers.
- [ ] Run `npm.cmd test -- src/app` and confirm all foundation tests pass.

### Task 2: Formal-report and tracking integrity

**Files:** `src/components/FormalReport.tsx`, `src/components/TrackReport.tsx`, matching tests

- [ ] Write failing tests for capture-session failure, camera denial, failed submission, and failed tracking.
- [ ] Remove generated capture sessions, demo tokens, fallback report confirmation, and mock tracking timelines.
- [ ] Keep failure states in the existing panels and buttons; do not change screen composition.
- [ ] Run focused tests and commit.

### Task 3: Scanner store and camera safety

**Files:** `src/components/ShelfScanner.tsx`, `src/components/StoreDirectory.tsx`, matching tests

- [ ] Write failing tests proving no default recent store, no synthetic store results, media-track cleanup, and capability-driven torch controls.
- [ ] Preserve the current scanner layout while correcting initialization, error recovery, and cleanup logic.
- [ ] Replace blocking alerts with existing inline error presentation.
- [ ] Run focused tests and commit.

### Task 4: Legacy-shell routing, truth state, and handoffs

**Files:** `src/App.tsx`, `src/components/Navbar.tsx`, `Home.tsx`, `SrpSearch.tsx`, `ProductDetail.tsx`, tests

- [ ] Write failing tests for paths, Back/Forward, unknown config, direct tracking, and product/report handoffs.
- [ ] Map typed routes to the legacy `activeTab` visual state.
- [ ] Preserve the existing Navbar and screen markup while adding `aria-current` and correct route updates.
- [ ] Keep unknown/offline status distinct from confirmed normal monitoring.
- [ ] Run focused tests and commit.

### Task 5: Accessibility semantics without redesign

**Files:** existing modal/form components and tests

- [ ] Write failing keyboard and automated accessibility tests.
- [ ] Add linked labels/errors, Escape handling, focus restoration, visible copy announcements, and secret-token reveal using existing styling.
- [ ] Add a visually hidden skip link and focus-visible behavior without altering normal appearance.
- [ ] Run accessibility tests and commit.

### Task 6: PWA packaging without header redesign

**Files:** `index.html`, `vite.config.ts`, `public/*`, `src/pwa-assets.test.ts`

- [ ] Write a failing asset/metadata test.
- [ ] Generate valid icons from the current legacy logo while leaving Navbar logo usage unchanged.
- [ ] Correct title, metadata, manifest paths, maskable icon, and orientation.
- [ ] Run packaging tests and build.

### Task 7: Full audit

- [ ] Run `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build`.
- [ ] Scan production source for fake-session, fake-confirmation, mock-timeline, and forbidden terminology branches.
- [ ] Render Home before/after at 390px and confirm no intentional visual redesign.
- [ ] Commit verification corrections if required.

