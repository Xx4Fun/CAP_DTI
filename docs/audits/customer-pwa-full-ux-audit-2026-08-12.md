# Customer PWA Full UX Audit

**Audit date:** 12 August 2026  
**Audit type:** Read-only source, workflow, accessibility, and implementation-integrity review  
**Scope:** `customer-pwa/` and its connected public Laravel API endpoints  
**Excluded:** DTI Admin UI, Flutter mobile, deployment changes, and independent legal-policy validation

## Executive assessment

The Customer PWA has a solid visual foundation. Its principal routes build correctly, the shelf scanner now performs genuine camera capture and backend OCR, store selection is one-tap, price filters are well implemented, and device Back behavior is substantially improved.

The most important remaining problems are workflow continuity, regulatory-data provenance, receipt-report recoverability, offline honesty, and failure handling. These concerns should be addressed before describing the complete journey as consumer-ready.

## Highest-priority findings

| Priority | Finding | User impact | Recommendation |
|---|---|---|---|
| P0 | Product-detail handoffs are ignored | Scan and Report forget the selected product | Preserve the selected commodity across the target flow |
| P0 | Reporting continues after capture-session failure | Users can complete capture and review only to fail at submission | Stop early and expose Retry/Back |
| P0 | Receipt detected fields are not receipt OCR | The interface implies analysis that did not occur | Rename the section or implement receipt OCR |
| P0 | Privacy claims exceed implementation | Trust and compliance copy is unsupported by the current code | Align every claim with implemented safeguards |
| P0 | Idempotent replay can lose the secret tracking token | A successful report may become impossible to track | Redesign one-time credential recovery |
| P0 | Old private tracking credentials remain in memory | A prior report can reopen later on a shared device | Consume and clear the intentional handoff once |
| P0 | Cached responses can be labelled live | Stale regulatory data can appear newly synchronized | Use one explicit cache/provenance mechanism |
| P0 | Regulatory metadata is invented | Missing data becomes a fixed date, normal state, or nationwide scope | Render unavailable states instead |

## 1. Home and primary navigation

### Strengths

- Home presents two clear primary actions.
- Recent Reports uses real locally recorded summaries rather than fabricated tickets.
- The bulletin separates regulatory status, effective date, and result count.
- The PWA installation promotion is browser-gated and dismissible.
- Bottom navigation uses icons and labels with a prominent Scan action.

### Findings

1. **Profile opens a navigation menu rather than a profile.** Replace it with a direct Track action; the header already owns the menu.
2. **The header menu duplicates primary navigation.** Reserve it for secondary destinations such as Help, Privacy, Consumer Rights, About, and installation.
3. **The menu lacks complete dialog behavior.** Add semantics, focus entry, focus trapping, focus restoration, and an internal close control.
4. **The calamity notice is a clickable status `div`.** Use a real link or button.
5. **“Compare any price instantly” overpromises.** Prefer “Scan a shelf tag and compare it with the current reference price.”
6. **Recent report cards look interactive but cannot open.** Rename “View all” to “Track a report” and identify the displayed status as the last known status.
7. **Consumer Rights keeps the same accessible label while expanded.** Announce Show and Hide states.
8. **Data freshness shows a time without date or timezone.** Use a complete localized timestamp.

## 2. Price directory and product details

### Strengths

- Classification pills fit without horizontal scrolling.
- Category filtering stages draft changes in an accessible bottom sheet.
- The filter sheet supports focus trapping, Escape, backdrop and swipe dismissal, scroll locking, safe areas, and focus restoration.
- Sorting is an inline dropdown.
- Product cards are semantic buttons with useful names.
- Product details have real routes and restore the exact list scroll position.
- Broken list images use a neutral fallback.

### Findings

1. Search replaces the complete result list with a loading message after each debounce. Keep existing results visible and update in the background.
2. Filter-only empty states can mention an empty search value. Generate the message from the active conditions and provide the relevant reset action.
3. “Offline mode” also covers backend failure while the browser is online. Distinguish browser offline, saved copy, backend unavailable, and bundled reference data.
4. Bundled data cards still say “Current SRP.” Reserve that label for confirmed live data.
5. Search, filters, and sort reset after switching tabs. Preserve them for the session.
6. Search clear, filter removal, and Clear all are smaller than comfortable mobile targets.
7. Product details invent a fixed effective date, Nationwide scope, and Normal monitoring state when metadata is missing.
8. Product-detail images use cropping and fabricated branded fallback illustrations. Use containment and the neutral list fallback.
9. The Bulletin Source card has no public source reference.
10. Price-freeze text makes hardcoded legal assertions without tying them to the active item and source.

## 3. Price-tag scanner

The current happy path is Choose store, open camera, align and capture, upload the guide crop, run OCR/product matching, compare automatically when confidence permits, recover manually when needed, then present the comparison result.

### Strengths

- Store cards support real images and neutral fallbacks.
- Store selection proceeds with one tap and recent stores do not duplicate the list.
- Camera capture and OCR are genuine.
- The guide is mapped to the corresponding source pixels before upload.
- Torch controls are hidden when unsupported in Scanner.
- Recovery states cover missing text, price, and product matching.
- Network failures do not fabricate a comparison.
- Scan another item retains the selected store.
- Above-reference results do not automatically claim a violation.
- Device Back and asynchronous cleanup have automated coverage.

