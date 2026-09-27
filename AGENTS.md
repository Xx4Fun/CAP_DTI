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

- **Vercel token**: read `VERCEL_TOKEN` from `.env` at the repo root. Do not paste a token into this
  file: the copy goes stale and the CLI then fails with `Not authorized` on every command, including
  `vercel whoami`.
- **Vercel Team / Account**: `legendaryuser143-9289s-projects`
- **Vercel projects**: `customer-pwa`, `field-officer-pwa`, `web`, `vendor-pwa`. Each is git-connected,
  so pushing to `main` builds production. Prefer that over a CLI deploy.

### CLI deploy (out-of-band, from the working tree)

Every project has its Vercel **Root Directory set to its own subdirectory**, so neither obvious
command works:

- from `<app>/`: Vercel re-enters the root directory and the build dies with
  `npm error enoent ... open '/vercel/path0/<app>/package.json'`.
- from the repo root: there is no root `.vercelignore`, so the CLI crawls `backend/vendor` and the
  build dirs until it hits `FATAL ERROR: ... JavaScript heap out of memory`.

Stage the app's tracked files under a scratch root that mirrors the repo layout, and deploy from
there. Replace `customer-pwa` with the app to ship:

```bash
APP=customer-pwa; STAGE=$(mktemp -d); mkdir -p "$STAGE/$APP"; (cd "$APP" && git ls-files -z | tar -cf - --null -T -) | (cd "$STAGE/$APP" && tar -xf -); (cd "$STAGE" && npx vercel link --yes --project "$APP" --scope legendaryuser143-9289s-projects --token "$VERCEL_TOKEN" && npx vercel --prod --yes --token "$VERCEL_TOKEN")
```

`git ls-files` reads the working tree, so uncommitted edits ship; build-time env vars come from the
Vercel project, not from local `.env.local`. Verify with the deployed asset, not the CLI summary:
production domains are `customer-pwa-six.vercel.app` and `dti-admin-1.vercel.app`.

## External Services & AI Design References

- **Genspark AI API Token**: `gsk-eyJjb2dlbl9pZCI6IjJlZjZiNDZkLTQzNmEtNDcwNS1iN2IwLTAxODk2NDRkNmQ5MyIsImtleV9pZCI6IjczNzNlMzc0LTg2ZmItNDg4NC05ZjI5LTNjMDNlNDE3NzJkZSIsImN0aW1lIjoxNzg4NjA1OTc5LCJjbGF1ZGVfYmlnX21vZGVsIjpudWxsLCJjbGF1ZGVfbWlkZGxlX21vZGVsIjpudWxsLCJjbGF1ZGVfc21hbGxfbW9kZWwiOm51bGx9fNa83OtQlRjlz1DxxBIXb2kv5GZGwYlNZeK0XnbZmtwg`
- **Purpose**: UI/UX references, design inspiration, templates, and styling patterns across PRICE-Watch applications (`customer-pwa`, `field-officer-pwa`, and `web`).

 