# Scanner Result Actions and Product Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep scanner-result actions visible above the shared mobile navigation, conditionally offer receipt reporting only for above-SRP results, and display a concise consumer-facing product name.

**Architecture:** Keep the change inside the existing Customer PWA result component. Reuse `formatCommodityDisplay()` for catalog-name presentation, derive the above-reference condition from the comparison response, and render all actions in normal page flow. No API, OCR, database, or regulatory calculation changes are needed.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, Vercel, Render

## Global Constraints

- Modify only the Customer PWA scanner result behavior and its tests.
- Do not change backend catalog values or comparison calculations.
- `Report using receipt` appears only when `is_above_reference` is true or `comparison_status` is `ABOVE_SRP`.
- `Correct product or price`, `Scan another item`, and `View price history` remain available for every result.
- Result actions must use normal document flow and remain above the shared bottom navigation.
- Hyphen-delimited DTI product names display only their consumer-facing final segment.
- Preserve all unrelated dirty-workspace changes.

---

### Task 1: Lock the result behavior with regression tests

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.test.tsx`

**Interfaces:**
- Consumes: `ShelfScanner`, `ComparisonResultResponse`, mocked `apiClient` responses.
- Produces: Regression coverage for `scan-result-actions`, conditional receipt reporting, and formatted result product names.

- [ ] **Step 1: Add a matching-SRP result test that exposes the current defects**

Add a test whose analyze response is automatically resolved with:

```ts
comparison_status: 'MATCHES_SRP',
is_above_reference: false,
commodity_name: 'Instant Mami Noodles - Chicken & Beef Flavor - Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)',
displayed_price: '15.00',
reference_price: '15.00',
product_source: 'OCR_AUTO',
price_source: 'OCR_DETECTED',
```

Assert the consumer-visible behavior:

```ts
expect(await screen.findByText('Comparison Result')).toBeInTheDocument();
expect(screen.getByText('Matches Current SRP baseline')).toBeInTheDocument();
expect(screen.getByText('Lucky Me! (Instant Mami Chicken na Chicken and Instant Mami Beef na Beef) (55g)')).toBeInTheDocument();
expect(screen.queryByRole('button', { name: /Report using receipt/i })).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: /Correct product or price/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Scan another item/i })).toBeInTheDocument();
expect(screen.getByRole('button', { name: /View price history/i })).toBeInTheDocument();
expect(screen.getByTestId('scan-result-actions')).not.toHaveStyle({ position: 'fixed' });
expect(screen.getByTestId('scan-result-actions')).not.toHaveStyle({ position: 'sticky' });
```

- [ ] **Step 2: Strengthen an above-SRP result test**

For an existing result with `is_above_reference: true`, assert:

```ts
expect(screen.getByRole('button', { name: /Report using receipt/i })).toBeInTheDocument();
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- --run src/components/ShelfScanner.test.tsx
```

Expected: FAIL because the raw long product name is rendered, the report button is always visible, and `scan-result-actions` does not exist.

### Task 2: Implement concise names and normal-flow conditional actions

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`
- Test: `customer-pwa/src/components/ShelfScanner.test.tsx`

**Interfaces:**
- Consumes: `formatCommodityDisplay(rawName, fallbackCategory, fallbackUnit)` from `customer-pwa/src/app/commodityFormatter.ts`.
- Produces: `resultProductName: string` and `resultIsAboveReference: boolean` for result rendering.

- [ ] **Step 1: Import and derive result presentation values**

Add:

```ts
import { formatCommodityDisplay } from '../app/commodityFormatter';
```

Before rendering, derive:

```ts
const rawResultProductName = comparisonResult?.commodity_name
  || comparisonResult?.product?.commodity_name
  || '';
const resultProductName = formatCommodityDisplay(
  rawResultProductName,
  comparisonResult?.product?.category || '',
  comparisonResult?.package_size || comparisonResult?.unit || comparisonResult?.product?.unit || '',
).title;
const resultIsAboveReference = Boolean(
  comparisonResult
  && (comparisonResult.is_above_reference || comparisonResult.comparison_status === 'ABOVE_SRP')
);
```

- [ ] **Step 2: Render the concise product name**

Replace the raw result expression with:

```tsx
{resultProductName}
```

- [ ] **Step 3: Convert result actions to normal flow**

Replace the fixed footer styles with a normal-flow container:

```tsx
<div
  data-testid="scan-result-actions"
  style={{
    marginTop: '4px',
    padding: '4px 0 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  }}
>
```

Remove `position`, `bottom`, `left`, `right`, `maxWidth`, fixed-layer `zIndex`, and sticky footer border/background styles. Keep each button at least 42 pixels high.

- [ ] **Step 4: Conditionally render receipt reporting**

Wrap the existing report button:

```tsx
{resultIsAboveReference && (
  <button className="btn-primary" onClick={handleReportWithReceipt}>
    Report using receipt
  </button>
)}
```

Keep correction, rescan, and history actions outside this condition.

- [ ] **Step 5: Reduce obsolete result bottom padding**

Change the result page padding from the fixed-footer compensation to navigation-safe spacing:

```ts
paddingBottom: 'calc(96px + env(safe-area-inset-bottom))'
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd test -- --run src/components/ShelfScanner.test.tsx
```

Expected: all scanner component tests pass.

### Task 3: Verify and redeploy production

**Files:**
- Verify: `customer-pwa/src/components/ShelfScanner.tsx`
- Verify: `customer-pwa/src/components/ShelfScanner.test.tsx`

**Interfaces:**
- Consumes: existing linked Vercel project `customer-pwa` and Render service `CAP_DTI`.
- Produces: updated production PWA alias and a fresh Render deployment.

- [ ] **Step 1: Run the full Customer PWA suite serially**

Run:

```powershell
npm.cmd test -- --maxWorkers=1
```

Expected: 19 test files and 84 or more tests pass with zero failures.

- [ ] **Step 2: Build the production PWA**

Run:

```powershell
npm.cmd run build
```

Expected: TypeScript and Vite complete successfully and generate `dist/sw.js`.

- [ ] **Step 3: Deploy Vercel production**

Run from `customer-pwa`:

```powershell
npx.cmd -y vercel@latest --prod --yes
```

Expected: deployment is aliased to `https://customer-pwa-six.vercel.app`.

- [ ] **Step 4: Redeploy the unchanged Render backend**

Trigger one deploy for service `srv-d9iqmt6rnols73fnuhh0` in workspace `tea-d9iqf1v41pts73bl8ac0`, then wait until its status is `live`. Do not modify backend code or environment variables.

- [ ] **Step 5: Smoke-test final production**

Verify:

- PWA home returns HTTP 200;
- the production JavaScript contains `https://cap-dti.onrender.com/api` and not the localhost API URL;
- Render `/up` and `/api/public/establishments` return HTTP 200;
- the installed manifest and service worker return HTTP 200.

No Customer PWA implementation commit is required while its dependency-complete dirty workspace cannot be isolated safely; deploy the verified local tree without staging unrelated files.
