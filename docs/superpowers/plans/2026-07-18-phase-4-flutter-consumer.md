# Phase 4: Flutter Consumer App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Consumer scanner screen in the Flutter mobile application under `/mobile`, including camera hardware layout locking, a bounding box overlay, regex text validation, cryptographic image hashing (SHA-256), and secure multipart transmission of the receipt vault payload to Laravel's private storage.

**Architecture:** A secure consumer scanning flow. Employs Flutter's camera package to capture images directly from the lens (disabling gallery picks), processes/validates OCR decimal patterns, hashes the file bytes, and uploads the metadata and image to the API.

---

## Plan Decomposition

### Task 1: Add Consumer Packages & Configuration

**Files:**
- Modify: `mobile/pubspec.yaml`

- [ ] **Step 1: Add packages**
  Add `camera` and `crypto` libraries to `mobile/pubspec.yaml`:
  ```yaml
  dependencies:
    camera: ^0.10.5+9
    crypto: ^3.0.3
  ```

- [ ] **Step 2: Fetch packages**
  Run:
  ```powershell
  cd mobile
  flutter pub get
  ```

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add mobile/pubspec.yaml
  git commit -m "feat: add camera and crypto packages for Consumer scanner"
  ```

---

### Task 2: Implement Camera Scanner Screen with Bounding Box

**Files:**
- Create: `mobile/lib/screens/consumer_scan_screen.dart`

- [ ] **Step 1: Create Bounding Box camera widget**
  Create `mobile/lib/screens/consumer_scan_screen.dart` featuring:
  - Hardware camera controller initialization.
  - Custom UI stack overlay showing a bright target Bounding Box overlay (aspect ratio locked to receipts).
  - Explicit omission of any "Import from Gallery" buttons (enforcing physical lens capture lock).
  - Captures receipt photo on trigger.

- [ ] **Step 2: Cryptographic hashing and Regex decimal parser**
  Within `consumer_scan_screen.dart`:
  - Calculate SHA-256 hash of the captured image file bytes.
  - Implement OCR text validator that parses simulated/recognized lines for decimal patterns using `RegExp(r'\d+\.\d{2}')`.
  - Compile the JSON OCR payload structure.

- [ ] **Step 3: Encrypted multipart upload**
  - POSTs multipart/form-data to Laravel API `/api/tips` containing:
    * `store_id` (selected store ID)
    * `image` (raw image file bytes)
    * `image_hash` (the calculated SHA-256 checksum)
    * `extracted_text_json` (serialized JSON containing OCR matches)
  - Shows success validation check results to the user.

- [ ] **Step 4: Commit**
  Run:
  ```bash
  git add mobile/lib/screens/consumer_scan_screen.dart
  git commit -m "feat: implement Consumer scan screen with bounding box and cryptographic upload"
  ```

---

### Task 3: Assemble Tab Layout and Verify Build

**Files:**
- Modify: `mobile/lib/main.dart`

- [ ] **Step 1: Connect Consumer view in main.dart**
  - Add "Consumer Mode" option to login screen or dynamic tab options.
  - Connect the `<ConsumerScanScreen />` widget to the tab navigator view list.

- [ ] **Step 2: Analyze & Test**
  Run:
  ```powershell
  cd mobile
  flutter analyze
  flutter test
  ```
  Expected: 0 warnings, 0 compile errors, and tests pass successfully.

- [ ] **Step 3: Commit**
  Run:
  ```bash
  git add .
  git commit -m "feat: integrate Consumer scan screen and verify Flutter build"
  ```
