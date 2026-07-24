# Customer PWA Trust, Accessibility, and Price-Label UX Overhaul

> **Date:** 2026-07-25  
> **Status:** Approved in conversation on 2026-07-25  
> **Target:** `customer-pwa/` only  
> **Product:** PRICE-Watch Consumer Progressive Web Application

## 1. Purpose

PRICE-Watch helps Philippine consumers check DTI reference prices, compare a shelf price, submit a physical checkout receipt for evaluation, and privately track a submitted report. The overhaul must make those tasks truthful, accessible, responsive, and clearly connected without weakening the existing legal or privacy safeguards.

The implementation will preserve the existing four primary destinations—Home, Prices, Scan, and Reports—while repairing incomplete handoffs, misleading states, camera dead ends, accessibility gaps, and generic visual hierarchy.

## 2. Success Criteria

The work is successful when:

1. No failed public API, camera, OCR, submission, or tracking request can display synthetic production success data.
2. Every status shown as current, verified, detected, nearby, recent, copied, or successful is based on real state.
3. Users can enter, leave, refresh, and navigate the primary destinations using browser history and stable URLs.
4. Product and report context passes correctly between Prices, Scan, Reports, and Tracking.
5. All interactive controls are keyboard accessible, visibly focused, labelled, and usable at a minimum 44 by 44 CSS pixel target where practical.
6. Dialogs support focus management, Escape, labelled semantics, and focus restoration.
7. The experience adapts from 320px phones through tablets and desktop layouts without losing the mobile-first PWA behavior.
8. Camera flows provide truthful permission, capability, retry, manual-entry, and exit states.
9. Offline and unknown regulatory states are visually different from confirmed normal monitoring.
10. The installable PWA has valid icons, metadata, an optimized logo, and no missing manifest assets.
11. The visual system is recognizably PRICE-Watch through a restrained official shelf-label motif rather than generic rounded dashboard styling.
12. Automated tests cover route state, truthful failure behavior, handoffs, filters, accessibility semantics, and status derivation.

## 3. Non-Negotiable Product Rules

- Formal receipt reporting uses live camera capture only. Gallery uploads remain unavailable.
- A report is successful only after the backend confirms it and supplies the real public reference and secret tracking token.
- Use “tamper-evident,” never “tamper-proof.”
- A shelf comparison is informational and never automatically confirms a violation.
- Receipt information remains subject to human DTI evaluation.
- Offline SRP data may be displayed only with its source and saved timestamp or an explicit “saved date unavailable” message.
- Camera images and secret tracking tokens must not be persisted in local storage.
- Unknown configuration must display as unknown, never as normal monitoring.
- Demo fixtures may exist only in tests or behind an explicit development-only flag that cannot run in production builds.

## 4. Chosen Direction

The approved direction combines:

1. **Trust-first usability:** truthful system states, complete cross-flow context, reliable navigation, accessible controls, and explicit recovery paths.
2. **Price-label visual identity:** a restrained DTI bulletin and grocery shelf-label language used for the most important current-price and comparison information.

A full information-architecture replacement is intentionally excluded. The four existing primary destinations are understandable and will be improved rather than replaced.

## 5. Information Architecture and Routing

The application will use browser-backed routing without adding a large routing dependency. A small route module will map URL paths to typed application routes and update `history.pushState`.

Required paths:

- `/` — Home
- `/prices` — SRP directory
- `/prices/:commodityId` — Product detail
- `/scan` — Shelf scanner
- `/reports` — Reports dashboard
- `/reports/new` — Formal report workflow
- `/reports/track` — Tracking form

Browser Back and Forward must restore the corresponding primary screen. Sensitive workflow data stays in component memory. Non-sensitive handoff data—selected commodity ID, store ID, and comparison values—may use `sessionStorage` through one typed handoff module and must be consumed or cleared deliberately.

The fixed bottom navigation remains the primary mobile navigation. The top menu is limited to secondary actions: How it works, Privacy, Language readiness, and About PRICE-Watch. It must not duplicate the four primary destinations.

## 6. Shared State Model

### 6.1 Regulatory status

Regulatory status is tri-state:

- `loading`
- `available`, containing `stateOfCalamity`, source timestamps, and any bulletin metadata
- `unavailable`, containing offline or request-failure context

Components must not convert `null` or a failed request into `false`.

### 6.2 Connectivity and cached data

One shared connectivity notice replaces duplicate navbar and content banners. It reports:

- whether the browser is offline;
- whether displayed SRP data is live, cached, or bundled fallback data;
- the last known saved timestamp when available;
- that formal reporting requires a live connection.

### 6.3 Flow handoffs

Typed session handoffs will support:

- Prices to Scan: selected commodity.
- Prices to Reports: selected commodity.
- Scan result to Reports: selected store, commodity, displayed price, and reference price.
- Report confirmation to Tracking: real reference and real secret token, passed in memory rather than written to URL parameters.

