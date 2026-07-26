# Customer PWA Audit Report

**System:** PRICE-Watch  
**Scope:** Customer Progressive Web App (`customer-pwa/`) only  
**Focus:** Overall consumer app structure and the **price tag / shelf-tag OCR scanner**  
**Type:** Read-only code and architecture review (no code changes)  
**Date:** 2026-07-25  
**Related prior audit:** `docs/audits/price-watch-implementation-audit-2026-07-25.md`

---

## 1. Executive summary

The customer PWA is a **zero-login consumer application** that supports four main jobs:

1. Browse official SRP (Suggested Retail Price) commodity prices  
2. **Scan a shelf price tag** for an informational regulatory comparison  
3. Submit a **live-camera receipt** as a formal DTI concern  
4. Track a submitted report using a reference number and secret token  

### Headline finding (OCR)

The shelf-tag flow **looks** like OCR (live camera → “Analyzing Shelf Tag” → “Reading tag text…”) but **does not read text from the image**.

What actually happens:

- The client captures a real camera frame and uploads it.
- The backend stores the image under a local vault path.
- The backend returns a short list of **generic active commodities** from `srp_bulletins`.
- The consumer **manually selects** the product and **types** the displayed shelf price.
- Comparison math then runs against the bulletin baseline.

**Verdict:** The customer PWA is a solid interactive prototype with real camera capture, real public API wiring, and a working PWA shell. It is **not pilot-ready** until OCR claims, synthetic fallbacks, and “verified store” messaging are corrected or explicitly gated as demo-only.

| Area | Maturity | Notes |
|------|----------|--------|
| App shell / routing / PWA | Solid prototype | React + Vite PWA, History API routes, service worker |
| SRP browse / search | Working pattern | Public API + offline fallbacks |
| Live camera capture | Real | Browser `getUserMedia` + canvas JPEG |
| **Shelf-tag OCR** | **Not implemented** | Upload + DB candidates only |
| Regulatory compare | Partially real | Baseline math works; freeze/APC incomplete |
| Formal receipt report | Stronger than scan | Camera + SHA-256 + server submit; OCR fields empty |
| Trust / demos | Weak | Synthetic stores/prices when API fails |

---

## 2. Scope and method

### In scope

- `customer-pwa/` source, config, and PWA setup  
- Public Laravel endpoints consumed by the PWA (`/api/public/*`)  
- Shelf-tag scanner flow end-to-end (UI → API → compare → handoff)  
- Formal report OCR-related UI (for contrast only)

### Out of scope

- Flutter mobile app (`mobile/`)  
- Staff/admin web app (`web/`)  
- Legal notice engine internals beyond compare-price behavior  
- Live device lab testing (physical camera/device behavior not executed in this review)

### Primary artifacts reviewed

| Artifact | Path |
|----------|------|
| App shell | `customer-pwa/src/App.tsx` |
| Routing | `customer-pwa/src/app/routing.ts` |
| API client / types | `customer-pwa/src/api/client.ts` |
| Shelf scanner | `customer-pwa/src/components/ShelfScanner.tsx` |
| Formal report | `customer-pwa/src/components/FormalReport.tsx` |
| Handoffs | `customer-pwa/src/app/handoffs.ts` |
| PWA config | `customer-pwa/vite.config.ts` |
| Public API controller | `backend/app/Http/Controllers/PublicPwaController.php` |
| Public routes | `backend/routes/api.php` |
| API docs | `docs/customer-pwa-api.md` |

---

## 3. Customer PWA overview

### 3.1 Location and stack

| Item | Detail |
|------|--------|
| Path | `customer-pwa/` |
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| HTTP | Axios (`VITE_API_BASE_URL` or `http://localhost:8000/api`) |
| Icons | lucide-react |
| PWA | vite-plugin-pwa + Workbox (`registerType: autoUpdate`) |
| Styling | Vanilla CSS design system (`index.css`, `App.css`) |
| Tests | Vitest + Testing Library |
| Auth model | None for consumers (public API only) |
| Dev port | 5174 |
| Deploy | Vercel SPA rewrite (`vercel.json`) |

### 3.2 Screens and routes

Routing uses the browser History API (no React Router).

