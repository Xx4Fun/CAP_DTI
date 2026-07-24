# Customer PWA UI Redesign Specification

> **Date:** 2026-07-24  
> **Status:** APPROVED  
> **Target Project:** `customer-pwa/` (PRICE-Watch Consumer Web Application)  
> **Reference Prototype Designs:** `cus_ui/` (13 screen mockups in 4 subdirectories)

---

## 1. Executive Summary

This document specifies the UI redesign and component structure for the PRICE-Watch Customer Progressive Web Application (`customer-pwa/`). The redesign aligns the application with the 13 official visual prototype screens stored in `cus_ui/` while preserving the robust backend integration with the Laravel API (`cap_dti` database) and adhering strictly to all system regulatory and legal constraints.

---

## 2. System Architecture & UI Design Tokens

### 2.1 Color Palette & Typography Tokens (`customer-pwa/src/index.css`)
* **Background Primary:** `#f8fafc` (Light Slate Clean Background)
* **Card & Surface Background:** `#ffffff` (Pure White with `#e2e8f0` border, `16px` border-radius)
* **Primary Brand Color:** `#1d4ed8` (Royal Philippine Blue)
* **Primary Hover / Active:** `#1e40af`
* **Accent Warning / Price Flag:** `#f59e0b` (Amber)
* **Accent Danger / Alert:** `#ef4444` (Coral Red)
* **Accent Success / Active Badge:** `#10b981` (Emerald Green)
* **Text Main:** `#0f172a` (Deep Slate Gray)
* **Text Muted:** `#64748b` (Muted Slate)
* **Typography:** `Outfit`, sans-serif (Google Fonts)

### 2.2 Shell & Navigation Structure
* **Top Header Bar (`Navbar.tsx`):**
  * Brand Logo (Blue Tag Icon) + Title *"PRICE-Watch"* & Subtitle *"Consumer Price Guide"*.
  * State of Calamity Pill Indicator (Visually turns red/alert when active).
  * Hamburger Menu button (`≡`).
* **Fixed Bottom Navigation Bar (`Navbar.tsx`):**
  * **Home** (`Lucide.Home`) ➔ `Home.tsx`
  * **Prices** (`Lucide.Tag`) ➔ `SrpSearch.tsx` & `ProductDetail.tsx`
  * **Scan** (`Lucide.Scan`) ➔ `ShelfScanner.tsx` (3-step wizard)
  * **Reports** (`Lucide.ClipboardList`) ➔ `FormalReport.tsx` (7-step wizard) & `TrackReport.tsx`

---

## 3. Screen Specifications (1:1 Mapping to `cus_ui/`)

### 3.1 Home View (`cus_ui/home/1.png`)
* **Hero Title:** *"Check current commodity prices"* — Scan a shelf tag or submit a checkout receipt for DTI evaluation.
* **Primary Action Cards:**
  1. **"Scan shelf tag"** (Blue tint card with barcode icon) ➔ Navigates to `Scan` tab.
  2. **"Report concern"** (Amber tint card with receipt badge) ➔ Navigates to `Reports` tab (New Report).
* **Track Report Button:** Full-width card *"Track an existing report"* with clipboard icon and arrow.
* **Current Price Bulletin Status Card:**
  * Displays Effective Date (e.g. 11 May 2026).
  * Displays Total Reference Prices Available (167 items).
  * Status Pill: *"Normal monitoring"* (Green) or *"State of Calamity"* (Red).
* **Popular Categories Grid:** Quick filter buttons for *Sardines*, *Milk*, *Coffee*, *Water*.
* **Help Footer Card:** *"How price checking and reporting work"*.

---

### 3.2 Prices Directory & Product Detail Views (`cus_ui/Price/1.png` & `2.png`)
* **Directory Screen (`Price/1.png`):**
  * Search bar with instant debouncing across `commodity_name`, `category`, `unit`, and `regulatory_classification`.
  * Category Quick Filter Tabs: *All*, *Basic Necessities*, *Prime Commodities*.
  * Commodity Card List: Displays category icon/thumbnail, item name, package size, baseline price (₱), classification badge (*BASIC NECESSITY* / *PRIME COMMODITY*), and effective date.
