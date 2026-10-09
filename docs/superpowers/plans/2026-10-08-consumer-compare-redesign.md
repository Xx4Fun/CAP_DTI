# Consumer PWA Manual Compare Price Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Redesign the manual shelf price comparison feedback UI in the Consumer PWA by converting the historical store price indicator into a compact, single-row pill matching the live delta style, visually hiding inline save and disclaimer notices, and adding a dedicated Price Comparison Notice card with required regulatory text.

**Architecture:** Update `customer-pwa/src/components/ShelfScanner.tsx` manual comparison flow to render a matching `.shelf-compare-live-delta` pill for historical price deltas, encapsulate save status in an accessible `.sr-only` container to preserve test assertions and accessibility, and append a structured `<section className="shelf-compare-notice-card">`. Style with semantic CSS classes in `customer-pwa/src/index.css`.

**Tech Stack:** React (TypeScript), CSS3 / Flexbox, Lucide React icons (`History`, `Info`, `AlertTriangle`, `Scale`), Vitest, Playwright.

---

### Task 1: Add Styling for Historical Delta Fallback & Notice Container in CSS

**Files:**
- Modify: `customer-pwa/src/index.css:6915-6925` (add neutral delta variant and sr-only)
- Modify: `customer-pwa/src/index.css:7080-7115` (add notice card styles)

- [x] **Step 1: Add `.sr-only` accessibility class and `.shelf-compare-live-delta--neutral` variant**

In `customer-pwa/src/index.css`:
```css
/* Screen reader only utility */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Neutral live delta indicator for missing historical data */
.shelf-compare-live-delta--neutral {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
}
```

- [x] **Step 2: Add styles for `.shelf-compare-notice-card` and inner typography**

In `customer-pwa/src/index.css`:
```css
/* Dedicated Price Comparison Notice Section */
.shelf-compare-notice-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 14px 16px;
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
}

.shelf-compare-notice-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.shelf-compare-notice-icon {
  color: #2563eb;
  flex-shrink: 0;
}

.shelf-compare-notice-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 750;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.shelf-compare-notice-text {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #475569;
}

.shelf-compare-notice-note {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.45;
  color: #334155;
  padding-top: 6px;
  border-top: 1px solid #e2e8f0;
}

.shelf-compare-notice-note strong {
  color: #1e3a8a;
}
```

- [x] **Step 3: Verify CSS build passes without syntax errors**

Run: `npm --prefix customer-pwa run build`
Expected: Build succeeds without CSS parse errors.

---

### Task 2: Update Manual Comparison Component in `ShelfScanner.tsx`

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx:14-16` (import `Info`)
- Modify: `customer-pwa/src/components/ShelfScanner.tsx:1222-1256` (replace historical indicator, hide save/disclaimer, add notice section)

- [x] **Step 1: Import `Info` from `lucide-react`**

In `customer-pwa/src/components/ShelfScanner.tsx`:
Add `Info` to the Lucide icon imports:
```typescript
import {
  Search,
  MapPin,
  Zap,
  ZapOff,
  RotateCw,
  Camera,
  Scale,
  AlertTriangle,
  Tag,
  ArrowLeft,
  CheckCircle2,
  History,
  Info
} from 'lucide-react';
```

- [x] **Step 2: Update historical store price indicator and replace inline notices**

Replace the current lines 1222–1253 with:
```tsx
            {visibleInlineCheck?.status === 'done' && visibleInlineCheck.result && (() => {
              const result = visibleInlineCheck.result;
              const userPrice = Number(userPriceInput);
              const hasPrevPrice = result.previous_verified_price != null && !isNaN(Number(result.previous_verified_price));
              const prevPrice = hasPrevPrice ? Number(result.previous_verified_price) : null;
              
              let prevDeltaNode = null;
              if (hasPrevPrice && prevPrice !== null) {
                const prevDiff = Math.round((userPrice - prevPrice) * 100) / 100;
                const absPrevDiff = Math.abs(prevDiff).toFixed(2);
                if (prevDiff > 0) {
                  prevDeltaNode = (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--above">
                      <History size={15} color="#d97706" />
                      <span>
                        ₱{absPrevDiff} above previous price
                        <span className="sr-only">₱{prevPrice.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                } else if (prevDiff < 0) {
                  prevDeltaNode = (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--below">
                      <History size={15} color="#059669" />
                      <span>
                        ₱{absPrevDiff} below previous price
                        <span className="sr-only">₱{prevPrice.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                } else {
                  prevDeltaNode = (
                    <div className="shelf-compare-live-delta shelf-compare-live-delta--exact">
                      <History size={15} color="#2563eb" />
                      <span>
                        Matches previous price
                        <span className="sr-only">₱{prevPrice.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                }
              } else {
                prevDeltaNode = (
                  <div className="shelf-compare-live-delta shelf-compare-live-delta--neutral">
                    <History size={15} color="#64748b" />
                    <span>No previous price data</span>
                  </div>
                );
              }

              return (
                <>
                  {prevDeltaNode}
                  <div role="status" className="sr-only">
                    {visibleInlineCheck.saved
                      ? 'Saved to comparison history'
                      : "Couldn't save to this device's history"}
                  </div>
                </>
              );
            })()}
```

- [x] **Step 3: Insert the dedicated `Price Comparison Notice` container section**

Directly beneath `</section>` (the closing tag of `shelf-compare-form-card`), add:
```tsx
          {/* Price Comparison Notice Card */}
          <section className="shelf-compare-notice-card" aria-label="Price comparison notice">
            <div className="shelf-compare-notice-header">
              <Info size={16} className="shelf-compare-notice-icon" aria-hidden="true" />
              <h3 className="shelf-compare-notice-title">Price Comparison Notice</h3>
            </div>
            <p className="shelf-compare-notice-text">
              Retail prices may vary depending on the product's brand, size, packaging, promotions, and applicable location-based price references. Please ensure that you are comparing the same product.
            </p>
            <p className="shelf-compare-notice-text">
              This comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
            </p>
            <p className="shelf-compare-notice-note">
              <strong>Note:</strong> During a Price Freeze, covered products are subject to the applicable official Automatic Price Control (APC) reference.
            </p>
          </section>
```

---

### Task 3: Verify Unit and Integration Tests

**Files:**
- Test: `customer-pwa/src/components/ShelfScanner.test.tsx`

- [x] **Step 1: Run Vitest test suite**

Run: `npm --prefix customer-pwa test -- run src/components/ShelfScanner.test.tsx`
Expected: 32 tests passed (including `Saved to comparison history`, `₱36.00` previous price assertion, and disclaimer checks).

---

### Task 4: Playwright Visual Verification

**Files:**
- Test: `scratch/test_compare.py`
- Verify screenshots: `scratch/consumer_compare_result.png`

- [x] **Step 1: Execute Playwright script to capture updated mobile UI**

Run: `python scratch/test_compare.py`
Expected: Script captures screenshot on mobile viewport (412x915).

- [x] **Step 2: Visually verify layout and single-row height**

Check:
1. Historical price indicator renders as a compact, single-row pill matching the style of the live delta pill above it.
2. No visible `"Saved to comparison history"` or duplicate inline disclaimer texts in the form card.
3. The dedicated `Price Comparison Notice` card renders cleanly below the form card with distinct typography, header icon, and official Price Freeze note.
