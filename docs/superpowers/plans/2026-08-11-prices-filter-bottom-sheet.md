# Prices Filter Bottom Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Customer PWA Prices filters as three page-level regulatory pills plus an accessible mobile bottom sheet that stages and applies several product categories together.

**Architecture:** Keep applied filtering state and commodity result computation in `SrpSearch`. Add pure category-normalization helpers for deterministic matching, and add a portal-based `PriceFilterSheet` for draft selection, modal focus, scroll locking, cancellation, and swipe-down dismissal. Use React, pointer events, and scoped CSS only; do not add an animation or drawer dependency.

**Tech Stack:** React 19, TypeScript 6, React DOM portals, Lucide React, CSS, Vitest 4, Testing Library, user-event, Vite 8

## Global Constraints

- Modify only the Customer PWA Prices filter interface, its focused helpers/styles, and automated tests.
- Keep the `All`, `Basic Necessities`, and `Prime Commodities` page-level pills.
- Remove the always-visible `Category:` dropdown and the current inline `Filter Options` panel.
- Support several applied product categories using OR semantics; combine category and regulatory classification filters using AND semantics.
- Category choices are staged until `Apply filters`; cancellation must discard the draft.
- `Clear filters` clears draft categories only and does not close or apply the sheet.
- Keep sorting separate and exclude it from the Filters badge count.
- Use no new third-party UI, gesture, modal, or animation dependency.
- Preserve the existing search, offline/cache status, product cards, product detail, scan/report handoffs, and backend contracts.
- Meet 44-by-44-pixel minimum touch targets and preserve the shared bottom navbar safe area.
- Respect `prefers-reduced-motion: reduce`.
- Do not deploy without a separate explicit deployment request.
- Preserve all unrelated dirty-workspace changes. Before any commit, inspect `git diff --cached --name-only`; if a task file contains pre-existing user changes that cannot be isolated, leave it uncommitted rather than staging unrelated work.

---

## File Structure

- Create `customer-pwa/src/app/priceFilters.ts`: pure normalization, category extraction, sanitization, matching, and badge-count functions.
- Create `customer-pwa/src/app/priceFilters.test.ts`: literal fixtures covering case-insensitive multi-category semantics.
- Create `customer-pwa/src/components/PriceFilterSheet.tsx`: portal-based modal sheet, draft state, focus management, scroll locking, progressive Back support, and pointer gesture state.
- Create `customer-pwa/src/components/PriceFilterSheet.test.tsx`: isolated behavior, accessibility, cancellation, and gesture tests.
- Modify `customer-pwa/src/components/SrpSearch.tsx`: replace the single category with applied category arrays, stabilize available category options, render the sheet, and remove obsolete controls.
- Modify `customer-pwa/src/components/SrpSearch.test.tsx`: cover the complete user flow and product-result behavior.
- Modify `customer-pwa/src/index.css`: bottom-sheet/backdrop motion, safe-area actions, touch sizing, drag state, and reduced-motion rules.

---

### Task 1: Pure multi-category filter rules

**Files:**
- Create: `customer-pwa/src/app/priceFilters.ts`
- Create: `customer-pwa/src/app/priceFilters.test.ts`

**Interfaces:**
- Consumes: `Commodity` from `customer-pwa/src/api/client.ts`.
- Produces:

```ts
export type PriceClassification = 'ALL' | 'BASIC_NECESSITY' | 'PRIME_COMMODITY';

export function normalizePriceCategory(value: string): string;
export function extractPriceCategories(commodities: Commodity[]): string[];
export function sanitizeAppliedCategories(applied: string[], available: string[]): string[];
export function commodityMatchesPriceFilters(
  commodity: Commodity,
  classification: PriceClassification,
  appliedCategories: string[],
): boolean;
export function countActivePriceFilters(
  classification: PriceClassification,
  appliedCategories: string[],
): number;
```

- [ ] **Step 1: Write failing literal-fixture tests**

Create `priceFilters.test.ts` with fixtures that prove the intended semantics independently of the implementation:

