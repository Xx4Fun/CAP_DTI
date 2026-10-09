# Field Monitoring "Additional Visits" UI/UX Redesign Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DTI Admin "Additional Visits" table into a clean, modern, and operationally intuitive interface by fixing awkward vertical button stacking, upgrading raw status badges and text, adding visual hierarchy and icons, and introducing quick-triage status pills.

**Architecture:** Frontend-only refinement within `web/src/components/admin/FieldMonitoringRecords.tsx` (`VerificationView`) and scoped styling rules in `web/src/components/admin/admin.css`. All existing accessible queries, ARIA roles, and state interactions are preserved to maintain 100% test suite compatibility.

**Tech Stack:** React 18, TypeScript, Vite, Lucide React icons, CSS, Vitest, Playwright.

---

## Current Status & Problem Analysis

From auditing the live interface (`VerificationView` in `FieldMonitoringRecords.tsx` and user screenshot):
1. **Misleading Column Header**: The last column is titled `RESULT`, but holds operational actions (`Assign`, `Cancel`) or record links. It should be titled `ACTION`.
2. **Awkward Vertical Button Stacking**: In open visit rows, the `Assign` and `Cancel` buttons stack vertically as full-width blocks, doubling row height and causing severe vertical imbalance across the table.
3. **Crude Lowercase Status Badges**: The open status badge uses `.history` (muted grey for archived records) with lowercase `needs assignment`. Other statuses lack clear semantic coloring.
4. **Redundant "Needs assignment" Repetition**: Both the Status column says `needs assignment` AND the Assigned Officer column says `Needs assignment`.
5. **Raw / Informal Reason Field**: Freeform text (e.g. `tyrr`, `May issue paki checkk`) renders unformatted without visual framing or text-overflow safeguards.
6. **Plain Source Column**: Origin is just plain text. Supervisor directives display `"No consumer report"` which sounds like an error/warning instead of an internal order.
7. **Date Formatting**: Single comma-separated text string without visual hierarchy between date and time.
8. **Missing Quick Triage**: Admins must click the dropdown to filter by status without visibility into how many visits are currently open or completed.

---

## File Structure & Responsibilities

- **Modify**: `web/src/components/admin/FieldMonitoringRecords.tsx`
  - Refactor `VerificationView` component (lines 1004–1077).
  - Add quick filter status chips with count badges.
  - Upgrade table row cells: establishment identity with icon, source chip with monospace reference code, styled reason bubble, two-line date/time, semantic status badges, officer avatar chip, and horizontal action button cluster.
  - Maintain all test-critical attributes: `aria-label="Search additional visits"`, `aria-label="Additional visit status"`, button names (`Assign`, `Cancel`, `Reopen`, `Record #...`).
- **Modify**: `web/src/components/admin/admin.css`
  - Add scoped CSS styles for `.verification-table`, `.verification-action-group`, `.verification-badge`, `.verification-origin-chip`, `.verification-ref-pill`, `.verification-reason-bubble`, `.verification-officer-pill`, and `.verification-status-pills`.
- **Verify**: `web/src/components/admin/FieldMonitoringRecords.test.tsx`
  - Run existing 23 Vitest tests to ensure complete regression safety.
- **Visual Verification**: Run Playwright screenshot verification against `scratch/view_field_monitoring.py`.

---

### Task 1: Add Scoped CSS Styles for Additional Visits in `admin.css`

**Files:**
- Modify: `web/src/components/admin/admin.css`

- [ ] **Step 1: Add CSS rules for Additional Visits UI in `admin.css`**