| Route | Route name | Component | Purpose |
|-------|------------|-----------|---------|
| `/` | `home` | `Home.tsx` | Hero + primary CTAs |
| `/prices` | `prices` | `SrpSearch.tsx` | Commodity / SRP directory |
| `/prices/:id` | `product` | Intended product deep link | Defined in routing; not fully wired through `App.tsx` |
| `/scan` | `scan` | `ShelfScanner.tsx` | Price-tag capture + compare |
| `/reports` | `reports` | `FormalReport.tsx` | Formal receipt report wizard |
| `/reports/new` | `new-report` | `FormalReport.tsx` (via tab mapping) | New report entry |
| `/reports/track` | `track-report` | `TrackReport.tsx` | Track by reference + secret token |

Bottom navigation: **Home · Prices · Scan · Reports · Track**

### 3.3 Auth, privacy, and tracking model

- No consumer accounts or Sanctum login in the PWA.
- Formal reports return a **report reference** plus a **secret tracking token** (capability-based access).
- Capture sessions issue short-lived **capture_session_id + capture_token** before formal receipt capture.
- Staff-only routes remain under Sanctum and are not used by the consumer PWA.

### 3.4 Offline / PWA behavior

| Concern | Behavior |
|---------|----------|
| App shell | Precached via Workbox |
| Public read data | NetworkFirst cache for `/api/public/(commodities\|establishments\|config)` (3s timeout, 24h) |
| Scan / report / track | Not runtime-cached (network-only for evidence integrity) |
| Offline UI | `OfflineBanner` + online/offline listeners |
| Fallbacks | `defaultConfig`, `defaultStoresList`, `fallbackCommodities`, SRP localStorage cache |
| Unused packages | `idb` and `leaflet` are in `package.json` but not used in current `src/` |

### 3.5 Cross-screen handoffs

`sessionStorage` key: `price-watch-flow-handoff` (`customer-pwa/src/app/handoffs.ts`)

| Kind | Purpose |
|------|---------|
| `price-to-scan` | Commodity → scanner |
| `price-to-report` | Commodity → formal report |
| `store-to-scan` | Store → scanner |
| `scan-to-report` | Comparison result → formal report (store, commodity, prices) |

Important: the shelf-tag image is **not** handed off to the formal report flow. Formal reporting always requires a new receipt capture.

---

## 4. Public API surface used by the PWA

| Method | Endpoint | Used by | Role |
|--------|----------|---------|------|
| GET | `/public/config` | `App.tsx` | App config + calamity flag |
| GET | `/public/commodities` | `SrpSearch.tsx` | SRP bulletin list/search |
| GET | `/public/establishments` | Scanner, FormalReport | Store directory |
| POST | `/public/scan-tag` | `ShelfScanner.tsx` | Shelf image upload + candidate return |
| POST | `/public/compare-price` | `ShelfScanner.tsx` | Regulatory comparison |
| POST | `/public/capture-session` | `FormalReport.tsx` | Short-lived capture token |
| POST | `/public/reports` | `FormalReport.tsx` | Formal report submission |
| GET | `/public/reports/track` | `TrackReport.tsx` | Status lookup |
| POST | `/public/reports/{reference}/confirm-ocr` | Backend only | Exists; **not called by PWA** |

---

## 5. Price-tag OCR scanner — detailed findings

### 5.1 Primary files

| Layer | File |
|-------|------|
| UI / state machine | `customer-pwa/src/components/ShelfScanner.tsx` |
| Response types | `customer-pwa/src/api/client.ts` (`ScanTagResponse`, `ComparisonResultResponse`) |
| Fallback commodities | `customer-pwa/src/data/srpFallback.ts` |
| Backend endpoint | `PublicPwaController::scanTag` |
| Compare endpoint | `PublicPwaController::comparePrice` |
| Tests | `customer-pwa/src/components/ShelfScanner.test.tsx` |

### 5.2 Scanner state machine

```
SELECT_STORE
  → CAMERA_LIVE
  → CAPTURE_REVIEW
  → UPLOADING
  → CANDIDATE_SELECTION and/or ENTER_PRICE
  → COMPARING
  → RESULT | ERROR
```

Optional exit: RESULT → “Report using receipt” → Formal Report (new receipt photo required).

### 5.3 Intended consumer journey vs actual behavior

#### Step A — Store selection

**Implemented**

- Loads stores from `GET /public/establishments`.
- Search by store name / address / owner.
- Recently-used store shortcut within the session.
- Handoff support for `store-to-scan`.

**Problems**

