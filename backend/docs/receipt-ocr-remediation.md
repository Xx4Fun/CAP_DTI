# Receipt OCR remediation report

## Incident summary

Continuous receipt reports were repeatedly ending in `Needs recapture` because the processing pipeline sampled only the first six seconds of a recording, rejected frames before OCR using rigid image thresholds, and required exact text overlap between adjacent frames. OCR infrastructure failures were also presented to customers as capture failures.

## Corrected processing contract

The original continuous video is the canonical evidence source. The server now:

1. validates and stores one video at sequence zero;
2. extracts two frames per second across the full recording, with no six-second cap;
3. selects the best frame from each chronological window while retaining quality diagnostics;
4. records source sequence and video timestamp on every vaulted extracted frame;
5. runs primary and fallback OCR passes and selects the stronger usable result;
6. distinguishes technical OCR failure from evidence uncertainty;
7. verifies fuzzy adjacent-frame continuity independently from merchant identity;
8. matches the receipt header against the selected store name or registered owner;
9. requires parsed items, an explicit total, and centavo-level item/discount reconciliation;
10. exposes read-only OCR results for customer confirmation.

## Public outcomes and reason codes

Only evidence uncertainty becomes `Needs recapture`:

| Code | Cause | Customer action |
| --- | --- | --- |
| `INSUFFICIENT_FRAMES` | Too little decodable video evidence | Record at least three seconds and show the whole receipt |
| `TEXT_UNREADABLE` | OCR ran but could not read enough text | Improve focus, lighting, and receipt flatness |
| `INCOMPLETE_SCAN` | Adjacent views do not prove top-to-bottom continuity | Move slowly and keep overlapping text visible |
| `STORE_NOT_CONFIRMED` | Header does not match the selected store or owner | Capture the store header clearly or choose the correct store |
| `ITEMS_NOT_FOUND` | No complete item lines were parsed | Capture item names and prices clearly |
| `TOTAL_NOT_FOUND` | No explicit payable total was parsed | Include the receipt footer and total |
| `TOTAL_MISMATCH` | Parsed items and discounts do not reconcile to the total | Recapture all item and discount lines |

`OCR_UNAVAILABLE`, `OCR_TIMEOUT`, `OCR_FAILED`, and unexpected processing errors become `Processing failed`; they do not blame the customer or request recapture.

## Recovery and evidence integrity

- The browser uploads only the original video for continuous mode; browser-generated JPEGs are no longer treated as duplicate evidence.
- Tracking and resume credentials are generated before report submission and reused on idempotent retries, so a lost HTTP response does not lose access to the draft.
- A completed upload can retry report creation without uploading or scanning again.
- Recapture creates a new immutable evidence bundle and attempt number but retains the same report reference and prior attempt history.
- Confirmation accepts only a boolean acknowledgement. Customers cannot type, replace, or correct OCR item values.
- Drafts expose `created_at`; `submitted_at` remains null until confirmation.

## Production gates

Do not deploy the continuous scanner until all of these are configured and verified:

- `RECEIPT_EVIDENCE_DRIVER=s3` with a private durable bucket and valid endpoint credentials;
- FFmpeg and FFprobe available in the web and queue runtime;
- Tesseract available to the receipt-processing queue;
- database migration `2026_08_23_000001_add_receipt_processing_attempts.php` applied;
- queue timeout/retry settings remain longer than the receipt job timeout;
- 25 MiB Laravel/PHP and 30 MiB reverse-proxy upload contracts remain effective;
- an end-to-end 30-second long-receipt fixture reaches `Ready for confirmation`, and forced OCR outage reaches `Processing failed`.

This change set does not deploy, migrate production, or reprocess existing reports automatically.

