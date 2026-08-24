# PRICE-Watch Field Monitoring PWA

Installable React PWA for DTI field officers. Accounts are issued from Admin User Management and use the Laravel `/api/field/*` contract.

## Local setup

1. Copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.
2. Run `npm install`.
3. Run `npm run dev` (defaults to `http://localhost:5175`).

The first sign-in must be online. An officer replaces the Admin-issued temporary password and creates a 4–8 digit device PIN. The PIN-derived AES-GCM key protects the cached bootstrap data, session, drafts, and completed sync queue in IndexedDB.

## Production configuration

- Serve the PWA over HTTPS so installation, precise geolocation, and service workers are available.
- Set `VITE_API_BASE_URL` to the deployed Laravel `/api` URL before building.
- Set `VITE_FIELD_PWA_URL` in the Admin web build to this PWA's public HTTPS URL so the one-time credential handoff opens the correct application.
- Run the new backend migration before enabling officer sign-in.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The generated service worker precaches only the application shell. API responses and private signature evidence are not put in Workbox caches.