* **Product Detail Screen (`Price/2.png`):**
  * Opened upon selecting a commodity card.
  * Header back button (`←`).
  * Item title, category, unit size, and large baseline price display (`₱XX.XX Current SRP · Effective 11 May 2026`).
  * Regulatory Table: Classification, Geographic Scope (*Nationwide*), Regulatory State (*Normal monitoring*), Last Updated.
  * Price Freeze Accordion: Explains Price Act (R.A. 7581) automatic price ceiling rules during declared calamities.
  * Action Buttons: *"Scan shelf price"* & *"Report a concern"*.

---

### 3.3 3-Step Shelf Scanner Flow (`cus_ui/scan/1.png` ➔ `3.png`)
* **Step 1: Store Selection (`scan/1.png`):**
  * Search store bar + filter chips (*Nearby stores*, *Recently selected*, *Filter by barangay*).
  * Store Card List: Fetches verified establishments from `/api/public/establishments` showing SEC verification badge, address, and *Select* button.
* **Step 2: Live Camera Viewport (`scan/2.png`):**
  * Uses `getUserMedia()` live camera feed.
  * Bounding frame overlay targeting physical shelf tag.
  * Instruction box: *"Position the shelf tag inside the frame. Include product name, package size, and displayed price."*
  * Manual price input override option.
* **Step 3: Comparison Result (`scan/3.png`):**
  * Displays selected store, product name, displayed shelf price vs SRP.
  * Calculates price difference: `₱X.XX above current SRP` and `% higher than reference`.
  * **Mandatory System Legal Disclaimer:**  
    > ⚠️ *"A possible price difference was found. This does not automatically confirm a violation."*
  * Action Buttons: *"Report using receipt (Requires an actual checkout receipt)"* & *"Scan another item"*.

---

### 3.4 7-Step Formal Receipt Reporting & Tracking (`cus_ui/Reports/1.png` ➔ `7.png`)
1. **`Reports/1.png` (Dashboard):** Main options for *"Submit a new report"*, *"Track an existing report"*, *How reporting works*, *Privacy notice*, *FAQ*.
2. **`Reports/2.png` (Privacy Notice Modal):** Outlines camera use, privacy protection (redacting unrelated receipt lines), and human DTI evaluation requirement. Requires agreement checkbox before proceeding.
3. **`Reports/3.png` (Step 1: Store Selection):** Select establishment where receipt was issued.
4. **`Reports/4.png` (Capture Guidelines Modal):** Flat surface positioning tips + **Security Warning:** *"Gallery uploads are unavailable for formal receipt reporting."*
5. **`Reports/5.png` (Step 2: Camera Capture Viewport):** Live camera frame targeting physical receipt with stability/lighting status indicator (`Hold steady · Lighting looks good`).
6. **`Reports/6.png` (Step 3: Review & Submit):** Displays captured receipt thumbnail (*"Protected original receipt"*), auto-detected OCR text (*"Subject to DTI verification"*), legal confirmation checkbox, and mandatory disclaimer banner (*"This submission does not automatically confirm a violation. The receipt and detected information require DTI evaluation."*).
7. **`Reports/7.png` (Confirmation & Tracking):** Displays success checkmark, Public Report Reference (`PW-2026-00184`), Initial Status (`Submitted for initial evaluation`), and Secret Tracking Token instructions.

---

## 4. Non-Negotiable Constraints & Security Rules

1. **Hardware Camera Lock:** Gallery file uploads (`<input type="file">`) are strictly disabled for formal receipt submission.
2. **Legal Terminology:** Never use terms like "tamper-proof" or "automatic fine". Always use "tamper-evident evidence acquisition", "possible price difference", "subject to human verification by DTI".
3. **Offline Fallback Guarantee:** If the backend is offline or disconnected, `srpFallback.ts` (167 commodities) provides instant local search functionality without displaying error banners.
