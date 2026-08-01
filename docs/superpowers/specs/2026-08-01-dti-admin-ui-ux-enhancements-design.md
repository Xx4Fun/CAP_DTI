# Design Spec: DTI Admin Portal Comprehensive UI/UX Enhancements

**Date**: 2026-08-01  
**Target System**: DTI Admin & Vendor Web Portal (`web/`)  
**Scope**: Full administrative interface visual, structural, and interactive overhaul (excluding the Executive Navy sidebar, which remains 100% intact as-is per user directive).

---

## 1. Executive Top Sticky Header & Evaluator Bar (`AdminShell.tsx` & `admin.css`)

### Functional & Visual Requirements
- **Executive Navigation Header (`.admin-top-header`)**:
  - Sticky top header with background `#1a2744`, crisp 1px border `rgba(255, 255, 255, 0.12)`, and subtle drop-shadow `0 2px 8px rgba(0, 0, 0, 0.15)`.
  - Left side: Mobile navigation drawer toggle button + Active Module Title & Subtitle.
  - Right side: Live Market Status Indicator Pill (`🟢 Normal Market Protocol` vs `🚨 State of Calamity Active`) + DTI Officer Account Pill.
- **Evaluator Profile Pill (`.header-account-button`)**:
  - Distinct gradient avatar badge (`E` for Evaluator / `A` for Admin) surrounded by a subtle ring and a pulsing status indicator dot (`🟢 Session Active`).
  - Officer Name in bold slate text + User Role label (`dti evaluator`, `super admin`, or `field officer`).
  - Chevron dropdown indicator pointing to the interactive account popover card.
- **Animated Account Popover Menu (`.header-account-menu`)**:
  - Floating card with smooth fade/slide animation, sharp `#ffffff` background, border `#e2e8f0`, and shadow `0 16px 32px rgba(15, 23, 42, 0.12)`.
  - Items: Officer Name header, SEC Role description, *Lock Session* (re-authentication trigger), and *Logout* with Lucide SVG icons.

---

## 2. Executive Dashboard Command Center (`OverviewPanel.tsx` & `AdminPanels.tsx`)

### Layout & Component Architecture
- **4-Card Top KPI Metric Grid**:
  1. 🏢 **Commercial Establishments**: Total store count with `+2 verified this week` badge.
  2. 🧾 **Formal Receipts Queue**: Pending citizen receipt submissions requiring evaluator action.
  3. 📊 **Price Volatility Alerts**: Store count exceeding the 10% prevailing SRP ceiling.
  4. 🛡️ **Market Protocol Status**: Current emergency state indicator with one-click link to Calamity controls.
- **Main 2-Column Dashboard Split**:
  - **Left Section (65% Width) — Volatility & Compliance Chart**:
    - Chart.js temporal compliance chart displaying 4-week inspection price movements against flat official SRP ceiling.
    - Commodity category quick filter tabs (`All`, `Rice`, `Canned Goods`, `Dairy`, `Bread`).
  - **Right Section (35% Width) — Live System Activity & Quick Actions**:
    - **Live Audit Stream**: Real-time activity feed showing recent officer inspections, receipt approvals, and bulletin revisions.
    - **Quick Action Shortcuts**: Single-click action buttons (*Dispatch Notice*, *Add SRP Bulletin*, *Review Receipts*, *Toggle Calamity*).

---

## 3. CartoDB Light GIS Store Registry (`StoreManager.tsx` & `StoreMap.tsx`)

### CartoDB Light Map Engine Integration
- **Basemap Tile Layer**: CartoDB Light engine (`https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`) focused on San Jose de Buenavista, Antique (`10.7431° N, 121.9839° E`).
- **Custom Establishment Markers**:
  - **Green Pin**: 100% SRP Compliant store.
  - **Yellow Pin**: Minor price anomaly (within +10% SRP allowance).
  - **Red Pin**: Flagged store / Recidivist offender (over +10% SRP ceiling or LOI issued).
- **Interactive Establishment Popup Cards**:
  - Popup displaying Store Name, DTI SEC #, Address, Recidivism Index, and direct button link to view 4-week inspection history.
- **Split Workspace**: Left-side filterable store registry table + Right-side full-height Leaflet GIS map.

---

## 4. Four-Week Temporal Volatility Analytics (`TemporalVolatility.tsx`)

### Analytics & Chart Controls
- **Filter Toolbar**: Establishment search selector + Commodity category selector.
- **Regulatory Threshold Overlays**:
  - Flat blue dashed line representing **Official Prevailing SRP Baseline**.
  - Red shaded allowance band highlighting prices exceeding the **+10% Regulatory Ceiling**.
  - Direct peso variance calculation callout (e.g., `+₱2.50 above prevailing SRP`).

---

## 5. Formal Receipt Review Queue (`CitizenTipReview.tsx`)

### Dual Inspection Workspace
- **Left Column**: Vaulted receipt evidence image container with image zoom, pan, and rotation tools.
- **Right Column**: Extracted OCR text breakdown compared against official SRP items with single-click evaluator action buttons (*Approve & Issue LOI*, *Dismiss Report*, *Request Re-scan*).

---

## 6. Legal Notice Engine & State of Calamity Protocol (`LegalNoticeManager.tsx` & `EmergencyToggle.tsx`)

### Document Previewer & Emergency Controls
- **DOM Legal Notice Draft Preview**: Live preview of **Letter of Inquiry (LOI)** or **Show Cause Order (SCO)** formatted on official DTI Antique Provincial Office letterhead with 48-hour expiration countdown timer.
- **Emergency Protocol Command Banner**: Prominent emergency status header, APC price ceiling lookup table, and automated Show Cause Order escalation triggers.

---

## Verification & Automated Test Strategy
- **PHPUnit (Backend)**: Run full test suite verifying all admin endpoints (`122+ tests`).
- **Vitest (Frontend)**: Verify all 36+ React component tests pass without visual regressions or broken aria controls.
- **Build Verification**: Run `npm run build` in `web/` to ensure zero TypeScript errors.
- **Deployment**: Commit to `main` branch and deploy to Vercel production.
