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
