# PRICE-Watch DTI Admin & Regulatory Portal Light Theme & Layout Redesign

## 1. Overview
The DTI Admin & Vendor Portal (`web/`) is transitioning from an over-dark, amber-glowing dark theme to a clean, authoritative **Government Executive Light Theme**. The new design provides high contrast, ergonomic readability for 8-hour administrative workflows, a structured left sidebar navigation, and clear visual hierarchy across all DTI regulatory modules.

---

## 2. Core Aesthetic & Color Token System

| Token Name | Color Hex / Value | Purpose |
| :--- | :--- | :--- |
| `--bg-main` | `#f8fafc` | Main page background (Pearl Slate White) |
| `--bg-surface` | `#ffffff` | Panel & card containers (Pure White) |
| `--border-color` | `#e2e8f0` | Subtle clean card and table dividers |
| `--primary` | `#1e3a8a` | Executive Philippine Navy (Headers, active navigation, primary CTAs) |
| `--primary-hover` | `#1d4ed8` | Primary button hover state |
| `--primary-subtle` | `#eff6ff` | Light blue background tint for active item highlights |
| `--accent-gold` | `#d97706` | Official DTI Regulatory Gold / Warning Badges |
| `--accent-green` | `#059669` | Compliant status badges & positive trends |
| `--accent-red` | `#dc2626` | Flagged price anomalies, SCO notices & Calamity mode |
| `--text-main` | `#0f172a` | High-contrast dark slate body text |
| `--text-muted` | `#64748b` | Subtitles, labels, and metadata |

### Emergency State of Calamity Modifiers
When `state_of_calamity` is enabled:
- Main header switches to a prominent crimson alert bar (`#dc2626`).
- Top banner displays glowing emergency badge: `🚨 STATE OF CALAMITY ACTIVE - 0% SRP ALLOWANCE ENFORCED`.
- Primary action buttons shift to regulatory urgency styling (`#dc2626`).

---

## 3. Layout Architecture & Component Hierarchy

### A. Left Sidebar Navigation (`AdminShell.tsx`)
- Fixed **260px** width sidebar on desktop.
- DTI Seal & Provincial Office header branding (`DTI Antique Provincial Office`).
- Grouped Category Sections:
  1. **📊 Overview**: Regulatory dashboard & metric cards.
  2. **📍 GIS & Establishments**: Interactive Leaflet store pins & onboarding.
  3. **📈 Price Monitoring**: 4-Week temporal volatility graphs vs SRP baseline.
  4. **🧾 Consumer OCR Queue**: Citizen receipt scan reviews & vault audits.
  5. **⚖️ Legal Engine**: LOI & SCO notice dispatch & rebuttal portal.
  6. **🚨 Emergency Protocol**: State of Calamity control panel.
- Bottom profile summary card with active officer role & single-click logout.

### B. Top Header Bar
- Breadcrumb navigation (`DTI Admin > GIS Map`).
- Live Market State Indicator (`[🟢 Normal Market Mode]` vs `[🚨 State of Calamity Active]`).
- Quick Search input box for store SEC numbers, commodity names, and legal notice IDs.

### C. Content Panels & Tables
- High-contrast white card panels (`#ffffff`) with 1px border (`#e2e8f0`) and soft elevation (`0 1px 3px rgba(15, 23, 42, 0.08)`).
- Monospaced tabular figures for price values (`₱23.50`).
- Explicit status badges (`COMPLIANT`, `FLAGGED`, `LOI_ISSUED`, `SCO_ESCALATED`).
- Smooth, non-layout transitions (no vertical jumping or bouncy animations).

---

## 4. Verification Plan

### Automated Build Verification
- Execute `npm run build` inside `web/` to confirm zero TypeScript compilation or Vite bundling errors.

### Production Deployment
- Push commits to GitHub repository `Xx4Fun/CAP_DTI` on branch `main`.
- Deploy updated production build to Vercel (`https://web-plum-sigma-99.vercel.app`).