Each destination shows a removable “Starting with” summary and consumes the handoff only when it has safely loaded it.

## 7. Visual System

### 7.1 Color tokens

- Government Ink — `#102A43`
- DTI Blue — `#1557B0`
- Price Tag Yellow — `#F2C14E`
- Paper — `#F6F8FB`
- Verified Green — `#13795B`
- Alert Red — `#B42318`

White remains the primary card surface. Muted text and borders will be derived at accessible contrast levels. Status must never depend on color alone.

### 7.2 Typography

- Body and form text: Atkinson Hyperlegible, self-hosted with a system fallback.
- Headings and shelf-label language: Barlow Semi Condensed, used with restraint.
- Prices, report references, and tracking tokens: IBM Plex Mono with tabular numerals.

If font files cannot be added without a network dependency, the implementation will use the closest system fallbacks while keeping the role-based token structure. The PWA must not depend on a live Google Fonts request for its core presentation.

### 7.3 Signature element

The signature element is the **official price strip**: a structured shelf-label module containing the product or bulletin name, large tabular price, effective date, source status, and a narrow yellow reference marker. It appears on Home, Product Detail, and the shelf comparison result. It is not used as decoration elsewhere.

### 7.4 Layout

- 320–599px: single-column mobile layout, safe-area-aware bottom navigation, stacked primary actions below 360px.
- 600–899px: wider content area with two-column Home sections and denser product/store lists.
- 900px and above: maximum 960px application shell, two-column directory/detail opportunities, while camera experiences remain focused and full-screen.
- Long review flows use a sticky action region that does not cover content or bottom navigation.
- Motion is limited to purposeful state transitions and disabled under `prefers-reduced-motion`.

## 8. Shared Components

The implementation will introduce focused reusable units instead of extending the existing large inline-style components:

- `AppRoute` and route helpers for typed navigation.
- `RegulatoryStatus` and `DataFreshness` types.
- `FlowHandoff` helpers for session context.
- `StatusBanner` for offline, unknown, warning, and success notices.
- `PriceStrip` for current bulletin and comparison emphasis.
- `Dialog` for modal semantics and focus management.
- `IconButton` for labelled 44px icon controls.
- `StorePicker` for real search, selection, and optional recent-store behavior.
- `CameraShell` for a shared full-screen, safe-area-aware capture layout.
- `Field` and `PasswordField` for linked labels, descriptions, errors, and show/hide behavior.
- `CopyButton` with visible and announced success/failure.

Large workflow components may retain their state machines, but presentation and shared behavior will move into these bounded units.

## 9. Screen Designs

### 9.1 Home

Home opens with the product’s core job:

```text
┌ PRICE-Watch                           Menu ┐
│ Current bulletin · source status            │
│                                              │
│ What price do you want to check?            │
│ [ Search product, brand, or package size ]  │
│                                              │
│ [ Scan a shelf tag ] [ Report a receipt ]   │
│                                              │
│ [ Track an existing report ]                │
│ Popular products                            │
└ Home       Prices       Scan       Reports ┘
```

Search transfers the term to `/prices`. The bulletin price strip uses real configuration data or an explicit unavailable state. “Track an existing report” goes directly to `/reports/track`. “How it works” opens real help content rather than Prices.

### 9.2 Prices

The directory includes:

- a labelled search field;
- classification filters with real result changes;
- an explicit sort menu rather than a cycling button;
- removable active filter chips and Reset;
- truthful live/cached/fallback freshness;
- skeleton loading rows;
- a helpful empty state;
- semantic product-row buttons;
- two-line product names before truncation;
- responsive one- or two-column results.

Product detail uses the price strip for the current reference price, server-derived dates, accessible accordion state, and handoff actions to Scan or Reports.

### 9.3 Shelf scanner

The scanner state machine remains explicit:

1. Store selection
2. Permission/camera
3. Capture review
4. Analysis
5. Candidate selection or manual recovery
6. Displayed-price confirmation
7. Comparison result
8. Error recovery

Store filters are shown only when functional. “Nearby” requires geolocation and actual distance sorting. “Recently selected” uses a real session record. No default store is presented as recently used.

The full-screen camera includes Close, store context, supported camera controls, guide text, and a shutter disabled when capture is unavailable. Torch UI appears only when the active track exposes torch capability. Lighting copy remains instructional unless real image-quality analysis exists.

Camera failure offers Retry camera, Choose another store, and Enter details manually. Closing the camera stops all media tracks.

The result centers a three-row comparison:

- Shelf price
- DTI reference price
- Difference in pesos and percent

The informational legal notice appears immediately beneath it. Reporting carries the comparison handoff into the formal report flow.

### 9.4 Formal report

The Reports dashboard emphasizes Submit a new report and Track an existing report. Educational material is consolidated under one “Before you report” disclosure.

The reporting flow is:

