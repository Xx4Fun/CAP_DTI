# GEMINI.md - Master System Blueprint & Agent Instructions

## ⚠️ AGENT DIRECTIVE (CRITICAL)
You are an expert Full-Stack Systems Architect. You are tasked with building "PRICE-Watch," a highly secure, offline-first, API-driven government regulatory system. You must strictly adhere to the technology stack, database constraints, and architectural rules defined in this document. DO NOT deviate from this stack. DO NOT suggest alternative frameworks. DO NOT attempt to provision a new database.

---

## 1. Core Project Metadata
*   **Project Title:** PRICE-Watch: A GIS-Mapped Temporal Monitoring System for Localized Commodity Price Regulation Utilizing Digitized Temporal Matrices and Tamper-Proof Evidence Acquisition
*   **Target Pilot Area:** San Jose de Buenavista, Antique
*   **Primary Regulatory Body:** Department of Trade and Industry (DTI) Antique Provincial Office
*   **System Goal:** To enforce the Philippine Price Act (R.A. 7581) by digitizing paper-based price monitoring, processing offline field data, capturing tamper-proof consumer receipt OCRs, and automating legal notices via a bifurcated decision-support engine.

---

## 2. Infrastructure & Database Configuration
*   **Database Provider:** Supabase (Remote PostgreSQL)
*   **Target Database Name:** `cap_dti`
*   **Agent Constraint:** The `cap_dti` Supabase instance is **ALREADY CREATED** and connected to this workspace. All Laravel migrations, Eloquent models, and seeders MUST be directed to this existing PostgreSQL database. 
*   **Storage:** Laravel Local/S3 storage for encrypted receipt vaulting and PDF generation caching.

---

## 3. Strict Technology Stack (Decoupled Architecture)
The system is divided into a centralized API backend and three distinct frontends.

### A. The Core Engine (Backend)
*   **Framework:** Laravel (PHP)
*   **Authentication:** Laravel Sanctum (Token-based API authentication for both React and Flutter).
*   **Key Packages:** `DomPDF` (for automated LOI/SCO legal notice generation).
*   **Role:** The single source of truth. Handles all database writing, OCR text queueing, spatial mapping data, and the Bifurcated Legal Engine logic.

### B. The Governance & Vendor Nodes (Web Frontend)
*   **Framework:** React.js with TypeScript (Next.js optional if preferred for routing).
*   **Libraries:** `Leaflet.js` (for GIS store mapping), `Chart.js` (for 4-week temporal volatility graphs), `Axios` (for API consumption).
*   **Role:** The administrative dashboard for DTI officers to view temporal graphs and trigger legal actions, and the Vendor Portal for store owners to submit rebuttals.

### C. The Edge Nodes (Mobile Frontends)
*   **Framework:** Flutter (Dart)
*   **Libraries:** `sqflite` (for offline relational database caching), `google_ml_kit` (for on-device OCR Text Recognition).
*   **Role:** A native Android application with two distinct UI flows (Field Officer and Consumer). Strictly requires hardware-level camera locking and offline persistence.

---

## 4. Required Database Schema Blueprint (Laravel Migrations)
The AI must construct Laravel migrations to support the following relational structure in `cap_dti`:

1.  **`users`**: Role-based access (Roles: `super_admin`, `dti_evaluator`, `field_officer`, `vendor`, `consumer`).
2.  **`stores`**: Contains `dti_sec_number`, `store_name`, `owner_name`, `latitude`, `longitude`, `address`, and `recidivism_index` (integer).
3.  **`srp_bulletins`**: Contains `commodity_name`, `baseline_price`, `effective_date`, `is_active`.
4.  **`item_aliases`**: Dictionary mapping POS abbreviations (e.g., "NESC CLSSIC") to the official `srp_bulletins.id`.
5.  **`temporal_inspections`**: Logs offline synced field data. Columns: `store_id`, `srp_id`, `recorded_price`, `is_flagged` (boolean), `inspection_timestamp`, `sync_timestamp`, `officer_signature`, `vendor_signature`.
6.  **`citizen_tips`**: Logs OCR scans. Columns: `store_id`, `extracted_text_json`, `image_hash_path` (vault location), `status` (pending, validated, dismissed).
7.  **`legal_notices`**: The audit trail. Columns: `store_id`, `notice_type` (LOI or SCO), `pdf_file_path`, `status` (issued, acknowledged, rebutted, escalated), `due_date_timestamp`.

