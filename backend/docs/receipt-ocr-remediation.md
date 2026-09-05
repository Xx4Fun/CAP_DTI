# Receipt OCR remediation

## Current capture contract

New Customer receipt reports use `guided_photos_v1`:

1. open the rear camera without gallery import;
2. capture one clear full-receipt image when it fits;
3. add ordered, overlapping sections for a long receipt;
4. preview or retake a section before upload;
5. store each original image privately with its server-computed SHA-256;
6. preprocess and OCR only the submitted still images;
7. show the originals and system extraction read-only;
8. submit the unchanged evidence and extraction for DTI evaluation.

Continuous WebM capture is no longer selected for new Customer reports. The video pipeline and existing video, extracted-frame, and stitched-preview assets remain available for historical reports.
Legacy `single_image_v1` session creation is rejected; new session requests default to guided stills, and Customer-supplied OCR JSON is prohibited at the report boundary.

## Evidence and recapture

- One source image is sufficient; up to 12 ordered images are accepted.
- Multi-image captures require adjacent OCR overlap only when every section produced OCR text.
- Retaking one section or adding a section creates a new evidence bundle and attempt number. Unchanged sections are copied with provenance metadata, while prior bundles remain intact.
- Restarting capture creates a fresh guided-photo attempt under the same report reference.
- Admin can inspect original assets from current and prior attempts. Derived legacy assets are labeled separately.
- Customer evidence endpoints expose only current original source images and require the report resume credential.
- An original must still exist and match its server-recorded SHA-256 before it can be carried into a new attempt, displayed, downloaded, or submitted.

## Outcome rules

`Needs recapture` is limited to evidence defects:

| Code | Meaning | Customer action |
| --- | --- | --- |
| `INSUFFICIENT_FRAMES` | No usable receipt image exists | Capture at least one receipt image |
| `TEXT_UNREADABLE` | An image is unreadable or too poor for OCR | Improve focus, lighting, and receipt flatness |
| `INCOMPLETE_SCAN` | Multiple sections do not overlap enough to prove continuity | Retake the affected section with visible overlap |

Clear evidence with uncertain OCR remains `Ready for confirmation` with `manual_review_required` and warnings such as `OCR_INCOMPLETE`, `STORE_NOT_CONFIRMED`, `ITEMS_NOT_FOUND`, `TOTAL_NOT_FOUND`, or `TOTAL_MISMATCH`. The raw OCR result is preserved for Admin review.

`OCR_UNAVAILABLE`, `OCR_TIMEOUT`, `OCR_FAILED`, and unexpected processing errors become `Processing failed`. The Customer can retry processing against the same immutable evidence; technical failures are not described as bad captures.

## No Customer correction layer

- Customer review contains no editable OCR fields or item-row controls.
- Confirmation accepts only an acknowledgement and rejects all receipt-value fields.
- New reports keep `consumer_confirmed_json` and item `consumer_correction_json` null and do not set item `consumer_confirmed`.
- `consumer_confirmed_at` is retained as the evidence-review/submission timestamp for schema compatibility.
- The legacy correction columns remain in the schema only to preserve historical data; active Customer and Admin API responses do not use them.
- DTI evaluator findings remain a separate, audited layer.

## Production gates

Before release, verify:

- `RECEIPT_EVIDENCE_DRIVER=s3` (or equivalent durable private object storage) and valid credentials;
- Tesseract is available to the receipt-processing worker;
- receipt queue timeout and retry settings exceed the job timeout;
- the receipt-processing-attempt migration is applied;
- a real Android Chrome capture covers a one-image receipt, overlapping long receipt, one-section retake, OCR outage retry, and Admin review of all originals;
- historical video evidence remains downloadable. FFmpeg and FFprobe are needed only while legacy video processing or reprocessing is supported.

This implementation does not deploy, migrate production, or reprocess existing reports automatically.
