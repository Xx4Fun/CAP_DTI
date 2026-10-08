# Consumer Reports automatic assessment

Approved workflow (2026-10-09): **Violations → Confirmed Findings → No Violations → For Review → With Field Officer → Rejected → All**. Violations is the default tab.

Reliable clean receipts resolve automatically after consumer submission. Unidentified products, missing unit prices or applicable references, uncertain receipt dates/store identities, extraction warnings, or unverified evidence keep reports for DTI review. A reliable overpriced line puts a mixed receipt in Violations while uncertain lines remain flagged.

Automatic assessments preserve item/reference snapshots separately from human decisions. Only actual DTI-confirmed regulatory findings enter Confirmed Findings and contribute confirmed cases to analytics. Completing field verification alone leaves a case awaiting DTI checking. Manual insufficient evidence stays For Review rather than asserting no violation.

Automatically resolved reports display their saved reference values. Reports awaiting DTI checking display current applicable references; their initial automatic assessment remains in the audit details.

## Existing undecided reports

The nullable `automatic_assessment_json` migration must exist before the new backend is used. The batch skips already assessed reports, human decisions/findings, active referrals, and reports still with the consumer or extraction pipeline. It verifies original evidence and uses the same assessment as new submissions.

Run from `backend/` in the explicitly approved target environment:

```powershell
php artisan reports:assess-pending
```

This previews counts without changing reports. After reviewing the preview and obtaining production-data approval where applicable:

```powershell
php artisan reports:assess-pending --apply
```

Saved assessments are skipped on retry. A save failure rolls back that report's assessment, status/history, and audit. Automatic clean outcomes create no regulatory findings and never impersonate a DTI evaluator.

## Verification boundary

Implementation and verification are local. Production migration, batch processing, and deployment have not been authorized or performed. Field Officer and Vendor interfaces are outside this change.

Local validation on 2026-10-09: backend full suite passed 816 tests / 6241 assertions; Admin full suite passed 276 tests, with all 23 Consumer Reports tests passing after final UI edits. TypeScript/Vite build passed. Lint completed with the existing `EmergencyToggle.tsx:120` warning; Vite retains the existing large export-chunk warning.

Chromium checks using synthetic reports passed at 1440, 768, and 390px: correct tabs/default, no page overflow, automatic reports without decision controls, and detected violations with checking controls. Authenticated production flows and the PostgreSQL migration/batch have not been run.