```ts
import { describe, expect, it } from 'vitest';
import type { Commodity } from '../api/client';
import {
  commodityMatchesPriceFilters,
  countActivePriceFilters,
  extractPriceCategories,
  sanitizeAppliedCategories,
} from './priceFilters';

const products = [
  { id: 1, commodity_name: 'Sardines', category: ' Canned Goods ', regulatory_classification: 'BASIC_NECESSITY', baseline_price: 20 },
  { id: 2, commodity_name: 'Milk', category: 'Milk', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 30 },
  { id: 3, commodity_name: 'Coffee', category: 'coffee', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 40 },
] as Commodity[];

describe('priceFilters', () => {
  it('extracts sorted canonical categories without case-insensitive duplicates', () => {
    expect(extractPriceCategories(products)).toEqual(['Canned Goods', 'coffee', 'Milk']);
  });

  it('matches any selected category and then requires the selected classification', () => {
    expect(products.filter((item) => commodityMatchesPriceFilters(item, 'ALL', ['CANNED GOODS', 'Milk'])).map((item) => item.id)).toEqual([1, 2]);
    expect(products.filter((item) => commodityMatchesPriceFilters(item, 'PRIME_COMMODITY', ['Canned Goods', 'Milk'])).map((item) => item.id)).toEqual([2]);
  });

  it('treats no selected categories as all categories', () => {
    expect(products.filter((item) => commodityMatchesPriceFilters(item, 'ALL', [])).map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it('drops unavailable applied categories and removes duplicates', () => {
    expect(sanitizeAppliedCategories(['milk', 'Missing', 'MILK'], ['Canned Goods', 'Milk'])).toEqual(['Milk']);
  });

  it('counts categories plus a non-All classification and never counts sorting', () => {
    expect(countActivePriceFilters('ALL', ['Milk', 'Coffee'])).toBe(2);
    expect(countActivePriceFilters('PRIME_COMMODITY', ['Milk', 'Coffee'])).toBe(3);
  });
});
```

- [ ] **Step 2: Run the helper test and verify RED**

Run from `customer-pwa`:

```powershell
npm.cmd test -- --run src/app/priceFilters.test.ts
```

Expected: FAIL because `priceFilters.ts` does not exist.

- [ ] **Step 3: Implement the pure functions**

Create `priceFilters.ts` using one normalized key for every comparison:

