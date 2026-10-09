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
- Public image URLs: `app/Services/CommodityImageStorage.php` (`publicUrl`) is the single owner. The rule is in [[DECISIONS]] 2026-10-03, and the plan is in `plans/image-urls/`.

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
- Responsibility: invited vendor accounts — notices, formal responses with evidence, messages with DTI, SRP guide, advisories, an alerts drawer (notices needing action and unread messages), and a Profile page (current establishment representative, notification preferences, password, sign out).
- DTI side of messaging: Store Communications (`web/src/components/admin/StoreCommunications.tsx`); backend `Admin/StoreConversationController.php`, `Vendor/VendorMessageController.php`.
- Start with: `vendor-pwa/src/App.tsx`, `vendor-pwa/src/services/vendorApi.ts`, `vendor-pwa/src/app/rules.ts`, `vendor-pwa/src/components/profile/`, `vendor-pwa/src/components/alerts/`; backend `backend/app/Http/Controllers/Vendor/` and `LegalNoticeController.php`.
- Account management: DTI Admin User Management (`web/src/components/admin/UserManagementPanel.tsx`).
- Shell: same layout as the Field Officer PWA; plan and review record in `plans/vendor-shell/`.
- Offline workspace and local verification boundaries: [[plans/vendor-offline/README]].
- Decisions: [[DECISIONS]] entries 2026-09-14 and 2026-10-04 (shell; current establishment representative).

## Flutter client

- Path: `mobile/` (removed 2026-09-28; recover with `git log --diff-filter=D -- mobile`)
- Status: deprecated per `../PRODUCT.md`; backend legacy sync routes remain.

## Documentation routing

- `audits/`: evidence snapshots and readiness reviews; dates matter.
- `superpowers/specs/`: design intent; a spec is not proof of implementation.
- `superpowers/plans/`: planned work; a plan is not proof of completion.
- Source code, focused tests, deployment configuration, and live probes override stale documentation.
