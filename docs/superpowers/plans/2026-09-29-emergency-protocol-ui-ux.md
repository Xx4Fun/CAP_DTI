# Emergency Protocol UI/UX Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DTI Admin "Emergency Protocol & Price Freeze" section (`web/src/components/admin/EmergencyToggle.tsx`) from a raw single-column prototype into a clean, modern, and organized regulatory command center with a 2-column responsive layout, live state indicators, polished candidate comparison tables, and compliance verification checkpoints, with zero business logic or API changes.

**Architecture:** Refactor `EmergencyToggle.tsx` into an organized modular UI structure supported by dedicated, scoped CSS classes in `admin.css`. The layout adopts an Executive Command Header + 2-Column Responsive Workspace (Left: Declarations Hub & Preparation Form; Right: APC Inspector, Preparation Matrix & Official References).

**Tech Stack:** React 19, TypeScript, Lucide React icons, CSS variables / design tokens from `admin.css`, Vitest for verification.

---

## File Structure

- **Modify**:
  - `web/src/components/admin/EmergencyToggle.tsx` (reorganize layout, apply dedicated semantic CSS classes, add status badges, keep all data handlers and test-critical strings/roles intact)
  - `web/src/components/admin/admin.css` (add `.emergency-console-*`, `.emergency-hero-*`, `.emergency-declaration-*`, `.apc-matrix-*`, `.apc-verify-*` styles)
- **Test**:
  - `web/src/components/admin/LegalNoticeAndEmergency.test.tsx` (all 8 tests must remain 100% passing)

---

## Proposed UI/UX Enhancements

### 1. Executive Status Command Bar (Hero Banner)
- Replace the flat inline `#0f274f` / `#991b1b` box with an authoritative, modern command banner featuring:
  - Deep gradient backdrop (`#0f172a` to `#1e3a8a` for normal SRP protocol; `#7f1d1d` to `#991b1b` during active Price Freeze).
  - Live pulse status beacon (`#10b981` green dot for "NORMAL SRP MONITORING"; `#ef4444` red alert beacon for "PRICE FREEZE ACTIVE · R.A. 7581").
  - Jurisdiction & authority meta pills (`San Jose de Buenavista, Antique`, active APC count, legal reference badge).
  - Exact headings and text retained: `State of Calamity Regulatory Command Bar`, `Confirmed APC references are in effect.` / `Normal weekly SRP monitoring remains in effect.`.

### 2. Responsive 2-Column Master-Detail Workspace ($\ge 1024\text{px}$)
- **Left Column: Regulatory Declarations Hub & Preparation (`~380px–420px`)**:
  - **Declarations Panel**:
    - Header with `<Calendar size={18} /> Declarations` and count badge.
    - Card-based declaration items with distinct status chips:
      - `in_effect` -> Amber/Red badge `"IN EFFECT"`
      - `draft` -> Blue badge `"DRAFT"`
      - `ended` -> Slate badge `"CONCLUDED"`
    - Active selection indicator (accent border ring, left color bar, elevated background).
  - **"Prepare a Price Freeze declaration" Panel**:
    - Compact, organized form with clean input styling, calendar date pickers, location indicator, and "Prepare APC" button with loading spinner state.
- **Right Column: APC Review Console & Official References (`flex: 1`)**:
  - **Active Declaration Manager**:
    - When an active freeze is selected, displays active coverage dates and an elevated danger-action card for "End Price Freeze" with warning safeguards.
  - **APC Preparation & Calculation Matrix (Draft view)**:
    - Header with source week tag (`Source week: ... · Asia/Manila`) and `Refresh preparation` button.
    - Clean data table with formatted currency, price range badges (Min / Max), observed average, and a prominent badge for `Computed APC` (`(min + max) ÷ 2`).
    - Collapsible Source Observation drawers with styled cards showing establishment name, recorded price, date, and record #.
    - Prominent **Compliance & Verification Box**: A distinct verification card grouping the reviewer confirmation checkbox and the primary `Confirm and activate` button.
  - **Official APC / Price Freeze References**:
    - Polished reference table showing currently enforceable APC price ceilings under R.A. 7581 with clean badge indicators.

---

## Tasks

### Task 1: Add Scoped CSS Styles for Emergency Protocol in `admin.css`

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Append dedicated `.emergency-*` and `.apc-*` classes to `web/src/components/admin/admin.css`**
  - Add grid layouts for desktop 2-column (`.emergency-grid-workspace`) and single-column mobile.
  - Add styling for the hero banner (`.emergency-hero-banner`, `.emergency-pulse-dot`, `.emergency-badge`).
  - Add styling for declaration cards (`.emergency-decl-card`, `.emergency-status-chip`).
  - Add styling for candidate tables (`.apc-candidate-table`, `.apc-price-pill`, `.apc-formula-tag`).
  - Add styling for the verification card (`.apc-verification-box`).

- [ ] **Step 2: Verify CSS syntax and ensure no breaking changes to other panels**
  - Run `npm run lint` or `npm run build` in `web/` to check for syntax errors.

---

### Task 2: Refactor `EmergencyToggle.tsx` Structure and Presentation

**Files:**
- Modify: `web/src/components/admin/EmergencyToggle.tsx`
- Test: `web/src/components/admin/LegalNoticeAndEmergency.test.tsx`

- [ ] **Step 1: Update `EmergencyToggle.tsx` to use the new classes while retaining 100% of event handlers, state, and test strings**
  - Restructure layout into the 2-column workspace.
  - Apply the new status chips, hero banner layout, and table enhancements.
  - Ensure all `name`, `type`, `role`, `aria-pressed`, and text strings match test assertions.

- [ ] **Step 2: Run Vitest tests to verify 100% pass rate**
  - Run: `npx vitest run src/components/admin/LegalNoticeAndEmergency.test.tsx`
  - Expected: 8 passed (100%).

- [ ] **Step 3: Run production build to ensure TypeScript and bundle integrity**
  - Run: `npm run build`
  - Expected: Build succeeds without errors.

---

### Task 3: Visual Inspection & Cross-Viewport Polish

**Files:**
- Test: Desktop (1280px), iPad/Tablet (768px - 820px), Mobile (375px - 412px)

- [ ] **Step 1: Check desktop layout (1280px)**
  - Ensure 2-column workspace looks balanced, clean, and organized.
- [ ] **Step 2: Check tablet/iPad layout (768px)**
  - Ensure it stacks cleanly into a readable single-column flow with no horizontal overflow.
- [ ] **Step 3: Check mobile layout (375px)**
  - Ensure tables scroll smoothly horizontally and cards pad appropriately.
