# Four establishment photos

## Local implementation

The supplied JPGs are preserved byte-for-byte in `backend/database/seeders/store-source-images/`.
The ignored `receipt-samples/` folder and older frontend bundles are unchanged.

| Establishment | Source file | Database object key |
| --- | --- | --- |
| CPT Mart- Antique Branch | cptmart.jpg | store_images/cptmart.jpg |
| HARO MART | haromart.jpg | store_images/haromart.jpg |
| Puregold Price Club Incorporated | puregold.jpg | store_images/puregold.jpg |
| Unitop General Merchandise | unitop.jpg | store_images/unitop.jpg |

`stores:import-photos` uses the configured `filesystems.commodity_images_disk`, just like establishment creation.
It previews by default, rejects missing/duplicate stores, invalid or oversized JPGs, existing different photos and conflicting storage objects.
Apply verifies uploaded bytes before locking the four stores and committing image fields and `store.photo_imported` audits together.
Repeating the command reuses matching objects without updating timestamps or adding audit events.
Objects uploaded before a database failure remain available for a verified retry; no shared files are deleted.

The full establishment seeder now has these four defaults. Do not run that seeder against an existing production database for this photo change: it also rewrites establishment metadata.
The importer alone changes only image paths and their normal update timestamps. Existing APIs and clients keep their current image URL contract.

## Authorized rollout procedure

Production storage writes, database writes, commits, pushes and deployment require explicit approval.
No production import is part of local implementation.

1. Deploy only the reviewed backend command, mappings and four assets. Preserve unrelated working-tree changes.
2. Verify the target database and configured image disk. Production must use the existing public `commodity-images` bucket, not Render container storage.
3. From `backend/`, preview with `php artisan stores:import-photos`; confirm exactly the four intended establishments and object keys.
4. Apply with `php artisan stores:import-photos --apply` only after approval. Do not allow simultaneous external writes to these four fixed keys: the installed storage adapter does not support conditional object creation through this command.
5. Verify all four public URLs return successful image responses with the source SHA256, and that the public establishment API and authorized Admin/Field/Vendor responses return those URLs.
6. Refresh each online client and inspect its store cards, map pins, detail views and Vendor establishment view. Vendor visibility remains limited to linked stores. No frontend deployment is expected.

Rollback only the reviewed photo assignments to their recorded previous keys with an audit; do not restore a full database snapshot or delete shared storage objects.

## Verification

Focused coverage: `ImportStorePhotosTest`, `OfficialEstablishmentSeederTest`, `PublicImageRuleTest`, `AdminRouteHardeningTest`, and `VendorPortalTest`.
Import tests use isolated SQLite and fake public storage; they never use the normal PostgreSQL configuration.
Browser fixtures render the actual Consumer cards, Admin map/detail, Field Choose Store wizard and Vendor scorecard on phone and desktop, using only local responses.
Screenshots and the browser report are under `scratch/store-photos/`.

Verified locally on 2026-10-09: 56 focused backend tests passed; the final full backend suite passed 875 tests / 6,689 assertions. All eight browser scenarios passed (four apps, phone and desktop), including missing/broken-photo fallbacks and 30 px Admin photo pins. PHP syntax checks passed and all four copied JPG SHA256 values match the supplied originals.

These checks prove local behavior. They do not prove production application, authenticated live rendering or fully offline photo availability.
