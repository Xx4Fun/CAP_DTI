# Consumer Reports "Selected Report" UI/UX Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DTI Admin Consumer Reports detail review workspace into a balanced, operationally intuitive dual-column interface that looks polished in both expanded (open) and collapsed (closed) sidebar states. This eliminates chaotic button wrapping, integrates the detached field verification card, enhances receipt navigation and zoom feedback, and distinguishes violation severity across item cards.

**Architecture:** Frontend refinement in `web/src/components/admin/CitizenTipReview.tsx` and scoped CSS in `web/src/components/admin/admin.css`. Strictly adheres to the zero-inline-styles rule enforced by `ConsumerReportInlineStyles.test.ts` and preserves all 25 Vitest tests and accessibility queries in `CitizenTipReview.test.tsx`.

**Tech Stack:** React 18, TypeScript, Vite, Lucide React icons, CSS Container Queries, Vitest, Playwright.

---

## 1. Problem Analysis & Scope

From testing the live interface under both **expanded sidebar (~1200px content width)** and **collapsed sidebar (~1380px content width)**, and auditing the user's uploaded screenshot:

1. **Chaotic 3-Row Action Button Cluster**:
   - `Record finding` and `Refer for field verification` sit side-by-side on Row 1 (with Referral disabled if not pre-checked above).
   - `Resolve without a finding` stretches to 100% full width on Row 2.
   - `Reject report` is isolated on Row 3 aligned to the far right with empty whitespace on the left.
2. **Detached Field Verification Card**:
   - Above the decision bar sits an isolated white card with massive empty space containing only `[ ] Refer this report for field verification`. This creates a confusing 2-step interaction where clicking the button at the bottom is disabled until you hunt for and check this card above.
3. **Redundant 3-Row Section Navigation in Evidence Viewer**:
   - The captured sections header stacks `Previous section / Section 1 of 3 / Next section` on row 1, `Section 1 / Section 2` buttons on row 2, and `Continuity: not_assessed · Merchant: matched` on row 3 with raw snake_case technical strings.
4. **Missing Zoom Level & Image Feedback**:
   - Image controls lack an indicator showing the current zoom level (`100%`, `125%`), forcing evaluators to click blind.
5. **No Severity Distinction in Item Decisions**:
   - When decided, all items receive a uniform green `(✓) Decided` badge, whether the outcome was a clean "No violation" or a serious "Confirmed violation".
6. **Narrow Viewport When Sidebar is Expanded**:
   - The dual columns are fixed at 50/50. When the sidebar is open, each column shrinks to ~580px, crowding item input fields and receipt images.

---

## 2. File Structure & Responsibilities

- **Modify**: `web/src/components/admin/admin.css`
  - Scoped styles for:
    - `.consumer-report-detail-header`: responsive flex wrapping and icon alignment.
    - `.consumer-report-assets`: consolidated single-row section bar with dot badges.
    - `.consumer-report-zoom-badge`: zoom percentage indicator pill.
    - `.consumer-report-item`: semantic status borders and badges for violations vs compliant items.
    - `.consumer-report-decision-bar`: sticky docking, smooth referral toggle accordion, and 2-tier button grid.
    - `.consumer-report-actions`: clean 2-tier action grid (`grid-template-columns: 1fr 1fr`).
- **Modify**: `web/src/components/admin/CitizenTipReview.tsx`
  - Consolidate captured sections controls into a sleek single-tier bar with formatted continuity badges.
  - Add live zoom percentage badge in the image toolbar.
  - Add semantic finding badges on decided item cards (distinguishing confirmed violations from no-violation items).
  - Integrate the field verification referral box directly into the decision console, removing the awkward detached card.
  - Reorganize action buttons into a balanced 2-tier cluster.
- **Verify**:
  - `web/src/components/admin/CitizenTipReview.test.tsx` (all 25 tests pass).
  - `web/src/components/admin/ConsumerReportInlineStyles.test.ts` (0 inline styles beyond transforms).
  - `web/src/components/admin/AdminTypographyIntegrity.test.ts`.
  - Visual verification via Playwright in both sidebar expanded and collapsed states.

---

### Task 1: Add Scoped CSS Styles for Selected Report Detail in `admin.css`

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [x] **Step 1: Update styles for Consolidated Sections Bar & Zoom Badge**
  - Style `.consumer-report-assets-head` and `.consumer-report-asset-list` for single-row alignment.
  - Style `.consumer-report-zoom-badge` (`display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; font-size: 0.74rem; font-weight: 700; background: #f1f5f9; border-radius: 999px; color: #475569;`).
  - Style `.consumer-report-status-dot` for continuity and merchant badges.

