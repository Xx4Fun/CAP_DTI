# DTI Admin Portal UI/UX Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive UI/UX overhaul across the DTI Admin Portal, enhancing the Top Sticky Evaluator Header, Dashboard Command Center, CartoDB Light GIS Store Map, 4-Week Volatility Analytics, Receipt Review Queue, and Legal Notice Engine (while preserving the Executive Navy sidebar 100% as-is).

**Architecture:** Refactor React administrative components in `web/src/components/admin/` with sleek Executive Light styling, multi-column dashboard widgets, Chart.js trend overlays, CartoDB Light Leaflet tile layers, and live DOM legal notice document previews.

**Tech Stack:** React 19, TypeScript, Vitest, Lucide Icons, Leaflet.js, Chart.js, CSS Custom Properties.

---

### Task 1: Executive Top Sticky Header & Evaluator Bar

**Files:**
- Modify: `web/src/components/admin/AdminShell.tsx`
- Modify: `web/src/components/admin/admin.css`
- Test: `web/src/components/admin/AdminShell.test.tsx`

- [ ] **Step 1: Write failing unit test for Evaluator session status pill and popover menu**

```typescript
// Add test in web/src/components/admin/AdminShell.test.tsx
it('renders the evaluator profile pill with session status and popover menu', async () => {
  const user = { name: 'Officer Santos', role: 'dti_evaluator' }
  render(<AdminShell user={user} />)

  const accountBtn = screen.getByRole('button', { name: /Officer Santos account/i })
  expect(accountBtn).toBeInTheDocument()
  expect(screen.getByText('Session Active')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/admin/AdminShell.test.tsx`
Expected: FAIL (Session Active badge missing)

- [ ] **Step 3: Update `AdminShell.tsx` and `admin.css`**

Add session status badge inside `.header-account-button`:
```tsx
<button
  type="button"
  className="header-account-button"
  aria-label={`${user.name} account`}
  aria-expanded={accountOpen}
  aria-controls="admin-account-menu"
  onClick={() => setAccountOpen((open) => !open)}
>
  <div className="avatar-wrapper">
    <span className="header-avatar-badge" aria-hidden="true">{avatarInitial}</span>
    <span className="status-pulse-dot" title="Session Active" />
  </div>
  <span className="header-account-copy">
    <strong>{user.name}</strong>
    <small><span className="active-text">Session Active</span> • {user.role.replace('_', ' ')}</small>
  </span>
  <UserRound size={16} aria-hidden="true" />
</button>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/AdminShell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/AdminShell.tsx web/src/components/admin/admin.css web/src/components/admin/AdminShell.test.tsx
git commit -m "feat(admin): implement executive top sticky header with active session status pill"
```

---

### Task 2: Executive Dashboard Command Center

**Files:**
- Modify: `web/src/components/admin/AdminPanels.tsx`
- Modify: `web/src/components/admin/admin.css`
- Test: `web/src/components/admin/AdminVisualIntegrity.test.tsx`

- [ ] **Step 1: Write failing unit test for 4-Card Top KPI grid and split activity section**

```typescript
// Add test in web/src/components/admin/AdminVisualIntegrity.test.tsx
it('renders 4 KPI metrics and quick action shortcuts in overview panel', async () => {
  render(<OverviewPanel />)
  expect(await screen.findByText('Commercial Establishments')).toBeInTheDocument()
  expect(screen.getByText('Quick Actions')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/components/admin/AdminVisualIntegrity.test.tsx`
Expected: FAIL (Quick Actions section missing)

- [ ] **Step 3: Update `OverviewPanel` in `AdminPanels.tsx`**