---

## 5. Detailed Module Workflows (How the System Operates)

### Module 1: GIS Vendor Onboarding (React -> Laravel)
*   **Action:** DTI Admin inputs store data and drops a map pin using Leaflet.js.
*   **Logic:** React sends the exact Latitude/Longitude to Laravel. Laravel creates the `stores` record, generates a temporary password for the Vendor, and dispatches an email via SMTP.

### Module 2: Offline-First Temporal Field Monitoring (Flutter -> SQLite -> Laravel)
*   **Pre-Deployment Sync:** Flutter app calls a Laravel endpoint (e.g., `/api/sync/down`). Laravel returns a JSON array of `stores`, active `srp_bulletins`, and the last 3 weeks of `temporal_inspections`. Flutter saves this to `sqflite`.
*   **Offline Execution:** Inside a zero-signal store, the Officer selects the store via a local text-search UI. They encode the shelf price. 
*   **The Math:** Flutter locally calculates: `IF recorded_price > (srp_baseline * 1.10) THEN flag = TRUE`.
*   **Post-Deployment Sync:** When online, Flutter sends the queued batch via POST `/api/sync/up`. Laravel deduplicates the batch and updates the `temporal_inspections` table.

### Module 3: Tamper-Proof Consumer Tipping (Flutter OCR -> Laravel)
*   **Hardware Lock:** The Flutter camera UI must disable gallery uploads. It displays a bounding box overlay to force correct aspect ratios.
*   **On-Device Processing:** `google_ml_kit` extracts the receipt text. A Dart Regex function validates the text (must detect `\d+\.\d{2}` decimals).
*   **Encrypted Transmission:** Flutter creates a cryptographic hash of the image, appends the JSON text payload, and sends a multipart/form-data request to Laravel.
*   **Vaulting:** Laravel saves the image to a restricted `storage/app/private/receipt_vault` directory (NOT public). It inserts the extracted JSON into `citizen_tips` for manual review.

### Module 4: Temporal Analytics Dashboard (React)
*   **Manual Review Queue:** DTI Admin views the `citizen_tips` text data (original image remains hidden in the vault unless explicitly requested by authorized admin).
*   **Volatility Graph:** React fetches the `temporal_inspections` for the flagged store and renders a Chart.js line graph showing price fluctuations over the last 4 weeks against the flat SRP baseline.
*   **State of Calamity Toggle:** A global boolean setting in Laravel. When TRUE, the UI visually shifts to red, indicating emergency protocols are active.

### Module 5: The Bifurcated Legal Engine (Laravel Core Logic)
When the DTI Admin clicks "Validate & Dispatch" on an anomaly, Laravel executes the following arithmetic routing:
*   **Condition A (Normal Market):** 
    *   `IF state_of_calamity == FALSE AND store.recidivism_index == 0`
    *   **Action:** Laravel uses `DomPDF` to generate a "Letter of Inquiry (LOI)". Sets a 48-hour expiration timestamp. Notifies Vendor Portal.
*   **Condition B (Emergency / Repeat Offender):** 
    *   `IF state_of_calamity == TRUE OR store.recidivism_index > 0`
    *   **Action:** Laravel drops the 10% allowance logic. It uses `DomPDF` to generate an immediate "Show Cause Order (SCO)". Escalates case to Field Dispatch queue.

### Module 6: Vendor Rebuttal Portal (React -> Laravel)
*   **Action:** Vendor logs in and views the PDF notice.
*   **Upload Restraint:** The React UI provides an upload button for rebuttal evidence. Laravel backend strictly validates the MIME type (only `application/pdf`, `image/jpeg`, `image/png`). If the 48-hour timestamp has expired, the Laravel API rejects the upload with a 403 Forbidden error.

---
## 6. Development Phasing for the AI Agent
Agent, do not build everything at once. Execute in this strict order:
1.  **Phase 1:** Configure Laravel API, connect to `cap_dti`, and build all Migrations and basic REST controllers.
2.  **Phase 2:** Develop the React Web Dashboard (Auth, Map Pinning, Temporal Charts).
3.  **Phase 3:** Develop the Flutter Officer App (SQLite sync logic, UI, dual signature).
4.  **Phase 4:** Develop the Flutter Consumer App (Camera lock, ML Kit OCR, Bounding box).
5.  **Phase 5:** Integrate the DomPDF Bifurcated Legal Engine in Laravel.