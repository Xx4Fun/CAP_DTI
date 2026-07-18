# Phase 5: DomPDF Bifurcated Legal Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install and configure Barryvdh DomPDF, implement the bifurcated legal notice routing logic (generating LOI vs SCO notices dynamically), establish the secure private receipt vault, build the rebuttal validation checks, and wire up the setting toggle for Calamity Mode in Laravel.

---

## Plan Decomposition

### Task 1: Install and Configure Barryvdh DomPDF

**Files:**
- Modify: `backend/composer.json`
- Create: `backend/resources/views/notices/loi.blade.php`
- Create: `backend/resources/views/notices/sco.blade.php`

- [ ] **Step 1: Install barryvdh/laravel-dompdf**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  composer require barryvdh/laravel-dompdf
  ```
  Expected: Package installed successfully.

- [ ] **Step 2: Create Blade templates for PDF generation**
  - Create [loi.blade.php](file:///c:/CAP101_DTI_SYS/backend/resources/views/notices/loi.blade.php): styling for the official "Letter of Inquiry" containing store details, pricing anomaly, and the 48-hour rebuttal notice warning.
  - Create [sco.blade.php](file:///c:/CAP101_DTI_SYS/backend/resources/views/notices/sco.blade.php): styling for the official "Show Cause Order" (red headers, strict warnings, drop of 10% allowance, direct escalation warning).

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add backend/composer.json backend/composer.lock
  git commit -m "feat: install laravel-dompdf package"
  ```

---

### Task 2: Build Bifurcated Legal Engine & Notice Routing

**Files:**
- Create: `backend/app/Http/Controllers/LegalNoticeController.php`
- Create: `backend/tests/Feature/LegalNoticeTest.php`

- [ ] **Step 1: Write LegalNoticeController logic**
  Create `backend/app/Http/Controllers/LegalNoticeController.php` containing:
  - `dispatchNotice(Request $request)`: Takes a `store_id` (or inspection ID), checks `state_of_calamity` system flag, checks `store.recidivism_index`, and routes:
    * **Standard LOI Notice**: generated if `state_of_calamity == false && store.recidivism_index == 0`. Expire timestamp set to `now()->addHours(48)`.
    * **Show Cause Order (SCO)**: generated immediately if `state_of_calamity == true || store.recidivism_index > 0`. Triggers escalation to field dispatch. Increments `recidivism_index` by 1.
    * Saves generated notice PDF binary directly into the storage.
  - `index()`: lists notices for logged in user.
  - `show($id)`: returns details and downloads the PDF notice.

- [ ] **Step 2: Implement integration tests**
  Create `backend/tests/Feature/LegalNoticeTest.php` asserting that LOI is generated under standard markets, SCO is generated under calamity/recidivism markets, and due dates match the specifications.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add backend
  git commit -m "feat: implement LegalNotice controller and bifurcated PDF generation logic"
  ```

---

### Task 3: Rebuttal Upload Gateway & Validation

**Files:**
- Modify: `backend/app/Http/Controllers/LegalNoticeController.php`
- Modify: `backend/routes/api.php`

- [ ] **Step 1: Implement Rebuttal Submission Action**
  Inside `LegalNoticeController.php`:
  - Add `uploadRebuttal(Request $request, $id)`:
    * Fetch notice.
    * Check if `now() > notice.due_date_timestamp`. If expired, throw `403 Forbidden` Exception.
    * Validate file MIME types strictly (`application/pdf`, `image/jpeg`, `image/png`).
    * Save rebuttal file in storage, change notice status to `'rebutted'`.
  - Wire routes in `routes/api.php`.

- [ ] **Step 2: Run validation tests**
  Update `LegalNoticeTest.php` asserting:
  - Allowed files (PDF, JPG, PNG) succeed.
  - Invalid types (EXE, ZIP, etc.) fail validation.
  - Submitting after 48 hours throws a `403 Forbidden` response.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add backend
  git commit -m "feat: implement rebuttal upload gateway and timestamp validation checks"
  ```

---

### Task 4: Private Receipt Vaulting & Calamity APIs

**Files:**
- Create: `backend/app/Http/Controllers/CitizenTipController.php`
- Create: `backend/app/Http/Controllers/CalamityController.php`

- [ ] **Step 1: Implement CitizenTipController**
  Create `backend/app/Http/Controllers/CitizenTipController.php` containing:
  - `store(Request $request)`: Validates receipt image, text extraction lines, and SHA-256 hash. Saves raw image directly to secure `storage/app/private/receipt_vault` (locked from public HTTP). Saves OCR json lines inside `citizen_tips`.
  - `index()`: returns list of pending citizen tips for review queue.
  - `updateStatus(Request $request, $id)`: validates or dismisses tips.

- [ ] **Step 2: Implement CalamityController**
  Create `backend/app/Http/Controllers/CalamityController.php` providing endpoints to get and set the global setting `state_of_calamity` (toggled by admin).

- [ ] **Step 3: Register API Routes**
  Configure new endpoints inside `routes/api.php`.

- [ ] **Step 4: Verify test suites**
  Run:
  ```powershell
  $env:Path = "C:\Users\noych\AppData\Local\Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe;" + $env:Path
  php artisan test
  ```
  Expected: All tests pass.

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add backend
  git commit -m "feat: add citizen tip private vault upload and calamity settings API"
  ```
