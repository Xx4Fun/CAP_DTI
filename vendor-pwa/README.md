# PRICE-Watch Vendor Portal (PWA)

## Overview
The **PRICE-Watch Vendor Portal** is a Progressive Web Application for retail establishment owners in San Jose de Buenavista, Antique, whose stores are monitored by the Department of Trade and Industry (DTI) Antique Provincial Office. Vendor accounts are created only through an invitation sent from DTI Admin User Management.

Vendors use the portal to:
1. **Review notices issued to their establishment:** Letters of Inquiry and Show Cause Orders, the observed commodities recorded in the notice, the official PDF, delivery status, and the response deadline. Deadlines come from the approved legal policy and start only after DTI records delivery; the portal shows the deadline the backend returns and does not compute its own.
2. **Submit a formal response:** a reason, a written explanation, optional supporting documents (PDF, JPG, PNG; up to 5 files, 5 MB each) with a document type per file, and a sworn certification. One response per notice.
3. **Browse current price references:** a searchable, paged SRP guide filtered by category and classification. Each row shows the reference DTI monitoring uses (standard SRP, or the official ceiling for goods covered by a price freeze) and the price from which a shelf price is reviewed. It is not a legal or compliance finding.
4. **Read advisories:** price-freeze declarations (scheduled, in effect, or ended) and recent SRP updates.
5. **Set notification preferences:** saved to the account; SMS and email alerts are not yet delivered.

---

## Technical Stack
- **Framework:** React 19 with TypeScript
- **Bundler & Tooling:** Vite + `vite-plugin-pwa`
- **API:** Laravel backend `/api/vendor/*` with a scoped, expiring vendor token (`VITE_API_BASE_URL`)
- **Design System:** DTI Government Palette (Deep Navy `#1B365D`, Gold `#C59B27`, Slate Ice), responsive mobile-first layout with `@fontsource-variable/outfit` and `lucide-react`.
- **Testing:** Vitest + React Testing Library + jsdom.

---

## Local Development
```bash
cd vendor-pwa
cp .env.example .env.development.local   # point VITE_API_BASE_URL at your local backend
npm install
npm run dev # Launches at http://localhost:5176
```

## Production Build
```bash
npm run build
```

## Running Tests
```bash
npm run test
```
