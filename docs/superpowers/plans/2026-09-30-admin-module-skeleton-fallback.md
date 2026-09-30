# Admin module skeleton loader (Suspense fallback)

## Context

Opening Field Monitoring, Consumer Reports or GIS Monitoring (Monitoring & Intake) briefly shows the
plain text "Loading Admin module..." instead of a skeleton.

Root cause (verified in source):
- These panels are `React.lazy` imports wrapped in `<Suspense fallback={<PanelLoader />}>`
  (`web/src/components/admin/AdminPanels.tsx:6-17`).
- `PanelLoader` is a bare `<div className="admin-panel-loader" role="status">Loading Admin module...</div>`.
  `.admin-panel-loader` has **no CSS rule** anywhere in `web/src`, so it renders as unstyled text at
  the top of `.admin-panel`.
- The skeletons that do exist live **inside** each module (`FieldMonitoringRecords.tsx:915-936`
  row/card skeletons, `CitizenTipReview.tsx:631-639` skeleton rows, `StoreManager.tsx:350-360`
  sidebar skeleton). They can only render after the lazy chunk has downloaded. During the chunk
  download the Suspense fallback shows the text.
- Dashboard shows a skeleton because `OverviewPanel` is not lazy; its skeleton is its own
  data-loading state (`AdminPanels.tsx:55-75`).

So the skeleton work covered data loading, not code-chunk loading. Same text appears on every lazy
module (Regulation & Legal, Administration, Settings), not only Monitoring & Intake.

## Approach

One change in the shared fallback so every lazy module is fixed at once:

Replace `PanelLoader` in `web/src/components/admin/AdminPanels.tsx` with a generic skeleton reusing
the existing classes (`admin-dashboard-workspace`, `admin-metric-grid-4`, `admin-skeleton-block`,
`sr-only`, all in `admin.css`) and the same pattern as the Overview skeleton:

```tsx
const PanelLoader = () => (
  <div className="admin-dashboard-workspace" role="status" aria-label="Loading Admin module">
    <span className="sr-only">Loading Admin module...</span>
    <div className="admin-metric-grid-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="admin-skeleton-block" style={{ height: '116px' }} />)}
    </div>
    <div className="admin-skeleton-block" style={{ height: '420px' }} />
  </div>
)
```

- Screen-reader text stays ("Loading Admin module..."), visible text goes.
- Reduced motion: `.admin-skeleton-block` animates forever (`admin.css:4880`) but the
  `@media (prefers-reduced-motion: reduce)` rule (`admin.css:5173`) only covers
  `.admin-skeleton-row span`. Extend that selector to `.admin-skeleton-row span, .admin-skeleton-block`
  (also fixes the existing Overview skeleton). Edit only that selector; `admin.css` has unrelated
  uncommitted edits that must stay.
- No new files, no per-module skeleton variants.

Non-goals: per-module shaped fallbacks, preloading chunks on hover, changing module data skeletons.

## Test

Add one test to `web/src/components/admin/AdminShell.test.tsx` (existing file, existing mocks):
render a lazy module (e.g. `?module=consumer_reports`), assert the fallback
`getByRole('status', { name: 'Loading Admin module' })` contains `.admin-skeleton-block` elements and
no visible "Loading Admin module..." outside `.sr-only`. If the lazy chunk resolves before the first
assertion in vitest, test `PanelLoader` via a never-resolving `Suspense` child instead (export not
needed: render `SrpManagementPanel` etc. with the lazy import mocked to a pending promise).

## Execution (claudex-loop)

- Host/coordinator: Claude. Plan reviewer: Codex (read-only). Builder: Claude. Inspector: fresh Codex.
- Plan copy for runner: `docs/superpowers/plans/2026-09-30-admin-module-skeleton-fallback.md`;
  log `PLAN-REVIEW-LOG.md` kept in scratchpad (outside checkout). Max 5 review rounds, 2 fix rounds.
- Before each Codex call: back up `~/.codex/config.toml` outside repo + SHA256, disable
  `[mcp_servers.*]` and write/outbound plugins per AGENTS.md; restore byte-for-byte and verify SHA256
  after.
- Preserve unrelated working-tree changes (StoreCommunications files, admin.css edits, mobile/, scratch/).
  No commit/push/deploy without explicit approval.

## Verification

- `cd web && npx vitest run src/components/admin/AdminShell.test.tsx` passes (new test included).
- `cd web && npx tsc -b --noEmit` (or `npm run build`) clean.
- Manual: `npm run dev` in `web/`, DevTools Network throttled to Slow 3G, hard reload, click Field
  Monitoring / Consumer Reports / GIS Monitoring: shimmer skeleton shows, no "Loading Admin module..."
  text; module then swaps to its own data skeleton.