### Findings

1. The result leads with the generic heading “Comparison Result”; lead with the plain-language verdict and amount difference.
2. “View price history” opens the general directory. Navigate to the exact product or rename the action.
3. Product-detail Scan loses the selected product context.
4. Camera denial leaves the user without Retry, permission guidance, or a manual path.
5. The shutter can be pressed before the camera is ready.
6. Store empty states conflate no search matches, no recents, no nearby stores, and network failure.
7. The store directory lacks an explicit Retry action.
8. Nearby stores hides its two-kilometre radius.
9. Manual selection can bypass the visible Compare button, making completion behavior inconsistent.
10. OCR and regulatory implementation terms should be rewritten in consumer language.
11. Processing, recovery, and result transitions need assistive-technology announcements.
12. Scanner store selection does not display the global offline warning.

## 4. Receipt reporting

### Strengths

- Submit and Track are separated clearly.
- Consent occurs before capture.
- Store selection is one-tap and shares scanner styling.
- Camera capture is real, with review and retake.
- Submission requires affirmation.
- Confirmation explains that human evaluation remains necessary.
- Secret tokens are not stored in ordinary local storage.

### Findings

1. Capture-session failure is ignored and users can continue into a flow that cannot submit.
2. Static fallback stores are selectable for formal evidence reporting.
3. The 15-minute capture session can expire without warning during capture or review.
4. Direct reporting does not collect the item, expected price, paid price, discrepancy, or explanation.
5. “Automatically Detected Fields” is not receipt OCR. Direct reports contain no extracted lines; scan handoff inserts a commodity ID and scanned shelf price.
6. Privacy copy claims encryption, automatic redaction, anonymity, and verified client hashing beyond what current code proves.
7. Privacy notice version `1.0` is hardcoded despite the configurable public value.
8. A timeout-after-success can return an idempotent replay without the original tracking token.
9. Leaving confirmation can permanently lose the only tracking credentials.
10. Clipboard failures are ignored.
11. The interface promises a private tracking link but generates only two credentials.
12. Report-camera permission denial has no useful recovery path.
13. Report-camera controls are smaller than 44 pixels and omit top safe-area handling.
14. Torch appears even when unsupported and can fail silently.
15. Retake is duplicated on the review screen.

## 5. Report tracking

### Strengths

- Both credentials are required and the token is obscured.
- Timeline history comes from the backend.
- The backend-reported status determines the current timeline item.
- Dates are localized and Track another report clears the visible form.

### Findings

1. Old submission credentials persist in application state and can automatically reopen a previous private report.
2. Network failure is presented as an invalid-reference or invalid-token error.
3. There is no Show or Hide token control.
4. Copy controls are undersized and incompletely labelled.
5. Recent reports cannot securely prefill tracking without storing the secret; the UI should explain this tradeoff.

## 6. Offline, PWA, failure recovery, and performance

1. Workbox and the React verified cache can disagree about freshness. A service-worker-cached response can be stamped as newly live.
2. Offline-banner dismissal does not reset after reconnecting.
3. The offline banner has weak contrast and an undersized close target.
4. The global error screen diagnoses every exception as an update and clears every service worker and cache before reload.
5. Asset-load recovery can repeatedly unregister and reload when a resource remains missing.
6. API cold-start messaging is generic even though readiness can wait up to 75 seconds.
7. The production build reports an initial JavaScript chunk above 500 kB.
8. The primary font is loaded through a blocking external Google Fonts import.

## 7. Accessibility and mobile usability

- Enforce 44-by-44-pixel targets for icon, chip, close, copy, and camera controls.
- Use at least 16-pixel inputs to prevent iOS focus zoom.
- Add top safe-area handling to the fixed header and report camera.
- Complete focus trapping and restoration for menus and report dialogs.
- Add `aria-expanded` to report accordions and accessible names to copy buttons.
- Announce camera readiness, OCR progress, comparison, submission, and tracking results.
- Move focus to the next heading when a wizard state changes.
- Respect reduced motion for scanner spinners and inline animations.
- Add automated `jest-axe` coverage; the package is installed but unused.
- Prefer plain consumer language over OCR, evidence-vault, and regulatory-engine terminology.

## Recommended implementation order

1. Repair trust and data continuity.
2. Prevent reporting with an invalid capture session.
3. Restructure the successful scan result around the verdict and next action.
4. Repair camera, offline, cold-start, tracking, clipboard, and crash failure states.
5. Standardize navigation, touch targets, safe areas, focus, and announcements.
6. Reduce initial load and validate on representative Android and iOS devices.

## Verification performed

- Customer PWA and connected public Laravel endpoints were inspected read-only.
- Production build completed successfully, with a large-chunk warning.
- All 141 Customer PWA tests passed when run serially in smaller groups.
- Lint completed with no errors; existing warnings remain.
- No physical camera, geolocation-permission, installed-PWA, screen-reader, or real-device run was available during this audit.

