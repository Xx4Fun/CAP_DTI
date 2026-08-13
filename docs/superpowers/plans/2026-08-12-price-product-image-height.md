# Price Product Image Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visibly reduce the overall size of every price-card product image by 8%.

**Architecture:** Preserve the existing absolute image underlay and original responsive image boxes, then add a uniform `scale(0.92)` to the existing centering transform. Extend the existing source-level SRP layout regression so future CSS edits retain both the scale and responsive boxes.

**Tech Stack:** React, TypeScript, CSS, Vitest

## Global Constraints

- Keep product-image box width and horizontal position unchanged.
- Restore default, narrow, and wide height boxes to `+18px`, `+14px`, and `+20px`.
- Scale the rendered image uniformly to 92% on both axes.
- Keep card dimensions, description layout, wrapping, category badge, and SRP panel unchanged.
- Do not add dependencies or alter application behavior.

---

### Task 1: Scale the complete product image

**Files:**
- Modify: `customer-pwa/src/components/SrpSearch.test.tsx:171`
- Modify: `customer-pwa/src/index.css:1104`
- Test: `customer-pwa/src/components/SrpSearch.test.tsx`

**Interfaces:**
- Consumes: Existing `.price-product-image` CSS underlay and responsive media queries.
- Produces: `translate(-50%, -50%) scale(0.92)` with the original `+18px`, `+14px`, and `+20px` responsive height boxes.

- [ ] **Step 1: Write the failing regression expectations**

Change the default `.price-product-image` expectation to require `translate(-50%, -50%) scale(0.92)`. Restore the three height expectations to `+ 18px`, `+ 14px`, and `+ 20px` while retaining the current width and left-position assertions.

- [ ] **Step 2: Verify the focused test fails**

Run: `npm.cmd test -- src/components/SrpSearch.test.tsx`

Expected: the responsive image-underlay test fails because CSS lacks `scale(0.92)` and still contains the reduced height boxes.

- [ ] **Step 3: Apply the minimal CSS change**

```css
.price-product-image {
  height: calc(100% + 18px);
  transform: translate(-50%, -50%) scale(0.92);
}

@media (max-width: 360px) {
  .price-product-image {
    height: calc(100% + 14px);
  }
}

@media (min-width: 520px) {
  .price-product-image {
    height: calc(100% + 20px);
  }
}
```

- [ ] **Step 4: Verify the focused and complete project checks**

Run sequentially from `customer-pwa`:

```powershell
npm.cmd test -- src/components/SrpSearch.test.tsx
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: all commands exit successfully; unrelated pre-existing warnings may remain.

- [ ] **Step 5: Leave changes uncommitted**

Do not commit or deploy without explicit user approval.
