# PRICE-Watch DTI Admin Sidebar-Only Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the rich royal blue theme strictly to the Left Sidebar, fix sidebar navigation/sub-menu interaction bugs, and revert the main content area (`OverviewPanel`) back to clean PRICE-Watch regulatory summary metrics.

**Architecture:** Update `AdminShell.tsx` navigation handlers and sub-item dropdown logic, update `admin.css` sidebar styles, and simplify `OverviewPanel` in `AdminPanels.tsx`.

**Tech Stack:** React, TypeScript, Vite, Vitest.

---

### Task 1: Fix Sidebar Navigation Logic & Sub-Menu Interaction (`AdminShell.tsx` & `admin.css`)

**Files:**
- Modify: `web/src/components/admin/AdminShell.tsx`
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Refactor `AdminShell.tsx` navigation handlers**

Ensure clicking a sub-item (`analytics`, `srp`, `legal`, `audit`) cleanly activates the module without collapsing the parent section.
Ensure parent nav items (`Price Regulation`, `Legal Engine`) toggle expansion on chevron click, while allowing direct navigation to default sub-module.

- [ ] **Step 2: Refactor `admin.css` sidebar rules**

Update `.admin-sidebar`, `.admin-nav-item`, `.admin-nav-sub-item`, and `.admin-sidebar.collapsed`:
- Collapsed width: `72px`.
- Active parent pill: `background: rgba(255, 255, 255, 0.2); color: #ffffff; font-weight: 700;`.
- Active sub-item pill: `color: #ffffff; background: rgba(255, 255, 255, 0.12); font-weight: 600; border-left: 3px solid #ffffff;`.
- Sub-item indent padding: `padding-left: 2.25rem`.

- [ ] **Step 3: Commit Task 1**

```bash
git add web/src/components/admin/AdminShell.tsx web/src/components/admin/admin.css
git commit -m "fix(admin): refine sidebar sub-menu navigation and collapsed state styling"
```

---

### Task 2: Revert & Clean Up Workspace Content Area (`AdminPanels.tsx`)

**Files:**
- Modify: `web/src/components/admin/AdminPanels.tsx`

- [ ] **Step 1: Clean up `OverviewPanel` in `AdminPanels.tsx`**

Remove external mock cards ("Compliant Stores", "Pending Scans", "Active LOIs", etc.).
Render clean, real PRICE-Watch DTI summary cards:
1. **Commercial Establishments**: Count of registered stores.
2. **Formal Consumer Tips**: Count of pending consumer receipt submissions.
3. **State of Calamity Status**: Current active emergency status & freeze policy status.

- [ ] **Step 2: Commit Task 2**

```bash
git add web/src/components/admin/AdminPanels.tsx
git commit -m "refactor(admin): revert main workspace overview panel to clean PRICE-Watch metrics"
```

---

### Task 3: Build Verification, Unit Tests & Vercel Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Run production build**

```bash
npm run build
```

- [ ] **Step 2: Run Vitest test suite**

```bash
npm test -- --run
```

- [ ] **Step 3: Push commits to GitHub `main`**

```bash
git push origin main
```

- [ ] **Step 4: Deploy to Vercel Production**

```bash
npx -y vercel --prod --yes
```

- [ ] **Step 5: Verify Live Vercel Production Deployment**
Verify `https://web-plum-sigma-99.vercel.app` returns 200 OK.