- On empty/error response, app falls back to `defaultStoresList` (Super Metro, Gaisano, Robinsons).
- UI always shows **“Verified store”**, including for synthetic fallback stores.
- Backend establishments query does not enforce a verified-only filter.
- “Nearby stores” chip does not use geolocation.
- “Recently selected” is in-session only; chip filtering is incomplete.

#### Step B — Live camera

**Implemented**

- `navigator.mediaDevices.getUserMedia` with preferred rear camera (`facingMode: environment`).
- Full-screen camera UI with safe-area padding.
- Corner bracket framing guide for shelf tags.
- Torch toggle when device capability exists.
- Front/rear camera flip.
- Body scroll lock while camera is live.
- Shutter captures current video frame to canvas → JPEG blob (quality ~0.9).
- **No gallery / file input** — live capture only (aligned with evidence intent).

**Notes**

- Camera start/stop is tied to `CAMERA_LIVE` state; leaving the state stops tracks.
- Back control returns to store selection and stops the stream.

#### Step C — Upload and “OCR”

Client request:

```http
POST /api/public/scan-tag
Content-Type: multipart/form-data

image    = shelf_tag.jpg
store_id = <selected store id>
```

**What the client does not do**

- No on-device OCR library (no Tesseract, ML Kit, Cloud Vision, etc.).
- No `manual_query` field is sent (even though backend supports it).
- No local text extraction from the JPEG.

**Misleading UI copy during processing**

- “Uploading shelf tag image to DTI server…”
- **“Reading tag text & matching database records…”**
- Screen title: **“Analyzing Shelf Tag”**

Only the upload portion is true.

#### Step D — Backend `scanTag` reality

Documented/commented as a “Dynamic Shelf Tag OCR & Product Matching Endpoint.” Actual logic:

1. Validate `store_id` and image (`jpeg|png|webp`, max 10MB).  
2. Store file under local disk path `scan_vault/...`.  
3. Optionally filter commodities by `manual_query` (PWA never provides this).  
4. Query active rows from `srp_bulletins`.  
5. If no text match (always in the PWA path), return **top 5 active** regulated commodities.  
6. `detected_price` is parsed only from a text query regex, not from the image.  
7. Return payload with:

| Field | Typical PWA path value |
|-------|-------------------------|
| `scan_id` | New UUID-based id |
| `store` | Selected store snapshot |
| `detected_price` | `null` |
| `ocr_status` | `MANUAL_SELECTION_REQUIRED` |
| `candidates` | Up to 5 active bulletins |
| `timestamp` | ISO timestamp |

**Critical fact:** image bytes are never opened for text recognition. The photo is stored, not analyzed.

#### Step E — Candidate selection and price entry

- Multiple candidates → product picker UI: “We found possible matching regulated commodities…”  
  In reality these are **not image-derived matches**.
- Single candidate → may auto-run comparison (rarely meaningful without OCR price).
- User enters **Displayed Shelf Price** manually.
- UI correctly warns that manual price correction is **informational only** and is not an official monitoring record.

#### Step F — Regulatory comparison

`POST /public/compare-price` with:

- `store_id`
- `srp_bulletin_id`
- `displayed_price`

Backend computes:

- ₱ difference vs bulletin `baseline_price`
- percentage vs SRP
- optional previous verified store price from `temporal_inspections`
- status: `ABOVE_SRP` | `MATCHES_SRP` | `BELOW_SRP`

Under state of calamity + `price_freeze_applicable`, the **label** may become “Frozen prevailing price,” but the system does **not** resolve a genuine frozen prevailing price / APC engine value.

**Positive control:** scan/compare does not auto-create a formal report, tip, or legal notice.

#### Step G — Offline / API failure path (critical integrity issue)

If `scan-tag` fails, the client does not present a hard failure. It synthesizes:

| Fake field | Synthetic value |
|------------|-----------------|
| `detected_price` | **23.50** |
| `candidates` | bundled `fallbackCommodities` |
| `ocr_status` | `MANUAL_SELECTION_REQUIRED` |
| `scan_id` | `SCAN-REF-<timestamp>` |

The user continues into candidate selection as if analysis succeeded. This is production-reachable whenever the API is offline, misconfigured, or unreachable.

#### Step H — Handoff to formal report

“Report using receipt” writes `scan-to-report` handoff:

- store id  
- commodity id  
- displayed price  
- baseline price  