- [x] **Step 2: Update styles for Item Card Severity Badges**
  - Add `.consumer-report-item.is-violation` (`border-left-color: #ef4444; background: #fffbfb;`).
  - Add `.consumer-report-item.is-clean` (`border-left-color: #10b981;`).
  - Add `.consumer-report-item.is-insufficient` (`border-left-color: #94a3b8;`).
  - Add `.consumer-report-item-state.violation` and `.consumer-report-item-state.compliant`.

- [x] **Step 3: Update styles for Integrated Decision Console & 2-Tier Actions**
  - Update `.consumer-report-actions`:
    ```css
    .consumer-report-actions {
      display: grid;
      gap: 0.65rem;
    }
    .consumer-report-actions-tier {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.65rem;
    }
    ```
  - Standardize button heights (`min-height: 40px`), flex centering, and icons.
  - Enhance `.consumer-report-referral` when integrated inside the decision bar.

- [x] **Step 4: Verify CSS integrity**
  Run:
  ```bash
  npm --prefix web test -- run src/components/admin/ConsumerReportInlineStyles.test.ts
  ```

---

### Task 2: Refactor Selected Report Layout in `CitizenTipReview.tsx`

**Files:**
- Modify: `web/src/components/admin/CitizenTipReview.tsx`

- [x] **Step 1: Polish Top Header**
  - Add store building icon `<Building2 size={18} />` next to store name.
  - Ensure status badge and metadata pills wrap smoothly without collision in both sidebar states.

- [x] **Step 2: Consolidate Captured Sections & Add Zoom Feedback**
  - Replace redundant 3-row layout with a unified single-row section bar.
  - Format continuity and merchant indicators:
    - `Continuity: Not Assessed` / `Valid` with color indicator dot.
    - `Merchant: Matched` / `Unmatched` with color indicator dot.
  - Add live zoom badge `<span className="consumer-report-zoom-badge">{Math.round(zoom * 100)}%</span>` directly in the image toolbar.

- [x] **Step 3: Differentiate Item Finding Outcomes**
  - In `selected.items.map`:
    - If `decision?.regulatory_finding === 'confirmed_violation'`: display amber/red violation chip `<AlertTriangle size={13} /> Violation Confirmed`.
    - If `decision?.regulatory_finding === 'no_violation'`: display green chip `<CheckCircle2 size={13} /> Conforms to SRP`.
    - If `decision?.regulatory_finding === 'insufficient_evidence'`: display neutral chip `<HelpCircle size={13} /> Insufficient Evidence`.

- [x] **Step 4: Integrate Field Verification Referral into Decision Console**
  - Move the referral section inside the `.consumer-report-decision-bar` directly above the actions.
  - Ensure the referral checkbox (`Refer this report for field verification`) expands the Field Officer select seamlessly.
  - Preserve all existing attributes (`aria-label="Refer for field verification"`, `aria-label="Field Officer"`).

- [x] **Step 5: Rebalance Action Buttons into 2-Tier Grid**
  - **Tier 1 (Enforcement Actions)**:
    - Button 1: `<button className="admin-button primary action-primary"><ShieldCheck size={15} /> Record finding</button>`
    - Button 2: `<button className="admin-button secondary action-referral"><Send size={15} /> Refer for field verification</button>`
  - **Tier 2 (Resolution / Dismissal Actions)**:
    - Button 3: `<button className="admin-button secondary action-resolve">Resolve without a finding</button>`
    - Button 4: `<button className="admin-button danger action-reject"><XCircle size={15} /> Reject report</button>`
  - All 4 buttons have equal widths in their respective tiers and uniform heights.

- [x] **Step 6: Run Vitest Unit Tests**
  Run:
  ```bash
  npm --prefix web test -- run src/components/admin/CitizenTipReview.test.tsx src/components/admin/ConsumerReportInlineStyles.test.ts
  ```
  Expected: All 25 tests in `CitizenTipReview.test.tsx` and all 4 tests in `ConsumerReportInlineStyles.test.ts` pass.

---

### Task 3: Visual & Cross-State Verification with Playwright

**Files:**
- Execute: `scratch/check_consumer_reports.py`

- [x] **Step 1: Capture Screenshots in Both States**
  - Capture `scratch/consumer_report_sidebar_open.png` (Expanded sidebar).
  - Capture `scratch/consumer_report_sidebar_collapsed.png` (Collapsed sidebar).

- [x] **Step 2: Visual Audit Checkpoints**
  - Action buttons sit in a clean, symmetrical 2x2 grid without awkward orphans or empty row gaps.
  - Field verification referral is cleanly unified with no detached empty box.
  - Section navigation is sleek and single-line.
  - Zoom percentage is visible and updates on zoom in/out.
  - Item cards clearly highlight confirmed violations versus compliant items.
  - Layout is well-proportioned in both 1200px (open sidebar) and 1380px (closed sidebar) viewports.
