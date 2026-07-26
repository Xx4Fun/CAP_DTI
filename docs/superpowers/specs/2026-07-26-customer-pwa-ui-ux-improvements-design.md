# Customer PWA UI/UX Improvements Design Spec

**Date**: 2026-07-26  
**Target Project**: `customer-pwa` (PRICE-Watch Consumer PWA)  
**Goal**: Eliminate bouncy layout animations, convert static reporting cards into compact accordions, and add dynamic category filtering to the SRP Prices section.

---

## 1. Scope of Changes

### 1.1 Bouncy Animation & Transition Fix
- **Files**: `customer-pwa/src/index.css`, `customer-pwa/src/components/SrpSearch.tsx`, `customer-pwa/src/components/Navbar.tsx`
- **Changes**:
  - Replace wildcard `transition: all 0.2s ease` and `transition: all 0.15s ease` across `.glass-panel`, `.action-card`, `.chip`, and `.nav-item` with explicit non-layout transitions:
    `transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;`
  - Remove vertical `transform: translateY(-2px)` / `translateY(-1px)` hover & active offsets that cause layout bouncing when items re-render or switch state.

### 1.2 Reports Section Collapsible Accordion
- **Files**: `customer-pwa/src/components/FormalReport.tsx`
- **Changes**:
  - Convert the three static info cards on the main Reports dashboard into interactive, collapsible accordion panels:
    1. **How reporting works** (Icon: `HelpCircle`, Color: Amber)
    2. **Privacy & Evidence Security** (Icon: `ShieldCheck`, Color: Blue)
    3. **Frequently Asked Questions** (Icon: `FileText`, Color: Green)
  - Add state `openAccordions: Record<string, boolean>` defaulting to all collapsed `{ 'how-reporting-works': false, 'privacy-security': false, 'faq': false }`.
  - Display header with section title, icon, and right toggle chevron (`ChevronDown` / `ChevronUp`).
  - Reduces vertical dashboard height by ~60%.

### 1.3 Prices Category Filter Dropdown (Option B)
- **Files**: `customer-pwa/src/components/SrpSearch.tsx`
- **Changes**:
  - Extract unique dynamic item categories from the `commodities` state list fetched from Supabase (e.g., *Canned Sardines*, *Corned Beef*, *Luncheon Meat*, *Meat Loaf*, *Evaporated Milk*, *Condensed Milk*, *Coffee Refill*, *Instant Noodles*, *Bottled Water*, *Toilet Soap*, *Laundry Soap*, *Bread*, *Candles*, *Salt*).
  - Add state `selectedCategory: string` defaulting to `'ALL'`.
  - Add a styled Category `<select>` dropdown component below the search bar alongside the classification chips.
  - Combine filtering logic:
    ```ts
    const filteredList = commodities.filter((item) => {
      const matchesClassification = categoryFilter === 'ALL' || item.regulatory_classification === categoryFilter;
      const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
      return matchesClassification && matchesCategory;
    });
    ```
  - Display active item count reflecting category filter (e.g. *"14 prices in Canned Sardines"*).

---

## 2. Verification Plan

1. **Build Verification**:
   - Run `npm run build` inside `customer-pwa/` to ensure zero TypeScript or Vite bundle errors.
2. **UI & Behavioral Verification**:
   - Verify tab switching and clicking price cards shows no vertical bounce.
   - Verify clicking Accordion headers in Reports section expands and collapses content cleanly.
   - Verify selecting a category (e.g., *Sardines*, *Toilet Soap*) filters the list accurately.