Shelf image is **not** transferred. Formal report starts a separate live receipt capture.

### 5.4 Architecture diagram (truthful)

```
┌─────────────┐   getUserMedia    ┌──────────────┐
│  Consumer   │ ───────────────► │ Live camera  │
│  browser    │                  │ + canvas JPG │
└──────┬──────┘                  └──────┬───────┘
       │                                │
       │  POST /public/scan-tag         │ image + store_id
       ▼                                ▼
┌──────────────────────────────────────────────┐
│  Laravel PublicPwaController::scanTag        │
│  • vault image                               │
│  • NO OCR / NO pixel or text read            │
│  • return top active SRP commodities         │
└──────────────────────┬───────────────────────┘
                       │ candidates (not image-matched)
                       ▼
              user picks product + types price
                       │
                       ▼  POST /public/compare-price
              SRP math vs baseline bulletin
                       │
                       ▼
                 RESULT (informational only)
```

### 5.5 What the scanner is (and is not)

| Claim users may infer | Actual status |
|-----------------------|---------------|
| App reads the shelf tag with OCR | **False** |
| Product list comes from the photo | **False** (top active bulletins / fallbacks) |
| Detected price comes from the tag | **False** in normal path (`null`); fake `23.50` offline |
| Photo is captured live | **True** |
| Photo is uploaded/stored | **True** (server vault) |
| Comparison uses official bulletin baseline | **True** for the selected bulletin |
| Scan files a formal DTI case | **False** (informational only) |

**Accurate product description today:**  
*A guided manual shelf-price comparison tool with a live camera front-end — not an OCR engine.*

---

## 6. Formal receipt flow (contrast, OCR-related)

Reviewed only as it relates to OCR honesty and evidence integrity.

| Aspect | Shelf scanner | Formal report |
|--------|---------------|---------------|
| Camera | Live, full-screen | Live capture |
| Gallery upload | Blocked | Blocked |
| Image integrity extras | Server store only | Client SHA-256 + capture session token |
| OCR | Claimed, not real | “Automatically Detected Fields” UI with empty/placeholder data |
| Case filing | No | Yes (`POST /public/reports`) |
| OCR confirm endpoint | N/A | Backend exists; **PWA never calls it** |

Formal report is stronger on evidence submission integrity and more cautious in some labels (“Subject to DTI verification”), but still presents an **Automatically Detected** panel that is not populated by OCR.

---

## 7. Findings by severity

### Critical

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| C1 | No real shelf-tag OCR | `scanTag` never reads image content; no client OCR deps | Consumers and auditors may trust false automation |
| C2 | Misleading processing copy | “Reading tag text & matching database records…” | Overclaims capability |
| C3 | Synthetic success on scan failure | Hard-coded `23.50` + fallback commodities | Fake results in production-reachable offline path |
| C4 | “Verified store” on unverified/synthetic data | Fallback list + no verified backend filter | False regulatory trust signal |

### High

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| H1 | Nearby / filter chips incomplete | UI chips without geo/locality logic | Broken expectations for store discovery |
| H2 | Price freeze path incomplete | Label change only under calamity | Incorrect regulatory interpretation during freeze |
| H3 | Product deep link incomplete | `/prices/:id` not fully wired in `App` | Broken share/deep-link UX |
| H4 | Dead / unfinished deps | `leaflet`, `idb` unused | Signal of incomplete offline/map features |

### Medium

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| M1 | Formal report OCR UI is placeholder | Empty `ocrItems`; static metadata defaults | Misleading “detected” language |
| M2 | `confirm-ocr` unused by PWA | API route exists; no client call | Incomplete receipt correction workflow |
| M3 | `StoreDirectory` not mounted | Component exists, not in `App.tsx` | Dead UI surface |
| M4 | Scan vault has no consumer audit trail | By design for info flow | Easy to confuse with formal evidence |

### Low / positive controls

| ID | Finding | Notes |
|----|---------|-------|
| P1 | Live camera-only shelf capture | No gallery spoof path in scanner |
| P2 | Compare does not auto-file legal reports | Correct separation of info vs formal case |
| P3 | Manual price disclaimer on ENTER_PRICE | Honest about informational use |
| P4 | Evidence endpoints not SW-cached | Good for integrity |
| P5 | Formal submit failure does not invent success | Stronger honesty than scan offline path |
| P6 | Scanner camera cleanup on leave | Stream stopped when leaving live state |

