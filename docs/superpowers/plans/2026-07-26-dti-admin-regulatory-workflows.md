# DTI Admin Regulatory Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed inline because the user explicitly requested continuation in the live workspace. Do not delegate or commit.

**Goal:** Add safe, auditable DTI Admin regulatory workflows while preserving current public APIs, integrations, and historical records.

**Architecture:** Add authenticated `/api/admin/*` controllers backed by small domain services. Reuse existing models and UI components, add one conditional migration proposal, and keep formal reports, regulatory findings, emergency prices, and audit events as explicit data boundaries.

**Tech Stack:** Laravel 13, PHP 8.3, Sanctum, React 19, TypeScript 6, Vite 8, Leaflet, Chart.js, Axios, Vitest, jsdom, React Testing Library.

## Global Constraints

- Work only in `C:\CAP101_DTI_SYS`.
- Reuse the current Admin shell, models, routes, Leaflet, Chart.js, Sanctum, PDF templates, and Vendor Portal.
- Do not modify public Customer PWA response formats or shelf-tag behavior.
- Do not stage, commit, push, deploy, send real emails, or run the proposed migration against the configured database.
- Backend tests use only PHPUnit's in-memory SQLite connection.
- Invitation tokens are stored only as SHA-256 hashes and the raw link is returned once.
- Formal review reads only `consumer_reports`.
- `raw_ocr_json` is immutable; evaluator corrections use `evaluator_confirmed_json`.
- Recidivism is derived only from confirmed regulatory findings.
- Missing authoritative emergency prices return `REGULATORY_PRICE_UNAVAILABLE`.
- Missing approved legal policy returns `LEGAL_POLICY_UNAVAILABLE`.
- Draft legal preview creates no notice, deadline, notification, or regulatory state change.

---

### Task 1: Add the migration proposal and domain models

**Files:**
- Create: `backend/database/migrations/2026_07_26_100000_extend_dti_admin_regulatory_controls.php`
- Create: `backend/app/Models/VendorInvitation.php`
- Create: `backend/app/Models/RegulatoryFinding.php`
- Create: `backend/app/Models/RegulatoryEmergency.php`
- Create: `backend/app/Models/RegulatoryPriceRecord.php`
- Create: `backend/app/Models/AuditEvent.php`
- Modify: `backend/app/Models/Store.php`
- Modify: `backend/app/Models/SrpBulletin.php`
- Modify: `backend/app/Models/TemporalInspection.php`
- Test: `backend/tests/Feature/AdminSchemaContractTest.php`

**Interfaces:**
- Produces `Store::vendorUser()`, `Store::findings()`, `SrpBulletin::scopeEffectiveOn()`, and model casts/fillable contracts used by all later tasks.
- The migration uses `Schema::hasColumn()` for live-schema drift and is never executed against the configured database.

- [ ] Write `AdminSchemaContractTest` first, asserting the in-memory schema contains all additive columns and tables and that an `AuditEvent` cannot be updated or deleted.
- [ ] Run `php artisan test tests/Feature/AdminSchemaContractTest.php` and verify the missing-schema failure.
- [ ] Add the conditional migration and focused Eloquent models.
- [ ] Run the schema contract test and the existing `ModelRelationshipTest`.

### Task 2: Add shared Admin authorization and immutable auditing

**Files:**
- Create: `backend/app/Services/Admin/AdminAuthorizationService.php`
- Create: `backend/app/Services/Admin/AuditTrailService.php`
- Create: `backend/app/Http/Controllers/Admin/AuditEventController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminAuthorizationAndAuditTest.php`

**Interfaces:**
- `AdminAuthorizationService::canManage(User $user): bool`
- `AdminAuthorizationService::canViewAnalytics(User $user): bool`
- `AuditTrailService::record(Request $request, string $action, Model|string $subject, array $metadata = []): AuditEvent`

- [ ] Write failing tests proving `dti_evaluator` and `super_admin` can manage, `field_officer` can only view analytics, and vendor/consumer users receive 403.
- [ ] Write a failing test proving `/api/admin/audit-events` is read-only and redacts sensitive metadata.
- [ ] Implement authorization checks and audit recording.
- [ ] Run the new tests and existing auth tests.

### Task 3: Implement GIS store management and vendor invitations

**Files:**
- Create: `backend/app/Services/Admin/VendorInvitationService.php`
- Create: `backend/app/Http/Controllers/Admin/StoreAdminController.php`
- Create: `backend/app/Http/Controllers/Admin/VendorInvitationController.php`
- Create: `backend/app/Mail/VendorInvitationMail.php`
- Create: `backend/resources/views/mail/vendor-invitation.blade.php`
- Modify: `backend/routes/api.php`
- Modify: `backend/app/Http/Controllers/PublicPwaController.php`
- Modify: `backend/app/Http/Controllers/LegalNoticeController.php`
- Test: `backend/tests/Feature/AdminStoreInvitationTest.php`