Implement 4 KPI cards and 2-column split (Volatility Chart preview + Activity Stream & Quick Action Shortcuts):
```tsx
export function OverviewPanel(props: { onNavigate?: (module: ModuleId) => void }) {
  // ... state & fetch logic ...
  return (
    <div className="admin-dashboard-workspace">
      <div className="admin-metric-grid-4">
        <article className="kpi-card">
          <div className="kpi-icon-wrap blue"><Store size={22} /></div>
          <div><strong>{summary.stores}</strong><span>Commercial Establishments</span></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon-wrap amber"><Receipt size={22} /></div>
          <div><strong>{summary.pending_reports}</strong><span>Pending Receipt Reviews</span></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon-wrap red"><TrendingUp size={22} /></div>
          <div><strong>0</strong><span>Volatility Alerts (+10% SRP)</span></div>
        </article>
        <article className="kpi-card">
          <div className="kpi-icon-wrap green"><Shield size={22} /></div>
          <div><strong>{emergencyRecordsAvailable ? (summary.active_emergencies > 0 ? 'State of Calamity' : 'Normal Market') : 'Active'}</strong><span>Market Protocol Status</span></div>
        </article>
      </div>

      <div className="dashboard-split-grid">
        <div className="dashboard-left-panel">
          <div className="dashboard-card">
            <h3>Market Volatility & Compliance Overview</h3>
            <p>Four-week price compliance across San Jose de Buenavista establishments.</p>
            <div className="chart-placeholder-box">
              <span className="badge-live">Live Analytics Connected</span>
              <button type="button" className="admin-button secondary" onClick={() => props.onNavigate?.('analytics')}>View 4-Week Temporal Chart</button>
            </div>
          </div>
        </div>
        <div className="dashboard-right-panel">
          <div className="dashboard-card">
            <h3>Quick Actions</h3>
            <div className="quick-actions-list">
              <button type="button" onClick={() => props.onNavigate?.('srp')}>+ Add / Revise SRP Bulletin</button>
              <button type="button" onClick={() => props.onNavigate?.('reports')}>Review Formal Receipts</button>
              <button type="button" onClick={() => props.onNavigate?.('stores')}>GIS Establishment Map</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/admin/AdminVisualIntegrity.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/AdminPanels.tsx web/src/components/admin/admin.css web/src/components/admin/AdminVisualIntegrity.test.tsx
git commit -m "feat(admin): implement executive dashboard command center with 4 KPI cards and split view"
```

---

### Task 3: CartoDB Light GIS Store Registry Map

**Files:**
- Modify: `web/src/components/admin/StoreMap.tsx`
- Modify: `web/src/components/admin/StoreManager.tsx`

- [ ] **Step 1: Inspect `StoreMap.tsx` and confirm CartoDB Light tile configuration**

CartoDB Light tile URL: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`.
Add establishment status pins (Green = Compliant, Yellow = Anomaly, Red = Flagged) with popup summaries.

- [ ] **Step 2: Update `StoreMap.tsx` popup markers**

```typescript
const customIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="store-map-pin pulse-green" title="Compliant Establishment"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})
```

- [ ] **Step 3: Run web tests to verify no map regression**

Run: `npm test -- --run`
Expected: PASS (all tests pass)

- [ ] **Step 4: Commit**

```bash
git add web/src/components/admin/StoreMap.tsx web/src/components/admin/StoreManager.tsx
git commit -m "feat(admin): refine CartoDB light GIS store map with establishment popup badges"
```

---

### Task 4: Four-Week Temporal Volatility Analytics Overlays

**Files:**
- Modify: `web/src/components/admin/TemporalVolatility.tsx`
- Test: `web/src/components/admin/TemporalVolatility.test.tsx`

- [ ] **Step 1: Run existing volatility tests**

Run: `npx vitest run src/components/admin/TemporalVolatility.test.tsx`
Expected: PASS

- [ ] **Step 2: Enhance chart controls and baseline ceiling callout badge**

Add a prevailing SRP reference badge showing variance: `Prevailing SRP Baseline (Flat)` vs `Recorded Shelf Price (+10% Allowance Zone)`.

- [ ] **Step 3: Run tests to verify**

Run: `npx vitest run src/components/admin/TemporalVolatility.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add web/src/components/admin/TemporalVolatility.tsx
git commit -m "feat(admin): enhance 4-week temporal volatility chart with prevailing SRP ceiling overlays"
```

---

### Task 5: Formal Receipt OCR Review Queue Workspace

**Files:**
- Modify: `web/src/components/admin/CitizenTipReview.tsx`

- [ ] **Step 1: Enhance dual-column OCR receipt inspection workspace**

Ensure vaulted receipt images are presented with image rotation & zoom controls alongside extracted OCR items.

- [ ] **Step 2: Run web tests**

Run: `npm test -- --run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add web/src/components/admin/CitizenTipReview.tsx
git commit -m "feat(admin): polish formal receipt OCR review queue workspace"
```

---

### Task 6: Legal Notice Engine Previewer & Calamity Protocol Controls

**Files:**
- Modify: `web/src/components/admin/LegalNoticeManager.tsx`
- Modify: `web/src/components/admin/EmergencyToggle.tsx`

- [ ] **Step 1: Enhance legal document previewer and emergency protocol command bar**

Add official DTI Antique Provincial Office letterhead formatting to LOI/SCO draft previews with 48-hour expiration countdown timer.

- [ ] **Step 2: Run all web tests and build**

Run: `npm test -- --run ; npm run build`
Expected: PASS with 0 errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/admin/LegalNoticeManager.tsx web/src/components/admin/EmergencyToggle.tsx
git commit -m "feat(admin): implement DOM legal notice previewer and emergency protocol command bar"
```
