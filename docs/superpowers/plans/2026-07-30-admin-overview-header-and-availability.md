# Admin Overview Header and Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sticky Admin header the single active-page heading and keep the overview usable when the approved emergency schema is not yet available.

**Architecture:** Reuse the existing `panels` metadata in `AdminShell` for the sticky heading and description, then remove the redundant page-header strip. Make `AdminOverviewController` inspect the real schema before querying optional emergency records and return a nullable metric plus additive availability metadata so existing counts remain usable without misrepresenting missing regulatory data.

**Tech Stack:** React 19, TypeScript, Vitest, Laravel 12, PHPUnit, PostgreSQL.

## Global Constraints

- Reuse the existing Admin shell, API route, controller, models, and response envelope.
- Do not run migrations or fabricate an emergency count.
- Do not stage, commit, push, deploy, or change Customer PWA behavior.
- Preserve role authorization and existing deep-link navigation.

---

### Task 1: Sticky active-module heading

**Files:**
- Modify: `web/src/components/admin/AdminShell.test.tsx`
- Modify: `web/src/components/admin/AdminShell.tsx`
- Modify: `web/src/components/admin/admin.css`

**Interfaces:**
- Consumes: `panels[activeModule].title` and `panels[activeModule].description`
- Produces: one focusable level-one heading inside `.admin-top-header`

- [ ] Add a failing Admin shell test proving the banner contains the active module heading and that no duplicate page-header strip remains.
- [ ] Run `npm.cmd test -- --run src/components/admin/AdminShell.test.tsx` and confirm the test fails because the banner still says `DTI Officer Portal`.
- [ ] Move the existing focused `h1` and description into `.header-titles`, remove `.admin-page-header`, and keep sidebar branding unchanged.
- [ ] Remove only CSS made unused by the deleted strip and preserve responsive behavior.
- [ ] Re-run the targeted Admin shell test and confirm it passes.

### Task 2: Partial overview when emergency schema is unavailable

**Files:**
- Modify: `backend/tests/Feature/AdminAuthorizationAndAuditTest.php`
- Modify: `backend/app/Http/Controllers/Admin/AdminOverviewController.php`

**Interfaces:**
- Produces: `data.stores: int`, `data.pending_reports: int`, `data.active_emergencies: int|null`, and `data.availability.regulatory_emergencies: bool`

- [ ] Add a failing feature test that drops `regulatory_emergencies`, requests `/api/admin/overview`, and expects available counts plus `active_emergencies: null`.
- [ ] Run the targeted PHPUnit test and confirm it fails from the unconditional emergency query.
- [ ] Guard the emergency count with `Schema::hasTable('regulatory_emergencies')` and return additive availability metadata.
- [ ] Re-run the targeted backend test and confirm it passes without exposing database details.

### Task 3: Honest overview unavailable state

**Files:**
- Modify: `web/src/components/admin/AdminSafeguards.test.tsx`
- Modify: `web/src/services/adminApi.ts`
- Modify: `web/src/components/admin/AdminPanels.tsx`

**Interfaces:**
- Consumes: nullable `active_emergencies` and `availability.regulatory_emergencies`
- Produces: visible `Unavailable` emergency metric while retaining store and report metrics

- [ ] Add a failing component test for a successful partial overview response with unavailable emergency records.
- [ ] Run `npm.cmd test -- --run src/components/admin/AdminSafeguards.test.tsx` and confirm the current numeric-only rendering fails.
- [ ] Type the overview response and render a clear unavailable state without turning missing regulatory data into zero.
- [ ] Re-run the targeted component test and confirm it passes.

### Task 4: Verification

**Files:**
- Verify only; no production release actions.

- [ ] Run targeted backend and frontend tests.
- [ ] Run the full backend PHPUnit suite with a 512 MB PHP memory limit.
- [ ] Run the full web Vitest suite, lint, and production build.
- [ ] Run `git diff --check`, `git status --short`, `git diff --stat`, and confirm the index is unchanged.
- [ ] Recheck migration status and confirm no migration was executed.