---

## 8. Capability scorecard

| Capability | Status |
|------------|--------|
| Installable PWA / offline shell | Implemented |
| Public SRP browse | Implemented |
| Live shelf camera + frame capture | Implemented |
| Upload shelf image to server | Implemented |
| **Read text from price tag** | **Not implemented** |
| **Detect price from tag image** | **Not implemented** (manual only; fake 23.50 offline) |
| Match product from image content | **Not implemented** (top-5 active list) |
| Compare displayed vs SRP baseline | Implemented (normal case) |
| Freeze / APC-aware regulatory price | Partial / incomplete |
| Formal receipt report | Implemented (camera + hash + vault) |
| Receipt OCR extraction | Not implemented |
| Report tracking (ref + secret token) | Implemented |

---

## 9. Recommended remediation (no implementation in this audit)

Ordered by integrity risk.

### Phase 0 — Honesty and safety (before any pilot)

1. Remove or rewrite UI copy that claims tag text is being read.  
2. Surface backend `ocr_status` honestly (`MANUAL_SELECTION_REQUIRED`, unavailable, etc.).  
3. On scan API failure, show a clear error / offline state — **never invent price or candidates**.  
4. Gate synthetic stores/commodities behind an explicit non-production/demo flag.  
5. Remove “Verified store” unless backend returns a real verification flag.

### Phase 1 — Real OCR or explicit manual mode

Choose one product path:

**Option A — Real OCR**

- Client on-device OCR and/or server vision provider  
- Parse product lines + ₱ amounts  
- Fuzzy-match to `srp_bulletins`  
- Populate `detected_price` from image text  
- Keep manual correction, but label confidence/source

**Option B — Honest manual mode (faster)**

- Rename flow to “Compare shelf price with photo”  
- Keep camera for evidence context only  
- Manual product search + price entry  
- No “analyzing / reading tag text” language

### Phase 2 — Regulatory completeness

1. Implement freeze prevailing-price resolution (not label-only).  
2. Define APC handling rules in compare-price.  
3. Align establishments endpoint with verified-store policy.

### Phase 3 — Formal report OCR parity

1. Either implement receipt OCR or remove “Automatically Detected” framing.  
2. Wire or remove `confirm-ocr`.  
3. Keep capture token + SHA-256 path.

---

## 10. Definition of done for “real shelf-tag OCR”

The scanner may claim OCR only when all of the following are true:

1. Image text is extracted by a documented OCR path (client and/or server).  
2. Candidate commodities are derived from extracted text, not a generic top-N list.  
3. Detected price (if shown) comes from parsed tag text or is explicitly marked “not detected.”  
4. Failures show Unavailable / error — never synthetic success values.  
5. UI copy matches actual automation level.  
6. Automated tests cover OCR success, partial detection, and OCR unavailable paths.

---

## 11. Bottom line

**How the price-tag scanner works today:**

1. User selects a store.  
2. User takes a real live photo of the shelf tag.  
3. App uploads the photo and presents processing language that implies OCR.  
4. Server stores the image and returns a short list of active SRP commodities.  
5. User selects the product and types the shelf price.  
6. Server compares the typed price to the bulletin baseline.  
7. Result is informational; formal action requires a separate receipt report.

**It is a guided manual comparison tool with a camera front-end — not an OCR engine.**

Until Phase 0 honesty fixes land, the customer PWA should not be described to stakeholders or consumers as having working price-tag OCR.

---

## 12. Appendix — key code anchors

| Topic | Anchor |
|-------|--------|
| Scanner states | `ShelfScanner.tsx` — `ScannerStepState` |
| Camera start/stop | `ShelfScanner.tsx` — `startCamera` / `stopCamera` |
| Capture shutter | `ShelfScanner.tsx` — `handleShutterCapture` |
| Upload + offline fake path | `ShelfScanner.tsx` — `handleUploadAndAnalyze` |
| Compare call | `ShelfScanner.tsx` — `executeComparison` |
| Synthetic stores | `api/client.ts` — `defaultStoresList` |
| Backend scan (no OCR) | `PublicPwaController.php` — `scanTag` |
| Backend compare | `PublicPwaController.php` — `comparePrice` |
| Public routes | `backend/routes/api.php` |
| PWA Workbox rules | `customer-pwa/vite.config.ts` |

---

*End of report.*
