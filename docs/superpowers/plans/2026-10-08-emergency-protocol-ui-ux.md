# Emergency Protocol (Price Freeze & APC) UI/UX Overhaul Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the DTI Admin "Emergency Protocol" module into an executive, statutory-grade regulatory command center for Automatic Price Control (APC) and Price Freeze enforcement under R.A. 7581, replacing debug-style dumps, unformatted timestamps, and raw database slugs with polished Philippine government administrative interfaces.

**Architecture:** Refactor `EmergencyToggle.tsx` and accompanying styles in `admin.css` to introduce structured master-detail layouts, human-readable commodity name formatting, localized Philippine Standard Time (PST) date formatting, interactive product search/filtering, diagnostic readiness cards, and an inline store observation inspector, while maintaining 100% test compatibility with all 20 vitest test assertions.

**Tech Stack:** React 19, TypeScript, Lucide Icons, Vite, Vitest, CSS3 Variables / BEM-inspired Admin Theme.

---

## Current Baseline vs. Proposed Redesign

| Area | Current State (Baseline) | Proposed Design (Overhaul) |
| :--- | :--- | :--- |
| **Hero Command Banner** | Generic dark navy card with "Command Bar" title, duplicate status pills, and plain subtitle. Abrupt solid red on emergency. | **Executive Emergency Operations Center**: Statutory header citing R.A. 7581 (Philippine Price Act), jurisdiction badge, clear surveillance status, and 4 KPI metric chips (Surveillance Mode, Active Freeze Countdown, Covered Items, Jurisdiction). |
| **Date & Time Formatting** | Displays raw UTC ISO strings with microseconds (`2026-10-07T00:00:00.000000Z to 2026-10-08T00:00:00.000000Z`). | Clean formatted Philippine Standard Time dates: `Oct 7, 2026 – Oct 8, 2026` (or `Oct 7, 2026 (Open)`). |
| **Declaration Status Badges** | Text wraps awkwardly (e.g. `EN DED`), inconsistent badge styling across items. | Refined pill badges (`DRAFT` in soft blue, `ACTIVE FREEZE` in red pulse, `ENDED` in subtle slate) with non-breaking whitespace and status icons. |
| **Prepare Declaration Form** | Oversized 80px static location block, plain cramped inputs with no duration helpers. | Compact, streamlined form with inline jurisdiction tag (`📍 San Jose de Buenavista, Antique`), statutory formula highlight, and a "+60 Days (Statutory Default)" quick-fill button. |
| **APC Product Names** | Raw kebab-case database slugs (`5-star-esperma-white-20pcspack-03`, `absolute-1l`). | Clean human-readable titles (e.g. **5-Star Esperma White (20 pcs/pack)**, **Absolute Distilled Water (1L)**) with category badges and size indicators. |
| **Search & Filtering** | None. Table stretches across 50+ rows with no search or category filters. | Real-time search bar + filter chips (`All Covered (50)`, `Ready with APC`, `SRP Fallbacks`). |
| **Error / Blocked Messaging** | Dumps a giant unformatted paragraph listing 30+ product slugs across the bottom (`Activation is blocked: no qualifying source-week observation for...`). | **Pre-Activation Diagnostic Card**: Clear readiness breakdown showing items ready, items falling back to SRP, and missing observations count with a collapsible checklist. |
| **Source Store Observations** | 50 stacked HTML `<details>` accordions rendered beneath the table creating massive visual clutter. | Integrated row action: modal or clean slide-out inspection drawer revealing store names, visit dates, and recorded prices. |
| **Active Price Freeze Banner** | Plain pink box with single button. | Comprehensive **60-Day Price Freeze Timeline & Countdown Tracker** showing elapsed days, remaining days, automatic expiration date, and official bulletin export. |
| **Table Typography & Layout** | Misaligned columns, varying paddings. | Strict adherence to the newly standardized Admin Table Typography (0.74rem uppercase headers, 0.85rem body, tabular numbers for currency). |

---

## Detailed Task Breakdown

### Task 1: Utility Helpers for Commodity Title & Date Formatting

**Files:**
- Modify: `web/src/utils/commodityFormatter.ts`
- Modify: `web/src/components/admin/EmergencyToggle.tsx:8-25`
- Test: `web/src/components/admin/EmergencyToggleFormatting.test.ts`

- [ ] **Step 1: Write unit tests for commodity slug beautifier and PST date formatting**
  Verify that slug strings like `5-star-esperma-white-20pcspack-03` format to `"5-Star Esperma White (20 pcs/pack)"` and ISO date strings format to `"Oct 7, 2026"` without throwing on null/undefined.
- [ ] **Step 2: Implement slug-to-title parser and robust PST date formatter**
  Add helper functions:
  - `formatPstDate(isoString: string | null): string`
  - `formatPstDateRange(startsOn: string, endsOn: string | null): string`
  - `humanizeCommoditySlug(slug: string): string`
- [ ] **Step 3: Run unit tests to confirm passing**
  Run: `npx vitest run src/components/admin/EmergencyToggleFormatting.test.ts`
  Expected: PASS

---

### Task 2: Redesign Executive Regulatory Command Banner & KPI Summary

