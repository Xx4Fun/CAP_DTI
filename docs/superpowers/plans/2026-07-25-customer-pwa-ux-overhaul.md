# Customer PWA Trust, Accessibility, and Price-Label UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved truth-first, accessible, responsive PRICE-Watch customer PWA with stable routes, complete cross-flow handoffs, honest camera/report failure states, valid PWA packaging, and a distinctive official price-label visual system.

**Architecture:** Add a small typed browser-history layer rather than a routing dependency, move shared state and handoffs into pure tested modules, and introduce bounded UI primitives for dialogs, fields, status, copying, store selection, and price strips. Existing screen components keep responsibility for their workflows, but fabricated fallbacks are removed and camera/report state transitions become explicit and testable.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest, React Testing Library, user-event, jsdom, jest-axe, vanilla CSS, vite-plugin-pwa.

## Global Constraints

- Change only `customer-pwa/`, its customer-PWA documentation, and its tests.
- Formal receipt reporting uses live camera capture only; gallery uploads remain unavailable.
- A report is successful only after the backend confirms it and supplies a real public reference and secret tracking token.
- Use “tamper-evident,” never “tamper-proof.”
- Shelf comparisons are informational and never automatically confirm a violation.
- Receipt information remains subject to human DTI evaluation.
- Unknown configuration displays as unknown, never as normal monitoring.
- Demo fixtures exist only in tests or behind an explicit development-only flag excluded from production behavior.
- Camera images and secret tracking tokens are never persisted in local storage.
- Every production behavior change follows red-green-refactor.
- Preserve existing user changes outside the files explicitly listed by each task.

---

## File Structure

### New production modules

- `customer-pwa/src/app/routing.ts` — typed route parsing, path generation, and browser-history subscription.
- `customer-pwa/src/app/handoffs.ts` — typed session handoff read, consume, and clear behavior.
- `customer-pwa/src/app/status.ts` — regulatory/data-freshness and report-timeline derivation.
- `customer-pwa/src/hooks/useAppRoute.ts` — React adapter for browser-history routing.
- `customer-pwa/src/hooks/useConnectivity.ts` — one online/offline state source.
- `customer-pwa/src/components/ui/Dialog.tsx` — accessible modal semantics and focus lifecycle.
- `customer-pwa/src/components/ui/Field.tsx` — labelled text/password fields with descriptions and errors.
- `customer-pwa/src/components/ui/IconButton.tsx` — labelled minimum-target icon control.
- `customer-pwa/src/components/ui/CopyButton.tsx` — clipboard feedback and live announcement.
- `customer-pwa/src/components/ui/StatusBanner.tsx` — shared offline, unknown, warning, and error notice.
- `customer-pwa/src/components/ui/PriceStrip.tsx` — official price-label signature component.
- `customer-pwa/src/components/StorePicker.tsx` — semantic, searchable, optional recent-store selector.
- `customer-pwa/src/components/CameraShell.tsx` — full-screen safe-area camera frame and exit controls.

### New tests

- `customer-pwa/src/test/setup.ts`
- `customer-pwa/src/app/routing.test.ts`
- `customer-pwa/src/app/handoffs.test.ts`
- `customer-pwa/src/app/status.test.ts`
- `customer-pwa/src/components/ui/Dialog.test.tsx`
- `customer-pwa/src/components/ui/Field.test.tsx`
- `customer-pwa/src/components/ui/CopyButton.test.tsx`
- `customer-pwa/src/components/Navbar.test.tsx`
- `customer-pwa/src/components/Home.test.tsx`
- `customer-pwa/src/components/SrpSearch.test.tsx`
- `customer-pwa/src/components/ShelfScanner.test.tsx`
- `customer-pwa/src/components/FormalReport.test.tsx`
- `customer-pwa/src/components/TrackReport.test.tsx`
- `customer-pwa/src/App.test.tsx`
- `customer-pwa/src/pwa-assets.test.ts`

### Existing files modified

- `customer-pwa/package.json`
- `customer-pwa/package-lock.json`
- `customer-pwa/vite.config.ts`
- `customer-pwa/index.html`
- `customer-pwa/src/App.tsx`
- `customer-pwa/src/index.css`
- `customer-pwa/src/api/client.ts`
- `customer-pwa/src/components/Navbar.tsx`
- `customer-pwa/src/components/Home.tsx`
- `customer-pwa/src/components/OfflineBanner.tsx` — removed after the shared banner replaces it.
- `customer-pwa/src/components/SrpSearch.tsx`
- `customer-pwa/src/components/ProductDetail.tsx`
- `customer-pwa/src/components/ShelfScanner.tsx`
- `customer-pwa/src/components/FormalReport.tsx`
- `customer-pwa/src/components/TrackReport.tsx`
- `customer-pwa/public/*` — generated install assets and optimized brand mark.

---

### Task 1: Test Harness, Typed Routes, Handoffs, and Truthful Status Models

**Files:**
- Modify: `customer-pwa/package.json`
- Modify: `customer-pwa/package-lock.json`
- Modify: `customer-pwa/tsconfig.app.json`
- Create: `customer-pwa/vitest.config.ts`
- Create: `customer-pwa/src/test/setup.ts`
- Create: `customer-pwa/src/app/routing.test.ts`
- Create: `customer-pwa/src/app/handoffs.test.ts`
- Create: `customer-pwa/src/app/status.test.ts`
- Create: `customer-pwa/src/app/routing.ts`
- Create: `customer-pwa/src/app/handoffs.ts`
- Create: `customer-pwa/src/app/status.ts`
- Create: `customer-pwa/src/hooks/useAppRoute.ts`
- Create: `customer-pwa/src/hooks/useConnectivity.ts`

