# PRICE-Watch Cross-User Integration Specification

## Overview
This document specifies the end-to-end regulatory workflow connecting all four actor nodes across the PRICE-Watch system:
1. **Consumer PWA** (`customer-pwa/`)
2. **DTI Administrator / Evaluator** (`web/` React Dashboard)
3. **DTI Field Monitoring Officer** (`mobile/` Flutter Mobile App)
4. **Vendor / Store Manager** (`web/` Vendor Rebuttal Portal)

---

## Complete Cross-User Lifecycle

```
[ CONSUMER (PWA) ]
  ├── 1. Opens zero-install PWA -> Searches SRP baseline
  ├── 2. Selects store -> Requests Capture Session Token from Backend
  ├── 3. Captures live camera receipt photo -> SHA-256 Hash + UUID
  └── 4. Receives Public Reference (REP-XXXX) + Secret Tracking Token
        │
        ▼
[ DTI EVALUATOR (Web Dashboard) ]
  ├── 5. Views Consumer Report Queue (`/api/tips` & `/api/public/reports`)
  ├── 6. Reviews OCR extracted fields & Redacted Receipt Working Copy
  └── 7. Action: Validates anomaly -> Triggers Field Verification Dispatch
        │
        ▼
[ DTI FIELD OFFICER (Mobile App) ]
  ├── 8. Executes Downsync (`/api/sync/down`) -> Receives assigned dispatch task
  ├── 9. Visits store -> Encodes shelf price & collects Dual Digital Signatures
  └── 10. Executes Upsync (`/api/sync/up`) -> Submits signed inspection record
        │
        ▼
[ DTI EVALUATOR (Web Dashboard) ]
  ├── 11. Receives verified inspection log
  └── 12. Executes Legal Engine Dispatch (`/api/notices/dispatch`)
         ├── Condition A (Normal & Recidivism = 0): Generates Letter of Inquiry (LOI)
         └── Condition B (Calamity OR Recidivism > 0): Generates Show Cause Order (SCO)
        │
        ▼
[ VENDOR / STORE MANAGER (Vendor Portal) ]
  ├── 13. Receives LOI / SCO notice notification
  ├── 14. Views PDF notice & 48-hour response countdown timer
  └── 15. Uploads Rebuttal evidence document (PDF/JPG/PNG) via `/api/notices/{id}/rebuttal`
        │
        ▼
[ DTI EVALUATOR (Web Dashboard) ]
  ├── 16. Reviews Vendor Rebuttal
  └── 17. Closes case -> Records final disposition ("Case Resolved / Compliance Verified")
        │
        ▼
[ CONSUMER (PWA) ]
  └── 18. Tracks report via `/api/public/reports/track?reference=...&token=...`
        └── Sees sanitized status update: "Resolved / Case Closed by DTI"
```

---

## Traceable Data Model Mapping

| System Node | Database Table | Key Identifiers | Status Transition |
| :--- | :--- | :--- | :--- |
| **Consumer PWA** | `consumer_reports` | `report_reference`, `tracking_token_hash`, `submission_uuid` | `Submitted` → `Under initial evaluation` |
| **DTI Evaluator** | `citizen_tips` / `consumer_reports` | `id`, `status` | `pending_evaluation` → `field_dispatch_created` |
| **Field Officer** | `temporal_inspections` | `store_id`, `srp_id`, `inspection_timestamp` | `field_verification_in_progress` → `field_verification_completed` |
| **DTI Evaluator** | `legal_notices` | `id`, `notice_type` (LOI / SCO), `due_date_timestamp` | `vendor_notice_issued` → `awaiting_vendor_response` |
| **Vendor** | `legal_notices` | `id`, `status` | `awaiting_vendor_response` → `vendor_response_received` |
| **DTI Evaluator** | `report_status_histories` | `consumer_report_id`, `new_status`, `public_message` | `regulatory_review` → `Resolved` / `Closed` |
