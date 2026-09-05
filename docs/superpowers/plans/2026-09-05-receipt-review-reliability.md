# Receipt review reliability implementation

Approved in conversation: repair guided-still OCR and simplify Customer review, without Customer corrections, new OCR engines, new dependencies, commits, merges or deployments.

## Task 1: Backend extraction and evidence outcomes

Work only in backend/. Tests first. Reject symbol-only/numeric-only item names, including `$ 8.50`; preserve raw text and warn when extraction is incomplete. Unknown item confidence is null, never fixed 0.8. Rank successful OCR passes by plausible item count, recognized total presence, measured mean word confidence, primary on ties. Preserve both pass results and selection provenance in existing private processing JSON. Do not mix passes. Merchant display_name is a nullable actual OCR header line only when unambiguous; observed raw header lines remain intact. Do not substitute selected store. Public review adds attempt_number, merchant.display_name and nullable transaction_date from actual existing data (no invented extraction). No schema migrations. An OCR overlap mismatch alone means unverified continuity and manual review, not recapture, for guided stills; historical video behaviour stays compatible. Preserve adjacent merging, repeat purchases, raw output and immutable original attempts. Do not automatically reprocess history. Existing correction fields remain unused. Keep original hash/existence and confirmation request integrity checks. Run focused and full backend tests, real Tesseract checks; report skips honestly.

## Task 2: Customer lifecycle and review

Stop callback-driven reload loops and unchanged parent status writes. Poll at eight seconds only during processing, never overlap. Cache evidence by current manifest; retain failed placeholders and retry only failed originals. All expected originals must load and decode before acknowledgement/submission. Handle 429 Retry-After with paused requests and visible retry recovery. Errors visible on processing/review. Reset acknowledgement on changed attempt and return correctly after recapture, including same-route navigation. Preserve recoverable drafts on leave. Require confirmation before full restart.

Photo-first UI: Review your receipt; one instruction; Selected store label; one-column natural-aspect photos on phones with accessible full-size zoom; compact read-only extraction summary (merchant/date/items/quantities/prices/total); one conditional uncertainty notice; short acknowledgement and submit. No raw OCR dump or editable values. Unknown/legacy confidence never presented as measured. Keep per-section retake/add/restart. Hide back-to-top on receipt routes and keep final actions above bottom navigation. Existing branding unchanged. Native/existing components, no dependencies.

## Task 3: Admin alignment

Reuse private viewer. Original ordered sections/current-prior attempts, raw/system extraction, audited DTI findings remain separate. Use merchant.display_name, not slash-joined headers, in structured summary. Show all structured items, including missing/uncertain labels, and retain raw OCR in technical details. Preserve historical compatibility and do not expose Customer corrections. Tests first.

## Task 4: Verify and document

Regressions for callback rerenders, polling/429, partial failures, same-route recapture, readonly submit, malformed items/confidence, coherent pass selection, overlap uncertainty, and Admin evidence. Run backend suite, real Tesseract integration tests, Customer/Admin suites, lint/builds. Inspect mobile and desktop locally without production writes. Update compact operational notes only where facts changed. Android real-camera and production acceptance remain release gates needing user testing/approval.

## Progress

- Baseline: worktree clean at 707bb7a; main dirty work preserved. Backend receipt baseline running. npm.ps1 blocked by execution policy: use npm.cmd, no policy changes.
- Task interfaces: Backend produces additive nullable metadata consumed by Customer/Admin. Old responses tolerated. Existing raw fields retained for compatibility, technical presentation Admin-only.
- Scope review: all tasks preserve captured originals and no-correction contract. Customer owns its files; backend worker owns backend files; Admin implementation follows backend worker to avoid competing implementations. No commits authorized.
- Customer baseline 5/5; red regression run 5 failures/4 passes before implementation; focused review now 9/9 and lifecycle 4/4. Full Customer suite 330/330; build passed. Five pre-existing lint warnings outside changed receipt files.
- Backend initial implementation reviewed: pass scoring must reuse real extractors; partial rejected items must warn. Worker fixing both with regressions. Initial full suite 269/269 and real Tesseract 4/4.
- Browser runtime connected but getForUrl reported no browser and browsers.list returned []; interactive mobile/desktop verification unavailable. No production data or credentials accessed. Android/device acceptance remains open.

## Local handoff — 2026-09-06

- Tasks 1–3 implemented. Independent final spec/quality review found no critical or important blockers. No commit, merge, push, migration, historical reprocessing, or deployment.
- Backend review findings fixed: pass selection reuses actual extractors; rejected price-like lines are retained and trigger OCR_INCOMPLETE even when other items reconcile. CORS exposes Retry-After. Manager-only manifest exposes current processing_result; public review/status do not expose pass diagnostics.
- Customer regression covers changed-attempt acknowledgement reset; full suite 331/331 and production build pass. Lint has five unrelated existing warnings. Native-dialog and image-load behaviour are covered in DOM tests, not actual device verification.
- Admin maps guided report.items rather than assuming raw OCR contains items. Optional private processing diagnostics are read-only in technical details. Parent independently verified full serial suite 93/93, build pass, five unrelated lint warnings; parallel run had two timing failures, recorded separately pending baseline comparison.
- Backend final full suite independently rerun: 272/272, 1367 assertions. Worker real-Tesseract integration: 4/4, 55 assertions on synthetic receipts. Successful processing is not proof of extraction accuracy on arbitrary receipts.
- Automated UI detector returned zero findings. Browser connection unavailable; local test server stopped. Browser/mobile visual verification, real Android captures, and production checks remain release gates.
- Main checkout remains untouched by this work; unrelated active Field/Admin/Seeder/mobile changes are excluded. Keep this worktree for the next review/release step.
- Parallel Admin baseline comparison completed: unchanged HEAD 707bb7a reproduces both originally reported failures (86/91 passed, five failures). Current default parallel run passed 91/93. Failing lazy-panel assertions still display "Loading Admin module...": Testing Library's one-second async wait expires under parallel startup load independently of Vitest's 20-second test timeout. These failures predate the receipt changes.
- Current bounded-parallel verification: `npm.cmd test -- --run --maxWorkers=2` passed all 93 tests across 21 files in 33.61 seconds. No source, test, or configuration changes were needed for this diagnostic; the default unrestricted command remains timing-sensitive. Temporary baseline export and its dependency junction were removed without touching the real dependencies.
- Visual verification retried: Browser runtime reports "No browser is available" and an empty browser list. Mobile/desktop inspection remains pending a connected browser; no new screenshots or device-verification claims.

## Authorized release preparation - 2026-09-06

- User authorized commit/integration into main and Render followed by Customer/Admin Vercel deployment. User will perform mobile/desktop visual review and real Android short/long receipt acceptance; these are not claimed complete.
- Fresh release checks: backend 272/272 (1367 assertions), real Tesseract 4/4 (55 assertions), Customer 331/331, Admin 93/93 with two workers; both production builds passed. Each frontend lint run has five existing warnings, no errors.
- Release only the receipt worktree changes. Preserve unrelated main edits, including the overlapping Admin test changes, outside the commit and deployment source. No schema changes or historical reprocessing are included.
