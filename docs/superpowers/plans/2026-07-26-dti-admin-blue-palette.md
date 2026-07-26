# PRICE-Watch DTI Admin Blue Palette & Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the DTI Admin & Vendor Web Portal (`web/`) to use the rich royal blue sidebar gradient, ice-white background, left-bordered accent cards, and rounded royal blue action buttons matching the color palette from `DTI-ui/image.png`.

**Architecture:** Update CSS variables in `web/src/index.css` and `web/src/components/admin/admin.css`, update `AdminShell.tsx` to render the rich blue gradient sidebar with user profile card and expandable menu items, and update metric counter cards to feature colored left borders.

**Tech Stack:** React, TypeScript, Vite, CSS Variables, Leaflet.js, Chart.js.

---

### Task 1: Rich Blue Sidebar CSS Tokens & Layout Styling

**Files:**
- Modify: `web/src/index.css`
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Define Rich Blue Palette CSS variables in `index.css`**

```css
:root {
    --font-primary: 'Outfit', sans-serif;
    --sidebar-bg: linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%);
    --sidebar-text: #ffffff;
    --sidebar-muted: #bfdbfe;
    --sidebar-active: rgba(255, 255, 255, 0.18);
    --bg-main: #f1f5f9;
    --bg-card: #ffffff;
    --border-color: #e2e8f0;
    --primary: #1d4ed8; /* Royal Blue */
    --primary-hover: #1e40af;
    --text-main: #0f172a;
    --text-muted: #64748b;
}
```

- [ ] **Step 2: Add Left-Accent Border Card Classes in `admin.css`**

```css
.metric-card-green { border-left: 4px solid #059669 !important; }
.metric-card-amber { border-left: 4px solid #f59e0b !important; }
.metric-card-blue  { border-left: 4px solid #2563eb !important; }
.metric-card-purple{ border-left: 4px solid #8b5cf6 !important; }
.metric-card-teal  { border-left: 4px solid #0d9488 !important; }
```

- [ ] **Step 3: Commit Task 1**

```bash
git add web/src/index.css web/src/components/admin/admin.css
git commit -m "style(admin): define rich blue sidebar gradient and left-accent card CSS classes"
```

---

### Task 2: Rich Blue Sidebar Navigation & Top Header (`AdminShell.tsx` & `App.tsx`)

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Refactor Sidebar Header & User Profile Pill in `AdminShell.tsx`**

Include:
- DTI Seal + Portal Title + `‹` collapse toggle button.
- Translucent User Card showing Avatar Initial (`E`), Officer Name, and Role Badge.

- [ ] **Step 2: Refactor Categorized Navigation List**

Render section headers (`MAIN MENU`, `REGULATORY ENGINE`, `SYSTEM`) and items with expandable chevrons:
- 📊 Dashboard Overview
- 📍 GIS & Establishments
- 📈 Price Regulation
- 🧾 Consumer OCR Queue
- ⚖️ Legal Engine (LOI / SCO Notices)
- 🚨 Emergency Protocol

- [ ] **Step 3: Refactor Top Header Bar**

Render Left Home Badge + Title + Subtitle, and Right `Messages` Pill Button + User Profile Initial Avatar.

- [ ] **Step 4: Commit Task 2**

```bash
git add web/src/App.tsx web/src/components/admin/AdminShell.tsx
git commit -m "feat(admin): implement rich blue sidebar gradient and top header matching prototype palette"
```

---

### Task 3: Metric Cards & Quick Access Action Grid Refactoring (`StoreManager.tsx`, `TemporalVolatility.tsx`, `CitizenTipReview.tsx`, `LegalNoticeManager.tsx`, `EmergencyToggle.tsx`, `Login.tsx`)

**Files:**
- Modify: `web/src/components/admin/StoreManager.tsx`
- Modify: `web/src/components/admin/TemporalVolatility.tsx`
- Modify: `web/src/components/admin/CitizenTipReview.tsx`
- Modify: `web/src/components/admin/LegalNoticeManager.tsx`
- Modify: `web/src/components/admin/EmergencyToggle.tsx`
- Modify: `web/src/components/Login.tsx`

- [ ] **Step 1: Refactor Dashboard Overview & Metric Cards**
Add colored left borders (`#059669`, `#f59e0b`, `#2563eb`, `#8b5cf6`, `#0d9488`) to the 5 metric counter cards.

- [ ] **Step 2: Refactor Quick Access Grid & Action Cards**
Add rounded royal blue icon boxes (`#1d4ed8`), short module descriptions, and blue `Open module →` interactive links.

- [ ] **Step 3: Update `Login.tsx` to match Rich Royal Blue Palette**
Update login screen background, logo badge, and primary buttons to Royal Blue `#1d4ed8`.

- [ ] **Step 4: Commit Task 3**

```bash
git add web/src/components/
git commit -m "style(admin): refactor metric cards, action grid, and modules to rich blue palette"
```

---

### Task 4: Production Build, Test & Vercel Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Test production build**

Run in `c:\CAP101_DTI_SYS\web`:
```bash
npm run build
```

- [ ] **Step 2: Run Vitest unit test suite**

Run in `c:\CAP101_DTI_SYS\web`:
```bash
npm test -- --run
```

- [ ] **Step 3: Push commits to GitHub `main`**

```bash
git push origin main
```

- [ ] **Step 4: Deploy to Vercel Production**

Run in `c:\CAP101_DTI_SYS\web`:
```bash
npx -y vercel --prod --yes
```

- [ ] **Step 5: Verify Live Vercel Production Deployment**
Verify `https://web-plum-sigma-99.vercel.app` returns 200 OK.
