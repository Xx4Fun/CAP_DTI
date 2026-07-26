# Customer PWA UI/UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate bouncy UI layout animations, convert static reporting cards into compact accordions, and integrate dynamic category filtering into the SRP Prices section.

**Architecture:** Refactor CSS transitions in `index.css` to prevent layout jumps, add collapsible accordion state in `FormalReport.tsx`, and add a dynamic category `<select>` dropdown in `SrpSearch.tsx` combined with existing search & classification filters.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind/Vanilla CSS tokens, Lucide React icons.

---

### Task 1: Fix Bouncy Animations and Layout Transitions

**Files:**
- Modify: `customer-pwa/src/index.css`

- [ ] **Step 1: Inspect and update CSS transition rules in `customer-pwa/src/index.css`**

Replace wildcard `transition: all 0.2s ease` and `transition: all 0.15s ease` on `.glass-panel`, `.action-card`, `.chip`, `.nav-item`, and `.btn-primary` with explicit non-layout transitions to prevent layout shifts.

- [ ] **Step 2: Remove vertical `translateY` hover offsets**

Remove `:hover { transform: translateY(-2px); }` and `:hover { transform: translateY(-1px); }` from `.action-card:hover` and `.btn-primary:hover` so clicking buttons or hovering cards does not cause vertical bouncing.

- [ ] **Step 3: Run build to verify CSS syntax**

Run: `npm run build` in `customer-pwa/`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add customer-pwa/src/index.css
git commit -m "fix(customer-pwa): remove bouncy translateY transforms and transition layout properties"
```

---

### Task 2: Implement Collapsible Accordion in Reports Section

**Files:**
- Modify: `customer-pwa/src/components/FormalReport.tsx`

- [ ] **Step 1: Add accordion state management in `FormalReport.tsx`**

Add state for expanded accordion items:
```tsx
const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
  'how-reporting-works': false,
  'privacy-security': false,
  'faq': false,
});

const toggleAccordion = (key: string) => {
  setOpenAccordions((prev) => ({ ...prev, [key]: !prev[key] }));
};
```

- [ ] **Step 2: Refactor Info Section Cards into Collapsible Accordions**

Update the cards for *"How reporting works"*, *"Privacy & Evidence Security"*, and *"Frequently Asked Questions"* in `FormalReport.tsx` to render clickable header bars with `ChevronDown` (when collapsed) and `ChevronUp` (when expanded), displaying the content only when expanded.

- [ ] **Step 3: Run build to verify TypeScript compilation**

Run: `npm run build` in `customer-pwa/`
Expected: PASS

- [ ] **Step 4: Commit changes**

```bash
git add customer-pwa/src/components/FormalReport.tsx
git commit -m "feat(customer-pwa): convert reports info cards into collapsible accordions"
```

---

### Task 3: Implement Dynamic Category Select Dropdown in Prices Section

**Files:**
- Modify: `customer-pwa/src/components/SrpSearch.tsx`

- [ ] **Step 1: Add `selectedCategory` state and dynamic category extraction**

In `SrpSearch.tsx`:
```tsx
const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

const availableCategories = React.useMemo(() => {
  const categories = new Set<string>();
  commodities.forEach((item) => {
    if (item.category) categories.add(item.category.trim());
  });
  return Array.from(categories).sort();
}, [commodities]);
```

- [ ] **Step 2: Update `filteredList` logic to include category selection**

```tsx
const filteredList = commodities.filter((item) => {
  const matchesClassification =
    categoryFilter === 'ALL'
      ? true
      : categoryFilter === 'BASIC_NECESSITY'
      ? item.regulatory_classification === 'BASIC_NECESSITY'
      : item.regulatory_classification === 'PRIME_COMMODITY';

  const matchesCategory =
    selectedCategory === 'ALL'
      ? true
      : (item.category || '').toLowerCase().trim() === selectedCategory.toLowerCase().trim();

  return matchesClassification && matchesCategory;
});
```

- [ ] **Step 3: Render Category Dropdown UI controls**

Add a styled Category Select Dropdown control right above/below search bar:
```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <label htmlFor="category-select" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
    Category:
  </label>
  <select
    id="category-select"
    value={selectedCategory}
    onChange={(e) => setSelectedCategory(e.target.value)}
    style={{
      width: '100%',
      padding: '8px 12px',
      borderRadius: '10px',
      border: '1px solid #cbd5e1',
      background: '#ffffff',
      fontSize: '0.85rem',
      fontWeight: 600,
      color: '#0f172a',
      outline: 'none',
      cursor: 'pointer'
    }}
  >
    <option value="ALL">All Categories ({commodities.length})</option>
    {availableCategories.map((cat) => (
      <option key={cat} value={cat}>
        {cat}
      </option>
    ))}
  </select>
</div>
```

- [ ] **Step 4: Run build to verify TypeScript compilation**

Run: `npm run build` in `customer-pwa/`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add customer-pwa/src/components/SrpSearch.tsx
git commit -m "feat(customer-pwa): add dynamic category filter dropdown to Prices section"
```

---

### Task 4: Full Build Verification & Production Deployment

- [ ] **Step 1: Execute production build**

Run: `npm run build` in `customer-pwa/`
Expected: `dist/` created cleanly with zero errors.

- [ ] **Step 2: Push changes to GitHub repository**

```bash
git push origin main
```
Expected: Changes pushed to GitHub, triggering auto-deploy on Vercel (`https://customer-pwa-six.vercel.app`).
