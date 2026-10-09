# Emergency Protocol Layout Balancing & Table Pagination Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harmonize the visual layout of the Emergency Protocol module by fixing the left column Declarations list to an exact 4-item calculated height (`354px`) with vertical scrolling for 5+ items, and implementing clean pagination on the candidate commodities and official references tables so the right column stops cleanly and balances with the left column.

**Architecture:** Client-side pagination and container sizing in `EmergencyToggle.tsx` and `admin.css`. Standardize with existing administrative pagination patterns (`.admin-pagination`) without breaking backend contracts or Vitest assertions.

**Tech Stack:** React 18, TypeScript, Vite, CSS Modules / `admin.css`, Lucide React icons, Vitest, Playwright.

---

## 1. Goal Description & Problem Analysis

In the Emergency Protocol module (`web/src/components/admin/EmergencyToggle.tsx`):
1. **Left Column Declarations List Issue**:
   - The declarations list currently expands or contracts arbitrarily based on record count.
   - When declarations are added, the left column stretches indefinitely. When only 1–3 exist, it collapses, causing visual jumping and asymmetry.
   - **Target**: Set a fixed calculated height matching exactly 4 declaration items (`354px`). When there are 1–3 items, the list maintains this clean fixed height. When there are 4 items, they fill it without scrollbars. When there are 5+ items, the list becomes scrollable (`overflow-y: auto`) with a sleek scrollbar.

2. **Table Pagination & Column Height Balance Issue**:
   - The Candidate table in APC Preparation currently renders all 124 commodities in one giant unpaginated list, stretching over 6,500px down the page, leaving thousands of pixels of empty gutter beside the left column (~1,114px).
   - The Official APC References table likewise dumps all 248 records unpaginated.
   - **Target**: Add client-side pagination to the Candidate Table with `pageSize = 8` (configurable to 8, 12, 24). At 8 rows per page (~480px) + search toolbar + pagination bar (~52px) + observation logs + verification box, the right column stops right around ~1,150px, aligning harmoniously with the left column (~1,114px).
   - Also add pagination to the Official APC References table (`pageSize = 10`).

---

## 2. User Review Required

> [!NOTE]
> **Page Size Selection & Left Column Alignment**
> - The Candidate table pagination defaults to **8 items per page**. With 8 rows, the APC Preparation card height plus the source observation logs and verification box totals ~1,150px, which balances with the left column (~1,114px).
> - Evaluators can also switch rows per page between **8**, **12**, and **24** using a quick selector.
> - Search and filter actions automatically reset the current page to 1.

---

## 3. Mathematical Height Calculations

```
+-----------------------------------------------------------------------------------------+
|                                 EMERGENCY WORKSPACE                                     |
+---------------------------------------------------+-------------------------------------+
| LEFT COLUMN (~1,114px Total)                     | RIGHT COLUMN (~1,150px Total)       |
+---------------------------------------------------+-------------------------------------+
| 1. Declarations Card (~475px):                    | 1. APC Preparation Card (~640px):   |
|    - Card Header: ~80px                           |    - Card Header & Meta: ~60px      |
|    - Declarations List: Fixed 354px               |    - Search & Filter Pills: ~48px   |
|      * 4 Items * 80.56px = 322.2px                |    - Table Header + 8 Rows: ~480px  |
|      * 3 Gaps * 10.4px = 31.2px                   |    - Admin Pagination Nav: ~52px    |
|      * Total = 353.4px (~354px)                   |                                     |
|      * 1-3 items: preserves 354px height          | 2. Source Logs Card: ~320px         |
|      * 5+ items: scrollable within 354px          |    - Scrollable observation audits  |
|                                                   |                                     |
| 2. Prepare Declaration Card (~520px):             | 3. Verification & Activation: ~150px|
|    - Title & Statutory rule: ~140px               |    - Review check & action button   |
|    - Formula Callout box: ~90px                   |                                     |
|    - Jurisdiction + Reference input: ~120px       |                                     |
|    - Date Pickers + +60d button: ~110px           |                                     |
|    - "Prepare APC" button: ~45px                  |                                     |
+---------------------------------------------------+-------------------------------------+
```

---

## 4. Proposed Changes

### Component 1: `web/src/components/admin/EmergencyToggle.tsx`
#### [MODIFY] `EmergencyToggle.tsx`
- **Candidate Table Pagination**:
  - Add state: `candidatePage` (default `1`) and `candidatePerPage` (default `8`).
  - Calculate:
    ```tsx
    const totalCandidatePages = Math.max(1, Math.ceil(filteredCandidates.length / candidatePerPage))
    const paginatedCandidates = useMemo(() => {
      const start = (candidatePage - 1) * candidatePerPage
      return filteredCandidates.slice(start, start + candidatePerPage)
    }, [filteredCandidates, candidatePage, candidatePerPage])
    ```
  - Reset `candidatePage` to `1` whenever `candidateSearch` or `candidateFilter` changes.
  - Render `<nav className="admin-pagination apc-pagination">` at the bottom of the table:
    - Left side: `Showing {from}–{to} of {filteredCandidates.length} commodities`
    - Right side: Rows per page selector (`8`, `12`, `24`), Previous button (`ChevronLeft`), Page indicators (`Page X of Y`), and Next button (`ChevronRight`).
- **Official References Table Pagination**:
  - Add state: `refPage` (default `1`) and `refPerPage` (default `10`).
  - Paginate `officialPrices.slice((refPage - 1) * refPerPage, refPage * refPerPage)`.
  - Render pagination navigation at the bottom of the official references card.

### Component 2: `web/src/components/admin/admin.css`
#### [MODIFY] `admin.css`
- **Declarations List Fixed Height & Scroll**:
  ```css
  .emergency-decl-list {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    width: 100%;
    height: 354px;
    max-height: 354px;
    overflow-y: auto;
    padding-right: 4px;
    box-sizing: border-box;
  }
  
  .emergency-decl-list::-webkit-scrollbar {
    width: 6px;
  }
  
  .emergency-decl-list::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 999px;
  }
  
  .emergency-decl-list::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
  ```
- **APC Table Pagination Styling**:
  - Integrate `.apc-pagination` styled with modern border, subtle background, active page indicator, and responsive row selector matching the Price Regulation and User Management standards.

---

## 5. Verification Plan

### Automated Tests
Run Vitest suites covering the Emergency Protocol:
```bash
npx vitest run src/components/admin/LegalNoticeAndEmergency.test.tsx src/components/admin/AdminSafeguards.test.tsx src/utils/commodityFormatter.test.ts
```
Expected result: 30/30 tests passing.

### Playwright Visual Verification
Execute Python Playwright script to verify:
1. Declarations list maintains exact `354px` height and scrolls cleanly when multiple declarations exist.
2. Candidate table shows exactly 8 rows per page on page 1 with active pagination controls.
3. Clicking `Next` advances to page 2 with items 9–16.
4. Searching filters down candidate records and resets pagination to page 1.
5. Right column bottom stops around the same height as the left column without vertical asymmetry.
6. Capture screenshots:
   - `scratch/verify_pagination_page1.png`
   - `scratch/verify_pagination_page2.png`
   - `scratch/verify_declarations_scroll.png`
