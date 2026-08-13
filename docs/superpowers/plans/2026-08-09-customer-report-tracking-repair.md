# Customer Report Tracking Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore receipt report tracking and show successful local submissions in Home's recent-report section.

**Architecture:** Keep Laravel's existing GET tracking contract. Add one focused browser-storage module for non-secret report summaries, then connect successful submission and tracking callbacks through `App` so Home receives current display data.

**Tech Stack:** React 19, TypeScript 6, Axios, Vitest, Testing Library, Laravel public API

## Global Constraints

- Preserve all unrelated uncommitted workspace changes.
- Never persist `secret_tracking_token`.
- Do not change backend routes, schema, migrations, or production data.
- Do not commit, stage, deploy, or push.

---

### Task 1: Restore the Tracking HTTP Contract

**Files:**
- Modify: `customer-pwa/src/components/TrackReport.test.tsx`
- Modify: `customer-pwa/src/components/TrackReport.tsx`

**Interfaces:**
- Consumes: Laravel `GET /api/public/reports/track?reference=<reference>&token=<token>`
- Produces: `apiClient.get('/public/reports/track', { params: { reference, token } })`

- [ ] **Step 1: Change the tracking test to spy on `apiClient.get`, submit credentials, and assert that the returned report becomes visible.**
- [ ] **Step 2: Run `npm.cmd test -- --run src/components/TrackReport.test.tsx` and confirm failure because production still calls POST.**
- [ ] **Step 3: Replace the POST call with GET query parameters in `TrackReport.tsx`.**
- [ ] **Step 4: Run the focused test again and confirm both tracking tests pass.**

### Task 2: Add Non-Secret Recent Report Storage

**Files:**
- Create: `customer-pwa/src/app/recentReports.ts`
- Create: `customer-pwa/src/app/recentReports.test.ts`

**Interfaces:**
- Produces: `StoredRecentReport`, `getRecentReports()`, `saveRecentReport(report)`, `toRecentReportTicket(report)`
- Storage key: `price-watch-recent-reports`
- Maximum entries: 5

- [ ] **Step 1: Write tests for empty/malformed storage, newest-first replacement by reference, five-entry bounding, status mapping, and serialized output without a tracking token.**
- [ ] **Step 2: Run `npm.cmd test -- --run src/app/recentReports.test.ts` and confirm failure because the module does not exist.**
- [ ] **Step 3: Implement strict parsing, bounded persistence, upsert-by-reference, and ticket conversion.**
- [ ] **Step 4: Run the focused storage tests and confirm they pass.**

### Task 3: Connect Successful Submission and Tracking to Home

**Files:**
- Modify: `customer-pwa/src/components/FormalReport.tsx`
- Modify: `customer-pwa/src/components/TrackReport.tsx`
- Modify: `customer-pwa/src/App.tsx`
- Modify: `customer-pwa/src/App.test.tsx`

**Interfaces:**
- `FormalReport.onReportSubmitted(result: FormalReportResponse, storeName: string): void`
- `TrackReport.onReportTracked(report: TrackReportResponse): void`
- `App` owns `StoredRecentReport[]`, persists callback results, and passes `RecentReportTicketProps[]` to `Home.recentReports`

- [ ] **Step 1: Add an application-level regression test that seeds a recent report summary and verifies Home renders it, plus callback behavior tests at the responsible component boundary.**
- [ ] **Step 2: Run the focused tests and confirm they fail because callbacks and Home wiring are absent.**
- [ ] **Step 3: Add the two callbacks, update application state through `saveRecentReport`, and pass mapped tickets to Home.**
- [ ] **Step 4: Run the focused tests and confirm they pass.**

### Task 4: Verify the Complete Repair

**Files:**
- Review all files changed by Tasks 1-3 and preserve pre-existing edits.

- [ ] **Step 1: Run `npm.cmd test` from `customer-pwa`.**
- [ ] **Step 2: Run `npm.cmd run lint` from `customer-pwa`.**
- [ ] **Step 3: Run `npm.cmd run build` from `customer-pwa`.**
- [ ] **Step 4: Run `git diff --check` and review the scoped diff for accidental changes or secret-token persistence.**