```ts
import type { Commodity } from '../api/client';

export type PriceClassification = 'ALL' | 'BASIC_NECESSITY' | 'PRIME_COMMODITY';

export const normalizePriceCategory = (value: string): string =>
  value.trim().toLocaleLowerCase();

export function extractPriceCategories(commodities: Commodity[]): string[] {
  const canonical = new Map<string, string>();
  commodities.forEach((commodity) => {
    const label = commodity.category?.trim() || '';
    const key = normalizePriceCategory(label);
    if (key && !canonical.has(key)) canonical.set(key, label);
  });
  return [...canonical.values()].sort((left, right) => left.localeCompare(right));
}

export function sanitizeAppliedCategories(applied: string[], available: string[]): string[] {
  const availableByKey = new Map(available.map((label) => [normalizePriceCategory(label), label]));
  const clean: string[] = [];
  const seen = new Set<string>();
  applied.forEach((label) => {
    const key = normalizePriceCategory(label);
    const canonical = availableByKey.get(key);
    if (canonical && !seen.has(key)) {
      clean.push(canonical);
      seen.add(key);
    }
  });
  return clean;
}

export function commodityMatchesPriceFilters(
  commodity: Commodity,
  classification: PriceClassification,
  appliedCategories: string[],
): boolean {
  const classificationMatches = classification === 'ALL'
    || commodity.regulatory_classification === classification;
  const selectedKeys = new Set(appliedCategories.map(normalizePriceCategory));
  const categoryMatches = selectedKeys.size === 0
    || selectedKeys.has(normalizePriceCategory(commodity.category || ''));
  return classificationMatches && categoryMatches;
}

export function countActivePriceFilters(
  classification: PriceClassification,
  appliedCategories: string[],
): number {
  return appliedCategories.length + (classification === 'ALL' ? 0 : 1);
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

```powershell
npm.cmd test -- --run src/app/priceFilters.test.ts
```

Expected: 1 test file passes with 5 passing tests.

- [ ] **Step 5: Record a scoped checkpoint**

```powershell
git diff --cached --name-only
git add customer-pwa/src/app/priceFilters.ts customer-pwa/src/app/priceFilters.test.ts
git commit -m "feat(prices): add multi-category filter rules"
```

If the execution workspace is not isolated or staging reveals unrelated paths, do not commit; leave these files unstaged and continue only after recording the passing test output.

---

### Task 2: Accessible staged-selection bottom sheet

**Files:**
- Create: `customer-pwa/src/components/PriceFilterSheet.tsx`
- Create: `customer-pwa/src/components/PriceFilterSheet.test.tsx`
- Modify: `customer-pwa/src/index.css`

**Interfaces:**
- Consumes: canonical category labels from `extractPriceCategories()` and applied labels from `SrpSearch`.
- Produces:

```ts
export interface PriceFilterSheetProps {
  open: boolean;
  categories: string[];
  appliedCategories: string[];
  onApply: (categories: string[]) => void;
  onCancel: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export function PriceFilterSheet(props: PriceFilterSheetProps): React.ReactPortal;
```

- [ ] **Step 1: Write failing structure and staged-state tests**

Create a test harness that owns `open` and `appliedCategories`, then assert real dialog behavior:

```tsx
function Harness() {
  const [open, setOpen] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>Filters</button>
      <output aria-label="Applied categories">{applied.join(', ') || 'All'}</output>
      <PriceFilterSheet
        open={open}
        categories={['Canned Goods', 'Coffee', 'Milk']}
        appliedCategories={applied}
        triggerRef={triggerRef}
        onCancel={() => setOpen(false)}
        onApply={(next) => { setApplied(next); setOpen(false); }}
      />
    </>
  );
}
```

Tests must assert:

```ts
await user.click(screen.getByRole('button', { name: 'Filters' }));
expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
expect(screen.getByLabelText('Applied categories')).toHaveTextContent('All');
await user.click(screen.getByRole('button', { name: 'Apply filters' }));
expect(screen.getByLabelText('Applied categories')).toHaveTextContent('Canned Goods, Milk');
```

Add separate tests proving:

- `Clear filters` unchecks every draft checkbox but does not close the dialog or change the applied output before Apply.
- `X` cancellation discards changed draft values.
- backdrop cancellation occurs only when the backdrop itself is clicked.
- Escape cancellation discards changes.
- a mocked `CloseWatcher` close event cancels the sheet for supported Android Back behavior.
- an empty category array renders `No categories available`.
- `index.css?raw` contains the sheet safe-area padding and a `prefers-reduced-motion: reduce` rule that sets the backdrop and sheet transition duration to `0ms`.

- [ ] **Step 2: Run the component test and verify RED**

```powershell
npm.cmd test -- --run src/components/PriceFilterSheet.test.tsx
```

Expected: FAIL because `PriceFilterSheet` does not exist.

- [ ] **Step 3: Implement portal, draft state, and semantic structure**

Implement the component with `createPortal(..., document.body)`, local `draftCategories`, and stable normalized toggling:

```tsx
const [draftCategories, setDraftCategories] = useState<string[]>(appliedCategories);

useEffect(() => {
  if (open) setDraftCategories(appliedCategories);
}, [open, appliedCategories]);

const toggleCategory = (category: string) => {
  const key = normalizePriceCategory(category);
  setDraftCategories((current) => current.some((item) => normalizePriceCategory(item) === key)
    ? current.filter((item) => normalizePriceCategory(item) !== key)
    : [...current, category]);
};
```

Render this exact semantic hierarchy inside the portal:

```tsx
<div
  className={`price-filter-backdrop${open ? ' is-open' : ''}`}
  aria-hidden={!open}
  data-testid="price-filter-backdrop"
  onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