**Files:**
- Modify: `web/src/components/admin/EmergencyToggle.tsx:70-95`
- Modify: `web/src/components/admin/admin.css:9190-9335`

- [ ] **Step 1: Update Command Banner Markup**
  - Add statutory authority badge: `R.A. 7581 · Automatic Price Control (APC)`
  - Add subtitle explaining prevailing market surveillance mode.
  - Insert 4 executive metric chips:
    1. **Active Surveillance Mode**: `Normal SRP Baseline` vs `Price Freeze Active`
    2. **Surveillance Target**: `San Jose de Buenavista, Antique`
    3. **Commodities Under Review**: Count of candidates + fallbacks
    4. **Surveillance Horizon**: Cutoff week range
  - If a price freeze is currently active:
    - Display a high-visibility statutory alert banner with days remaining countdown (e.g. `Day 14 of 60 · 46 Days Remaining`).
- [ ] **Step 2: Update CSS styling in `admin.css`**
  - Elevated glassmorphic badges, high-contrast typography, and smooth emergency state transitions.

---

### Task 3: Overhaul Declarations List & "Prepare Price Freeze" Form

**Files:**
- Modify: `web/src/components/admin/EmergencyToggle.tsx:105-225`
- Modify: `web/src/components/admin/admin.css:9395-9510`

- [ ] **Step 1: Redesign Declarations History Cards**
  - Replace raw ISO string display with `formatPstDateRange(record.starts_on, record.ends_on)`.
  - Format status chips (`DRAFT`, `IN EFFECT`, `ENDED`) with non-breaking styling and clear icon indicators.
  - Display declaration reference prominently with metadata badge (e.g., candidate count).
- [ ] **Step 2: Redesign "Prepare Price Freeze" Form**
  - Replace oversized static location container with an elegant inline jurisdiction badge with a MapPin icon.
  - Add statutory formula callout box:
    $$\text{Official APC Ceiling} = \frac{\text{Minimum Price} + \text{Maximum Price}}{2}$$
  - Add quick duration preset button "+60 Days (R.A. 7581 Default)" that auto-populates the end date input based on the chosen start date.
  - Enhance input styles with clear focus rings and icon badges.

---

### Task 4: Enhance APC Preparation Matrix & Pre-Activation Diagnostics

**Files:**
- Modify: `web/src/components/admin/EmergencyToggle.tsx:265-380`
- Modify: `web/src/components/admin/admin.css:9512-9605`

- [ ] **Step 1: Add Search and Filter Controls to Candidate Matrix**
  - Add an inline search input (`Search covered products...`).
  - Add category / readiness filter pills (`All`, `Ready`, `SRP Fallbacks`).
- [ ] **Step 2: Beautify Table Rows**
  - Render humanized commodity titles with category tags while preserving the candidate commodity key for test selector queries.
  - Render computed APC cell with prominent bold styling and clear formula breakdown.
  - Align all numeric columns with tabular figures.
- [ ] **Step 3: Replace Blocked Text Dump with Diagnostic Card**
  - When activation is blocked due to missing observations, render a structured **Pre-Activation Diagnostic Card**:
    - Alert title: `Surveillance Gap: Observations Needed Before Freeze Activation`
    - Summary chip: `X of Y commodities lack routine field data`
    - Collapsible / scrollable tag list of affected commodities with clean badges.
- [ ] **Step 4: Streamline Source Observations Inspection**
  - Instead of dumping 50 expanded `<details>` elements at the bottom, provide an on-demand modal or collapsible inspector per product row (`View Source Stores`).

---

### Task 5: Refine Verification, Activation, and Official References Table

**Files:**
- Modify: `web/src/components/admin/EmergencyToggle.tsx:382-465`
- Modify: `web/src/components/admin/admin.css:9605-9765`

- [ ] **Step 1: Elevate Compliance Verification Box**
  - Use high-trust statutory checkbox styling with evaluator acknowledgment copy.
  - Provide clear status feedback explaining why the activation button is enabled or disabled.
  - Primary button: `Confirm Official APC & Activate Price Freeze` with loading indicator.
- [ ] **Step 2: Format Official APC / Price Freeze References Table**
  - Humanize product names and format dates.
  - Format source column tags (`Routine Surveillance` vs `SRP Fallback Ceiling`).
  - Standardize typography to match Price Regulation table.

---

### Task 6: Visual & Automated Verification via Playwright & Vitest

**Files:**
- Test: `web/src/components/admin/LegalNoticeAndEmergency.test.tsx`
- Playwright Verification Scripts

- [ ] **Step 1: Run Vitest Suite**
  Run: `npx vitest run src/components/admin/LegalNoticeAndEmergency.test.tsx`
  Ensure all 20 existing unit tests pass without failure.
- [ ] **Step 2: Run Full Admin Test Suite**
  Run: `npx vitest run`
  Ensure zero regression across all 245 tests.
- [ ] **Step 3: Playwright Visual Capture**
  Capture high-resolution screenshots of the revamped Emergency Protocol page across states:
  - Normal State with Draft selected
  - Search & filter interaction
  - Ended declaration selected
  - Full-page inspection
- [ ] **Step 4: Present Visual Artifacts to User**
