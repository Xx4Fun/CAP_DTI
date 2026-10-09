# PRICE-Watch Field Monitoring PWA

Installable React PWA for DTI field officers. Accounts are issued from Admin User Management and use the Laravel `/api/field/*` contract.

## Local setup

1. Copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.
2. Run `npm install`.
3. Run `npm run dev` (defaults to `http://localhost:5175`).

Only one tab per browser may hold the workspace; a second one shows "Workspace already open". Set `VITE_DISABLE_TAB_LOCK=true` to skip that guard when previewing several viewports at once. Two live copies can overwrite each other's drafts and upload queue, so leave it unset wherever real field work is stored.

The first sign-in must be online. The Admin-issued password is the officer's final credential, followed by creation of a four-digit device PIN. Officers can change that PIN from Profile, including offline, by entering the current PIN and confirming a new one. A random AES-GCM data key protects cached field data in IndexedDB and is wrapped by the PIN-derived key. Supported devices may also enable WebAuthn PRF biometric unlock while retaining the PIN fallback.

## Production configuration

- Serve the PWA over HTTPS so installation, precise geolocation, and service workers are available.
- Set `VITE_API_BASE_URL` to the deployed Laravel `/api` URL before building.
- Set `VITE_FIELD_PWA_URL` in the Admin web build to this PWA's public HTTPS URL so the one-time credential handoff opens the correct application.
- No additional schema migration is required for PIN, biometric, lock, or lease-renewal support.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The generated service worker precaches only the application shell. API responses and private signature evidence are not put in Workbox caches.
