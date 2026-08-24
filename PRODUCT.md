# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Consumers use the public PRICE-Watch PWA to check reference prices and submit evidence-backed concerns.
- DTI field monitoring officers work in stores, often with unreliable connectivity, to record official price-monitoring visits.
- DTI evaluators and administrators manage accounts and review synchronized regulatory records in the existing Admin portal.

## Product Purpose

PRICE-Watch connects consumer price transparency, field monitoring, and DTI administrative review. The Field Monitoring Officer PWA must let an authorized officer complete a multi-commodity store visit, capture both required signatures and signing location, finalize it offline, and synchronize it once connectivity is available.

## Positioning

The product joins the same authoritative SRP history, registered establishments, signed field evidence, and temporal analytics across public, field, and administrative surfaces without treating an anomaly as a legal finding.

## Operating Context

- Field officers may monitor any active registered store; monitoring assignments are not required.
- A visit contains multiple commodity price lines under one DTI officer signature, one store-representative signature, and one locked location bundle.
- First login and password replacement require internet access. A device-local PIN unlocks an encrypted offline vault during a time-limited field session.
- Evidence-complete synchronized visits become immediately available for Admin review and verified temporal analytics.

## Capabilities and Constraints

- The customer PWA, Admin portal, and Field Officer PWA are separate web applications sharing the Laravel API.
- Admin-created `field_officer` accounts are the only identities accepted by the Field Officer PWA.
- Both signatures and a captured GPS fix are mandatory before finalization.
- Finalized local visits are immutable and must synchronize idempotently.
- Signatures and location evidence are private, authenticated, and audited.
- The Flutter field client is frozen and deprecated; its legacy sync routes remain compatible in this release.

## Brand Commitments

- Preserve the PRICE-Watch name, DTI identity, supplied `dti.png` process sequence, cobalt-blue and white visual language, and Outfit typography used by the customer PWA.
- `dti.png` governs workflow order, not literal screen composition.

## Evidence on Hand

- `dti.png` documents the confirmed Field Monitoring Officer workflow.
- The existing Laravel backend contains registered stores, SRP bulletins, temporal inspections, authenticated Admin APIs, and audit services.
- The customer PWA provides the incumbent manifest, service-worker, install-prompt, connectivity, and accessibility patterns.

## Product Principles

1. Preserve regulatory evidence before optimizing convenience.
2. Make offline status and synchronization state unmistakable.
3. Recalculate authoritative anomaly status on the server.
4. Keep field access narrower than Admin access.
5. Never lose or silently mutate a finalized offline record.

## Accessibility & Inclusion

Support keyboard navigation, screen readers, visible focus, reduced motion, clear non-color status cues, and touch targets of at least 44 by 44 CSS pixels. Design for phone, tablet, and desktop web viewports.
