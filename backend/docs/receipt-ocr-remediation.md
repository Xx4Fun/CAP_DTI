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
- Guided multi-image captures check adjacent OCR overlap. Unverified OCR continuity is flagged for DTI review; an OCR mismatch alone does not prove evidence is incomplete. Historical continuous-video continuity handling is unchanged.
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
| `INCOMPLETE_SCAN` | Historical video continuity could not be verified | Recapture with guided still images |

Clear evidence with uncertain OCR remains `Ready for confirmation` with `manual_review_required` and warnings such as `OCR_INCOMPLETE`, `STORE_NOT_CONFIRMED`, `ITEMS_NOT_FOUND`, `TOTAL_NOT_FOUND`, or `TOTAL_MISMATCH`. The raw OCR result is preserved for Admin review.

Guided stills can also carry `INCOMPLETE_SCAN` as an unverified-continuity warning, not a recapture decision. The Customer must inspect the actual photos for completeness; the interface does not claim readable photos merely because OCR returned text.

`OCR_UNAVAILABLE`, `OCR_TIMEOUT`, `OCR_FAILED`, and unexpected processing errors become `Processing failed`. The Customer can retry processing against the same immutable evidence; technical failures are not described as bad captures.

## No Customer correction layer

- Customer review contains no editable OCR fields or item-row controls.
- Confirmation accepts only an acknowledgement and rejects all receipt-value fields.
- New reports keep `consumer_confirmed_json` and item `consumer_correction_json` null and do not set item `consumer_confirmed`.
- `consumer_confirmed_at` is retained as the evidence-review/submission timestamp for schema compatibility.
- The legacy correction columns remain in the schema only to preserve historical data; active Customer and Admin API responses do not use them.
- DTI evaluator findings remain a separate, audited layer.

## Customer review reliability

- Review is photo-first, with full-size viewing and section-specific retakes. Structured receipt values are read-only; raw OCR technical output is shown in Admin, not the Customer UI. Existing API raw fields remain for compatibility.
- All current original sections must download and display before Customer acknowledgement/submission. Failed sections remain visible with retry; loaded originals are reused.
- Review status callbacks do not trigger repeated loading. Processing polls every eight seconds without overlap and stops in terminal states.
- HTTP 429 pauses requests according to `Retry-After` (60 seconds when unavailable). Retry does not discard the draft. Processing and review errors remain visible.
- Recapture completion returns to fresh processing, including same-route navigation; new attempts reset acknowledgement. Full restart requires confirmation and leaves historical uploaded attempts intact.
- Item confidence is null unless actually measured. Legacy fixed 0.8 values are not presented as measured confidence. Symbol-only and numeric-only labels are not accepted as product names; raw observations remain preserved.
- OCR pass selection ranks actual structured item extraction, total availability, then measured word confidence, with the primary pass winning ties. Fragment count is not a quality score. Separate product/price columns remain unresolved rather than guessed.
- Merchant display uses a nullable unambiguous original header line, never a replacement drawn from the selected store. Raw header observations remain available to Admin.

## Production gates

### OCR runtime and diagnostics

- The shared Tesseract launcher sets `OMP_THREAD_LIMIT=1` only for its child process.
- Receipt primary and fallback passes use `TESSERACT_RECEIPT_PASS_TIMEOUT_SECONDS` (default 60 seconds).
- A monotonic processing deadline uses `TESSERACT_RECEIPT_PROCESSING_BUDGET_SECONDS` (default and maximum 300 seconds). Each pass is limited to the remaining whole seconds; no new pass starts with less than one second remaining. Storage/preprocessing calls are checked at stage boundaries, not forcibly interrupted. The queue job retains its 360-second hard timeout.
- Budget exhaustion is `OCR_TIMEOUT` / `Processing failed`, with `diagnostics.budget_exhausted=true`. Original evidence remains unchanged for retry.
- Bundle processing results retain each pass's status, duration, timeout, original OCR result, and selected-pass provenance. These private diagnostics now contain OCR text and must not be logged or added to public status responses; access remains within authorized Admin evidence review.
- Processing status reads the latest history entry without changing the chronological audit timeline. Customer guidance distinguishes retrying OCR from refreshing status.
- Run real-engine checks explicitly with `php artisan test tests/Integration/ReceiptOcrIntegrationTest.php tests/Integration/TesseractIntegrationTest.php`. Receipt samples require GD FreeType and a system Consolas, DejaVu Sans Mono, or Liberation Mono font; missing prerequisites are reported as skipped. These generate isolated synthetic short/overlapping receipts; they do not replace Android captures or Render-worker verification.
- Extraction accuracy is unchanged by this runtime fix: separated product/price columns may still produce incomplete parsed items or totals. Preserve the OCR text and uncertainty warnings for DTI review; successful processing is not proof of complete extraction.

Before release, verify:

- `RECEIPT_EVIDENCE_DRIVER=s3` (or equivalent durable private object storage) and valid credentials;
- Tesseract is available to the receipt-processing worker;
- receipt queue timeout and retry settings exceed the job timeout;
- the receipt-processing-attempt migration is applied;
- a real Android Chrome capture covers a one-image receipt, overlapping long receipt, one-section retake, OCR outage retry, and Admin review of all originals;
- historical video evidence remains downloadable. FFmpeg and FFprobe are needed only while legacy video processing or reprocessing is supported.

This implementation does not deploy, migrate production, or reprocess existing reports automatically.