>
  <section
    ref={sheetRef}
    className={`price-filter-sheet${open ? ' is-open' : ''}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby="price-filter-title"
  >
    <div className="price-filter-sheet__handle" aria-hidden="true" />
    <header className="price-filter-sheet__header">
      <h2 id="price-filter-title">Filters</h2>
      <button ref={closeButtonRef} type="button" aria-label="Close filters" onClick={onCancel}><X /></button>
    </header>
    <div className="price-filter-sheet__category-scroll" data-filter-scroll>
      <h3>Category</h3>
      {categories.length === 0 ? <p>No categories available</p> : categories.map((category) => (
        <label className="price-filter-sheet__category" key={normalizePriceCategory(category)}>
          <input type="checkbox" checked={draftCategories.some((item) => normalizePriceCategory(item) === normalizePriceCategory(category))} onChange={() => toggleCategory(category)} />
          <span>{category}</span>
        </label>
      ))}
    </div>
    <footer className="price-filter-sheet__actions">
      <button type="button" onClick={() => setDraftCategories([])}>Clear filters</button>
      <button type="button" className="btn-primary" onClick={() => onApply(draftCategories)}>Apply filters</button>
    </footer>
  </section>
</div>
```

When `open` is false, keep the portal mounted for CSS exit transitions but apply `aria-hidden="true"`, `visibility: hidden`, and `pointer-events: none` through the closed-state CSS. Do not expose a closed dialog to role queries or assistive technology.

- [ ] **Step 4: Add focus containment, focus restoration, scroll locking, and progressive Back support**

On open:

```ts
const previousOverflow = document.body.style.overflow;
document.body.style.overflow = 'hidden';
closeButtonRef.current?.focus();
```

Install a `keydown` listener that cycles Tab/Shift+Tab between enabled buttons and checkboxes inside `sheetRef`. It cancels on Escape only when `CloseWatcher` is unavailable. On cleanup, restore the exact previous body overflow and call `triggerRef.current?.focus()`.

Use the browser `CloseWatcher` progressively instead of modifying navigation history:

```ts
type CloseWatcherInstance = { addEventListener(type: 'close', listener: () => void): void; destroy(): void };
type CloseWatcherConstructor = new () => CloseWatcherInstance;
const CloseWatcherApi = (window as unknown as { CloseWatcher?: CloseWatcherConstructor }).CloseWatcher;
const watcher = CloseWatcherApi ? new CloseWatcherApi() : null;
watcher?.addEventListener('close', onCancel);
```

Destroy the watcher during effect cleanup. This prevents Escape from invoking `onCancel` twice in browsers where `CloseWatcher` already handles it. Escape remains the fallback where `CloseWatcher` is unavailable; Android Back is supported where the API exists.

- [ ] **Step 5: Add base layout, safe-area, and reduced-motion CSS**

Append scoped classes to `index.css`:

```css
.price-filter-backdrop {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(15, 23, 42, 0);
  visibility: hidden;
  pointer-events: none;
  transition: background-color 180ms ease, visibility 0s linear 220ms;
}

.price-filter-backdrop.is-open {
  background: rgba(15, 23, 42, 0.48);
  visibility: visible;
  pointer-events: auto;
  transition-delay: 0s;
}

.price-filter-sheet {
  width: min(100%, 600px);
  max-height: 75dvh;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.2);
  transform: translateY(calc(100% + var(--price-filter-drag-y, 0px)));
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;
}

.price-filter-sheet.is-open {
  transform: translateY(var(--price-filter-drag-y, 0px));
}

.price-filter-sheet__category-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 16px 16px;
}

.price-filter-sheet__category,
.price-filter-sheet__header button,
.price-filter-sheet__actions button {
  min-height: 44px;
}

.price-filter-sheet__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  .price-filter-backdrop,
  .price-filter-sheet {
    transition-duration: 0ms;
  }
}
```

Add header, handle, category-row, checkbox, focus-visible, and secondary-button declarations using the existing blue/slate palette. Keep adjacent controls at least 8 pixels apart.

- [ ] **Step 6: Run the component test and verify GREEN**

```powershell
npm.cmd test -- --run src/components/PriceFilterSheet.test.tsx
```

Expected: all structure, staged-state, cancellation, focus, and scroll-lock tests pass.

- [ ] **Step 7: Record a scoped checkpoint**

```powershell
git diff --cached --name-only
git add customer-pwa/src/components/PriceFilterSheet.tsx customer-pwa/src/components/PriceFilterSheet.test.tsx customer-pwa/src/index.css
git commit -m "feat(prices): add accessible category filter sheet"
```

If `index.css` contains pre-existing uncommitted user work in the execution workspace, do not stage or commit it; preserve the verified changes unstaged.

---

### Task 3: Swipe-down dismissal and motion-state interaction

**Files:**
- Modify: `customer-pwa/src/components/PriceFilterSheet.tsx`
- Modify: `customer-pwa/src/components/PriceFilterSheet.test.tsx`
- Modify: `customer-pwa/src/index.css`

**Interfaces:**
- Consumes: `onCancel()` and the `[data-filter-scroll]` category container from Task 2.
- Produces: downward pointer dismissal at `96` pixels, drag-position CSS variable `--price-filter-drag-y`, and `.is-dragging` motion suppression.

- [ ] **Step 1: Add failing gesture tests**

Add tests using `fireEvent.pointerDown`, `fireEvent.pointerMove`, and `fireEvent.pointerUp`:

```ts
const sheet = screen.getByRole('dialog', { name: 'Filters' });
fireEvent.pointerDown(sheet, { pointerId: 1, clientY: 100 });
fireEvent.pointerMove(sheet, { pointerId: 1, clientY: 220 });
fireEvent.pointerUp(sheet, { pointerId: 1, clientY: 220 });
expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument();
```

Add independent cases proving:

- a 60-pixel drag snaps back and keeps the sheet open;
- upward movement never produces a negative translation;
- a drag beginning in the category scroller is ignored when `scrollTop` is greater than zero;
- a drag beginning in the category scroller can dismiss when `scrollTop` is zero; and
- a canceling drag does not apply staged checkboxes.

- [ ] **Step 2: Run the gesture test and verify RED**

```powershell
npm.cmd test -- --run src/components/PriceFilterSheet.test.tsx
```

Expected: FAIL because pointer gestures do not change the sheet or cancel it.

- [ ] **Step 3: Implement one-axis pointer tracking**

Use refs so pointer movement does not create stale closures:

```ts
const dragStartYRef = useRef<number | null>(null);
const dragDistanceRef = useRef(0);
const [dragDistance, setDragDistance] = useState(0);
const dismissThreshold = 96;
```

On pointer down, start only for a primary pointer. If the event originated inside `[data-filter-scroll]`, read that element's `scrollTop` and return when it is greater than zero. Capture the pointer on the sheet.

On pointer move, calculate `Math.max(0, event.clientY - dragStartYRef.current)`, update both the ref and state, and expose it through:

```tsx
style={{ '--price-filter-drag-y': `${dragDistance}px` } as React.CSSProperties}
```

On pointer up/cancel, call `onCancel()` only when the final distance is at least 96 pixels. Otherwise reset the distance to zero. Reset all drag state whenever `open` becomes false.

- [ ] **Step 4: Prevent transition resistance while actively dragging**

Add `.is-dragging` while a pointer is captured and define:

```css
.price-filter-sheet.is-dragging {
  transition: none;
  user-select: none;
}
```

Use `touch-action: pan-y` on the category scroller and `touch-action: none` on the drag handle/header so vertical content scrolling remains native and header dragging remains direct.

- [ ] **Step 5: Run the gesture test and verify GREEN**

```powershell
npm.cmd test -- --run src/components/PriceFilterSheet.test.tsx
```

Expected: all component and gesture tests pass.

- [ ] **Step 6: Record a scoped checkpoint**

```powershell
git diff --cached --name-only
git add customer-pwa/src/components/PriceFilterSheet.tsx customer-pwa/src/components/PriceFilterSheet.test.tsx customer-pwa/src/index.css
git commit -m "feat(prices): add swipe dismissal to filter sheet"
```

Apply the dirty-workspace staging rule from the Global Constraints.

---

### Task 4: Integrate staged categories into the Prices page

**Files:**
- Modify: `customer-pwa/src/components/SrpSearch.tsx:207-229`
- Modify: `customer-pwa/src/components/SrpSearch.tsx:353-382`
- Modify: `customer-pwa/src/components/SrpSearch.tsx:459-685`
- Modify: `customer-pwa/src/components/SrpSearch.tsx:729-731`
- Modify: `customer-pwa/src/components/SrpSearch.test.tsx`

**Interfaces:**
- Consumes: `PriceFilterSheet`, `extractPriceCategories`, `sanitizeAppliedCategories`, `commodityMatchesPriceFilters`, `countActivePriceFilters`.
- Produces: `appliedCategories: string[]`, stable `availableCategories: string[]`, filtered results, and the visible Filters badge.

- [ ] **Step 1: Add complete failing integration fixtures**

Expand `SrpSearch.test.tsx` to import `userEvent` and use three API commodities with distinct category/classification combinations:

```ts
const liveCommodities = [
  { id: 201, commodity_name: 'Saba Sardines', category: 'Canned Goods', regulatory_classification: 'BASIC_NECESSITY', baseline_price: 20, effective_date: '2026-08-01', is_active: true },
  { id: 202, commodity_name: 'Fresh Milk', category: 'Milk', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 30, effective_date: '2026-08-01', is_active: true },
  { id: 203, commodity_name: 'Ground Coffee', category: 'Coffee', regulatory_classification: 'PRIME_COMMODITY', baseline_price: 40, effective_date: '2026-08-01', is_active: true },
];
```

Mock `/public/commodities` with this complete response and assert:

```ts
expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Basic Necessities' })).toBeInTheDocument();
expect(screen.getByRole('button', { name: 'Prime Commodities' })).toBeInTheDocument();
expect(screen.queryByLabelText('Category:')).not.toBeInTheDocument();

await user.click(screen.getByRole('button', { name: /Filters/i }));
await user.click(screen.getByRole('checkbox', { name: 'Canned Goods' }));
await user.click(screen.getByRole('checkbox', { name: 'Milk' }));
expect(screen.getByText('Ground Coffee')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Apply filters' }));
expect(screen.getByText('Saba Sardines')).toBeInTheDocument();
expect(screen.getByText('Fresh Milk')).toBeInTheDocument();
expect(screen.queryByText('Ground Coffee')).not.toBeInTheDocument();
```

Add tests proving:

- selecting `Prime Commodities` after applying Canned Goods + Milk leaves only Fresh Milk and increases the badge from 2 to 3;
- changing Sort does not change the badge;
- reopening, clearing drafts, and canceling leaves the two applied categories active;
- reopening, clearing, and applying restores all categories;
- categories remain available when the product search narrows visible commodities; and
- an applied category removed by an unfiltered live refresh is sanitized out.

- [ ] **Step 2: Run the Prices integration test and verify RED**

```powershell
npm.cmd test -- --run src/components/SrpSearch.test.tsx
```

Expected: FAIL because the standalone Category dropdown and inline panel still render and only one category can be applied.

- [ ] **Step 3: Replace single-category state and derive the correct badge**

Import the new component/helpers and replace:

```ts
const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
```

with:

```ts
const [appliedCategories, setAppliedCategories] = useState<string[]>([]);
const filtersButtonRef = useRef<HTMLButtonElement>(null);
const activeFiltersCount = countActivePriceFilters(categoryFilter, appliedCategories);
```

Keep `isFilterModalOpen`, but rename it to `isFilterSheetOpen` throughout the touched component for semantic accuracy.

- [ ] **Step 4: Stabilize category options independently of search results**

Initialize a category catalog from the complete cached/fallback dataset:

```ts
const [availableCategories, setAvailableCategories] = useState<string[]>(() =>
  extractPriceCategories(initialCache?.data ?? fallbackCommodities)
);
```

When an unfiltered live response succeeds, update both the verified cache and category options:

```ts
if (!query && liveData.length > 0) {
  writeVerifiedCache(PUBLIC_COMMODITIES_CACHE_KEY, liveData);
  setAvailableCategories(extractPriceCategories(liveData));
}
```

When fallback data is selected, update `availableCategories` from the complete `baseDataSet` before applying the query filter. Never derive sheet categories from the search-narrowed `commodities` array.

Sanitize applied categories only when the stable options change:

```ts
useEffect(() => {
  setAppliedCategories((current) => sanitizeAppliedCategories(current, availableCategories));
}, [availableCategories]);
```

- [ ] **Step 5: Replace result filtering with the pure predicate**

Use:

```ts
const filteredList = commodities.filter((item) =>
  commodityMatchesPriceFilters(item, categoryFilter, appliedCategories)
);
```

Leave the existing sort implementation unchanged.

- [ ] **Step 6: Replace obsolete category and inline-filter markup**

Delete the entire always-visible `Category Select Dropdown` block and the conditional inline `Filter Modal Drawer` block.

Change the Filters trigger to:

```tsx
<button
  ref={filtersButtonRef}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={isFilterSheetOpen}
  onClick={() => setIsFilterSheetOpen(true)}
>
  <SlidersHorizontal size={18} aria-hidden="true" />
  Filters
  {activeFiltersCount > 0 && <span aria-label={`${activeFiltersCount} active filters`}>{activeFiltersCount}</span>}
</button>
```

Render the portal component once near the end of `SrpSearch`:

```tsx
<PriceFilterSheet
  open={isFilterSheetOpen}
  categories={availableCategories}
  appliedCategories={appliedCategories}
  triggerRef={filtersButtonRef}
  onCancel={() => setIsFilterSheetOpen(false)}
  onApply={(categories) => {
    setAppliedCategories(categories);
    setIsFilterSheetOpen(false);
  }}
/>
```

Update the count copy to avoid referring to one selected category:

```tsx
{sortedList.length} prices
{appliedCategories.length > 0 ? ` in ${appliedCategories.length} selected ${appliedCategories.length === 1 ? 'category' : 'categories'}` : ''}
```

- [ ] **Step 7: Run the Prices integration test and verify GREEN**

```powershell
npm.cmd test -- --run src/components/SrpSearch.test.tsx
```

Expected: all existing data-source tests and new filter-flow tests pass.

- [ ] **Step 8: Run both focused suites together**

```powershell
npm.cmd test -- --run src/app/priceFilters.test.ts src/components/PriceFilterSheet.test.tsx src/components/SrpSearch.test.tsx
```

Expected: all filter helper, sheet, and integration tests pass with zero failures.

- [ ] **Step 9: Record a scoped checkpoint**

```powershell
git diff --cached --name-only
git add customer-pwa/src/components/SrpSearch.tsx customer-pwa/src/components/SrpSearch.test.tsx
git commit -m "feat(prices): restore staged category filters"
```

Because both files already contain user changes in the current workspace, skip this commit unless execution occurs in a clean isolated worktree containing the intended current baseline.

---

### Task 5: Full regression, accessibility, and production-build verification

**Files:**
- Verify: `customer-pwa/src/app/priceFilters.ts`
- Verify: `customer-pwa/src/components/PriceFilterSheet.tsx`
- Verify: `customer-pwa/src/components/SrpSearch.tsx`
- Verify: `customer-pwa/src/index.css`

**Interfaces:**
- Consumes: the complete verified local Customer PWA tree.
- Produces: evidence that the Prices restoration does not regress the wider PWA and is buildable for production.

- [ ] **Step 1: Run the full Customer PWA suite serially**

```powershell
npm.cmd test -- --maxWorkers=1
```

Expected: every test file passes with zero failures. Record the exact file/test counts rather than copying an older expected count.

- [ ] **Step 2: Run lint**

```powershell
npm.cmd run lint
```

Expected: exit code 0 with no new lint errors in the touched files.

- [ ] **Step 3: Build the production PWA**

```powershell
npm.cmd run build
```

Expected: TypeScript and Vite finish successfully and generate `dist/manifest.webmanifest` and `dist/sw.js`.

- [ ] **Step 4: Review the final scoped diff against every acceptance criterion**

```powershell
git diff --check -- customer-pwa/src/app/priceFilters.ts customer-pwa/src/app/priceFilters.test.ts customer-pwa/src/components/PriceFilterSheet.tsx customer-pwa/src/components/PriceFilterSheet.test.tsx customer-pwa/src/components/SrpSearch.tsx customer-pwa/src/components/SrpSearch.test.tsx customer-pwa/src/index.css
git status --short -- customer-pwa/src/app/priceFilters.ts customer-pwa/src/app/priceFilters.test.ts customer-pwa/src/components/PriceFilterSheet.tsx customer-pwa/src/components/PriceFilterSheet.test.tsx customer-pwa/src/components/SrpSearch.tsx customer-pwa/src/components/SrpSearch.test.tsx customer-pwa/src/index.css
```

Confirm explicitly:

- three rounded classification pills remain;
- no standalone Category dropdown remains;
- the sheet supports several staged categories;
- Clear does not close or apply;
- Apply commits and closes;
- X, backdrop, Escape/Back where supported, and swipe cancel;
- product filtering uses category OR plus classification AND;
- the badge excludes sorting;
- focus and body scrolling are restored on close;
- actions include bottom safe-area padding; and
- reduced motion disables transitions.

- [ ] **Step 5: Commit only if the execution workspace is isolated and scoped staging is clean**

```powershell
git diff --cached --name-only
git status --short --branch
```

If earlier task commits were safely created, no additional commit is necessary. If they were intentionally deferred due the dirty workspace, leave the verified files unstaged and report that status. Do not deploy, push, or stage unrelated changes.
