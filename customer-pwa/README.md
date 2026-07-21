# PRICE-Watch Consumer Progressive Web Application (PWA)

## Overview
The PRICE-Watch Consumer PWA is a zero-install, browser-first progressive web application built to empower Philippine consumers with real-time commodity Suggested Retail Price (SRP) transparency, establishment verification, shelf price reference checks, and tamper-evident formal receipt reporting.

---

## Key Operating Features

1. **Zero-Install Public Access**
   * Accessible directly through any standard browser URL or QR code scan.
   * "Add to Home Screen" is completely optional and never blocks access to core functionality.

2. **Public Transparency Mode (No Account Required)**
   * **SRP Bulletin Search:** Filter by commodity name, brand, variant, package size, and effective date.
   * **Establishment Directory:** View verified participating stores, addresses, SEC numbers, and map locations.
   * **Shelf Price Checker:** Camera-based shelf tag scanner providing instant informational comparison vs SRP baselines (Includes warning disclaimer: *Informational only, does not automatically create a formal violation*).

3. **Formal Receipt Reporting Mode**
   * Browser HTTPS & media capability verification.
   * Explicit privacy notice modal with versioned user consent acknowledgment.
   * Server-issued short-lived capture session tokens (`POST /api/public/capture-session`).
   * Live-camera stream capture (`getUserMedia()`, rear camera, canvas frame capture, no gallery file picker).
   * Idempotent submission UUID enforcement & cryptographic SHA-256 server hashing.
   * Sealed original evidence stored in restricted private vault (`storage/app/private/receipt_vault`).
   * OCR confirmation screen for user verification of recognized fields.
   * Generates a **Public Report Reference** (e.g. `REP-20260722-A8F2`) and an **Unguessable Secret Tracking Token**.

4. **Public Report Tracking**
   * Track report status via Public Reference + Secret Tracking Token.
   * Displays sanitized progress timeline without exposing internal DTI notes or officer identities.

---

## Technology Stack
* **Framework:** React 18 + TypeScript + Vite
* **PWA Engine:** `vite-plugin-pwa` with Workbox Service Worker
* **Icons & Styling:** Custom Vanilla CSS Design System (`index.css`), Lucide React
* **Maps & GIS:** Leaflet.js

---

## Development Setup

### 1. Install Dependencies
```bash
cd customer-pwa
npm install
```

### 2. Environment Configuration
Create a `.env` file based on `.env.example`:
```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_APP_NAME=PRICE-Watch Consumer PWA
VITE_APP_ENV=development
VITE_MAP_PROVIDER=OpenStreetMap
```

### 3. Run Development Server
```bash
npm run dev
```
The PWA will run on `http://localhost:5174`.

### 4. Build for Production
```bash
npm run build
```
Production output files will be built to `customer-pwa/dist/`.
