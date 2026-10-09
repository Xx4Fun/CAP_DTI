# Emergency Protocol pricing-section cleanup

Implemented and locally verified on 2026-10-09, based on the user's approved plan. The user subsequently authorized committing and publishing this cleanup. Deployment acceptance is verified separately from the local checks below. Baseline: `a3ceb527b47401376002bc99a6f17801fee46ffe`.

One **Price Freeze Prices** section follows the selected declaration. Drafts show **Proposed price ceilings**; scheduled declarations show **Confirmed price ceilings — scheduled**; declarations in effect show **Confirmed price ceilings**. Ended/expired records show **Historical price ceilings**, cancelled records are explicitly cancelled, and unknown states show **Status unavailable** without preparation/activation/ending actions. Legacy `ended` records that remain `in_effect` retain manual ending.

Draft candidates and SRP fallbacks share one table: Product, Proposed ceiling, Price basis and Monitoring coverage. Search, basis filters and pagination operate on both row kinds; filter counts precede search. Missing observations show an unavailable APC ceiling and retain the existing activation block, while usable SRP fallbacks remain eligible. Minimum, maximum, observed average, source week and the APC formula are available inside the existing expandable monitoring-source rows.

Confirmed/historical views read only the selected summary's saved official prices, including saved SRP-held ceilings. Current SRP fallbacks and candidates cannot substitute for saved prices. Older declarations remain accessible through the Declarations list; the aggregate all-declarations table and separate draft SRP list are removed. Search, filters and pages reset synchronously when selection changes, and pages clamp when results shrink. Background refresh preserves the same declaration's visible records, expanded sources, scroll and review confirmation unless its preparation hash changes.

No backend/API/type-contract, dependency, schema, calculation or regulatory-data changes. Existing refresh guards, retries, stale warnings, activation hash validation, creation/date controls, and active/ended banners remain in place. Mobile cells use the existing `data-label` style, and the four draft filters wrap within the pricing section.

## Verification

- Observed RED before implementation: 13 new behavioral checks failed against the previous two-card layout. The mobile-label regression also failed before labels were added.
- Focused Admin component/API/session package: **7 files, 99 tests passed**. Covers mixed/APC-only/SRP-only/missing drafts, status variants, unknown draft blocking, authoritative activation/ending responses, selection races, saved historical values, refresh/retry, search/filter resets, and page clamping.
- Admin production build passed; the existing large Excel-export chunk warning remains. Scoped frontend lint passed with the same three refresh-hook warnings. The design detector reported existing shared stylesheet patterns outside the new rules; no broad style cleanup was undertaken.
- Browser checks use actual Admin styles and synthetic records, with external requests blocked: 1440 px desktop and 390 px phone, **127 draft products (123 APC + 4 SRP)**, **123 monitoring-source rows**, minimum row height **43 px**, readable calculations/observations, keyboard expansion and preserved refresh scroll/expansion.
- Independent read-only review found no material correctness issues. An initially transient filter assertion prompted synchronous selection resets; the final focused package passed after that change.

Browser assertions and screenshots: [results](../../../scratch/emergency-pricing-cleanup/browser-results.json), [desktop](../../../scratch/emergency-pricing-cleanup/draft-prices-1440.png), [phone](../../../scratch/emergency-pricing-cleanup/draft-prices-390.png).

Run the existing focused Admin package and `npm.cmd run build` from `web/`. For browser verification, start `npm.cmd run dev -- --host 127.0.0.1 --port 5191 --strictPort`, then run `python scratch/emergency-loading-fix/browser_check.py` from the repository root; results are written into `scratch/emergency-pricing-cleanup/`.

Backend tests and authenticated production workflow acceptance were not rerun because this cleanup changes Admin presentation only. No new performance target is claimed. Unrelated workspace files remain preserved; the user authorized the production release after local verification.