**Interfaces:**
- `VendorInvitationService::create(Store $store, string $email, User $actor, Request $request): array{invitation: VendorInvitation, raw_url: string}`
- `VendorInvitationService::accept(string $rawToken, string $name, string $password, Request $request): User`
- `VendorInvitationService::cancel(VendorInvitation $invitation, User $actor, Request $request): VendorInvitation`

- [ ] Write failing tests for store coordinate/status persistence, public-field redaction, token hashing, one-time raw link response, expiration, acceptance, cancellation, and audit events.
- [ ] Verify the mail fake receives a mail object while no external mail transport is used.
- [ ] Implement the Admin store endpoints, invitation service, log/array mail guard, and token acceptance route.
- [ ] Link Vendor Portal notice lookup by `vendor_user_id`, retaining owner-name fallback for existing records.
- [ ] Fix the existing missing-store null dereference only because store visibility integration exercises the shared verifier.
- [ ] Run the new tests plus `VerifiedStoreAndRateLimitTest`, `AnalyzeEndpointTest`, `LegalNoticeTest`, and `PublicPwaTest`.

### Task 4: Implement append-only temporal SRP management

**Files:**
- Create: `backend/app/Services/Admin/SrpImportService.php`
- Create: `backend/app/Services/Admin/TemporalSrpResolver.php`
- Create: `backend/app/Http/Controllers/Admin/SrpAdminController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Unit/TemporalSrpResolverTest.php`
- Test: `backend/tests/Feature/AdminSrpManagementTest.php`

**Interfaces:**
- `TemporalSrpResolver::resolve(string $commodityKey, CarbonInterface|string $observedAt): ?SrpBulletin`
- `SrpImportService::preview(array $payload): array`
- `SrpImportService::import(array $payload, User $actor, Request $request): array`

- [ ] Write resolver tests for before-first-version, exact-date, between-version, and after-latest resolution.
- [ ] Write import tests proving preview uses metadata effective date, rejects missing source references, detects duplicate versions, and never updates an old row.
- [ ] Implement normalized `commodity_key` generation and a transaction that inserts new versions only.
- [ ] Add list and import endpoints and audit events.
- [ ] Run the new tests plus SRP, sync, regulatory resolver, and public commodity tests.

### Task 5: Implement formal receipt review and regulatory findings

**Files:**
- Create: `backend/app/Services/Admin/ReportReviewService.php`
- Create: `backend/app/Http/Controllers/Admin/ReportReviewController.php`
- Modify: `backend/app/Models/ConsumerReport.php`
- Modify: `backend/app/Models/ReportStatusHistory.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminReportReviewTest.php`

**Interfaces:**
- `ReportReviewService::decide(ConsumerReport $report, string $action, array $corrected, string $reason, User $actor, Request $request): ConsumerReport`
- `ReportReviewService::recalculateRecidivism(Store $store): int`

- [ ] Write a failing queue test with one consumer report, one citizen tip, and one shelf scan; assert only the consumer report appears.
- [ ] Write failing decision tests for validate, correct, reject, and dismiss.
- [ ] Assert raw OCR is byte-for-byte unchanged while evaluator corrections are stored separately.
- [ ] Assert only confirmed findings change derived recidivism.
- [ ] Write an evidence-access test proving authorized streaming, path redaction, and audit recording.
- [ ] Implement the review service and endpoints in one transaction per decision.
- [ ] Run the new tests plus public formal-report tracking tests.

### Task 6: Implement temporal analytics

**Files:**
- Create: `backend/app/Services/Admin/TemporalAnalyticsService.php`
- Create: `backend/app/Http/Controllers/Admin/TemporalAnalyticsController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Unit/TemporalAnalyticsServiceTest.php`
- Test: `backend/tests/Feature/AdminTemporalAnalyticsTest.php`

**Interfaces:**
- `TemporalAnalyticsService::forStore(Store $store, ?string $commodityKey, CarbonInterface $asOf): array`
- Returns `labels`, `price_series`, `srp_series`, `table_rows`, and `recidivism_count`.

- [ ] Write failing tests with confirmed and rejected receipt findings, verified and pending inspections, and shelf-tag data.
- [ ] Assert only confirmed findings and verified signed inspections appear.
- [ ] Assert each point uses the SRP effective on its own observation date.
- [ ] Implement four-week filtering, stable chronological sorting, and accessible table rows.
- [ ] Run analytics tests plus historical price resolver and sync tests.

### Task 7: Implement emergency declarations and authoritative prices

**Files:**
- Create: `backend/app/Services/Admin/EmergencyPriceResolver.php`
- Create: `backend/app/Http/Controllers/Admin/EmergencyAdminController.php`
- Modify: `backend/app/Services/Ocr/RegulatoryPriceResolver.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Unit/EmergencyPriceResolverTest.php`
- Test: `backend/tests/Feature/AdminEmergencyControlTest.php`

