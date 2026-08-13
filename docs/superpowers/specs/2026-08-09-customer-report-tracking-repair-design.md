# Customer Report Tracking Repair Design

## Problem

The Customer PWA currently sends `POST /public/reports/track`, while Laravel registers the public tracking endpoint as `GET /api/public/reports/track`. The resulting 405 response prevents report tracking. Separately, Home renders recent-report tickets only when `recentReports` is supplied, but the application never records a successful receipt submission or supplies those records.

## Approved Design

- Restore the frontend tracking request to `GET /public/reports/track` with trimmed `reference` and `token` query parameters. The backend route and controller remain unchanged.
- Store a bounded local list of successful report summaries containing only the report reference, store name, public status, and submission timestamp. Never store the secret tracking token.
- Notify `App` after a successful formal-report submission. `App` updates the stored summaries and passes display-ready recent reports to Home immediately.
- When tracking succeeds, refresh that report's public store name, status, and submission timestamp in the same summary list without persisting its token.
- Normalize backend statuses into the Home ticket states `Submitted`, `Under review`, and `Closed`.

## Error and Privacy Boundaries

- A failed submission must not create a recent-report entry.
- Corrupt or unavailable browser storage falls back to an empty list without blocking submission or tracking.
- The report reference is locally visible by design; the secret tracking token remains in React memory only and is never written to browser storage.
- No backend schema, route, deployment, migration, or production data change is required.

## Verification

- A component regression test proves tracking emits GET query parameters and displays the returned report.
- Unit tests prove recent reports are bounded, newest-first, resilient to malformed storage, and omit secret tokens.
- An application/component test proves a successful submission callback updates Home data.
- Run the focused tests, complete Customer PWA test suite, lint, build, and `git diff --check`.
