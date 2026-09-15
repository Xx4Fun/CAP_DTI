# Vendor PWA: connect to backend + DTI Admin User Management

## Context

`C:\CAP101_DTI_SYS\vendor-pwa\` is a static prototype: React 19 + Vite 8 + vite-plugin-pwa, all data from `src/api/mockVendorData.ts`, fake login, simulator toolbar, gitignored (`.gitignore:13-14`), absent from this worktree. Meanwhile the real vendor surface is a thin `web/src/components/VendorPortal.tsx` inside the admin web app, and vendor onboarding (store invitation) is only reachable from Store Manager. Goal: the vendor PWA becomes the single, fully working vendor app on real backend data, and DTI Admin manages vendor accounts end to end from User Management.

Decisions (user-confirmed 2026-09-14):
1. Track `vendor-pwa/` in repo.
2. Onboarding = existing invitation flow, surfaced in User Management.
3. Feature gap = derive from existing data + small backend additions; no SMS/email delivery.
4. Retire web vendor portal; vendors redirected to PWA with dedicated scoped login.

Revision 2 (after Codex round 1): removed name-based backfill; serialized invitation/link/response/terminal writes; durable legal document disk; distinct session-vs-operation error codes; per-product SRP rule in Manila time; store-creation callback; fixture-based e2e.

Revision 3 (after Codex round 2): response locks store before notice; literal `legal_documents` disk name; store-create envelope `response.data.data`; e2e frontends pinned to local API; legacy legal tests migrated.

## Acceptance criteria

- Admin: User Management "Add user > Vendor account" picks an unlinked store (or registers one and continues with it), sends invite, shows copyable PWA link. Pending invitations listed with Resend / Cancel. Vendor rows: edit, reset password, deactivate (existing) + unlink store.
- Inviting for an already-linked store is rejected; unlinking cancels that store's pending invitations; a cancelled/superseded invitation cannot be accepted.
- Invite link opens vendor PWA accept page; vendor sets name/password; linked store appears after login.
- `POST /api/login` for vendor returns 403 `VENDOR_PWA_REQUIRED`; web login shows link to PWA (field officers likewise get `FIELD_PWA_REQUIRED` handoff). Old web `/vendor-invitation?token=` redirects to PWA with token.
- Vendor PWA: real login/logout, store switcher over vendor's linked stores, dashboard (derived compliance, recidivism, last inspection, active emergency), notices list + detail (flagged items from snapshot, official PDF), response wizard submits multipart with reason, per-file category, oath; deadline/delivery gating matches backend; response history; SRP guide using per-product reference type with provisional wording; advisories; notification preferences persisted. No mock data, no simulator, no vendor calamity toggle.
- Only one response per notice succeeds; response cannot overwrite a closed/cancelled notice.
- Deadline-expired submission shows error in wizard, session kept. Deactivated vendor / revoked token: PWA returns to login.
- New notice PDFs and attachments stored on configurable durable disk (S3 in Render).
- Admin Legal Notice view shows vendor response (text, reason, oath time, downloadable attachments).
- All proof commands below pass.

## Approach

### A. Backend (`backend/`)

1. **Vendor auth** — new `app/Http/Controllers/Vendor/VendorAuthController.php`, copying `Field/FieldAuthController.php` shape (no lease):
   - `POST /api/vendor/login` (`throttle:login`): role `vendor` + `is_active`; token name `vendor-portal-pwa`, abilities `['vendor-portal']`, `expires_at` now + `env('VENDOR_TOKEN_HOURS', 720)` hours. Audit `auth.vendor_login_succeeded`.
   - `GET /api/vendor/session`, `POST /api/vendor/logout`, `POST /api/vendor/password` (current + new min 12 confirmed).
   - Shared guard (one trait `App\Http\Controllers\Vendor\ResolvesVendor::vendorUser()`, used by all vendor controllers): role vendor, active, `currentAccessToken()->name === 'vendor-portal-pwa'` (name check because Sanctum `can()` passes legacy `['*']` tokens). Failure returns 403 JSON `{status: 'VENDOR_ACCESS_REVOKED'}`. Sanctum missing/expired token stays 401.
   - `AuthController::login`: vendor returns 403 `{status: 'VENDOR_PWA_REQUIRED'}` next to existing `FIELD_PWA_REQUIRED` branch.
2. **Vendor data** — new `Vendor/VendorPortalController.php`, routes under `auth:sanctum` prefix `/api/vendor`:
   - `GET overview`: user, `stores[]` (id, store_name, address, dti_sec_number, recidivism_index, `last_inspected_at` = latest accepted `MonitoringRecord.finalized_at`, `compliance_status` derived: open SCO → `SHOW_CAUSE_ISSUED`, open LOI → `UNDER_INQUIRY`, else `IN_GOOD_STANDING`; open = `issued|response_received`), `emergency` from `App\Support\MonitoringPeriod::effectiveEmergency(now('Asia/Manila'))` (declaration_reference, location, starts_on, ends_on) or null.
   - `GET srp`: one instant `$at = now('Asia/Manila')` used for bulletin selection (same query as `FieldDataController::bootstrap`), `FieldReferenceResolver::resolve($bulletin, $at)` and `protocolAt($at)`. Each item returns name, category, classification, unit and the resolver's full reference (`status`, `type` `standard_srp|emergency_ceiling`, `value`, `label`, `source`, `effective_date`). Response also carries `protocol` (mode, reference) for display only.
   - `GET advisories`: derived, no new table — emergencies (active + ended within 90 days) and SRP bulletins with `effective_date` within last 30 Manila days grouped by `source_reference`.
   - `GET|PUT preferences`: stored at `users.preferences.vendor_notifications` (merge pattern of `Admin/AdminSettingsController.php:102`); validate booleans, PH mobile `^09\d{9}$`, email.
3. **Notices** — move `LegalNoticeController` vendor routes to `/api/vendor/notices`, `/{id}`, `/{id}/document`, `POST /{id}/response`; delete old `/notices*` routes (`routes/api.php:158-162`). Changes in `app/Http/Controllers/LegalNoticeController.php`:
   - Use `vendorUser()` guard.
   - `storeIds()`: `vendor_user_id` only — drop `owner_name` fallback.
   - `vendorData()` adds `monitoring_date`, `flagged_items` (from `source_snapshot.items`: commodity_name, unit, observed_price, reference_value, reference_label, variance_percent), `response_text`, `response_reason_category`, `response_certified_at`, vendor-response attachments with `category`.
   - `response()` validation (before transaction): `reason_category` in `WHOLESALE_HIKE|FREIGHT_SURCHARGE|ENCODING_ERROR|PACKAGING_DISCREPANCY|FORCE_MAJEURE` (ids from prototype `RebuttalWizard.tsx:24-30`; wizard switches from label to id), `certified_under_oath` `accepted`, `response_text` required min 20 max 10000, `attachments` max 5 (pdf,jpeg,png, 5 MB), `attachment_categories` same length, each in `DELIVERY_RECEIPT|WHOLESALER_INVOICE|FREIGHT_BILL|SHELF_TAG|OTHER`. Drop legacy `rebuttal` field.
   - **Concurrency:** global lock order for any write touching both is **store → invitation** and **store → notice**. Inside `DB::transaction`: read notice `store_id` (no lock), `Store::whereKey($storeId)->lockForUpdate()->firstOrFail()`, then `LegalNotice::whereKey($id)->lockForUpdate()->firstOrFail()`; recheck `store.vendor_user_id === user.id` and notice `store_id` unchanged, status `issued`, delivery `received|refused`, deadline, all while holding both locks. Errors carry codes: 409 `{status: 'NOTICE_NOT_RESPONDABLE'}`, 403 `{status: 'RESPONSE_PERIOD_EXPIRED'}`, 403 `{status: 'NOTICE_ACCESS_DENIED'}`. Files written to disk `'legal_documents'` inside the transaction, attachment row `disk` = `'legal_documents'`; on exception delete stored paths from that same disk (existing cleanup pattern).
   - `Admin/LegalNoticeController`: `delivery()` and `terminal()` (close/cancel) reload the notice with `lockForUpdate` inside their transaction and recheck status before writing (`terminal` currently checks outside transaction at line 196). They do not read the vendor link, so notice lock alone suffices; no path locks notice before store.
4. **Migration** `2026_09_14_000001_vendor_pwa_portal.php` (guarded with `Schema::hasColumn` like siblings):
   - `legal_notices`: `response_reason_category` string nullable, `response_certified_at` timestamp nullable. `legal_notice_attachments`: `category` string nullable. Update model `$fillable`.
   - Delete existing vendor `personal_access_tokens` (legacy `['*']` from `/api/login`).
   - **No** name-based backfill. Unlinked real vendors regain access only through an admin invitation for their store.
5. **Invitations** (`app/Services/Admin/VendorInvitationService.php`, `Admin/VendorInvitationController.php`) — all store-link writers serialize on the store row, lock order always **store → invitation**:
   - URL base `config('app.vendor_pwa_url')` (env `VENDOR_PWA_URL`, fallback `frontend_url`); path stays `/vendor-invitation?token=`.
   - `create()`: transaction; `Store::whereKey()->lockForUpdate()`; reject 422 `STORE_ALREADY_LINKED` if `vendor_user_id` not null; cancel other pending invitations for the store (audit `invitation.superseded`); create new. Mail queued after commit. Resend = invite again.
   - `accept()`: find invitation by hash (no lock) to get `store_id`; transaction: lock store, lock invitation, recheck pending + not expired; reject if store already linked to a different user; `firstOrCreate` user; link; mark accepted. Response includes `existing_account: true` when user pre-existed (PWA tells vendor to sign in with existing password).
   - `cancel()`: transaction: lock store, lock invitation, status check inside.
   - New `GET /api/admin/vendor-invitations?status=pending` (`index`, `requireManager`): id, email, store {id, store_name}, expires_at, status, inviter name.
6. **Unlink store** — `StoreAdminController::update` accepts `vendor_user_id: null` only (linking stays invite-only), `SensitiveActionGuard::requireRecentReauthentication`; transaction locks store, nulls link, cancels pending invitations for store; audit `store.vendor_unlinked`.
7. **Admin attachment download** — no route exists (`routes/api.php:139-140` only attach/delete): add `GET /api/admin/legal-notices/{legalNotice}/attachments/{attachment}` (`requireManager`, attachment must belong to notice, `Storage::disk($a->disk)->response(...)`, audit `legal.attachment_accessed`). `detail()` already returns new columns + attachments.
8. **Durable legal document storage** — `config/filesystems.php` adds `legal_documents` disk mirroring `receipt_evidence` (driver `env('LEGAL_DOCUMENTS_DRIVER', 'local')`, local root `storage_path('app/private/legal-documents')`, S3 bucket/endpoint/keys/region/path-style from `LEGAL_DOCUMENTS_*` falling back to `RECEIPT_EVIDENCE_*`, visibility private). Replace hardcoded `'local'` in `Admin/LegalNoticeController` issue (lines 129-135: `put`, persisted `pdf_disk`, rollback delete), attach (~179: store, persisted `disk`, cleanup) and vendor `response()` with the literal disk name `'legal_documents'` (one class constant `LegalNotice::DOCUMENT_DISK = 'legal_documents'`). No config selector key. Tests assert persisted `pdf_disk`/`disk` equals `'legal_documents'` and file exists on `Storage::fake('legal_documents')`. Reads/deletes keep using each row's stored `pdf_disk`/`disk`, so existing rows are untouched. `render.yaml` adds `LEGAL_DOCUMENTS_DRIVER=s3`. Existing production files on `local` were already non-durable across deploys and cannot be recovered; their downloads keep returning 404 (documented in DECISIONS).
9. **Seeders** — `DatabaseSeeder`: link `vendor@grocery.com` to one named seeded store via `vendor_user_id` explicitly. New `VendorPwaVerificationSeeder` (refuses unless `app()->environment('local', 'testing')`): accepted `MonitoringRecord` with an anomaly item for that store, one `LegalNotice` `issued` + delivery `received` + due in 3 days with `source_snapshot.items` and a stub PDF on `legal_documents` disk, one pending invitation for a second unlinked store. Production legal policy gate (`config/legal_policy.php` `approved=false`) untouched; admin issuance itself stays covered by `LegalActionsWorkflowTest` config overrides.
10. `config/app.php` + `.env.example`: `VENDOR_PWA_URL`, `VENDOR_TOKEN_HOURS`, `LEGAL_DOCUMENTS_*`.

### B. Admin web (`web/`)

1. `services/adminApi.ts`: add `getVendorInvitations`, `cancelVendorInvitation` (existing route), `unlinkStoreVendor`, `downloadLegalAttachment`. Types in `types/admin.ts`.
2. Extract invite modal body from `components/admin/StoreManager.tsx:512-660` into `components/admin/VendorInviteForm.tsx` (email → `inviteVendor` → copyable link, shows `STORE_ALREADY_LINKED` message); StoreManager uses it.
3. Store creation handoff: `components/StoreOnboarding.tsx` `onCreated?: (store: StoreRecord) => void` receiving `response.data.data` of `POST /admin/stores` (backend returns `{data: store}` with 201, `StoreAdminController::store`); type the call `api.post<{ data: StoreRecord }>`. `AdminPanels.tsx:313` `StoreRegistrationPanel` gains optional `onCreated`; when given it is called instead of navigating to `gis_monitoring`, otherwise GIS navigation kept. `UserManagementPanel` supplies it through a render prop (`vendorRegistration: (onCreated) => ReactNode`), replacing the `cloneElement` at `UserManagementPanel.tsx:136-139`.
4. `UserManagementPanel.tsx` vendor view: step 1 choose unlinked store from `getStores()` (`vendor_user_id == null`) or register new (continues with returned store); step 2 `VendorInviteForm`; handoff copy mirrors `FieldOfficerHandoff` with `VITE_VENDOR_PWA_URL`.
5. List view: "Pending vendor invitations" block when role filter is `all|vendor` — email, store, expires, Resend, Cancel. Vendor row menu: "Unlink store" per linked store (confirm + existing reauthentication flow).
6. `App.tsx`: remove `VendorPortal` branch, `VendorInvitationAccept`, vendor restore from `localStorage` (`App.tsx:104-119`); `/vendor-invitation?token=` → `window.location.replace(VITE_VENDOR_PWA_URL + '/vendor-invitation?token=…')`. Generalize `fieldOfficerHandoff` (`App.tsx:45,257-272`) to `pwaHandoff: 'field' | 'vendor' | null`. `components/Login.tsx:35-40` maps any 403 to "temporarily unavailable" (existing bug): on 403 with `status` `FIELD_PWA_REQUIRED|VENDOR_PWA_REQUIRED` call new `onPwaRequired(kind)`. Delete `VendorPortal.tsx`, `VendorInvitationAccept.tsx` + test.
7. `LegalNoticeManager.tsx`: read-only "Vendor response" section when `response_received_at` set (text, reason label, oath time, attachment download buttons).
8. `.env.example`/`.env.production`: `VITE_VENDOR_PWA_URL`.

### C. Vendor PWA (`vendor-pwa/`)

1. Import from main checkout (exclude `node_modules`, `dist`); remove `.gitignore` entry. Add `axios`.
2. `src/services/vendorApi.ts` — shape of `field-officer-pwa/src/services/fieldApi.ts` (axios client, `VITE_API_BASE_URL`, explicit `auth(token)`, `apiError`): login, session, logout, password, overview, notices, notice, document (blob), respond (FormData), srp, advisories, getPreferences, savePreferences, acceptInvitation.
3. Session: token + expiry in `localStorage`. One helper `isSessionInvalid(error)`: true only for 401 or 403 with `status` `VENDOR_ACCESS_REVOKED`; then clear session, show login with message. All other errors (e.g. `RESPONSE_PERIOD_EXPIRED`, `NOTICE_NOT_RESPONDABLE`, `NOTICE_ACCESS_DENIED`, 422) stay in the current screen. Logout calls API then clears.
4. Rewrite `src/app/types.ts` to backend shapes; delete `src/api/mockVendorData.ts`. Status helper: `issued` + delivery not recorded → "Awaiting delivery record"; `issued` + received/refused → "Response due"; `response_received` → "Under review"; `closed` → "Closed".
5. Components (keep visual design, swap data):
   - `App.tsx`: remove simulator toolbar, calamity toggle, fake toasts; load overview; selected store in state; tabs as today.
   - `auth/VendorLogin.tsx`: real form, errors; remove demo accounts. New `auth/InvitationAccept.tsx` at `/vendor-invitation?token=`.
   - `dashboard/*`: overview data; emergency pill read-only.
   - `notices/NoticeList.tsx`, `NoticeDetailModal.tsx`: backend fields; official document via blob (logic of `web/src/components/VendorPortal.tsx:19-26`) instead of `alert()`.
   - `rebuttal/RebuttalWizard.tsx`: `canRespond` rule of `VendorPortal.tsx:37-38`; 5 files / 5 MB; per-file category; oath required; submit button disabled while pending (no double submit); FormData; server error codes shown inline; refresh notices.
   - `rebuttal/RebuttalHistory.tsx`: notices with `response_received_at`; reference = `control_number`; no evaluator notes/outcome.
   - `srp/SrpDirectory.tsx`: `/vendor/srp`; calculator per item copies `analyzeWithReference` rule from `field-officer-pwa/src/app/workflow.ts:44-56` (unavailable → no comparison; `emergency_ceiling` → price > value; `standard_srp` → price > value × 1.1). Labels "Within reference" / "For review" + reference label; remove "COMPLIANT", "ILLEGAL", "statutory ceiling" wording.
   - `advisories/AdvisoriesView.tsx`: `/vendor/advisories`.
   - `settings/NotificationSettingsModal.tsx`: load/save preferences; note "Saved. SMS/email alerts are not yet delivered."
   - `common/CountdownBadge.tsx`: `due_date_timestamp`.
6. PWA plumbing from field app: `vite.config.ts` `navigateFallbackDenylist: [/^\/api/]`; `src/app/pwaRegistration.ts` + `PwaUpdatePrompt.tsx`; `vercel.json`; `.env.example`; `vite-env.d.ts`. Offline = app shell + offline banner; no data caching, submissions need network.
7. Tests `src/App.test.tsx` rewritten with `vi.mock('./services/vendorApi')`.

### D. Docs

`docs/DECISIONS.md` entry: separate vendor PWA, scoped vendor token, owner_name fallback removed without backfill, derived compliance/advisories, no alert delivery, `legal_documents` durable disk and unrecoverable prior local files. `docs/PROJECT-MAP.md` lists `vendor-pwa/`.

## Non-goals

SMS/email/push delivery; offline response queue; rebuttal outcome / evaluator notes; direct vendor creation; vendor self-registration; vendor-initiated linking; migrating legacy local legal files; approving the production legal policy; rotating leaked secrets in `AGENTS.md` / committed `.env` (flagged to user separately).

## Risks

- Vendors currently linked only by owner name lose notice access until invited (accepted; safer than namesake access).
- Deleting legacy vendor tokens logs out current web-portal vendors (intended).
- Token in `localStorage` exposed to XSS; mitigated by scoped token, expiry, revoke on deactivate.
- SQLite test DB ignores `lockForUpdate`; race safety tested as sequential recheck cases, real locking relies on PostgreSQL.
- `legal_documents` S3 needs bucket env set in Render before deploy, else writes fail with 503 (existing message).

## Verification

Proof commands (host runs; all must pass):
```
cd backend && php artisan test
cd web && npx vitest run && npm run lint && npm run build
cd vendor-pwa && npm install && npm test && npm run lint && npm run build
```
Backend tests:
- `VendorAuthTest`: login role/active, `VENDOR_PWA_REQUIRED` on `/api/login`, legacy `*` token → 403 `VENDOR_ACCESS_REVOKED`, expired token 401, logout, deactivation revokes.
- `VendorPortalTest`: compliance derivation; store isolation incl. same-name owner no longer matching; SRP standard, emergency covered (`emergency_ceiling`) and non-covered (`standard_srp`) items; Manila-midnight boundary (`Carbon::setTestNow('2026-09-14 16:30 UTC')` with bulletin effective 2026-09-15 is selected and resolved); advisories; preferences validation.
- Existing suites migrated: every test referencing `/api/notices` (`LegalNoticeTest`, `LegalActionsWorkflowTest:38`, `AdminRegulatoryWorkflowTest`, `LegacyLegalPolicyGuardTest:24`; build step reruns `grep -rn "/api/notices" backend/tests` until empty) uses `/api/vendor/notices` with a `vendor-portal-pwa` token; removed-route expectations (`/api/notices/dispatch` 405) become 404 while keeping the assertions that no notice/regulatory state is created; `LegalActionsWorkflowTest:79,99-100` fakes and asserts `legal_documents` instead of `local`.
- `LegalNoticeTest`: new routes; reason/oath/category validation; delivery/deadline gating with codes; second response → 409 `NOTICE_NOT_RESPONDABLE` and attachments not added; response after store unlinked → 403 `NOTICE_ACCESS_DENIED` with no attachment rows or files; response after admin close → 409; admin close after response keeps response; files on `legal_documents` disk (`Storage::fake('legal_documents')`); flagged_items payload.
- `AdminInvitation*Test`: index; invite for linked store → 422; re-invite supersedes (old token rejected); accept after cancel rejected; unlink cancels pending and old token rejected; PWA URL; `existing_account` flag. Store unlink requires reauth.
- Admin attachment download authorization.
Web tests: UserManagementPanel invite flow incl. register-new continuing with returned store (mock returns real envelope `{data: {id: 42, ...}}`, assert invite posts to `/admin/stores/42/invitations`); StoreRegistrationPanel without `onCreated` still navigates to GIS; pending invitations resend/cancel; Login `FIELD_PWA_REQUIRED` and `VENDOR_PWA_REQUIRED` handoffs; `/vendor-invitation` redirect.
PWA tests: 403 `RESPONSE_PERIOD_EXPIRED` keeps session and shows wizard error; 401 returns to login; SRP rule per type.

Manual e2e (Playwright MCP), fully isolated — never Supabase or `cap-dti.onrender.com`:
- Backend: `DB_CONNECTION=sqlite DB_DATABASE=database/vendor-e2e.sqlite LEGAL_DOCUMENTS_DRIVER=local APP_ENV=local FRONTEND_URL=http://localhost:5173 VENDOR_PWA_URL=http://localhost:5176 MAIL_MAILER=log QUEUE_CONNECTION=sync` for `php artisan migrate:fresh --seed`, `php artisan db:seed --class=VendorPwaVerificationSeeder`, `php artisan serve --port=8000`.
- Web: `VITE_API_BASE_URL=http://localhost:8000/api VITE_VENDOR_PWA_URL=http://localhost:5176 VITE_FIELD_PWA_URL=http://localhost:5175 npm run dev` (shell env overrides `web/.env`, which points at production).
- Vendor PWA: `VITE_API_BASE_URL=http://localhost:8000/api npm run dev` (5176).
- Before any mutation: in each app, check Playwright network requests (`browser_network_requests`) show only `localhost:8000`; abort if any request targets another API host. Flow: admin invites vendor for unlinked store from User Management → accept in PWA → login → switch to seeded vendor account → sees flagged items, opens PDF, submits response with attachment → admin sees response and downloads attachment → admin deactivates vendor → PWA returns to login. Mobile viewport check. This proves integration on fixtures, not operational readiness of the legal policy.

## Claudex loop

Plan at `docs/plans/vendor-pwa/PLAN.md`, log `docs/plans/vendor-pwa/PLAN-REVIEW-LOG.md`, Codex `gpt-6-astra` high, max 5 rounds. Build authorized only after user confirms post-review; builder Claude, fresh Codex inspection.
