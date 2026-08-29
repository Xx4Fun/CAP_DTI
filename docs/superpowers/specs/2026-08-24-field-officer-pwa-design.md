# Field Monitoring Officer PWA Design Brief

## Job and audience

An authenticated DTI field monitoring officer must complete official multi-commodity monitoring visits in stores where connectivity may be intermittent. The surface is an Operate-mode, mobile-first tool whose primary success is a complete, dual-signed, location-locked visit that cannot be lost and synchronizes exactly once.

## Outcome and proof

The officer selects any active registered store, records one or more commodity prices, reviews provisional anomaly comparisons, obtains the DTI officer and store representative signatures, captures a GPS fix, and finalizes the visit. The immutable visit either synchronizes immediately or remains encrypted on-device with an explicit pending state. Server acceptance, signature hashes, location metadata, and an audit event provide proof.

## Selected direction

Extend the incumbent PRICE-Watch visual world: off-white working surfaces, the official DTI SVG, DTI cobalt navigation and primary actions, Outfit typography, restrained regulatory status color, and lucide-style line icons. The authenticated shell leads with operational readiness, active work, and connection state rather than promotional content. A numbered progress rail echoes `dti.png` without reproducing its flowchart cards. The memorable moment remains the final evidence lock: both signatures and GPS converge into one clear, irreversible confirmation.

## Scope and boundaries

- New standalone `field-officer-pwa` React/Vite application and dedicated `/api/field/*` contract.
- Existing Admin account creation becomes the credential and PWA-link handoff; Field Monitoring becomes a read-only visit queue/detail surface.
- No Admin assignment workflow, customer-PWA changes, legal-finding language, Flutter deletion, or production deployment in the local implementation phase.

## States and ranges

- Visit: draft, ready for review, finalized/pending sync, syncing, synced, or needs attention.
- Session: online login required, password change required, PIN setup, PIN locked, offline lease valid, lease expired, or account revoked on reconnect.
- Location: requesting, low accuracy, accepted and locked, denied, or unavailable.
- A visit supports 1-100 commodity lines; lists use pagination or virtualization where appropriate.

## Interaction and layout

- Phone: customer-PWA-style fixed header and five-destination bottom navigation for Home, Activity, a raised Add action, History, and Profile. Add starts a visit only when no draft exists; otherwise it opens Activity so an existing draft is never overwritten.
- Tablet/desktop: persistent left rail using the DTI Admin blue palette, a wider work canvas, and side-by-side operational summaries where space permits. The rail is 220 pixels on tablet and 264 pixels on desktop.
- Home owns readiness and summary information. Activity owns the active draft and encrypted synchronization queue. History shows server-accepted records only. Profile owns officer identity, biometric enrollment, explicit lock, and sign out.
- Connectivity is checked automatically after evidence lock. Online visits synchronize; offline visits enter the encrypted queue with manual and automatic retry affordances.
- Finalized evidence is read-only. Rejected server synchronization never deletes the local record and presents the server reason as Needs Attention.

## Constraints

- First login and password replacement are online-only; the encrypted vault uses a PIN-derived Web Crypto key and IndexedDB.
- Both signatures, representative identity, and a GPS accuracy of 100 metres or better are required.
- The server recomputes anomaly status from effective SRP/emergency references and recent verified prices.
- PWA installation and updates reuse the customer-PWA interaction pattern with a distinct manifest, icons, caches, and deployment URL.