1. Privacy and camera explanation
2. Store selection
3. Capture guidance
4. Full-screen live receipt capture
5. Review and correct detected information
6. Confirm and submit
7. Server-confirmed success

Privacy and guidance dialogs use the shared accessible Dialog. Camera failures never create an artificial receipt. Capture-session failures keep the user on a recovery screen. Leaving the camera stops all tracks.

Detected fields must come from a real response or be clearly marked “Not detected.” “Full receipt detected” appears only when a real validation provides that result. Technical details such as SHA-256 are available in the expanded privacy explanation rather than dominating the task flow.

Submission failure states: “We couldn’t submit your report. Nothing was filed.” Actions are Retry and Back to review. The confirmation screen exists only with a real backend response.

### 9.5 Tracking

The tracking form includes linked labels, a show/hide secret token control, Paste where supported, and announced field or request errors. Mock results are removed.

The timeline derives completed, current, and upcoming states from actual status data. It must never mark a step both completed and active. Copy actions show visible text feedback and announce it to assistive technology.

## 10. Accessibility Requirements

- Semantic `button`, `a`, `nav`, `main`, `section`, `form`, and heading structure.
- Skip link to main content.
- Global `:focus-visible` ring with at least 3:1 contrast.
- `aria-current="page"` on active primary navigation.
- `aria-expanded` and `aria-controls` on menus and disclosures.
- Dialog labelling, focus trap, Escape close, and focus restoration.
- Form `id`/`htmlFor`, help text, and `aria-describedby`.
- `aria-live` for asynchronous errors, copy confirmation, and status changes.
- Text contrast of at least 4.5:1 for normal text and 3:1 for large text or graphical controls.
- No status communicated only through color or iconography.
- Minimum 44px touch target for primary and icon controls.
- Reduced-motion support.
- Safe-area insets for fixed top and bottom controls.

## 11. PWA and Performance

- Set the document title to “PRICE-Watch | DTI Consumer Price Guide.”
- Generate valid 192px, 512px, maskable, Apple touch, and favicon assets from the approved logo.
- Remove manifest references to nonexistent files.
- Optimize the header mark to an appropriately sized SVG, WebP, or compressed PNG; the interface must not load the current multi-megabyte source for a 38px display.
- Do not force portrait orientation on tablets and accessibility use cases.
- Cache self-hosted font assets with the application shell.
- Preserve offline SRP access and make data freshness explicit.

## 12. Error Handling

All asynchronous operations use explicit states: idle, loading, success, empty where applicable, and error.

Errors must state:

1. what failed;
2. whether anything was saved or submitted;
3. what the user can do next.

Examples:

- “We couldn’t load the current regulatory status. Saved prices may still be available.”
- “Camera access is blocked. Allow camera access in your browser, then try again.”
- “We couldn’t read this shelf tag. Retake it in better light or enter the product and price manually.”
- “We couldn’t submit your report. Nothing was filed. Your captured receipt remains on this screen while you retry.”
- “No report matched those credentials. Check both codes and try again.”

## 13. Testing Strategy

The project will add a lightweight React test stack suitable for Vite:

- Vitest
- React Testing Library
- `@testing-library/user-event`
- jsdom
- `jest-axe` or an equivalent automated accessibility assertion library

Required automated coverage:

- Route parsing, navigation, Back/Forward behavior, and active navigation semantics.
- Unknown versus confirmed regulatory status.
- Offline/live/cached/fallback freshness messaging.
- Flow handoff consume/clear behavior.
- Real filter and sort behavior.
- Home direct destinations.
- Semantic product and store selection.
- Dialog focus, Escape, labelling, and restoration.
- Camera close and media-track cleanup.
- Camera failure recovery without fabricated evidence.
- Formal submission failure without confirmation.
- Tracking failure without mock results.
- Timeline-state derivation.
- Secret-token show/hide and copy feedback.
- Manifest asset existence and document metadata.

Each behavior change follows red-green-refactor: write and run a failing test, implement the minimum behavior, rerun the focused test, then run the affected suite.

## 14. Verification

Before completion:

1. Run all customer PWA unit and component tests.
2. Run `npm run lint` with no new warnings in changed application files.
3. Run `npm run build`.
4. Verify manifest assets exist in the built output.
5. Perform a keyboard-only pass through all primary flows.
6. Test 320px, 390px, 768px, and 1280px viewport layouts.
7. Test offline SRP lookup.
8. Test denied camera permission and unavailable torch.
9. Test failed capture-session, submission, and tracking requests.
10. Recheck every non-negotiable product rule in Section 3.

## 15. Scope Boundaries

This overhaul changes only `customer-pwa/` and its customer-PWA documentation and tests. It does not redesign the administrator web application, mobile officer application, vendor portal, backend data model, or public API contracts. Backend defects discovered during implementation will be documented rather than silently worked around with fake client success.
