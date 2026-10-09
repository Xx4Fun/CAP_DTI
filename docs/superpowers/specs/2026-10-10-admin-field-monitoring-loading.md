# Admin Field Monitoring loading improvements

Status: proposed design; implementation and release have not started.

## Goal and scope

Make the existing DTI Admin Field Monitoring directory and establishment profile faster to use. Preserve the current local layout, filters, visit review, exports, representative details, legal-action links and captured evidence. This work covers this Admin section and its supporting endpoints only.

The user approved creating a plan after the authenticated performance recheck. That request does not authorize implementation, paid services, production asset writes, or publishing this new change.

## Evidence and starting point

The 2026-10-10 browser recheck of deployed commit `09742cf1967b5254db4cc080077757fb8034066e` measured a roughly 0.41-second directory response, 1.63-second CPT Mart profile opening and 1.71-second repeat opening. Reopening repeated four API requests. The ten photos transferred approximately 4.28 MB as the directory was scrolled; images up to 2048 pixels were displayed at 260 x 195 pixels. All image responses had `Cache-Control: no-cache` and CDN `HIT`.

Evidence: `scratch/store-photos/performance-recheck/live-admin-performance.json` and `scratch/store-photos/check-monitoring-performance.py`. These are a desktop, warm-backend sample; they are not phone-network benchmarks or isolated database timings.

The working tree already has an uncommitted profile simplification in `web/src/components/admin/FieldMonitoringRecords.tsx`: profile and visits are fetched in parallel, without the deployed history/findings requests. Implementation must build on this local version without restoring the old four-request design or publishing unrelated changes accidentally. `MonitoringRecordController.php`, `adminApi.ts`, related tests and `docs/DECISIONS.md` also contain unrelated work.

## Approved direction for the plan

1. Prepare small WebP copies of all ten storefront photos for the Admin directory cards and list. Keep originals and their database assignments unchanged.
2. Serve the copies from the existing configured public image disk using content-versioned keys and long browser cache headers. Add an optional `card_image_url` only to the Admin monitoring establishment summaries. `CommodityImageStorage::publicUrl()` remains the URL owner.
3. Display the selected establishment's profile as soon as its profile response arrives; its visit table loads independently. Keep original images for the larger profile hero and retain asynchronous decoding.
4. Reuse monitoring list/profile/visit reads in memory for 15 seconds, keyed by Admin session and complete request parameters. Share concurrent requests, retain explicit refresh, and invalidate after writes and logout. No private evidence is added to this cache.
5. Measure before and after. Profile slow database queries before considering indexes, new aggregate queries, or server-side caches. An always-on Render service is an optional infrastructure decision, outside this implementation.

## Functional requirements

- Card copies: maximum width 640 pixels, no upscaling, original aspect ratio, no new crop, no removal of storefront signs or watermarks. Aim for at most 100 KiB each and 1 MiB combined, subject to a visual readability gate. Record actual output sizes.
- Thumbnail keys: `store_images/<store-slug>-card-<output-sha256-prefix>.webp`; use at least 12 hex characters of the output hash. An existing key with different bytes is a conflict, never an overwrite.
- Thumbnail uploads: `ContentType: image/webp`, `CacheControl: public, max-age=31536000, immutable`. Verify the actual public response headers and bytes after upload; adapter options alone are insufficient proof.
- `card_image_url` is optional and absolute. Unknown/new store photos receive no mapped thumbnail and continue using `image_path`. Missing or failed thumbnails fall back once to the original, then the existing placeholder without an error loop.
- Do not query storage existence or download an image in normal monitoring API requests. The reviewed, packaged manifest is the lookup source.
- Original `image_path`, Store accessor, store metadata, timestamps and existing client image contracts remain unchanged. No database migration or full seeder run.
- Existing lazy loading and reserved image dimensions remain; loading photos must not block names, statuses, controls or profile data.
- Loading/errors are independent for directory, profile, profile visits and standalone records/additional visits. A failed visit request must not hide a successful profile or become an empty successful visit list.
- Store A's late response cannot replace Store B. A late page/filter response cannot replace a newer page/filter. Browser Back/Forward and deep links keep their current behavior.
- Cached refresh failures retain visible data with an error and freshness indication. Data is never presented as newly refreshed when the refresh failed.
- Fresh reads bypass the 15-second cache on explicit Refresh, reconnect/foreground refresh and the existing `regulatory-data-changed` event. Reuse `regulatoryRefresh()` and its 60-second visible-online schedule; do not install another polling mechanism.
- Do not cache signature blobs, private evidence, audited location reads, legal actions or mutations. Regulatory actions continue requiring their existing authoritative server checks.
- Cache entries are memory-only. Bound them to 100 entries; clear expired entries when adding and evict the oldest when full. Include the current Manila calendar day in monitoring keys so cached reads cannot cross a daily/weekly boundary. No IndexedDB, service-worker API cache or offline readiness claim.

## Acceptance and boundaries

All ten directory photos must retain recognizable signs and normal placeholder behavior on 390 x 844 and 1440 x 900 viewports. The profile header must appear while its visit response is deliberately delayed; changing store/search/period must remain correct under reordered responses. Returning to the directory keeps existing visible rows. Repeat matching requests inside 15 seconds share or reuse a response, while Refresh always requests current data.

Measure downloaded bytes, image decode completion, directory response, profile-header readiness and visit-table readiness separately. Compare at least five warm-backend runs with a fresh browser cache and five repeat-navigation runs on the same connection. Add controlled slow-network browser checks. Target a directory-photo transfer reduction of at least 70%; report measured latency improvements instead of promising a fixed number of seconds.

Render's free service can sleep after 15 idle minutes and takes about a minute to wake, according to https://render.com/docs/free. These app changes do not eliminate that delay. Cold-server and real-phone acceptance remain separate checks.

Skipped: other applications, Admin modules outside Field Monitoring, upload/photo editing UI, additional CDN or image-transformation subscriptions, new query libraries, automatic DB/index changes and paid hosting changes.