**Interfaces:**
- Produces: `AppRoute`, `parseRoute(pathname)`, `pathFor(route)`, `navigate(route)`, `subscribeToRouteChanges(listener)`.
- Produces: `FlowHandoff`, `writeHandoff`, `peekHandoff`, `consumeHandoff`, `clearHandoff`.
- Produces: `RegulatoryStatus`, `DataFreshness`, `deriveTimelineItems`.
- Produces: `useAppRoute()` and `useConnectivity()`.

- [ ] **Step 1: Install and configure the test runner**

Run:

```powershell
npm.cmd install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-axe @types/jest-axe
```

Update scripts and add a dedicated Vitest configuration:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "test": "vitest run",
    "test:watch": "vitest",
    "preview": "vite preview"
  }
}
```

```ts
// vitest.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
});
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});
```

Exclude tests from the production TypeScript build:

```json
{
  include: [src],
  exclude: [src/**/*.test.ts, src/**/*.test.tsx, src/test]
}
```

- [ ] **Step 2: Write failing pure-module tests**

```ts
// src/app/routing.test.ts
import { describe, expect, it } from 'vitest';
import { parseRoute, pathFor } from './routing';

describe('routing', () => {
  it('parses a product detail URL', () => {
    expect(parseRoute('/prices/42')).toEqual({ name: 'product', commodityId: 42 });
  });

  it('falls back to home for unknown paths', () => {
    expect(parseRoute('/not-a-screen')).toEqual({ name: 'home' });
  });

  it('generates stable report paths', () => {
    expect(pathFor({ name: 'new-report' })).toBe('/reports/new');
    expect(pathFor({ name: 'track-report' })).toBe('/reports/track');
  });
});
```

```ts
// src/app/handoffs.test.ts
import { expect, it } from 'vitest';
import { consumeHandoff, peekHandoff, writeHandoff } from './handoffs';

it('consumes a handoff exactly once', () => {
  writeHandoff({
    kind: 'scan-to-report',
    storeId: 5,
    commodityId: 8,
    displayedPrice: 24.5,
    baselinePrice: 22,
  });

  expect(peekHandoff()?.kind).toBe('scan-to-report');
  expect(consumeHandoff()?.kind).toBe('scan-to-report');
  expect(consumeHandoff()).toBeNull();
});
```

```ts
// src/app/status.test.ts
import { expect, it } from 'vitest';
import { describeRegulatoryStatus, deriveTimelineItems } from './status';

it('describes unavailable regulatory state without claiming normal monitoring', () => {
  expect(describeRegulatoryStatus({ kind: 'unavailable', reason: 'offline' }))
    .toBe('Regulatory status unavailable');
});

