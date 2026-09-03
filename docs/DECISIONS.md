---
tags:
  - decisions
  - architecture
---

# Durable Decisions

Only record choices that should constrain future work. Newest entries go first and should link to supporting evidence when available.

## 2026-09-01 — Admin establishment publication

- Establishments created by a DTI manager are active, verified by that manager, and public immediately; there is no separate store-verification step.
- Registration numbers and owner names remain null when the official source does not provide them. The system must not invent identifiers or proprietor data.
- Stores without supplied artwork use `/stores/store.webp`.

## 2026-09-01 — Field Officer visit shell and store changes

- Choose Store uses the normal authenticated shell with Add active and a `New Visit` toolbar; Record Prices and Review & Sign use the fullscreen workspace.
- Returning to Choose Store from later steps requires an explicit continue, save, or delete choice. Save and delete both open a separate blank draft so visit evidence is never reassigned to another store.
- Leaving an untouched Choose Store draft through shell navigation removes that blank draft; preselected and resumed visits still open at their derived step.

## 2026-08-30 — Field Officer task guidance

- Preserve the existing compact tablet navigation rail; UX guidance belongs in page content, onboarding, and the visit workflow rather than a tablet navigation redesign.
- Home keeps the operational dashboard with readiness summaries, nearby establishments, and recent local activity. Activity contains encrypted unfinished drafts and finalized visits awaiting synchronization; registered-store selection lives in the visit workflow.
- First-use guidance is device-local, officer-scoped, optional, and replayable from Profile or Help.
- The visit sequence is Choose Store, Record Prices, then Review and Sign. Resuming derives the earliest incomplete step from the existing draft rather than persisting separate step state.
- Client-side price comparisons use provisional wording such as Within reference and For review; they do not label an observation as a violation or legal compliance finding.

## 2026-08-29 — DTI Admin regulatory integrity

- Field Officer accounts use the dedicated Field Monitoring PWA and cannot open the DTI Admin portal or Admin analytics routes.
- Legal notices remain watermarked, non-effective drafts while approved policy rules are unavailable; the Admin must not simulate dispatch, legal deadlines, or compliance findings.
- Regulated writes and private evidence access fail closed when their audit event cannot be stored. Dashboard, store, report, emergency, and analytics views display only API-confirmed facts and explicit unavailable states.
- Admin modules load on demand, and consumer report queues are server-paginated.

## 2026-08-28 — Field Officer authenticated navigation

- The authenticated Field Officer PWA uses one adaptive shell: an official-DTI-SVG phone header with five-item bottom navigation, and a persistent DTI Admin-palette sidebar on tablet and desktop.
- The five destinations are Home, Activity, Add, History, and Profile. Add is an action rather than a page; if unfinished drafts exist it opens Activity, where the officer can resume one or explicitly start another without replacing existing work.
- Home owns readiness summaries, Activity owns active and pending local work, History contains accepted server records only, and Profile owns biometric enrollment plus Lock now and Sign out.
- The visit wizard and its evidence workflow remain behaviorally unchanged by the shell redesign.

## 2026-08-28 — Field Officer device unlock and authorization

- Admin-created and reset Field Officer passwords are final credentials; successful legacy login normalizes `must_change_password` to false.
- The device workspace uses a four-digit PIN and may additionally use a platform biometric authenticator with WebAuthn PRF; PIN remains the fallback. The unlock surface accepts only four digits, treats missing PIN-length metadata as four digits, and submits automatically when the fourth digit is entered.
- A refresh in the same browser/PWA session restores the workspace through a session-scoped encrypted data-key wrapper. Explicit lock, logout, revocation, corrupt state, 60 seconds in the background, or a new browser session requires PIN or biometric unlock; foreground monitoring has no inactivity lock.
- Field access tokens end only on logout, password reset, or deactivation. The 24-hour offline lease renews online without replacing the lease attached to completed queued visits.
- Unresolved drafts or queued evidence must be preserved when authorization is revoked. Local evidence is cleared only after a clean online logout.

## 2026-08-27 — Documentation is a selective context index

- The `docs/` directory is the Obsidian vault.
- Compact index notes route people and agents to focused evidence.
- Detailed plans, audits, and specifications remain in their existing directories.
- Agents should not ingest the full vault by default.
- Obsidian workspace settings are local and excluded from Git.

## Product-level decisions

- PRICE-Watch has separate Consumer PWA, Field Officer PWA, Admin, and shared Laravel API surfaces.
- Regulatory evidence integrity takes priority over convenience.
- Anomalies and OCR uncertainty are not legal findings.
- Finalized field evidence must not be silently changed.
- The legacy Flutter client remains out of normal feature scope unless the user explicitly includes it.

See `../PRODUCT.md` for the fuller product contract.
