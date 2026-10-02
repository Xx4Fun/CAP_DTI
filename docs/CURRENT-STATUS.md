---
tags:
  - status
  - verification
reviewed: 2026-08-27
---

# Current Status

This page records boundaries for interpreting project status. Keep task-specific progress in the relevant source, test, audit, or deployment record rather than expanding this into a changelog.

## Repository state

- The repository may contain unrelated uncommitted work. Inspect `git status` before edits and preserve changes outside the requested scope.
- A design or implementation plan does not prove that its work was implemented.
- A passing local test or build does not prove deployment.
- Deployment claims require current evidence from the affected environment.

## Product surfaces

- `backend/`: Laravel API shared by the web clients.
- `web/`: DTI Admin portal.
- `customer-pwa/`: public consumer PWA.
- `field-officer-pwa/`: field monitoring PWA.
- `mobile/`: legacy Flutter client removed from the repo 2026-09-28; recover from git history if needed.

## Evidence handling

- Preserve receipt, signature, location, audit, and regulatory evidence integrity.
- Do not treat an anomaly, OCR uncertainty, or technical processing failure as a legal finding.
- Do not place secrets, report tracking tokens, customer evidence, or production credentials in documentation.
- Production legal documents (issued notice PDFs, attachments, e-signatures) share the private Supabase `receipt-evidence` bucket through the `legal_documents` disk. That bucket's allowed MIME types must include `application/pdf`; it was added 2026-10-02 after issuing failed with "Private document storage is unavailable". Bucket settings live in Supabase, not in this repository.

## Updating this page

Update the `reviewed` date only after checking the affected source or environment. Prefer a link to a focused audit over copying detailed results here.
