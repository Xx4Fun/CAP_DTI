# Price Freeze activation safeguards and recovery

Implemented locally on 2026-10-09 from the approved plan. This record establishes no deployment or production correction.

Activation rejects drafts whose inclusive Manila end date has passed, after taking the existing advisory/row locks and again at the price-write boundary. The latter check covers preparation or lock waits crossing midnight. Future and open-ended declarations remain supported.

The shared `EmergencyLifecycleService` releases expired active/ended locks during an otherwise valid activation, after preparation/hash and coverage validation. Recovery, official prices, confirmation, notifications, and mandatory audits share one transaction. Failures roll everything back; reads perform no recovery. Current, scheduled, open-ended, and unexpected malformed locks remain blockers.

Natural recovery changes only `status` to `ended`, clears `active_scope_key`, and updates normal bookkeeping. It preserves recorded dates, manual cutoff, confirmation, candidates, and all official prices. Natural expiry remains labelled `expired`; existing manual cutoffs remain `ended`. Confirmation is never backdated. Actual recovery records `emergency.expired_lock_released` with the previous status/key, original end date, and `automatic` or `manual` mode.

Summary/detail responses add `activation_lock_held` and `can_release_expired_lock` booleans. Genuine conflicts return HTTP 409 `EMERGENCY_ACTIVATION_BLOCKED` with the blocking declaration's identity, dates, and effective state. Expired drafts return HTTP 422 `EMERGENCY_DATE_EXPIRED`. Only the two PostgreSQL activation uniqueness constraints receive conflict translation; unrelated database errors retain normal logging and responses.

`POST /api/admin/emergencies/{id}/release-expired-lock` accepts `{ confirmed: true }`, requires manager authorization and password reconfirmation, and returns the existing detail shape. Repeated successful recovery creates no duplicate audit. Admin warns separately about expired locks while retaining the accurate current protocol, offers **Release expired lock**, and preserves the selected draft during recovery. Scheduled blockers can be cancelled through the existing confirmed status write.

An uncertain activation response triggers a status read without repeating the write. Failed verification disables activation behind **Activation result unknown** and **Retry status checking**. Saved confirmation displays its actual state; an unchanged draft requires another review. Mutation refreshes update all summaries, selected details, and regulatory listeners, preserving request guards.

## Verification

- New backend and Admin regressions failed before implementation. Covered expiry rejection, audit/database rollback, preserved history and late confirmation, inclusive end dates, midnight during preparation, real blockers, recovery idempotence/reconfirmation, selection/races, uncertain results, and scheduled cancellation. Consumer, Field, and Vendor protocol reads are checked with their real authorization contracts against isolated data.
- Full Admin suite: **37 files / 324 tests passed**. Admin production build passed. Scoped frontend lint has no errors; refresh-effect warnings remain, including the additional verification guard. The existing large Excel-export chunk warning remains.
- Full backend suite: **860 tests / 6,596 assertions passed**, including cross-client protocol reads. Scoped PHP formatting checks passed.
- Isolated PostgreSQL concurrency: **two overlapping advisory-lock waiters**, one HTTP 200, one HTTP 409, one active declaration, one recovery audit, and one confirmation audit. The runner refuses every database except its dedicated disposable scratch cluster and drops only its own database afterward. Official PostgreSQL 17.11 binaries are test tooling, not an application dependency.
- Actual Admin component/style browser checks passed at **1440 px and 390 px**, blocking all external requests: recovery preserves selection, expired activation is disabled, failed verification requires read retry, lost responses produce no duplicate writes, scheduled cancellation works, and there are no page errors or horizontal overflow. [Results](../../../scratch/emergency-activation-recovery/browser-results.json).
- Independent read-only review found no material correctness issues. Full backend results are retained in `scratch/emergency-activation-backend-full.log`.

From `backend/`, run `php vendor/bin/phpunit`; from `web/`, run `npm.cmd test -- --run --maxWorkers=1 --no-file-parallelism` and `npm.cmd run build`.

The standalone PostgreSQL check is `backend/tests/Integration/EmergencyActivationConcurrency.php`, requiring a fresh disposable scratch cluster at `scratch/emergency-activation-recovery/postgres/data`, initialized with PostgreSQL superuser `postgres`, listening only on `127.0.0.1:55439` with local trust authentication. Verification used the [official PostgreSQL 17.11 binary archive](https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip), extracting its `pgsql/bin`, `pgsql/share`, and `pgsql/lib` folders into the scratch PostgreSQL directory. The temporary cluster/runtime were removed after testing; results remain in `scratch/emergency-activation-recovery/postgres-concurrency.log`. Browser reproduction uses Admin on `127.0.0.1:5199` and `python scratch/emergency-activation-recovery/browser_check.py` from the repository root.

No schema migration, scheduler, application dependency, broad backfill, or production mutation. Unrelated work was preserved. Commit, push, deployment, and production recovery require separate authorization; release the compatible backend before Admin.