Add styles around line 1650 for:
- `.verification-table`: custom column width distributions and typography alignment.
- `.verification-action-group`: horizontal flex layout (`display: flex; gap: 0.5rem; align-items: center; white-space: nowrap;`).
- Compact action buttons: `.verification-action-btn` (`min-height: 32px; padding: 0.35rem 0.75rem; font-size: 0.8rem; font-weight: 600; border-radius: 8px; display: inline-flex; align-items: center; gap: 0.35rem;`).
- Enhanced status badges: `.verification-status-badge` variants for `open` (amber warning), `claimed` (blue info), `completed` (emerald success), `cancelled` (slate neutral).
- Source origin chips: `.visit-source-badge` for complaints vs supervisor directives.
- Monospace reference pill: `.visit-ref-pill` for `REF-YYYYMMDD-XXXX`.
- Reason bubble card: `.verification-reason-bubble` with soft slate background and quote/note icon.
- Officer avatar indicator: `.verification-officer-cell` with initials badge and unassigned placeholder.
- Quick filter status chips: `.verification-filter-pills` for quick status switching.

- [ ] **Step 2: Run CSS check**

Verify no syntax errors in CSS by running Vite test build:
```bash
npm --prefix web test -- run src/components/admin/FieldMonitoringRecords.test.tsx
```

---

### Task 2: Refactor `VerificationView` in `FieldMonitoringRecords.tsx`

**Files:**
- Modify: `web/src/components/admin/FieldMonitoringRecords.tsx:1004-1077`

- [ ] **Step 1: Import required Lucide icons**

Ensure `Building2`, `MapPin`, `AlertCircle`, `ShieldAlert`, `Clock`, `UserCheck`, `UserPlus`, `XCircle`, `RotateCcw`, `FileText`, `MessageSquare` are imported from `lucide-react`.

- [ ] **Step 2: Implement Quick Status Filter Chips**

Add quick status chips above or beside the controls bar showing counts:
- All (`total`)
- Needs Assignment (`open`)
- Assigned (`claimed`)
- Completed (`completed`)
- Cancelled (`cancelled`)

- [ ] **Step 3: Upgrade Table Header & Rows**

- Change header column `RESULT` to `ACTION`.
- **Establishment column**: Store name with `Building2` icon, address with `MapPin` icon.
- **Source column**: `Complaint` with alert badge & monospace reference code chip, or `Supervisor Directive` with directive badge and `Internal Order` subtext.
- **Reason column**: Styled bubble card with `MessageSquare` icon and tooltip for full text.
- **Requested column**: Primary formatted date + secondary micro-clock time.
- **Status column**: Semantic badges with uppercase/capitalized text and matching icons:
  - `Needs Assignment`: `<Clock size={12} /> Needs Assignment`
  - `Assigned`: `<UserCheck size={12} /> Assigned`
  - `Completed`: `<CheckCircle2 size={12} /> Completed`
  - `Cancelled`: `<XCircle size={12} /> Cancelled`
- **Assigned Officer column**:
  - If unassigned: `<span className="verification-unassigned">— Unassigned —</span>`
  - If assigned: Initials avatar badge + officer name + officer email.
- **Action column**:
  - Horizontal flex container.
  - Open visit: `<button className="admin-button primary verification-action-btn"><UserPlus size={14} /> Assign</button>` and `<button className="admin-button secondary verification-action-btn"><XCircle size={14} /> Cancel</button>`.
  - Completed visit: `<button className="admin-button secondary verification-action-btn"><FileText size={14} /> Record #{id}</button>`.
  - Cancelled visit: `<button className="admin-button secondary verification-action-btn"><RotateCcw size={14} /> Reopen</button>`.

- [ ] **Step 4: Run unit tests**

Run:
```bash
npm --prefix web test -- run src/components/admin/FieldMonitoringRecords.test.tsx
```
Expected: All 23 tests PASS.

---

### Task 3: Visual Verification with Playwright

**Files:**
- Execute: `scratch/view_field_monitoring.py`

- [ ] **Step 1: Capture updated screenshot**

Run the Playwright test script:
```bash
python scratch/view_field_monitoring.py
```

- [ ] **Step 2: Compare before vs after screenshot**

Inspect the generated screenshot `scratch/field_monitoring_current.png` against the baseline `scratch/field_monitoring_baseline.png` and user's original image to confirm:
- Buttons are aligned horizontally with clean padding.
- Row heights are uniform.
- Status badges are properly colored and legible.
- Typography is crisp and matches the rest of the DTI Admin portal.
