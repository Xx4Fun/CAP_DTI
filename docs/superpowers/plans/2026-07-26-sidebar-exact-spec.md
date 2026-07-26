# PRICE-Watch DTI Admin Sidebar Component Exact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a 290px desktop sidebar component with `linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%)`, 3px solid `#7dd3fc` left active borders, Lucide SVG icons, rotating chevrons (180deg), translucent user profile card, hover states, and mobile overlay drawer matching the exact design specification.

**Architecture:** Update `web/src/components/admin/AdminShell.tsx` navigation logic and SVG icon rendering, update `web/src/components/admin/admin.css` with exact color tokens, and implement mobile drawer overlay.

**Tech Stack:** React, TypeScript, Lucide React Icons, CSS Variables, Vite, Vitest.

---

### Task 1: Exact CSS Color System & Sidebar Layout Styling (`admin.css`)

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Add exact CSS variables to `admin.css`**

```css
:root {
  --sidebar-width: 290px;
  --sidebar-gradient: linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%);
  --sidebar-text: rgba(255, 255, 255, 0.85);
  --sidebar-muted: rgba(255, 255, 255, 0.48);
  --sidebar-active-bg: rgba(255, 255, 255, 0.18);
  --sidebar-active-border: #7dd3fc;
  --sidebar-sub-active-bg: rgba(125, 211, 252, 0.15);
  --sidebar-sub-active-text: #e0f2fe;
  --sidebar-hover-bg: rgba(255, 255, 255, 0.10);
  --sidebar-card-bg: rgba(255, 255, 255, 0.09);
  --sidebar-card-border: rgba(255, 255, 255, 0.12);
  --sidebar-dropdown-bg: rgba(0, 0, 0, 0.12);
  --sidebar-logout-hover-bg: rgba(220, 38, 38, 0.20);
  --sidebar-logout-hover-text: #fca5a5;
  --mobile-overlay-bg: rgba(15, 23, 42, 0.55);
}
```

- [ ] **Step 2: Implement Sidebar Container & Item Styles**

```css
.admin-sidebar {
  width: 290px;
  min-width: 290px;
  max-width: 290px;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--sidebar-gradient);
  color: var(--sidebar-text);
  padding: 1.25rem 1rem;
  overflow-y: auto;
  font-family: 'Inter', sans-serif;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.sidebar-profile-card {
  background: var(--sidebar-card-bg);
  border: 1px solid var(--sidebar-card-border);
  border-radius: 10px;
  padding: 0.75rem 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.sidebar-avatar-circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
  font-weight: 700;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--sidebar-muted);
  margin-top: 1.1rem;
  margin-bottom: 0.4rem;
  padding-left: 0.65rem;
}

.admin-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  background: transparent;
  color: var(--sidebar-text);
  border: none;
  border-left: 3px solid transparent;
  font-weight: 500;
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

.admin-nav-item:hover {
  background: var(--sidebar-hover-bg);
  color: #ffffff;
}

.admin-nav-item.active {
  background: var(--sidebar-active-bg);
  border-left: 3px solid var(--sidebar-active-border);
  color: #ffffff;
  font-weight: 600;
}

.nav-dropdown-container {
  background: var(--sidebar-dropdown-bg);
  border-radius: 6px;
  margin-top: 0.25rem;
  padding: 0.35rem 0;
}

.admin-nav-sub-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.5rem 0.85rem 0.5rem 2.5rem;
  background: transparent;
  color: var(--sidebar-text);
  border: none;
  border-left: 3px solid transparent;
  font-size: 0.84rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.admin-nav-sub-item:hover {
  background: var(--sidebar-hover-bg);
  color: #ffffff;
}

.admin-nav-sub-item.active {
  background: var(--sidebar-sub-active-bg);
  color: var(--sidebar-sub-active-text);
  border-left: 3px solid var(--sidebar-active-border);
  font-weight: 600;
}

.chevron-icon {
  transition: transform 0.3s ease;
}

.chevron-icon.open {
  transform: rotate(180deg);
}

.logout-btn-sidebar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.85rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: var(--sidebar-text);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.logout-btn-sidebar:hover {
  background: var(--sidebar-logout-hover-bg);
  color: var(--sidebar-logout-hover-text);
  border-color: rgba(220, 38, 38, 0.3);
}

.mobile-overlay-backdrop {
  position: fixed;
  inset: 0;
  background: var(--mobile-overlay-bg);
  z-index: 90;
  backdrop-filter: blur(4px);
}
```

- [ ] **Step 3: Commit Task 1**

```bash
git add web/src/components/admin/admin.css
git commit -m "style(admin): implement exact color system and sidebar CSS rules"
```

---

### Task 2: Refactor `AdminShell.tsx` Component Structure with Lucide SVG Icons & Accordion Logic

**Files:**
- Modify: `web/src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Import Lucide SVG Icons**

```tsx
import {
  LayoutDashboard,
  MapPin,
  TrendingUp,
  Receipt,
  Scale,
  Siren,
  ChevronDown,
  LogOut,
  Shield,
  Menu,
  X
} from 'lucide-react'
```

- [ ] **Step 2: Implement Sidebar Component Header & Profile Card**

Render:
1. Header Section: DTI Emblem + Title `PRICE-Watch` + Subtitle `DTI Officer Portal`.
2. Profile Card: 38px Avatar Circle (`avatarInitial`) + User Name (`user.name`) + Role Text (`user.role.toUpperCase()`).

- [ ] **Step 3: Implement Accordion Dropdown Navigation Items**

Render 3 menu sections with rotating `ChevronDown` SVG indicators:
- `MAIN MENU` (10px uppercase, `rgba(255, 255, 255, 0.48)`)
  - `LayoutDashboard`: Dashboard Overview (`overview`)
  - `MapPin`: GIS Store Registry (`stores`)
- `REGULATORY ENGINE`
  - `TrendingUp` + `ChevronDown`: Price Regulation (`analytics`)
    - Sub-item: Four-Week Analytics (`analytics`)
    - Sub-item: SRP Bulletins (`srp`)
  - `Receipt`: Consumer OCR Queue (`reports`)
  - `Scale` + `ChevronDown`: Legal Engine (`legal`)
    - Sub-item: Notice Drafts (`legal`)
    - Sub-item: Audit Trail (`audit`)
- `SYSTEM`
  - `Siren`: Emergency Protocol (`emergency`)

- [ ] **Step 4: Implement Bottom Logout Button & Mobile Overlay Drawer**

Render:
- Bottom pinned `LogOut` button with hover effect (`rgba(220, 38, 38, 0.20)` fill with `#fca5a5` text).
- Mobile Hamburger Button + `mobile-overlay-backdrop` (`rgba(15, 23, 42, 0.55)`).

- [ ] **Step 5: Commit Task 2**

```bash
git add web/src/components/admin/AdminShell.tsx
git commit -m "feat(admin): implement exact desktop sidebar component with Lucide SVG icons and accordion dropdowns"
```

---

### Task 3: Build Verification, Unit Tests & Production Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Test production build**

```bash
npm run build
```
Expected output: 0 errors.

- [ ] **Step 2: Run Vitest unit tests**

```bash
npm test -- --run
```
Expected output: 8/8 tests pass.

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