it('never marks the current timeline item completed', () => {
  const result = deriveTimelineItems([
    { status: 'Submitted', public_message: 'Received', timestamp: '2026-07-25' },
    { status: 'Under Evaluation', public_message: 'Reviewing', timestamp: '2026-07-26' },
  ], 'Under Evaluation');

  expect(result).toEqual([
    expect.objectContaining({ state: 'completed' }),
    expect.objectContaining({ state: 'current' }),
  ]);
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/app/routing.test.ts src/app/handoffs.test.ts src/app/status.test.ts
```

Expected: FAIL because `routing.ts`, `handoffs.ts`, and `status.ts` do not exist.

- [ ] **Step 4: Implement the pure modules and hooks**

```ts
// src/app/routing.ts
export type AppRoute =
  | { name: 'home' }
  | { name: 'prices' }
  | { name: 'product'; commodityId: number }
  | { name: 'scan' }
  | { name: 'reports' }
  | { name: 'new-report' }
  | { name: 'track-report' };

export function parseRoute(pathname: string): AppRoute {
  const product = pathname.match(/^\/prices\/(\d+)\/?$/);
  if (product) return { name: 'product', commodityId: Number(product[1]) };
  if (pathname === '/prices') return { name: 'prices' };
  if (pathname === '/scan') return { name: 'scan' };
  if (pathname === '/reports/new') return { name: 'new-report' };
  if (pathname === '/reports/track') return { name: 'track-report' };
  if (pathname === '/reports') return { name: 'reports' };
  return { name: 'home' };
}

export function pathFor(route: AppRoute): string {
  if (route.name === 'product') return `/prices/${route.commodityId}`;
  const paths: Record<Exclude<AppRoute['name'], 'product'>, string> = {
    home: '/',
    prices: '/prices',
    scan: '/scan',
    reports: '/reports',
    'new-report': '/reports/new',
    'track-report': '/reports/track',
  };
  return paths[route.name];
}

export function navigate(route: AppRoute, replace = false): void {
  if (replace) history.replaceState(null, '', pathFor(route));
  else history.pushState(null, '', pathFor(route));
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function subscribeToRouteChanges(listener: () => void): () => void {
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
```

```ts
// src/app/handoffs.ts
const KEY = 'price-watch-flow-handoff';

export type FlowHandoff =
  | { kind: 'price-to-scan'; commodityId: number }
  | { kind: 'price-to-report'; commodityId: number }
  | {
      kind: 'scan-to-report';
      storeId: number;
      commodityId: number;
      displayedPrice: number;
      baselinePrice: number;
    };

export function writeHandoff(value: FlowHandoff): void {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}

export function peekHandoff(): FlowHandoff | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlowHandoff;
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function clearHandoff(): void {
  sessionStorage.removeItem(KEY);
}

export function consumeHandoff(): FlowHandoff | null {
  const value = peekHandoff();
  clearHandoff();
  return value;
}
```

```ts
// src/app/status.ts
import type { StatusHistoryItem, SystemConfig } from '../api/client';

export type RegulatoryStatus =
  | { kind: 'loading' }
  | { kind: 'available'; config: SystemConfig }
  | { kind: 'unavailable'; reason: 'offline' | 'request-failed' };

export type DataFreshness =
  | { kind: 'live'; updatedAt: string }
  | { kind: 'cached'; savedAt: string | null }
  | { kind: 'bundled'; effectiveDate: string | null };

export type TimelineItem = StatusHistoryItem & {
  state: 'completed' | 'current' | 'upcoming';
};

export function describeRegulatoryStatus(status: RegulatoryStatus): string {
  if (status.kind !== 'available') return 'Regulatory status unavailable';
  return status.config.state_of_calamity ? 'Price freeze active' : 'Normal monitoring';
}

export function deriveTimelineItems(
  historyItems: StatusHistoryItem[],
  currentStatus: string,
): TimelineItem[] {
  const currentIndex = Math.max(
    0,
    historyItems.findIndex((item) => item.status === currentStatus),
  );
  return historyItems.map((item, index) => ({
    ...item,
    state: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming',
  }));
}
```

```ts
// src/hooks/useAppRoute.ts
import { useSyncExternalStore } from 'react';
import { parseRoute, subscribeToRouteChanges } from '../app/routing';

export function useAppRoute() {
  const pathname = useSyncExternalStore(
    subscribeToRouteChanges,
    () => window.location.pathname,
    () => '/',
  );
  return parseRoute(pathname);
}
```

```ts
// src/hooks/useConnectivity.ts
import { useEffect, useState } from 'react';

export function useConnectivity(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/app/routing.test.ts src/app/handoffs.test.ts src/app/status.test.ts
npm.cmd run lint
```

Expected: all focused tests pass and no new warnings originate from the new modules.

Commit:

```powershell
git add customer-pwa/package.json customer-pwa/package-lock.json customer-pwa/tsconfig.app.json customer-pwa/vitest.config.ts customer-pwa/src/test customer-pwa/src/app customer-pwa/src/hooks
git commit -m "test(customer-pwa): add typed UX state foundations"
```

---

### Task 2: Accessible UI Primitives and PRICE-Watch Design Tokens

**Files:**
- Create: `customer-pwa/src/components/ui/Dialog.test.tsx`
- Create: `customer-pwa/src/components/ui/Field.test.tsx`
- Create: `customer-pwa/src/components/ui/CopyButton.test.tsx`
- Create: `customer-pwa/src/components/ui/Dialog.tsx`
- Create: `customer-pwa/src/components/ui/Field.tsx`
- Create: `customer-pwa/src/components/ui/IconButton.tsx`
- Create: `customer-pwa/src/components/ui/CopyButton.tsx`
- Create: `customer-pwa/src/components/ui/StatusBanner.tsx`
- Create: `customer-pwa/src/components/ui/PriceStrip.tsx`
- Modify: `customer-pwa/src/index.css`

**Interfaces:**
- Produces: `Dialog`, `Field`, `PasswordField`, `IconButton`, `CopyButton`, `StatusBanner`, and `PriceStrip`.
- Consumes: `DataFreshness` from Task 1 for source labels where needed.

- [ ] **Step 1: Write failing accessibility tests**

```tsx
// src/components/ui/Dialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

it('labels the dialog, closes on Escape, and restores focus', async () => {
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <>
      <button>Open dialog</button>
      <Dialog open title="Privacy notice" onClose={onClose}>
        <button>Continue</button>
      </Dialog>
    </>,
  );

  expect(screen.getByRole('dialog', { name: 'Privacy notice' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
});
```

```tsx
// src/components/ui/Field.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Field } from './Field';

it('links its label, description, and error to the input', () => {
  render(<Field id="reference" label="Report reference" description="From your confirmation" error="Reference is required" />);
  const input = screen.getByRole('textbox', { name: 'Report reference' });
  expect(input).toHaveAccessibleDescription('From your confirmation Reference is required');
  expect(input).toHaveAttribute('aria-invalid', 'true');
});
```

```tsx
// src/components/ui/CopyButton.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CopyButton } from './CopyButton';

it('shows visible copy confirmation', async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<CopyButton value="REP-123" label="Copy report reference" />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy report reference' }));
  expect(screen.getByText('Copied')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/ui/Dialog.test.tsx src/components/ui/Field.test.tsx src/components/ui/CopyButton.test.tsx
```

Expected: FAIL because the UI modules do not exist.

- [ ] **Step 3: Implement the accessible primitives**

Implement `Dialog` with a labelled `role="dialog"`, `aria-modal`, initial focus on the first interactive element, Tab wrapping, Escape handling, body scroll locking, and restoration to `document.activeElement` captured when opened.

Implement `Field` with this public contract:

```tsx
export interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  description?: string;
  error?: string;
}

export function Field({ id, label, description, error, ...input }: FieldProps) {
  const descriptionIds = [
    description ? `${id}-description` : '',
    error ? `${id}-error` : '',
  ].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {description && <p id={`${id}-description`} className="field__description">{description}</p>}
      <input
        {...input}
        id={id}
        className="input-field"
        aria-describedby={descriptionIds}
        aria-invalid={error ? 'true' : undefined}
      />
      {error && <p id={`${id}-error`} className="field__error">{error}</p>}
    </div>
  );
}
```

Implement `PasswordField` as a `Field` wrapper with a 44px Show/Hide button. Implement `CopyButton` with clipboard rejection feedback, visible “Copied” or “Copy failed” text, and a polite live region. Implement `IconButton` with required `label`, `type="button"`, and `className="icon-button"`.

Implement `StatusBanner` variants `info | warning | error | success | offline` with `role="status"` for informational updates and `role="alert"` for errors.

Implement `PriceStrip` with:

```ts
interface PriceStripProps {
  eyebrow: string;
  title: string;
  price?: number;
  status: string;
  sourceLabel: string;
  tone?: 'default' | 'warning' | 'danger';
}
```

- [ ] **Step 4: Replace global CSS with the approved token system**

Define:

```css
:root {
  --ink: #102a43;
  --brand: #1557b0;
  --brand-strong: #0d438f;
  --price-tag: #f2c14e;
  --paper: #f6f8fb;
  --surface: #ffffff;
  --success: #13795b;
  --danger: #b42318;
  --muted: #52677d;
  --border: #cbd5df;
  --focus: #0b6bcb;
  --font-body: "Atkinson Hyperlegible", "Segoe UI", sans-serif;
  --font-display: "Barlow Semi Condensed", "Arial Narrow", sans-serif;
  --font-data: "IBM Plex Mono", "Cascadia Mono", monospace;
}

:focus-visible {
  outline: 3px solid var(--focus);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Add component classes for the primitives. Use 44px minimum icon targets, accessible small-text colors, safe-area variables, and responsive application widths of 600px, 840px, and 960px.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/components/ui
npm.cmd run lint
```

Commit:

```powershell
git add customer-pwa/src/components/ui customer-pwa/src/index.css
git commit -m "feat(customer-pwa): add accessible price-label design system"
```

---

### Task 3: Browser-Backed Application Shell and Non-Duplicated Navigation

**Files:**
- Create: `customer-pwa/src/App.test.tsx`
- Create: `customer-pwa/src/components/Navbar.test.tsx`
- Modify: `customer-pwa/src/App.tsx`
- Modify: `customer-pwa/src/components/Navbar.tsx`
- Delete: `customer-pwa/src/components/OfflineBanner.tsx`

**Interfaces:**
- Consumes: routing, regulatory status, `useConnectivity`, `StatusBanner`, and `Dialog`.
- Produces: stable route rendering and route-aware primary navigation.

- [ ] **Step 1: Write failing shell tests**

```tsx
// src/components/Navbar.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Navbar } from './Navbar';

it('marks the current primary destination and keeps secondary menu free of duplicates', () => {
  render(<Navbar activeRoute={{ name: 'prices' }} onNavigate={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Prices' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getAllByRole('button', { name: 'Prices' })).toHaveLength(1);
});
```

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./api/client', async () => {
  const actual = await vi.importActual<typeof import('./api/client')>('./api/client');
  return {
    ...actual,
    apiClient: {
      get: vi.fn().mockRejectedValue(new Error('offline')),
      post: vi.fn(),
    },
  };
});

it('shows unknown regulatory status when configuration fails', async () => {
  history.replaceState(null, '', '/');
  render(<App />);
  expect(await screen.findByText(/regulatory status unavailable/i)).toBeInTheDocument();
  expect(screen.queryByText(/normal monitoring/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/App.test.tsx src/components/Navbar.test.tsx
```

Expected: FAIL because the shell still accepts string tabs and treats failed configuration as false.

- [ ] **Step 3: Implement route-driven shell**

Change `App` to:

- read `useAppRoute()`;
- fetch configuration into `RegulatoryStatus`;
- render one connectivity/status banner;
- navigate through `navigate(route)`;
- render `ProductDetail` using the product route ID;
- use `/reports/new` and `/reports/track` directly;
- put `id="main-content"` on `<main>`;
- add a skip link before the header.

Use this route mapping:

```ts
const primaryRouteName = {
  home: 'home',
  prices: 'prices',
  product: 'prices',
  scan: 'scan',
  reports: 'reports',
  'new-report': 'reports',
  'track-report': 'reports',
} as const;
```

Change `Navbar` props to:

```ts
interface NavbarProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}
```

The bottom bar contains only Home, Prices, Scan, and Reports. The menu contains How it works, Privacy, About PRICE-Watch, and a disabled language-readiness row labelled “Filipino language support — planned,” not a nonfunctional toggle.

The menu button exposes `aria-expanded`, `aria-controls="secondary-menu"`, and uses the shared Dialog on narrow screens.

- [ ] **Step 4: Verify GREEN and route behavior**

Run:

```powershell
npm.cmd test -- src/App.test.tsx src/components/Navbar.test.tsx src/app/routing.test.ts
npm.cmd run lint
```

Manually exercise Back/Forward by invoking `navigate({ name: 'prices' })`, then `history.back()` in a focused test and asserting the Home heading returns.

- [ ] **Step 5: Commit**

```powershell
git add customer-pwa/src/App.tsx customer-pwa/src/App.test.tsx customer-pwa/src/components/Navbar.tsx customer-pwa/src/components/Navbar.test.tsx customer-pwa/src/components/OfflineBanner.tsx
git commit -m "feat(customer-pwa): add browser-backed accessible navigation"
```

---

### Task 4: Home, Price Directory, and Product Detail Journey

**Files:**
- Create: `customer-pwa/src/components/Home.test.tsx`
- Create: `customer-pwa/src/components/SrpSearch.test.tsx`
- Modify: `customer-pwa/src/components/Home.tsx`
- Modify: `customer-pwa/src/components/SrpSearch.tsx`
- Modify: `customer-pwa/src/components/ProductDetail.tsx`

**Interfaces:**
- Consumes: `PriceStrip`, `Field`, typed routes, data freshness, and handoff helpers.
- Produces: direct search, truthful bulletin state, real filters/sort, semantic product rows, and product-to-flow handoffs.

- [ ] **Step 1: Write failing Home journey tests**

```tsx
// src/components/Home.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { Home } from './Home';

it('sends a home search directly to the price directory', async () => {
  const onNavigate = vi.fn();
  render(<Home onNavigate={onNavigate} regulatoryStatus={{ kind: 'unavailable', reason: 'request-failed' }} />);
  await userEvent.type(screen.getByRole('searchbox', { name: /product price/i }), 'sardines');
  await userEvent.keyboard('{Enter}');
  expect(sessionStorage.getItem('price-watch-search')).toBe('sardines');
  expect(onNavigate).toHaveBeenCalledWith({ name: 'prices' });
});

it('opens tracking directly', async () => {
  const onNavigate = vi.fn();
  render(<Home onNavigate={onNavigate} regulatoryStatus={{ kind: 'loading' }} />);
  await userEvent.click(screen.getByRole('button', { name: /track an existing report/i }));
  expect(onNavigate).toHaveBeenCalledWith({ name: 'track-report' });
});
```

- [ ] **Step 2: Write failing price behavior tests**

```tsx
// src/components/SrpSearch.test.tsx
it('filters basic necessities and resets all filters', async () => {
  render(<SrpSearch onNavigate={vi.fn()} regulatoryStatus={{ kind: 'loading' }} initialItems={fixtures} />);
  await userEvent.click(screen.getByRole('button', { name: 'Basic necessities' }));
  expect(screen.getByText('Sardines 155g')).toBeInTheDocument();
  expect(screen.queryByText('Coffee 50g')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  expect(screen.getByText('Coffee 50g')).toBeInTheDocument();
});

it('writes the selected commodity handoff before scanning', async () => {
  render(<SrpSearch onNavigate={onNavigate} regulatoryStatus={{ kind: 'loading' }} initialItems={fixtures} />);
  await userEvent.click(screen.getByRole('button', { name: /sardines 155g/i }));
  await userEvent.click(screen.getByRole('button', { name: /scan shelf price/i }));
  expect(peekHandoff()).toEqual({ kind: 'price-to-scan', commodityId: 1 });
});
```

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/Home.test.tsx src/components/SrpSearch.test.tsx
```

Expected: FAIL because Home has no search form/direct tracking route and the price controls/handoffs use the old tab/session keys.

- [ ] **Step 4: Implement the journey**

Rebuild Home with:

- a search form labelled “Search for a product price”;
- `PriceStrip` using real available, loading, or unavailable status;
- semantic Scan, Report, and Track buttons;
- a real How it works disclosure;
- popular-category buttons that write `price-watch-search`.

In `SrpSearch`:

- use a labelled search field;
- keep category state as the only classification filter;
- replace cycling sort with `<select aria-label="Sort prices">`;
- calculate the filter count only from active user choices;
- show Reset only when filters or sort differ from defaults;
- render skeleton rows with `aria-busy` during loading;
- render semantic `<button className="product-card">` rows;
- allow product names to wrap to two lines;
- use `DataFreshness` rather than hard-coded times.

In `ProductDetail`:

- load by `commodityId`;
- use `PriceStrip`;
- use API dates only, with “Date unavailable” fallback;
- add `aria-expanded` and `aria-controls` to the price-freeze disclosure;
- write `price-to-scan` or `price-to-report` handoffs before navigation.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/components/Home.test.tsx src/components/SrpSearch.test.tsx src/app/handoffs.test.ts
npm.cmd run lint
```

Commit:

```powershell
git add customer-pwa/src/components/Home.tsx customer-pwa/src/components/Home.test.tsx customer-pwa/src/components/SrpSearch.tsx customer-pwa/src/components/SrpSearch.test.tsx customer-pwa/src/components/ProductDetail.tsx
git commit -m "feat(customer-pwa): connect home and price-check journeys"
```

---

### Task 5: Real Store Selection and Recoverable Shelf Scanner

**Files:**
- Create: `customer-pwa/src/components/StorePicker.tsx`
- Create: `customer-pwa/src/components/CameraShell.tsx`
- Create: `customer-pwa/src/components/ShelfScanner.test.tsx`
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`

**Interfaces:**
- Consumes: `FlowHandoff`, `Dialog`, `Field`, `IconButton`, `PriceStrip`, and typed navigation.
- Produces: `StorePicker` and `CameraShell` shared later by Formal Report.

- [ ] **Step 1: Write failing scanner trust tests**

```tsx
// src/components/ShelfScanner.test.tsx
it('does not present a fabricated recently used store', () => {
  render(<ShelfScanner onNavigate={vi.fn()} establishments={stores} />);
  expect(screen.queryByText(/recently used/i)).not.toBeInTheDocument();
});

it('closes the full-screen camera and stops every media track', async () => {
  const stop = vi.fn();
  mockGetUserMedia({ getTracks: () => [{ stop }] } as unknown as MediaStream);
  render(<ShelfScanner onNavigate={vi.fn()} establishments={stores} />);
  await userEvent.click(screen.getByRole('button', { name: /select super metro/i }));
  await userEvent.click(screen.getByRole('button', { name: /continue to camera/i }));
  await userEvent.click(screen.getByRole('button', { name: /close camera/i }));
  expect(stop).toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: /choose the store/i })).toBeInTheDocument();
});

it('offers retry and manual entry when camera access fails', async () => {
  mockGetUserMediaRejected(new DOMException('Denied', 'NotAllowedError'));
  render(<ShelfScanner onNavigate={vi.fn()} establishments={stores} />);
  await openCamera();
  expect(await screen.findByRole('button', { name: /retry camera/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /enter details manually/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /capture shelf tag/i })).toBeDisabled();
});

it('shows no torch control when the camera does not expose torch capability', async () => {
  mockVideoTrackCapabilities({});
  render(<ShelfScanner onNavigate={vi.fn()} establishments={stores} />);
  await openCamera();
  expect(screen.queryByRole('button', { name: /flash/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/ShelfScanner.test.tsx
```

Expected: FAIL because a default store is marked recent, the camera has no close control, and error/torch behavior is not capability-driven.

- [ ] **Step 3: Implement `StorePicker` and `CameraShell`**

`StorePicker` props:

```ts
interface StorePickerProps {
  stores: Establishment[];
  selectedId: number | null;
  recentStoreId?: number | null;
  onSelect: (store: Establishment) => void;
  title: string;
}
```

It renders a labelled search field, optional real recent-store shortcut, semantic radio-like store buttons with `aria-pressed`, and a useful no-results state. Do not show Nearby until geolocation and actual distance sorting are implemented; remove the nonfunctional chip from this scope.

`CameraShell` props:

```ts
interface CameraShellProps {
  title: string;
  subtitle: string;
  stream: MediaStream | null;
  error: string | null;
  canCapture: boolean;
  torchSupported: boolean;
  torchOn: boolean;
  onClose: () => void;
  onRetry: () => void;
  onManualEntry: () => void;
  onToggleTorch: () => void;
  onSwitchCamera: () => void;
  onCapture: () => void;
}
```

It uses a full-screen `role="region"` labelled by its title, safe-area padding, a 44px Close button, a disabled shutter without a stream, and recovery controls.

- [ ] **Step 4: Refactor the scanner state machine**

- Initialize selected and recent stores as `null`.
- Read `price-to-scan` handoff and preselect its commodity candidate.
- Keep a real recent store only for the current session.
- Stop tracks on Close, Back, state exit, facing-mode changes, and unmount.
- Query `MediaStreamTrack.getCapabilities()` and show torch only when supported.
- Call `track.applyConstraints({ advanced: [{ torch: next }] })` only on a compatible track.
- Replace `alert()` with linked inline field errors.
- Add manual product selection/search after OCR failure.
- Write `scan-to-report` handoff with real store and commodity IDs.
- Use `PriceStrip` for the comparison and label Shelf price, DTI reference, and Difference.
- Keep the legal informational notice directly below the comparison.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/components/ShelfScanner.test.tsx src/app/handoffs.test.ts
npm.cmd run lint
```

Commit:

```powershell
git add customer-pwa/src/components/StorePicker.tsx customer-pwa/src/components/CameraShell.tsx customer-pwa/src/components/ShelfScanner.tsx customer-pwa/src/components/ShelfScanner.test.tsx
git commit -m "feat(customer-pwa): make shelf scanning truthful and recoverable"
```

---

### Task 6: Server-Confirmed Formal Receipt Reporting

**Files:**
- Create: `customer-pwa/src/components/FormalReport.test.tsx`
- Modify: `customer-pwa/src/components/FormalReport.tsx`
- Modify: `customer-pwa/src/api/client.ts`

**Interfaces:**
- Consumes: `StorePicker`, `CameraShell`, `Dialog`, fields, handoffs, and typed navigation.
- Produces: formal-report state transitions in which only backend success reaches confirmation.

- [ ] **Step 1: Write failing report integrity tests**

```tsx
// src/components/FormalReport.test.tsx
it('does not fabricate a capture session when the request fails', async () => {
  apiClient.post.mockRejectedValueOnce(new Error('offline'));
  render(<FormalReport onNavigate={vi.fn()} establishments={stores} />);
  await beginReportAndSelectStore();
  expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't start secure receipt capture/i);
  expect(screen.queryByRole('button', { name: /open camera/i })).not.toBeInTheDocument();
});

it('does not create a receipt image when camera access fails', async () => {
  mockGetUserMediaRejected(new DOMException('Denied', 'NotAllowedError'));
  render(<FormalReport onNavigate={vi.fn()} establishments={stores} />);
  await reachCamera();
  expect(await screen.findByText(/camera access is blocked/i)).toBeInTheDocument();
  expect(screen.queryByAltText(/captured receipt/i)).not.toBeInTheDocument();
});

it('keeps the review visible and states that nothing was filed when submission fails', async () => {
  apiClient.post.mockRejectedValueOnce(new Error('submit failed'));
  render(<FormalReport onNavigate={vi.fn()} establishments={stores} />);
  await reachReviewWithRealBlob();
  await userEvent.click(screen.getByRole('checkbox', { name: /receipt i intend to submit/i }));
  await userEvent.click(screen.getByRole('button', { name: /submit receipt/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was filed/i);
  expect(screen.queryByText(/report has been received/i)).not.toBeInTheDocument();
});

it('uses tamper-evident terminology in the privacy notice', async () => {
  render(<FormalReport onNavigate={vi.fn()} establishments={stores} />);
  await userEvent.click(screen.getByRole('button', { name: /before you report/i }));
  expect(screen.getByText(/tamper-evident/i)).toBeInTheDocument();
  expect(screen.queryByText(/tamper-proof/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/FormalReport.test.tsx
```

Expected: FAIL because the current component fabricates capture sessions, receipt images, OCR fields, and successful report references.

- [ ] **Step 3: Replace fabricated behavior with explicit error states**

Refactor report state to:

```ts
type ReportView =
  | 'dashboard'
  | 'privacy'
  | 'select-store'
  | 'capture-guidance'
  | 'camera'
  | 'review'
  | 'submitting'
  | 'confirmation';

type AsyncError = {
  operation: 'capture-session' | 'camera' | 'submission';
  message: string;
};
```

Rules:

- `startCaptureSession` sets capture-session error on rejection and does not open guidance.
- `startCamera` sets camera error and does not generate canvas content.
- `captureLiveFrame` returns without a real ready video frame.
- OCR fields begin empty or use real server-provided data; no default sardines, receipt number, line count, or “Full receipt detected.”
- `submitFormalReport` moves to confirmation only inside the real success branch.
- On failure it returns to review, preserves the in-memory blob, and shows “We couldn’t submit your report. Nothing was filed.”
- All Back/Close paths stop the stream.
- Consume a matching `price-to-report` or `scan-to-report` handoff and show a removable Starting with summary.
- Consolidate dashboard education into an accessible “Before you report” disclosure.
- Use shared Dialog for privacy and capture guidance.
- Use `CameraShell` for receipt capture.
- Change all user-facing and canvas wording to “tamper-evident.”

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd test -- src/components/FormalReport.test.tsx src/components/ui/Dialog.test.tsx src/app/handoffs.test.ts
npm.cmd run lint
```

Expected: formal-report tests pass and no production code contains `tamper-proof` case-insensitively:

```powershell
rg -n -i "tamper-proof" src
```

Expected: no matches.

- [ ] **Step 5: Commit**

```powershell
git add customer-pwa/src/components/FormalReport.tsx customer-pwa/src/components/FormalReport.test.tsx customer-pwa/src/api/client.ts
git commit -m "fix(customer-pwa): require server-confirmed receipt reports"
```

---

### Task 7: Private Tracking Without Mock Results

**Files:**
- Create: `customer-pwa/src/components/TrackReport.test.tsx`
- Modify: `customer-pwa/src/components/TrackReport.tsx`

**Interfaces:**
- Consumes: `Field`, `PasswordField`, `CopyButton`, `StatusBanner`, `deriveTimelineItems`, and typed navigation.
- Produces: accessible tracking form and backend-derived timeline.

- [ ] **Step 1: Write failing tracking tests**

```tsx
// src/components/TrackReport.test.tsx
it('shows an error and no timeline when the tracking request fails', async () => {
  apiClient.get.mockRejectedValueOnce({ response: { data: { message: 'No matching report' } } });
  render(<TrackReport onNavigate={vi.fn()} />);
  await fillCredentials('REP-20260725-A8F2', 'trk_secret');
  await userEvent.click(screen.getByRole('button', { name: /track report/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No matching report');
  expect(screen.queryByText(/field inspection dispatched/i)).not.toBeInTheDocument();
});

it('reveals and hides the secret token', async () => {
  render(<TrackReport onNavigate={vi.fn()} />);
  const token = screen.getByLabelText('Secret tracking token');
  expect(token).toHaveAttribute('type', 'password');
  await userEvent.click(screen.getByRole('button', { name: /show secret tracking token/i }));
  expect(token).toHaveAttribute('type', 'text');
});

it('marks only the backend current status as current', async () => {
  apiClient.get.mockResolvedValueOnce({ data: { success: true, data: trackingFixture } });
  render(<TrackReport onNavigate={vi.fn()} />);
  await submitCredentials();
  expect(await screen.findByText('Under Evaluation')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByText('Submitted').closest('.timeline-item')).toHaveClass('is-completed');
});
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
npm.cmd test -- src/components/TrackReport.test.tsx
```

Expected: FAIL because requests beginning with `PW-` or `REP-` currently produce a mock timeline and the token field has no reveal control.

- [ ] **Step 3: Implement truthful accessible tracking**

- Delete the mock response branch.
- Use linked `Field` and `PasswordField`.
- Add Paste only when `navigator.clipboard.readText` exists; handle permission rejection with inline feedback.
- Use `StatusBanner variant="error"` for failed tracking.
- Use `CopyButton` for the reference.
- Map `deriveTimelineItems(report.status_history, report.current_status)`.
- Apply `aria-current="step"` only to the current item.
- Use completed/current/upcoming classes and text labels so color is not the only indicator.
- Navigate Back to `/reports`.

- [ ] **Step 4: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/components/TrackReport.test.tsx src/app/status.test.ts src/components/ui/CopyButton.test.tsx
npm.cmd run lint
```

Commit:

```powershell
git add customer-pwa/src/components/TrackReport.tsx customer-pwa/src/components/TrackReport.test.tsx
git commit -m "fix(customer-pwa): show only verified report tracking data"
```

---

### Task 8: Responsive Finish, Valid PWA Assets, Metadata, and Final Accessibility Pass

**Files:**
- Create: `customer-pwa/src/pwa-assets.test.ts`
- Modify: `customer-pwa/index.html`
- Modify: `customer-pwa/vite.config.ts`
- Modify: `customer-pwa/src/index.css`
- Modify: `customer-pwa/public/favicon.svg`
- Create: `customer-pwa/public/favicon.ico`
- Create: `customer-pwa/public/apple-touch-icon.png`
- Create: `customer-pwa/public/pwa-192x192.png`
- Create: `customer-pwa/public/pwa-512x512.png`
- Create: `customer-pwa/public/pwa-maskable-512x512.png`
- Create: `customer-pwa/public/brand-mark.webp`

**Interfaces:**
- Consumes: all screens and shared components.
- Produces: valid install packaging and final 320/390/768/1280 responsive behavior.

- [ ] **Step 1: Write failing packaging test**

```ts
// src/pwa-assets.test.ts
import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const publicDir = resolve(process.cwd(), 'public');

describe('install assets', () => {
  for (const file of [
    'favicon.ico',
    'apple-touch-icon.png',
    'pwa-192x192.png',
    'pwa-512x512.png',
    'pwa-maskable-512x512.png',
    'brand-mark.webp',
  ]) {
    it(`ships ${file}`, async () => {
      await expect(access(resolve(publicDir, file))).resolves.toBeUndefined();
    });
  }

  it('keeps the rendered brand mark below 100 KB', async () => {
    const info = await stat(resolve(publicDir, 'brand-mark.webp'));
    expect(info.size).toBeLessThan(100_000);
  });
});
```

- [ ] **Step 2: Run the packaging test and verify RED**

Run:

```powershell
npm.cmd test -- src/pwa-assets.test.ts
```

Expected: FAIL because the install assets and optimized mark do not exist.

- [ ] **Step 3: Generate and wire valid assets**

Use the installed ImageMagick executable and the existing approved `public/logo_icon.png` as the source. Trim surrounding whitespace, preserve aspect ratio, center the mark, and add safe square padding:

```powershell
magick public/logo_icon.png -trim +repage -resize 152x152 -gravity center -background none -extent 192x192 public/pwa-192x192.png
magick public/logo_icon.png -trim +repage -resize 408x408 -gravity center -background none -extent 512x512 public/pwa-512x512.png
magick public/logo_icon.png -trim +repage -resize 328x328 -gravity center -background '#1557b0' -extent 512x512 public/pwa-maskable-512x512.png
magick public/logo_icon.png -trim +repage -resize 180x180 -gravity center -background '#f6f8fb' -extent 180x180 public/apple-touch-icon.png
magick public/logo_icon.png -trim +repage -resize 64x64 -gravity center -background none -extent 64x64 public/favicon.ico
magick public/logo_icon.png -trim +repage -resize 96x96 -quality 86 public/brand-mark.webp
```

Open the generated 192px, maskable 512px, Apple touch, and 96px brand assets and verify the approved mark remains legible and undistorted.

Update manifest icons to:

```ts
icons: [
  { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
  { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
],
```

Remove the forced portrait orientation. Include only assets that exist. Change the header to use `/brand-mark.webp`.

Update `index.html`:

```html
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="theme-color" content="#1557b0" />
    <meta name="description" content="Check DTI reference prices, compare shelf prices, and submit receipt concerns for evaluation." />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>PRICE-Watch | DTI Consumer Price Guide</title>
  </head>
</html>
```

- [ ] **Step 4: Complete responsive and accessibility CSS**

Required observable layout rules:

```css
.app-container {
  width: min(100% - 2rem, 960px);
  margin-inline: auto;
  padding-bottom: calc(5.5rem + env(safe-area-inset-bottom));
}

.nav-bottom {
  min-height: 64px;
  padding-bottom: env(safe-area-inset-bottom);
}

@media (max-width: 359px) {
  .home-primary-actions,
  .product-actions {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 600px) {
  .home-layout,
  .report-dashboard-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 0.65fr);
    gap: 1.5rem;
  }

  .product-list,
  .store-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 900px) {
  .nav-bottom {
    left: 50%;
    width: min(100% - 2rem, 960px);
    transform: translateX(-50%);
    border-inline: 1px solid var(--border);
  }
}
```

Confirm all old inline colors that conflict with the approved tokens are removed from the primary screens. Remove unused Vite demo CSS and assets.

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
npm.cmd test -- src/pwa-assets.test.ts
npm.cmd run lint
npm.cmd run build
```

Confirm built assets:

```powershell
Get-ChildItem dist -Recurse -File | Where-Object Name -Match 'pwa|apple-touch|favicon|brand-mark'
```

Commit:

```powershell
git add customer-pwa/index.html customer-pwa/vite.config.ts customer-pwa/src/index.css customer-pwa/src/components/Navbar.tsx customer-pwa/public customer-pwa/src/pwa-assets.test.ts customer-pwa/src/assets
git commit -m "feat(customer-pwa): finish responsive installable price-label UI"
```

---

### Task 9: Full Verification and Requirement Audit

**Files:**
- Modify only files needed to correct failures exposed by verification.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: fresh evidence for every completion claim.

- [ ] **Step 1: Run the complete automated suite**

Run:

```powershell
npm.cmd test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run static verification**

Run:

```powershell
npm.cmd run lint
npm.cmd run build
```

Expected: both commands exit 0. Existing fallback-data escape warnings must be separated from changed application warnings; changed application files must be warning-free.

- [ ] **Step 3: Run trust and terminology scans**

Run:

```powershell
rg -n -i "tamper-proof|mock response|fallback response generator|realistic canvas fallback|PW-2026-00184|Current · Updated 3:21 PM|24 Jul 2026, 3:21 PM|Full receipt detected|Lighting looks good" src
```

Expected: no production matches.

Run:

```powershell
rg -n "onClick=" src/components
```

Inspect every match and verify the handler is on a semantic button/link or a deliberately interactive accessible component.

- [ ] **Step 4: Verify route and handoff requirements**

Run the focused suites:

```powershell
npm.cmd test -- src/app/routing.test.ts src/app/handoffs.test.ts src/App.test.tsx
```

Confirm `/`, `/prices`, `/prices/:id`, `/scan`, `/reports`, `/reports/new`, and `/reports/track` are all represented by tests and route code.

- [ ] **Step 5: Verify viewport and keyboard behavior**

Start the preview:

```powershell
npm.cmd run build
npm.cmd run preview -- --host 127.0.0.1
```

At 320px, 390px, 768px, and 1280px verify:

- no horizontal scrolling;
- primary actions do not overlap;
- bottom navigation clears safe-area/content;
- camera Close and shutter controls remain visible;
- review submit controls do not cover content;
- product/store layouts change at defined breakpoints.

Keyboard-only verify:

- skip link;
- four primary navigation buttons;
- Home search;
- Price filters/sort/product selection;
- dialogs and Escape;
- report credential fields and secret reveal;
- visible focus on every control.

- [ ] **Step 6: Verify failure paths**

With rejected API and media fixtures, confirm the focused tests prove:

- config failure shows unavailable, not normal;
- camera denial creates no evidence image;
- capture-session failure cannot open camera;
- submission failure creates no reference/token or confirmation;
- tracking failure creates no timeline;
- scanner camera exit stops tracks.

- [ ] **Step 7: Review the design specification line by line**

Use `docs/superpowers/specs/2026-07-25-customer-pwa-ux-overhaul-design.md` Sections 2, 3, 10, 11, and 14 as the checklist. Record any unmet item in the active task plan, fix it with a failing test first, and repeat Steps 1–6.

- [ ] **Step 8: Commit verification fixes**

If verification required fixes:

```powershell
git add customer-pwa
git commit -m "fix(customer-pwa): close UX verification gaps"
```

If no fixes were required, do not create an empty commit.
