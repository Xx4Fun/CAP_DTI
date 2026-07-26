# PRICE-Watch DTI Admin Sidebar-Only Refactor Design Spec

## 1. Overview
This specification details the targeted refactoring of the DTI Admin & Vendor Web Portal (`web/`). It restricts the royal blue gradient palette strictly to the **Left Sidebar Navigation**, fixes sub-menu selection/toggle issues in `AdminShell.tsx`, and reverts the main workspace content area (`OverviewPanel` in `AdminPanels.tsx`) back to PRICE-Watch DTI's clean, non-cluttered regulatory workspace.

---

## 2. Left Sidebar Navigation Fixes

- **Theme**: Rich Royal Blue Gradient (`linear-gradient(180deg, #1e3a8a 0%, #1d4ed8 100%)`).
- **Brand Header**: DTI Seal + `PRICE-Watch` + `DTI Officer Portal` + Collapse Toggle Button (`‹` / `›`).
- **User Avatar Pill**: Translucent card (`rgba(255, 255, 255, 0.15)`) showing Avatar Initial, User Name, and Role Badge.
- **Categorized Sections**:
  - `MAIN MENU`: Dashboard Overview (`overview`), GIS Store Registry (`stores`).
  - `REGULATORY ENGINE`: Price Regulation (`analytics` / `srp`), Consumer OCR Queue (`reports`), Legal Engine (`legal` / `audit`).
  - `SYSTEM`: Emergency Protocol (`emergency`).
- **Sub-Item Navigation Logic**:
  - Clicking sub-items (*Four-Week Analytics*, *SRP Bulletins*, *Notice Drafts*, *Audit Trail*) sets the active panel cleanly and maintains active styling on the parent item.
  - Sub-items are cleanly indented with a subtle left indicator line (`border-left: 2px solid rgba(255, 255, 255, 0.3)`).
- **Collapsed State**:
  - Hides section labels, text, and sub-items cleanly when collapsed (`width: 72px`). Shows crisp centered icons.

---

## 3. Main Workspace Content Clean-Up

- **Revert `OverviewPanel` (`AdminPanels.tsx`)**:
  - Remove mock metric card grids and extra action cards copied from external reference.
  - Display clean, real PRICE-Watch regulatory summary metrics:
    - Registered Commercial Establishments
    - Pending Formal Consumer Receipt Tips
    - Active State of Calamity Status
  - High-contrast white surfaces (`#ffffff`), subtle borders (`#e2e8f0`), and dark slate body typography (`#0f172a`).

---

## 4. Verification & Deployment Plan
1. Build check: `npm run build` in `web/` (0 errors).
2. Test suite: `npm test -- --run` in `web/` (8/8 tests pass).
3. Commit & push changes to `main`.
4. Deploy to Vercel production: `npx vercel --prod` (`https://web-plum-sigma-99.vercel.app`).
