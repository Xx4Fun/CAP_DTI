# PRICE-Watch Consumer PWA API Documentation

## Overview
This document specifies the RESTful API endpoints for the PRICE-Watch Consumer Progressive Web Application (PWA). All public endpoints are designed for zero-install browser access without requiring account creation for basic transparency and reporting.

Base URL: `http://localhost:8000/api` (or environment-configured `VITE_API_BASE_URL`)

---

## 1. Public Information Endpoints

### `GET /api/public/config`
Retrieves global application configuration and regulatory state.
* **Authentication:** None
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "Public configuration retrieved successfully.",
  "data": {
    "app_name": "PRICE-Watch",
    "state_of_calamity": false,
    "privacy_notice_version": "1.0",
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
  * `privacy_notice_version`: String ("1.0")
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

### `POST /api/public/reports/{reference}/confirm-ocr`
Allows the consumer to confirm or correct recognized OCR product fields.
* **Authentication:** None (Requires `tracking_token` parameter)
* **Request Body:**
```json
{
  "tracking_token": "trk_9a8b7c6d5e4f3a2b",
  "confirmed_items": [
    {
      "commodity_id": 1,
      "commodity_name": "Regular Milled Rice",
      "receipt_price": 45.00,
      "srp_baseline": 38.00,
      "quantity": 1
    }
  ]
}
```
* **Response (200 OK):**
```json
{
  "success": true,
  "message": "OCR field corrections stored successfully.",
  "data": {
    "report_reference": "REP-20260722-A8F2",
    "status": "Under initial evaluation"
  }
}
```

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
