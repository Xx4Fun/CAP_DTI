# Customer PWA UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign and implement the complete Customer PWA UI (`customer-pwa/`) matching the 13 prototype screens in `cus_ui/` (Home, Prices Directory & Product Detail, 3-Step Shelf Scanner, and 7-Step Formal Receipt Reporting & Tracking) with full offline fallback capabilities and backend API integration.

**Architecture:** Light-mode clean UI component architecture powered by Vanilla CSS tokens (`Outfit` font, `#f8fafc` background, white cards, royal blue primary actions, amber & emerald state badges), fixed 4-tab bottom navigation (`Navbar.tsx`), dynamic state management, hardware-locked camera access (`getUserMedia`), and offline cache fallback.

**Tech Stack:** React 19, TypeScript, Lucide Icons, Vite, Workbox PWA, Axios, Vanilla CSS.

---

## File Structure & Responsibilities

- `customer-pwa/src/index.css` — Global light-mode design tokens, utility classes, buttons, badges, card styles, and mobile responsive containers.
- `customer-pwa/src/components/Navbar.tsx` — Top application header bar + fixed 4-tab bottom navigation bar (*Home*, *Prices*, *Scan*, *Reports*).
- `customer-pwa/src/components/Home.tsx` — Dashboard landing view matching `cus_ui/home/1.png` with hero action cards, dynamic bulletin status card, category quick filters, and help links.
- `customer-pwa/src/components/SrpSearch.tsx` — Commodity & SRP directory matching `cus_ui/Price/1.png` with category tabs (*All*, *Basic Necessities*, *Prime Commodities*), debounced multi-field search, and commodity list cards.
- `customer-pwa/src/components/ProductDetail.tsx` — Detailed commodity pricing view matching `cus_ui/Price/2.png` with regulatory breakdown table, price freeze accordion, and action buttons.
- `customer-pwa/src/components/StoreDirectory.tsx` — Store selection directory component matching `cus_ui/scan/1.png` and `cus_ui/Reports/3.png` with search and SEC verification badges.
- `customer-pwa/src/components/ShelfScanner.tsx` — 3-step shelf tag scanner wizard matching `cus_ui/scan/1.png` ➔ `3.png` with store selection, live camera viewport, price comparison math, and mandatory legal disclaimers.
- `customer-pwa/src/components/FormalReport.tsx` — 7-step formal receipt submission wizard matching `cus_ui/Reports/1.png` ➔ `7.png` with terms modal, store select, camera guidelines modal, hardware-locked receipt capture, OCR review, vault submission, and reference tracking token generation.
- `customer-pwa/src/components/TrackReport.tsx` — Public report tracking interface matching `cus_ui/Reports/7.png` with reference & secret token lookup.
- `customer-pwa/src/App.tsx` — Root component managing active tab state, offline network detection, and backend system config syncing.

---

### Task 1: Design Tokens & Shell Layout (`index.css` & `Navbar.tsx`)

**Files:**
- Modify: `customer-pwa/src/index.css`
- Modify: `customer-pwa/src/components/Navbar.tsx`
- Modify: `customer-pwa/src/App.tsx`

- [ ] **Step 1: Configure Light-Mode Design Tokens in `index.css`**
  Write light-mode CSS variables (`--bg-primary: #f8fafc`, `--card-bg: #ffffff`, `--primary: #1d4ed8`, `--text-main: #0f172a`, `--border-color: #e2e8f0`), bottom navbar fixed styling, and mobile container boundaries.

- [ ] **Step 2: Update `Navbar.tsx` with Fixed 4-Tab Bottom Navigation & Top Header**
  Implement top header bar with logo, title *"PRICE-Watch Consumer Price Guide"*, state of calamity pill, and fixed bottom nav bar with tabs: `home`, `prices`, `scan`, `reports`.

- [ ] **Step 3: Update `App.tsx` to handle 4-tab state switching**
  Connect `App.tsx` tab state (`home`, `prices`, `scan`, `reports`) to render the corresponding primary components.

- [ ] **Step 4: Verify build succeeds**
  Run: `cd customer-pwa && npm run build`
  Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit**
  ```bash
  git add customer-pwa/src/index.css customer-pwa/src/components/Navbar.tsx customer-pwa/src/App.tsx
  git commit -m "feat: implement light-mode design system and fixed 4-tab bottom navigation shell"
  ```

---

### Task 2: Home Landing View Component (`Home.tsx`)

**Files:**
- Modify: `customer-pwa/src/components/Home.tsx`

- [ ] **Step 1: Implement `Home.tsx` matching `cus_ui/home/1.png`**
  Build hero title, *"Scan shelf tag"* and *"Report concern"* primary cards, *"Track an existing report"* card, Price bulletin status card (167 commodities, effective date, calamity indicator), Popular categories grid (*Sardines*, *Milk*, *Coffee*, *Water*), and Help footer.

