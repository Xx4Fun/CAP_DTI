# Immediate manual Price Freeze ending

Initial implementation scope: the user-approved 2026-10-08 plan; backend and Admin only, without production migration, commit, push, deployment, backfill or production data correction. Subsequent user instructions authorized a scoped commit and push to `main`.

Pre-flight: `ended_at` is a nullable UTC instant; consumers retain date-only scheduled expiry and use a strict historical cutoff. Admin receives the server timestamp and uses the existing mutation refresh event.

Ruling: implement in the current checkout and preserve unrelated edits, as requested. Keep existing date bookkeeping; the manual timestamp determines the actual cutoff. Existing cancellation behavior remains unchanged.

Implemented: nullable microsecond UTC `ended_at`, the existing declaration/row locks, idempotent manual ending, eligible legacy ending, a shared effective query, microsecond resolver keys, editing-lock release, and Admin success/error feedback with Manila ending time. Cancellation is unchanged; scheduled dates stay inclusive.

Verification (local, 2026-10-08):

- New regressions first failed on `in_effect` after manual ending and rejection of eligible legacy records. Admin regressions first failed on the old confirmation and missing legacy button.
- Focused backend: 54 tests / 548 assertions passed, including exact-cutoff references/cadence, retry/audit/notification behavior, rollback, authorization, inclusive scheduled expiry, and queued signed visits synchronized after ending.
- Full backend: 782 tests / 6034 assertions passed. Full Admin: 267 tests passed; build passed (existing chunk-size advisory).
- Browser acceptance: real Admin password reconfirmation and manual ending against a new synthetic SQLite database; immediate header/view refresh, server cutoff displayed in Manila, retry idempotency, public comparisons/SRP, Field standard/weekly bootstrap, Vendor ended advisory, and failed-save/legacy workflows passed. Artifacts: `scratch/manual-price-freeze-end/result.json` and screenshots. Nothing was migrated or changed in production.
- Scoped diff whitespace check passed. A pre-existing trailing blank line in Vendor CSS remains untouched.

Final independent review: no actionable Critical, Important or Minor findings. Reviewed precision, authorization, retry behavior, declaration-before-row locking, transactional audit/notifications, historical references, future editing restrictions and Admin refresh/errors. PostgreSQL concurrency was inspected in source but not exercised against a PostgreSQL instance; all runtime database checks used isolated SQLite.

Release verification (2026-10-08): the unpublished commit was split into backend and Admin commits with identical application code, preserving unrelated edits. Backend `c801d90` was pushed first and became live on Render at 09:00 Manila. Render logs confirm `2026_10_08_000001_add_manual_emergency_cutoff` completed; readiness and public configuration returned HTTP 200. Admin changes follow the verified backend via Git-connected builds. Pushing `main` automatically triggers the connected Vercel projects; no separate frontend deployment is issued. No declarations were backfilled or manually changed during production verification.
