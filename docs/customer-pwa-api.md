# PRICE-Watch Consumer PWA API Documentation

## Overview
This document specifies the RESTful API endpoints for the PRICE-Watch Consumer Progressive Web Application (PWA). All public endpoints are designed for zero-install browser access without requiring account creation for basic transparency and reporting.

Base URL: `http://localhost:8000/api` (or environment-configured `VITE_API_BASE_URL`)

Image fields: `image_path` in `/public/commodities`, `/public/establishments`, every comparison `product` (`/public/compare-price`, `/public/scan-tag/compare`) and `/public/scan-tag` candidates is an absolute URL or `null`. Render it as given; never map it to a bundled file (see `DECISIONS.md` 2026-10-03).

---

## 1. Public Information Endpoints

### `GET /api/public/config`
Retrieves global application configuration and regulatory state.
`state_of_calamity` follows a confirmed formal declaration effective at the current Manila date, including its end date. Legacy cache flags are ignored.
* **Authentication:** None
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Public configuration retrieved successfully.",
  "data": {
    "app_name": "PRICE-Watch",
    "state_of_calamity": false,
    "privacy_notice_version": "1.1",
    "max_upload_size_mb": 10,
    "allowed_mime_types": ["image/jpeg", "image/png", "image/webp"],
    "last_updated_at": "2026-07-22T00:00:00Z"
  }
}
```

### `GET /api/public/commodities`
Search or browse regulated commodities and active SRP bulletins.
* **Authentication:** None
* **Query Parameters:**
  * `query` (optional): Filter by commodity name, brand, variant, category
  * `category` (optional): Filter by category
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Commodities retrieved successfully.",
  "data": [
    {
      "id": 1,
      "commodity_name": "Regular Milled Rice",
      "brand": "NFA / Local",
      "variant": "Standard Grade",
      "package_size": "1 kg",
      "unit": "kg",
      "baseline_price": 38.00,
      "reference": {
        "status": "available",
        "type": "standard_srp",
        "value": 38.00,
        "label": "SRP baseline (provisional)",
        "source": "DTI SRP Bulletin",
        "effective_date": "2026-07-15",
        "source_id": 1
      },
      "effective_date": "2026-07-15",
      "regulatory_state": "SRP Active",
      "is_active": true
    }
  ]
}
```

