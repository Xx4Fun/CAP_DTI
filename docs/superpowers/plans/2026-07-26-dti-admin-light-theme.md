# PRICE-Watch DTI Admin Executive Light Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DTI Admin & Vendor Web Portal (`web/`) from dark-mode into an executive, high-contrast, light-themed administrative workspace with left sidebar navigation.

**Architecture:** Update CSS design tokens in `web/src/index.css`, refactor `AdminShell.tsx` and `App.tsx` for structured sidebar layout, and update all sub-component containers to use clean `#ffffff` surfaces with `#e2e8f0` borders.

**Tech Stack:** React, TypeScript, Vite, CSS Variables, Leaflet.js, Chart.js.

---

### Task 1: Global CSS Design Tokens & Base Styling

**Files:**
- Modify: `web/src/index.css`

- [ ] **Step 1: Replace dark-mode CSS variables with Light Executive tokens**

Update `:root` in `web/src/index.css`:
```css
:root {
    --font-primary: 'Outfit', sans-serif;
    --bg-dark: #f8fafc;
    --bg-card: #ffffff;
    --border-color: #e2e8f0;
    --primary: #1e3a8a; /* Navy */
    --primary-hover: #1d4ed8;
    --accent: #dc2626; /* Alert Red */
    --text-main: #0f172a;
    --text-muted: #64748b;
    --glass-blur: blur(8px);
    --success: #059669; /* Emerald */
    --shadow-glow: 0 1px 3px rgba(15, 23, 42, 0.08);
    --transition-speed: 0.2s;
}
```

- [ ] **Step 2: Update body background and calamity mode modifiers**

```css
body {
    margin: 0;
    font-family: var(--font-primary);
    background-color: var(--bg-dark);
    color: var(--text-main);
    overflow-x: hidden;
}

body.calamity-mode {
    --primary: #dc2626;
    --primary-hover: #b91c1c;
    --shadow-glow: 0 2px 8px rgba(220, 38, 38, 0.15);
}
```

- [ ] **Step 3: Remove layout-shifting hover transforms**

Replace wildcard `transition: all` and `transform: translateY` in `.glass`, `.card`, and `.btn-primary` with non-layout property transitions (`background-color`, `border-color`, `box-shadow`, `color`).

- [ ] **Step 4: Commit Task 1**

```bash
git add web/src/index.css
git commit -m "style(admin): update global CSS tokens to Executive Light Palette"
```

---

### Task 2: Executive Left Sidebar & Top Header Navigation (`AdminShell.tsx` & `App.tsx`)

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Refactor `App.tsx` layout container**

Update `App.tsx` header and main content wrapper to support the left sidebar layout:
```tsx
<div className="admin-app-layout">
  <AdminShell user={user as AdminUser} onLogout={handleLogout} />
</div>
```

- [ ] **Step 2: Refactor `AdminShell.tsx` to render Categorized Grouped Sidebar**

Implement 260px left sidebar with sections:
- 📊 **Overview**: Dashboard metrics
- 📍 **GIS & Establishments**: Interactive map & store management
- 📈 **Price Regulation**: 4-Week volatility graphs
- 🧾 **Consumer OCR Queue**: Citizen tips & vault inspection
- ⚖️ **Legal Engine**: LOI / SCO notice dispatch
- 🚨 **Emergency Protocol**: Calamity state control panel

- [ ] **Step 3: Add Top Breadcrumb & Calamity Alert Header**

Display DTI Antique Provincial Office title, breadcrumbs, search input, live market state pill (`[🟢 Normal Market]` vs `[🚨 State of Calamity]`), and user profile drawer.

- [ ] **Step 4: Commit Task 2**

```bash
git add web/src/App.tsx web/src/components/admin/AdminShell.tsx
git commit -m "feat(admin): implement Left Sidebar navigation and Executive Header in AdminShell"
```

---

### Task 3: Surface Refactoring for Admin Modules (`StoreManager.tsx`, `TemporalVolatility.tsx`, `CitizenTipReview.tsx`, `LegalNoticeManager.tsx`)

**Files:**
- Modify: `web/src/components/admin/StoreManager.tsx`
- Modify: `web/src/components/admin/TemporalVolatility.tsx`
- Modify: `web/src/components/admin/CitizenTipReview.tsx`
- Modify: `web/src/components/admin/LegalNoticeManager.tsx`
- Modify: `web/src/components/admin/EmergencyToggle.tsx`

- [ ] **Step 1: Update container cards in `StoreManager.tsx` to Light Surfaces**
Ensure table headers (`#f8fafc`), store cards, modal dialogs, and map containers use clean `#ffffff` surfaces and high-contrast text (`#0f172a`).

- [ ] **Step 2: Update Chart.js volatility graphs in `TemporalVolatility.tsx`**
Set gridlines to subtle slate (`#e2e8f0`), text labels to `#64748b`, and baseline SRP line to vibrant navy/emerald.

- [ ] **Step 3: Update OCR Review Queue & Legal Notice Tables**
Set modal backdrops to semi-transparent slate (`rgba(15, 23, 42, 0.4)`), status badges to emerald (`#059669`), gold (`#d97706`), or red (`#dc2626`).

- [ ] **Step 4: Commit Task 3**

```bash
git add web/src/components/admin/
git commit -m "style(admin): refactor workspace modules and tables to light executive cards"
```

---

### Task 4: Production Build Verification & Vercel Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Test production build**

Run in `c:\CAP101_DTI_SYS\web`:
```bash
npm run build
```
Expected output: Build completed successfully with 0 errors.

- [ ] **Step 2: Push commits to GitHub `main`**

```bash
git push origin main
```

- [ ] **Step 3: Deploy to Vercel Production**

Run in `c:\CAP101_DTI_SYS\web`:
```bash
npx -y vercel --prod --yes
```
Expected output: `Aliased https://web-plum-sigma-99.vercel.app`.

- [ ] **Step 4: Verify Live Vercel Production Deployment**
Test `https://web-plum-sigma-99.vercel.app` via `curl.exe` to confirm clean Light Theme bundle.
