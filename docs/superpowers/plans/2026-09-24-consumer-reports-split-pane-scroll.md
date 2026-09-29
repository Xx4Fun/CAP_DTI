# Consumer Reports Single-Row Sticky Header & Independent Dual-Column Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline the Consumer Report detail header into a single, clean horizontal row aligned with the back button, make it sticky at the top, and configure true independent dual-column scrolling so that scrolling over the left side scrolls only the evidence pane, and scrolling over the right side scrolls only the findings pane.

**Architecture:** 
- In `CitizenTipReview.tsx`, remove the redundant breadcrumb and protocol badge in the detail header. Merge the back button, store title, reference pill, and status into a single horizontal `<header>` with flex alignment.
- In `admin.css`, set the detail header to `position: sticky; top: 0; z-index: 30;` with compact padding. Constrain the detail container height to the remaining viewport (`height: calc(100vh - 5.5rem); overflow: hidden;`) and configure `.consumer-report-evidence` and `.consumer-report-findings` with independent `overflow-y: auto; height: 100%; overscroll-behavior: contain;`.
- Maintain strict zero inline-styles compliance per `ConsumerReportInlineStyles.test.ts`.

**Tech Stack:** React 19, TypeScript, CSS (Flexbox / CSS Grid, Container Queries), Vitest, Playwright.

---

### Task 1: Streamline Detail Header to 1 Row and Remove Breadcrumb & Protocol Badge

**Files:**
- Modify: `web/src/components/admin/CitizenTipReview.tsx:636-695`
- Modify: `web/src/components/admin/admin.css:7045-7140`
- Test: `web/src/components/admin/CitizenTipReview.test.tsx`
- Test: `web/src/components/admin/ConsumerReportInlineStyles.test.ts`

- [ ] **Step 1: Update `CitizenTipReview.tsx` header structure**
Replace the multi-tier header with a single horizontal flex header that aligns the back button, store name, reference pill, and status badge on one row without breadcrumbs or protocol badges:

```tsx
          <header className="consumer-report-card consumer-report-detail-header">
            <div className="consumer-report-detail-header-left">
              <button
                type="button"
                className="admin-button secondary consumer-report-back-btn"
                onClick={backToList}
                aria-label="Back to reports"
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Back to reports</span>
              </button>

              <span className="consumer-report-header-divider" aria-hidden="true" />

              <h2 tabIndex={-1} className="consumer-report-detail-title">
                {selected.store_name || 'Store unmapped'}
              </h2>
            </div>

            <div className="consumer-report-detail-header-right">
              <span className="consumer-report-detail-meta-pill">
                <strong>Ref:</strong> {selected.report_reference}
              </span>
              {selected.submitted_at && (
                <span className="consumer-report-detail-meta-pill">
                  <strong>Submitted:</strong> {new Date(selected.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              <span className={`consumer-report-status tone-${getStatusTone(selected.status)}`}>
                {getReadableStatus(selected.status)}
              </span>
            </div>
          </header>
```

- [ ] **Step 2: Update CSS in `web/src/components/admin/admin.css` for 1-row sticky header**
Add sticky positioning and horizontal flex alignment:

```css
/* Single-row sticky detail header */
.consumer-report-detail-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  background: var(--admin-surface);
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  flex-shrink: 0;
}

.consumer-report-detail-header-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.consumer-report-header-divider {
  width: 1px;
  height: 22px;
  background: var(--admin-border, #e2e8f0);
}

.consumer-report-detail-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--admin-text);
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.consumer-report-detail-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
}

.consumer-report-detail-meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--admin-muted);
}

.consumer-report-detail-meta-pill strong {
  color: #475569;
  font-weight: 600;
}
```

- [ ] **Step 3: Run tests to verify header updates**
Run: `npm test -- --run src/components/admin/CitizenTipReview.test.tsx src/components/admin/ConsumerReportInlineStyles.test.ts`
Expected: 22 passed.

---

### Task 2: Implement Independent Dual-Column Scrolling (Split-Pane Panes)

**Files:**
- Modify: `web/src/components/admin/admin.css`
- Test: `web/src/components/admin/ConsumerReportInlineStyles.test.ts`

- [ ] **Step 1: Configure height bounds and pane scrolling**
Update `admin.css` so `.consumer-report-detail` fits the viewport height without outer page overflow, and both columns scroll independently:

```css
/* One report at full panel width with fixed height bounds for split scrolling */
.consumer-report-detail {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 5.5rem);
  max-height: calc(100vh - 5.5rem);
  gap: 0.85rem;
  overflow: hidden;
}

.consumer-report-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.consumer-report-panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem;
  flex: 1;
  min-height: 0;
  height: 100%;
}

/* Left Column: Evidence pane with independent scroll */
.consumer-report-evidence {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  box-sizing: border-box;
}

/* Right Column: Findings pane with independent scroll */
.consumer-report-findings {
  height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 1.25rem;
  box-sizing: border-box;
}
```

- [ ] **Step 2: Run inline styles compliance test**
Run: `npm test -- --run src/components/admin/ConsumerReportInlineStyles.test.ts`
Expected: PASS.

---

### Task 3: Visual & Interactive Verification with Playwright

**Files:**
- Create: `scratch/verify_split_scroll.py`

- [ ] **Step 1: Write Playwright verification script**
Create `scratch/verify_split_scroll.py` to:
1. Log in as evaluator.
2. Navigate to Consumer Reports and click the first report.
3. Verify the detail header is 1 row (`Back to reports` button and establishment name side-by-side).
4. Hover over `.consumer-report-evidence` and mouse-wheel scroll down by 400px: verify only left column scrolled, right column did not move. Capture screenshot `admin_split_scroll_left.png`.
5. Hover over `.consumer-report-findings` and mouse-wheel scroll down by 600px: verify right column scrolled, left column did not move. Capture screenshot `admin_split_scroll_right.png`.

- [ ] **Step 2: Run script and visually inspect screenshots**
Run: `python scratch/verify_split_scroll.py`
Verify both screenshots confirm independent split scrolling and a clean 1-row sticky header.
