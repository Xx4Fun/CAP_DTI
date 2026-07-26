# PRICE-Watch DTI Admin Sidebar 5-Principle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 5 sidebar design & engineering principles: color gradient + translucent layers, single-open exclusive accordion state, CSS `max-height` dropdown transitions, fixed 290px width stability with ultra-thin 4px scrollbar, and responsive drawer overlay behavior.

**Architecture:** Refactor `AdminShell.tsx` state and dropdown collapse handlers, and update `admin.css` with CSS transitions, scrollbar rules, and mobile overlay drawer transforms.

**Tech Stack:** React, TypeScript, Vite, Vitest.

---

### Task 1: Refactor `AdminShell.tsx` Accordion State (Exclusive Open Category)

**Files:**
- Modify: `web/src/components/admin/AdminShell.tsx`

- [ ] **Step 1: Replace multi-expand state with single `openCategory` state**

In `AdminShell.tsx`:
```tsx
const [openCategory, setOpenCategory] = useState<string | null>('analytics')
```
Clicking a parent dropdown header toggles `openCategory`:
```tsx
const toggleCategory = (categoryId: string) => {
  setOpenCategory((prev) => (prev === categoryId ? null : categoryId))
}
```

- [ ] **Step 2: Update navigation click behavior**

When a parent item is clicked:
1. `setActiveModule(item.id)`
2. If `item.subItems`, call `toggleCategory(item.id)`
3. If mobile view, close mobile drawer (`setIsMobileOpen(false)`).

When a sub-item is clicked:
1. `setActiveModule(sub.id)`
2. Keep `openCategory` open (`item.id`).
3. If mobile view, close mobile drawer.

- [ ] **Step 3: Commit Task 1**

```bash
git add web/src/components/admin/AdminShell.tsx
git commit -m "feat(admin): implement single open category exclusive accordion state in AdminShell"
```

---

### Task 2: Refactor `admin.css` CSS Transitions, Scrollbar, & Layout Stability

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Add custom ultra-thin 4px scrollbar and layout stability rules**

```css
.admin-sidebar {
  width: 290px !important;
  min-width: 290px !important;
  max-width: 290px !important;
  height: 100vh;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(160deg, #1a2744 0%, #1e3a8a 60%, #2563eb 100%) !important;
  color: rgba(255, 255, 255, 0.85);
  padding: 1.25rem 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  font-family: 'Inter', sans-serif;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Custom ultra-thin 4px scrollbar */
.admin-sidebar::-webkit-scrollbar {
  width: 4px;
}

.admin-sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.admin-sidebar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.admin-sidebar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.35);
}

.nav-item-content span,
.user-card-name,
.user-card-role,
.brand-text h2,
.brand-text p {
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
```

- [ ] **Step 2: Add smooth `max-height` transition for sub-menu containers**

```css
.nav-dropdown-container {
  background: rgba(0, 0, 0, 0.12) !important;
  border-radius: 6px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 0.15rem !important;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  margin-top: 0;
  padding: 0;
  transition: max-height 0.25s ease, opacity 0.25s ease, margin-top 0.25s ease, padding 0.25s ease;
}

.nav-dropdown-container.open {
  max-height: 300px;
  opacity: 1;
  margin-top: 0.25rem;
  padding: 0.35rem 0;
}
```

- [ ] **Step 3: Commit Task 2**

```bash
git add web/src/components/admin/admin.css
git commit -m "style(admin): add max-height transitions, ultra-thin 4px scrollbar, and fixed layout stability"
```

---

### Task 3: Build Verification, Unit Tests & Production Deployment

**Files:**
- Build: `web/`

- [ ] **Step 1: Run production build**

```bash
npm run build
```

- [ ] **Step 2: Run Vitest unit test suite**

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

- [ ] **Step 5: Verify Live Vercel Production URL**
Verify `https://web-plum-sigma-99.vercel.app` returns 200 OK.