### `GET /api/public/establishments`
Search or browse verified participating establishments.
* **Authentication:** None
* **Query Parameters:**
  * `query` (optional): Search by store name, owner, SEC number, or address
  * `address` (optional): Filter by locality/address
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Establishments retrieved successfully.",
  "data": [
    {
      "id": 1,
      "dti_sec_number": "SEC-CS202612345",
      "store_name": "San Jose Public Market - Stall 12",
      "owner_name": "Maria Clara",
      "latitude": 10.74240000,
      "longitude": 121.94060000,
      "address": "Stall 12, Public Market, San Jose de Buenavista, Antique",
      "recidivism_index": 0
    }
  ]
}
```

---

## 2. Capture Session & Formal Reporting Endpoints

### `POST /api/public/capture-session`
Requests a short-lived server-issued token required before launching live receipt capture.
* **Authentication:** None
* **Request Body:**
```json
{
  "store_id": 1
}
```
* **Response (201 Created):**
```json
{
  "success": true,
  "message": "Capture session initialized.",
  "data": {
    "capture_session_id": "cs_8f9a2b1c",
    "capture_token": "ct_sec_991823ab8171f290",
    "expires_at": "2026-07-22T02:00:00Z",
    "store_id": 1,
    "max_file_size": 10485760,
    "accepted_types": ["image/jpeg", "image/png", "image/webp"]
  }
}
```

### `POST /api/public/reports`
Submits a formal receipt report with live camera capture image, cryptographic SHA-256 hash, and idempotency UUID.
* **Authentication:** None (Protected by capture token and rate limits)
* **Form-Data Request:**
  * `submission_uuid`: String (UUID v4)
  * `capture_session_id`: String
  * `capture_token`: String
  * `store_id`: Integer
  * `image`: File (Image binary)
  * `image_hash`: String (SHA-256)
  * `extracted_text_json`: JSON string (Client OCR preview lines)
  * `privacy_notice_version`: String, the notice version the customer accepted: `"1.1"` (current) or `"1.0"` (older installed apps). Any other value is rejected with 422.
* **Response (201 Created):**
```json
{
  "success": true,
  "message": "Formal receipt report successfully submitted to DTI for evaluation.",
  "data": {
    "report_reference": "REP-20260722-A8F2",
    "secret_tracking_token": "trk_9a8b7c6d5e4f3a2b",
    "status": "Submitted",
    "submitted_at": "2026-07-22T01:40:00Z"
  }
}
```

### `GET /api/public/reports/{reference}/review`
Returns the saved receipt photos, merchant details, system extraction, warnings, and review capabilities. Ready drafts and consumer-confirmed reports are readable, including after later evaluation status changes.

* **Authentication:** `X-Report-Resume-Token` for drafts; `X-Tracking-Token` for submitted viewing. Report credentials remain private. Responses and evidence assets use `Cache-Control: no-store, private`.
* **Capability fields:** `read_only`, `can_submit`, `can_change_store`, `submission_block_reason` (null or `{code, message}`), `submitted_at`, `attempt_number`, and `results_available`.
* Clear merchant mismatch means status `mismatch`, a nonempty detected name, no uncertainty flag, and an existing selected store. It blocks submission; missing, partial, or uncertain merchant names remain eligible with a warning.
* Submitted items come from saved extraction snapshots, never evaluator-corrected item rows. Missing historical snapshots or photos are explicitly unavailable.
* `/reports/{reference}/receipt` in the Consumer PWA opens a view-only layout using the device's tracking credential. Photo zoom, back navigation, and retrying reads remain available.

### `POST /api/public/reports/{reference}/store`
Corrects the selected store of a ready, unsubmitted receipt. Uses the same report credentials as review.

```json
{
  "store_id": 2,
  "expected_store_id": 1,
  "expected_attempt_number": 1
}
```

Returns refreshed review data. Invalid stores or extra receipt fields return 422; stale store/attempt expectations and submitted receipts return 409. Repeating an already-applied correction is a no-op. Store and report locks protect eligibility; audit metadata records old/new store IDs and the receipt attempt. Saved extraction is rechecked without an AI request; unrelated warnings, photos, hashes, credentials, receipt values, and capture history remain intact. Capture session and evidence bundle store IDs retain their original association.

### `POST /api/public/reports/{reference}/confirm-ocr`
Confirms the saved system extraction and submits the receipt for DTI evaluation. Receipt values are read-only; edited item fields are prohibited.

* **Authentication:** `X-Report-Resume-Token` or `X-Tracking-Token` (existing `tracking_token` body parameter remains supported).
* **Request body:** `{ "consumer_confirmed": true }`.
* **Response:** `{ "success": true, "data": { "report_reference": "REP-...", "status": "Submitted", "submitted_at": "..." } }`; automatic assessment may return a later status.
* The final transaction returns 422 with `code: "STORE_MISMATCH"` for a clear merchant mismatch before submission, assessment, status history, or Citizen Tip writes.
* Successful confirmation revokes the draft resume credential. The Consumer PWA removes its local copy and retains the tracking credential for private viewing.

### `GET /api/public/reports/track`
Tracks a report's sanitized public status using public reference and secret tracking token.
* **Authentication:** None
* **Query Parameters:**
  * `reference`: String (e.g. `REP-20260722-A8F2`)
  * `token`: String (e.g. `trk_9a8b7c6d5e4f3a2b`)
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Report status retrieved.",
  "data": {
    "report_reference": "REP-20260722-A8F2",
    "store_name": "San Jose Public Market - Stall 12",
    "current_status": "Referred for field verification",
    "submitted_at": "2026-07-22T01:40:00Z",
    "status_history": [
      {
        "status": "Submitted",
        "public_message": "Report received and queued for evaluation.",
        "timestamp": "2026-07-22T01:40:00Z"
      },
      {
        "status": "Referred for field verification",
        "public_message": "Report referred to DTI Field Monitoring Officer for physical store inspection.",
        "timestamp": "2026-07-22T01:45:00Z"
      }
    ]
  }
}
```

---

## 3. Error Response Format
All endpoints return standard formatted JSON errors:
```json
{
  "success": false,
  "message": "Action Forbidden (403): Invalid or expired tracking token.",
  "data": null,
  "errors": {
    "token": ["The tracking token provided is invalid."]
  }
}
```
