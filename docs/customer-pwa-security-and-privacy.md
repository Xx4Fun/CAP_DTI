# PRICE-Watch Consumer PWA Security & Privacy Specification

## 1. Security Architecture & Threat Model

### Threat Controls & Mitigations

| Threat Vector | Mitigation Strategy | Technical Implementation |
| :--- | :--- | :--- |
| **Tampered / Photoshopped Files** | Live-camera stream capture requirement; gallery picker disabled for formal submissions; server-side magic byte validation & SHA-256 hash checks. | `getUserMedia()` live stream capture; magic bytes MIME validation (`image/jpeg`, `image/png`); SHA-256 duplicate detection. |
| **Replay & Automated Bots** | Server-issued short-lived capture tokens; Client submission UUID idempotency key; Rate limiting per IP and capture session. | `capture_sessions` token validation; rate-limiters on `/api/public/reports` (e.g. 5 requests/min per IP). |
| **Unauthorized Evidence Access** | Tiered storage model; Original sealed evidence kept in private non-public directory. | Original image stored in `storage/app/private/receipt_vault`. Access strictly via authenticated DTI Evaluator route. |
| **Data Scraping & Identifiers** | Non-sequential public references; Unguessable secret tracking tokens stored as SHA-256 hashes. | `report_reference` (e.g. `REP-20260722-A8F2`); `tracking_token` stored as bcrypt/SHA-256 hash in database. |
| **XSS & Stored Injections** | Strict output escaping; Content Security Policy; HTML sanitization of consumer-confirmed fields. | React JSX escaping; JSON request schema validation; Sanitized DTI evaluation notes. |

---

## 2. Tiered Evidence Storage & Privacy Model

### Evidence Tier Structure

```
[ LEVEL 1: SEALED ORIGINAL ]
  └── Location: storage/app/private/receipt_vault/
  └── Access: DTI Evaluator / Super Admin (Authenticated & Audit Logged)
  └── Purpose: Forensic reference during legal notice disputes

[ LEVEL 2: REDACTED WORKING COPY ]
  └── Location: storage/app/private/receipt_working/
  └── Obscured: Cashier names, loyalty card numbers, personal payment card digits
  └── Access: DTI Administrative Reviewers & Field Officers

[ LEVEL 3: STRUCTURED MINIMUM PUBLIC DATA ]
  └── Location: Database (consumer_reports & srp_bulletins)
  └── Information: Establishment name, commodity, recorded price, timestamp, public status
  └── Access: Public tracking page (Requires Reference + Secret Token)
```

---

## 3. Privacy-by-Design & User Consent

### Privacy Notice Versioning & Consent
Before requesting live camera permissions or submitting formal reports, the Consumer PWA renders an explicit, non-blocking modal requiring consent:
1. **Camera Purpose:** Capturing product and shelf/receipt price text for regulatory evaluation.
2. **Data Usage:** Unrelated receipt items (e.g. personal groceries) and cashier details are redacted during preliminary DTI review.
3. **Audit Logged Acceptance:** Every report submission records `privacy_notice_version` (e.g. "1.0"), `user_ip`, `user_agent`, and acceptance timestamp.
4. **No Unsanitised Public Exposure:** Consumer identity remains anonymous unless legally required during formal proceedings.

---

## 4. Local Storage & Service Worker Cache Policy

1. **Service Worker Caching Rules:**
   * **Cache-First:** Application shell (`/index.html`), JavaScript bundles, CSS stylesheets, web app manifest, app logos, static icons.
   * **Network-First:** Live SRP commodity search, establishment directory, calamity state, report status tracking.
   * **NEVER Cache:** Receipt images, OCR json payloads, capture tokens, secret tracking tokens, private DTI notes.

2. **Temporary Draft Local Storage Policy:**
   * In case of internet drop during formal submission, pending reports are stored strictly in **IndexedDB** (never localStorage or cookies).
   * Pending drafts expire and are purged automatically after **24 hours**.
   * Drafts are immediately deleted from IndexedDB upon confirmed server receipt.
