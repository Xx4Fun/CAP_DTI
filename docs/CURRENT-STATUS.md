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

## Public images

- Public catalog images (commodity and store photos) are served from the public Supabase bucket `commodity-images`. It accepts webp/jpeg/png up to 2 MB. Render chooses the disk through the dashboard variable `COMMODITY_IMAGE_DISK`; `render.yaml` does not set it.
- Any new environment must first have the seed photos uploaded. The source folders are listed in [[DECISIONS]] 2026-10-03.
- For local development, copy those files into `backend/storage/app/public/{commodity_images,store_images}`.
- Known limit: the Customer PWA does not precache its bundled fallback-catalog photos (`globIgnores` in `customer-pwa/vite.config.ts`, unchanged by the image work). They show when the API is unreachable but the site is online, and on a fully offline first session only if the browser already cached them.

## Updating this page

Update the `reviewed` date only after checking the affected source or environment. Prefer a link to a focused audit over copying detailed results here.
