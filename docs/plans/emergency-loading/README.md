# Emergency Protocol loading and monitoring sources

Implemented locally on 2026-10-09. This record does not establish deployment or production latency.

Declaration summaries and their saved official references load through `GET /admin/emergencies?view=summary`. The response retains every declaration's official prices and obtains effective declaration IDs in one query. Candidates, observations, source-week calculations and live SRP fallbacks load only for the selected declaration. The legacy list, detail and write contracts remain available.

The subsequent local [pricing-section cleanup](../emergency-pricing-cleanup/README.md) changes Admin presentation to show the selected declaration's prices only. It preserves this API contract and refresh behavior. The browser script now checks 123 APC products plus four SRP fallbacks and writes current artifacts into `scratch/emergency-pricing-cleanup/`; the source-row artifacts below document the original loading fix.

Background refresh keeps loaded content, selection, pagination, scroll and expanded source rows visible. Separate request guards discard superseded summary/detail reads; overlapping triggers coalesce. Mutation responses appear immediately, but one record cannot verify an unavailable declaration list. Stale data retains a warning and Retry action; activation and ending require verified current data. Review confirmation resets when selection or preparation hash changes.

The expandable panel is labelled **Monitoring sources for APC**, counting products with observations. Its rows no longer shrink inside the scroll container. Guidance explains which establishment, observation date, recorded price and monitoring record an expansion shows. APC preparation, activation hash validation, authorization, official references and historical evidence remain under the existing backend rules.

## Local measurements

One representative test fixture: 3 declarations, 123 products, 369 accepted routine observations and 246 official prices. Each route was warmed, then sampled five times against the same in-memory SQLite dataset through Laravel's test HTTP kernel.

| Read | Response bytes | Database queries | Median elapsed ms |
| --- | ---: | ---: | ---: |
| Legacy full list | 503,876 | 21 | 1,982.44 |
| Summary list | 103,740 | 3 | 353.06 |
| Selected declaration detail | 96,682 | 9 | 446.92 |
| Summary plus selected detail | 200,422 | 12 | 785.33 |

The combined read transfers 60.2% fewer bytes. Combined elapsed time is the median of paired summary/detail sums; individual medians need not sum to it. These measurements exclude network, hosting and production database behavior and establish no latency target. Retaining all official references means the summary still grows with reference history. Raw samples: [backend-benchmark.json](../../../scratch/emergency-loading-fix/backend-benchmark.json).

## Verification

- Backend emergency/APC, regulatory workflow, authorization, manual ending and Field emergency rules: **37 tests, 359 assertions passed**. Summary compatibility, omitted source queries, effective-state parity and constant summary query counts are covered.
- Browser fixture with actual Admin styles: **123 expandable products at 1440 px and 390 px**, minimum collapsed row height **43 px**. Expanded observations, keyboard toggling and refresh preservation of records, expansion and scroll passed. All external browser requests were blocked; no production API was exercised.
- Focused Admin component/API/session package: **7 files, 80 tests passed**, including delayed/empty loading, refresh/retry, overlapping triggers, rapid selections, mutation races, unchanged-hash SRP fallback changes, review resets, stale-action blocking and pagination shrinking.
- Admin production build and scoped backend Pint check passed. The build retains its existing large Excel-export chunk warning. Scoped frontend lint passed with React hook warnings around the existing refresh-effect pattern; no full-repository lint run was performed.

Browser artifacts: [desktop](../../../scratch/emergency-loading-fix/sources-1440.png), [phone](../../../scratch/emergency-loading-fix/sources-390.png), [assertion results](../../../scratch/emergency-loading-fix/browser-results.json).

Reproduce the focused checks from `web/` and `backend/`, respectively:

```powershell
npm.cmd test -- --run src/components/admin/EmergencyRefresh.test.tsx src/components/admin/LegalNoticeAndEmergency.test.tsx src/components/admin/AdminSafeguards.test.tsx src/components/admin/AdminShell.test.tsx src/components/admin/AdminVisualIntegrity.test.tsx src/services/adminApi.test.ts src/AppSession.test.tsx --maxWorkers=1 --no-file-parallelism
npm.cmd run build
php vendor/bin/phpunit --filter 'EmergencyApcWorkflowTest|AdminRegulatoryWorkflowTest|AdminRouteHardeningTest|ManualPriceFreezeEndTest|FieldEmergencyRulesTest'
php vendor/bin/pint --test app/Http/Controllers/Admin/EmergencyAdminController.php tests/Feature/EmergencyApcWorkflowTest.php
```

For the browser check, run the Admin dev server on `127.0.0.1:5191`, then run `python scratch/emergency-loading-fix/browser_check.py` from the repository root. It uses the already installed Playwright runtime; no application dependencies were added.

No schema or regulatory-data changes. Unrelated working-tree files were preserved. Commit, push and release need separate authorization; deploy the compatible backend before Admin. Authenticated production acceptance and live response timings remain unverified.