- [ ] **Step 2: Verify build succeeds**
  Run: `cd customer-pwa && npm run build`
  Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Commit**
  ```bash
  git add customer-pwa/src/components/Home.tsx
  git commit -m "feat: implement Home view component matching prototype design"
  ```

---

### Task 3: Prices Directory & Product Detail Views (`SrpSearch.tsx` & `ProductDetail.tsx`)

**Files:**
- Modify: `customer-pwa/src/components/SrpSearch.tsx`
- Create: `customer-pwa/src/components/ProductDetail.tsx`

- [ ] **Step 1: Create `ProductDetail.tsx` matching `cus_ui/Price/2.png`**
  Build commodity detail view showing image/icon, item name, package size, baseline price (₱), classification badge (*BASIC NECESSITY* / *PRIME COMMODITY*), regulatory status table, price-freeze information accordion, and action buttons (*Scan shelf price*, *Report concern*).

- [ ] **Step 2: Update `SrpSearch.tsx` matching `cus_ui/Price/1.png`**
  Add filter chips (*All*, *Basic Necessities*, *Prime Commodities*), search bar, commodity list items, and modal/tab trigger opening `ProductDetail.tsx` when an item is selected.

- [ ] **Step 3: Verify build succeeds**
  Run: `cd customer-pwa && npm run build`
  Expected: Build succeeds with 0 errors.

- [ ] **Step 4: Commit**
  ```bash
  git add customer-pwa/src/components/SrpSearch.tsx customer-pwa/src/components/ProductDetail.tsx
  git commit -m "feat: implement Prices directory and ProductDetail components"
  ```

---

### Task 4: 3-Step Shelf Scanner Component (`ShelfScanner.tsx`)

**Files:**
- Modify: `customer-pwa/src/components/ShelfScanner.tsx`

- [ ] **Step 1: Implement Store Selection Step (`cus_ui/scan/1.png`)**
  Build store search bar, verified participating store list from `/api/public/establishments` with SEC badges and addresses.

- [ ] **Step 2: Implement Live Camera Scanner Step (`cus_ui/scan/2.png`)**
  Build `getUserMedia()` live camera viewport with bounding target frame overlay, instruction overlay, flash/flip camera controls, and manual price input override.

- [ ] **Step 3: Implement Comparison Result Step (`cus_ui/scan/3.png`)**
  Build price delta math card (₱ difference & % above SRP), store/item summary, **Mandatory Legal Disclaimer** (*"A possible price difference was found. This does not automatically confirm a violation."*), and transition action buttons (*Report using receipt*, *Scan another item*).

- [ ] **Step 4: Verify build succeeds**
  Run: `cd customer-pwa && npm run build`
  Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit**
  ```bash
  git add customer-pwa/src/components/ShelfScanner.tsx
  git commit -m "feat: implement 3-step shelf scanner component matching prototype design"
  ```

---

### Task 5: 7-Step Formal Receipt Reporting & Tracking Components (`FormalReport.tsx` & `TrackReport.tsx`)

**Files:**
- Modify: `customer-pwa/src/components/FormalReport.tsx`
- Modify: `customer-pwa/src/components/TrackReport.tsx`

- [ ] **Step 1: Build Reports Dashboard & Terms Modal (`cus_ui/Reports/1.png` & `2.png`)**
  Implement main reports dashboard menu and Privacy Notice Modal with explicit checkbox agreement.

- [ ] **Step 2: Build Store Selection & Camera Guidelines Modal (`cus_ui/Reports/3.png` & `4.png`)**
  Implement store selector for receipt issuer and receipt capture tips modal with gallery upload lock warning banner (*"Gallery uploads are unavailable for formal receipt reporting."*).

- [ ] **Step 3: Build Hardware-Locked Receipt Camera Viewport (`cus_ui/Reports/5.png`)**
  Implement live camera stream frame overlay targeting physical checkout receipt with stability status indicator (`Hold steady · Lighting looks good`).

- [ ] **Step 4: Build OCR Review & Confirmation Step (`cus_ui/Reports/6.png`)**
  Implement captured receipt preview, automatically extracted OCR text box (*"Subject to DTI verification"*), legal affirmation checkbox, mandatory disclaimer banner, and submit/retake buttons.

- [ ] **Step 5: Build Confirmation Screen & Track Report Component (`cus_ui/Reports/7.png`)**
  Implement submission confirmation showing Public Report Reference, Initial Status, and Secret Tracking Token instructions. Connect `TrackReport.tsx` to search status via `/api/public/reports/track`.

- [ ] **Step 6: Verify build succeeds**
  Run: `cd customer-pwa && npm run build`
  Expected: Build succeeds with 0 errors.

- [ ] **Step 7: Commit & Push**
  ```bash
  git add customer-pwa/src/components/FormalReport.tsx customer-pwa/src/components/TrackReport.tsx
  git push origin main
  ```
