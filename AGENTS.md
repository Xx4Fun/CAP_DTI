# PRICE-Watch Agent Guide

Use the Obsidian knowledge index in `docs/Home.md` before broad repository exploration.

## Context loading

1. Read `docs/PROJECT-MAP.md` to locate the relevant subsystem.
2. Read only the linked document needed for the current task.
3. Consult `docs/CURRENT-STATUS.md` for status boundaries and `docs/DECISIONS.md` for durable decisions.
4. Verify drift-prone claims against the current source, tests, configuration, or live environment before relying on them.

Do not load every file under `docs/`, `docs/superpowers/`, or `docs/audits/` by default. Preserve unrelated working-tree changes. Do not commit, push, deploy, migrate, or change production data without explicit user approval.

## Project boundaries

- `backend/`: Laravel API and regulatory data workflows.
- `web/`: React/Vite DTI Admin portal.
- `customer-pwa/`: React/Vite public consumer PWA.
- `field-officer-pwa/`: React/Vite field monitoring PWA.
- `mobile/`: legacy Flutter client; confirm current scope before changing it.

Update the compact vault notes only when a task changes their stated facts. Keep them as indexes and decision records, not chat transcripts.

## Deployment Configuration & Credentials

- **Vercel Deploy Token**: `vcp_5bVO5txBlBYGm2b5p7JNDNKA9EqvkJyNZnAdxSQ2qYtvVSktf73l8KKr`
- **Vercel Team / Account**: `legendaryuser143-9289s-projects`
- **Frontend Deployment Reference**:
  - `customer-pwa`: `npx vercel --token vcp_5bVO5txBlBYGm2b5p7JNDNKA9EqvkJyNZnAdxSQ2qYtvVSktf73l8KKr --prod --yes` (Run from `customer-pwa/`)
  - `field-officer-pwa`: `npx vercel --token vcp_5bVO5txBlBYGm2b5p7JNDNKA9EqvkJyNZnAdxSQ2qYtvVSktf73l8KKr --prod --yes` (Run from `field-officer-pwa/`)
  - `web`: `npx vercel --token vcp_5bVO5txBlBYGm2b5p7JNDNKA9EqvkJyNZnAdxSQ2qYtvVSktf73l8KKr --prod --yes` (Run from `web/`)

## External Services & AI Design References

- **Genspark AI API Token**: `gsk-eyJjb2dlbl9pZCI6IjJlZjZiNDZkLTQzNmEtNDcwNS1iN2IwLTAxODk2NDRkNmQ5MyIsImtleV9pZCI6IjczNzNlMzc0LTg2ZmItNDg4NC05ZjI5LTNjMDNlNDE3NzJkZSIsImN0aW1lIjoxNzg4NjA1OTc5LCJjbGF1ZGVfYmlnX21vZGVsIjpudWxsLCJjbGF1ZGVfbWlkZGxlX21vZGVsIjpudWxsLCJjbGF1ZGVfc21hbGxfbW9kZWwiOm51bGx9fNa83OtQlRjlz1DxxBIXb2kv5GZGwYlNZeK0XnbZmtwg`
- **Purpose**: UI/UX references, design inspiration, templates, and styling patterns across PRICE-Watch applications (`customer-pwa`, `field-officer-pwa`, and `web`).

 