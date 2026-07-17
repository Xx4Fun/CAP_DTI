# Phase 3: Flutter Officer App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a Flutter mobile application under `/mobile`, configure offline-first Relational SQLite persistence via `sqflite`, implement the Laravel downsync/upsync engine, and build the inspection view with dual signature capture and local anomaly mathematical checking.

**Architecture:** Offline-first mobile app. Persists sync states locally and syncs back when a network connection is available.

---

## Plan Decomposition

### Task 1: Scaffold Flutter Project & Dependencies

**Files:**
- Create: `mobile/pubspec.yaml`
- Modify: `mobile/lib/main.dart`

- [ ] **Step 1: Check flutter create help options**
  Run:
  ```powershell
  flutter create --help
  ```
  Expected: Shows all template and option flags.

- [ ] **Step 2: Scaffold Flutter project**
  Scaffold a new Flutter app named `price_watch` under `/mobile`:
  ```powershell
  flutter create --org gov.dti.antique --project-name=price_watch mobile
  ```
  Expected: Scaffold completed successfully with Dart code in `/mobile/lib`.

- [ ] **Step 3: Configure Dependencies**
  Modify `mobile/pubspec.yaml` to include the required database and utility libraries:
  ```yaml
  dependencies:
    flutter:
      sdk: flutter
    sqflite: ^2.3.0
    path: ^1.8.3
    http: ^1.1.0
    shared_preferences: ^2.2.0
    signature: ^5.4.0 # For officer/vendor drawing signatures
  ```

- [ ] **Step 4: Fetch packages**
  Run:
  ```powershell
  cd mobile
  flutter pub get
  ```
  Expected: Successfully resolves and caches packages.

- [ ] **Step 5: Commit**
  Run:
  ```bash
  git add mobile
  git commit -m "feat: scaffold mobile Flutter application and add dependencies"
  ```

---

### Task 2: SQLite Relational Database Helper

**Files:**
- Create: `mobile/lib/helpers/db_helper.dart`

- [ ] **Step 1: Write SQLite DB Schema Initialization**
  Create `mobile/lib/helpers/db_helper.dart` containing:
  - SQLite database versioning and opening helper.
  - SQL schema execution creating local tables:
    * `stores` (id, dti_sec_number, store_name, owner_name, latitude, longitude, address, recidivism_index)
    * `srp_bulletins` (id, commodity_name, baseline_price, effective_date, is_active)
    * `temporal_inspections` (id, store_id, srp_id, recorded_price, is_flagged, inspection_timestamp, sync_timestamp, officer_signature, vendor_signature, is_synced)
  - Helper functions to insert/upsert data and fetch lists.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add mobile/lib/helpers/db_helper.dart
  git commit -m "feat: add SQLite DB Helper and local schema definitions"
  ```

---

### Task 3: Sync Engine Service

**Files:**
- Create: `mobile/lib/services/sync_service.dart`

- [ ] **Step 1: Implement pre-deployment downsync & upsync**
  Create `mobile/lib/services/sync_service.dart` containing:
  - `syncDown(String token)`: calls Laravel API endpoint `/api/sync/down` with the bearer token. Parses the JSON array of stores, bulletins, and recent inspections and performs SQLite bulk transactional insert/upsert.
  - `syncUp(String token)`: queries all unsynced inspections (`is_synced = 0`) from SQLite, constructs the JSON payload, and POSTs it to `/api/sync/up`. Marks synced inspections as `is_synced = 1` in SQLite upon success.

- [ ] **Step 2: Commit**
  Run:
  ```bash
  git add mobile/lib/services/sync_service.dart
  git commit -m "feat: implement SQLite sync down and sync up service engine"
  ```

---

### Task 4: Offline Inspection Form with Dual Signature

**Files:**
- Create: `mobile/lib/screens/inspection_screen.dart`
- Modify: `mobile/lib/main.dart`

- [ ] **Step 1: Build Store Selection & Inspection Form UI**
  Create `mobile/lib/screens/inspection_screen.dart` featuring:
  - Store text search/filtering: queries the local `stores` SQLite table.
  - Commodity list: lets the officer select the target item and displays its baseline SRP.
  - Off-line math checking: validation logic comparing inputs to baseline:
    ```dart
    bool isFlagged = recordedPrice > (baselinePrice * 1.10);
    ```
  - Dual Signature Component: implements two signature drawing pads using the `signature` library (one for the Officer and one for the Vendor). Captures the vector as Base64 strings.
  - SQLite commit: saves the inspection locally as unsynced (`is_synced = 0`).

- [ ] **Step 2: Connect main layout**
  Update `mobile/lib/main.dart` to render the authentication interface and the dynamic tabs (Inspection Form & Sync dashboard).

- [ ] **Step 3: Validate Dart formatting & build**
  Run:
  ```powershell
  cd mobile
  flutter analyze
  ```
  Expected: 0 issues or errors found.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add .
  git commit -m "feat: add offline inspection screen, dual signature pad, and complete Phase 3"
  ```
