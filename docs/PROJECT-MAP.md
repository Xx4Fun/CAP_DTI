---
tags:
  - index
  - architecture
---

# Project Map

## Shared product context

- Product definition: `../PRODUCT.md`
- Repository agent rules: `../AGENTS.md`
- Durable decisions: [[DECISIONS]]
- Current status rules: [[CURRENT-STATUS]]

## Laravel backend

- Path: `backend/`
- Responsibility: APIs, authentication, regulatory records, report evidence, field synchronization, and persistence.
- Start with: `backend/README.md`, `backend/routes/`, and the relevant controller, service, model, migration, and test.
- OCR operations: `../backend/docs/receipt-ocr-remediation.md`

## DTI Admin portal

- Path: `web/`
- Responsibility: evaluator and administrator workflows.
- Start with: `web/src/App.tsx`, `web/src/components/admin/`, and adjacent tests.
- Design history: `superpowers/specs/` and `superpowers/plans/` files containing `admin` or `sidebar`.

## Consumer PWA

- Path: `customer-pwa/`
- Responsibility: public price discovery, scanning, reporting, and device-local report tracking.
- API: [[customer-pwa-api]]
- Privacy: [[customer-pwa-security-and-privacy]]
- Cross-user flow: [[customer-pwa-cross-user-flow]]
- Audits: `audits/` files containing `customer-pwa`, `scanner`, or `ocr`.

## Field Officer PWA

- Path: `field-officer-pwa/`
- Responsibility: authenticated field monitoring, offline evidence capture, finalization, and synchronization.
- Product constraints: `../PRODUCT.md`
- Design: [[superpowers/specs/2026-08-24-field-officer-pwa-design]]

## Vendor Portal PWA

- Path: `vendor-pwa/`
- Responsibility: invited vendor accounts — notices, formal responses with evidence, messages with DTI, SRP self-check, advisories, and notification preferences.
- DTI side of messaging: Store Communications (`web/src/components/admin/StoreCommunications.tsx`); backend `Admin/StoreConversationController.php`, `Vendor/VendorMessageController.php`.
- Start with: `vendor-pwa/src/App.tsx`, `vendor-pwa/src/services/vendorApi.ts`, `vendor-pwa/src/app/rules.ts`; backend `backend/app/Http/Controllers/Vendor/` and `LegalNoticeController.php`.
- Account management: DTI Admin User Management (`web/src/components/admin/UserManagementPanel.tsx`).
- Decisions: [[DECISIONS]] entry 2026-09-14.

## Flutter client

- Path: `mobile/`
- Status: described as frozen and deprecated in `../PRODUCT.md`; verify current user direction before editing.

## Documentation routing

- `audits/`: evidence snapshots and readiness reviews; dates matter.
- `superpowers/specs/`: design intent; a spec is not proof of implementation.
- `superpowers/plans/`: planned work; a plan is not proof of completion.
- Source code, focused tests, deployment configuration, and live probes override stale documentation.