**Interfaces:**
- `EmergencyPriceResolver::resolve(string $commodityKey, string $location, CarbonInterface|string $observedAt): array`
- `AdminEmergencyController` requires explicit `confirmed: true` before activation.

- [ ] Write failing tests for authorization, required location/dates/reference/confirmation, activation, ending, and audit events.
- [ ] Write resolver tests for exact location/date matches, APC and Price Freeze labels, and missing matches.
- [ ] Implement persistent emergency state and authoritative price records.
- [ ] Return `REGULATORY_PRICE_UNAVAILABLE` without falling back to normal SRP in emergency mode.
- [ ] Run the new tests plus `RegulatoryPriceResolverTest`.

### Task 8: Implement safe legal policy and draft preview

**Files:**
- Create: `backend/config/legal_policy.php`
- Create: `backend/app/Services/Admin/LegalPolicyService.php`
- Create: `backend/app/Http/Controllers/Admin/LegalDraftController.php`
- Create: `backend/resources/views/notices/draft-preview.blade.php`
- Modify: `backend/app/Http/Controllers/LegalNoticeController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/AdminLegalPolicyTest.php`

**Interfaces:**
- `LegalPolicyService::availability(): array{status: string, policy_version: ?string}`
- `LegalPolicyService::assertAvailable(): void`
- Dispatch returns HTTP 422 with `status: LEGAL_POLICY_UNAVAILABLE`.

- [ ] Write a failing test proving dispatch is blocked and creates no notice, PDF, deadline, notification, finding, or recidivism change.
- [ ] Write a failing draft test proving a visible watermark, placeholder values, no official template use, and only an audit event.
- [ ] Implement unavailable-by-default policy configuration and side-effect-free draft rendering.
- [ ] Guard the legacy dispatch endpoint with the same policy service.
- [ ] Run legal tests plus existing Vendor Portal rebuttal tests.

### Task 9: Add the Admin frontend test harness and API contracts

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/src/test/setup.ts`
- Create: `web/src/types/admin.ts`
- Create: `web/src/services/adminApi.ts`
- Test: `web/src/App.test.tsx`

**Interfaces:**
- Typed Admin API functions mirror `/api/admin/*`.
- Vitest runs with jsdom and React Testing Library.

- [ ] Add Vitest, jsdom, Testing Library, and user-event development dependencies.
- [ ] Write a failing shell test for role-aware Admin navigation and field-officer read-only behavior.
- [ ] Implement typed API contracts and shell navigation.
- [ ] Run `npm.cmd test -- --run`, lint, and build.

### Task 10: Build the Admin UI modules

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/index.css`
- Modify: `web/src/components/Dashboard.tsx`
- Modify: `web/src/components/StoreOnboarding.tsx`
- Create: `web/src/components/admin/AdminShell.tsx`
- Create: `web/src/components/admin/OverviewPanel.tsx`
- Create: `web/src/components/admin/StoreManagementPanel.tsx`
- Create: `web/src/components/admin/SrpManagementPanel.tsx`
- Create: `web/src/components/admin/ReportReviewPanel.tsx`
- Create: `web/src/components/admin/EmergencyPanel.tsx`
- Create: `web/src/components/admin/LegalDraftPanel.tsx`
- Create: `web/src/components/admin/AuditPanel.tsx`
- Create: `web/src/components/admin/TemporalPriceChart.tsx`
- Test: `web/src/components/admin/AdminPanels.test.tsx`

**Interfaces:**
- Each panel receives typed API data and exposes loading, empty, error, and success states.
- `TemporalPriceChart` renders Chart.js plus a semantic data table.

- [ ] Write failing tests for store status and invitation links, append-only SRP preview, consumer-report-only queue labels, original/corrected values, emergency confirmation, unavailable legal policy, and audit rows.
- [ ] Implement the panels by extracting and reusing current Dashboard and StoreOnboarding behavior.
- [ ] Replace missing CSS classes with semantic tokens, visible focus, 44 pixel targets, responsive table wrappers, and reduced-motion-safe transitions.
- [ ] Keep Leaflet and Chart.js lazy within their panels to reduce the main bundle.
- [ ] Run frontend tests, lint, and build after each panel group.

### Task 11: Integration and regression verification

**Files:**
- Modify only if a failing integration test proves necessary: `customer-pwa/*`, `mobile/*`, or Vendor Portal files.

- [ ] Run all new backend tests.
- [ ] Run `php -d memory_limit=512M vendor/bin/phpunit` and record pre-existing versus new failures.
- [ ] Run Admin frontend tests, lint, and build.
- [ ] Run Customer PWA tests and build only if public integration code changed.
- [ ] Run `git diff --check`.
- [ ] Run `git status --short` and `git diff --stat`.
- [ ] Verify no migration was run against the configured database with `php artisan migrate:status`.
- [ ] Verify no staged files with `git diff --cached --name-only`.
- [ ] Prepare the exact user-requested final report sections only.
