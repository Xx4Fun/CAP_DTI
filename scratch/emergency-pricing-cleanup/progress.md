# SDD ledger — plan: user-approved Emergency Protocol pricing-section cleanup

Base: a3ceb527b47401376002bc99a6f17801fee46ffe. The user-provided plan is the binding specification; no separate spec file.

Pre-flight: draft and confirmed views share selection, refresh guards and pagination. Both must use the selected declaration; draft rows combine candidates and SRP fallbacks without changing API contracts.

Ruling: implement in the user's current clean tracked workspace — the user explicitly requested local edits to this component and preservation of unrelated files. No commits, branch integration or deployment are authorized for this cleanup.

Task 1: complete — 13 RED checks observed, single-section implementation passed new behavioral tests. Mobile labels had a separate RED→GREEN regression.
Task 2: complete — focused package 99/99, production build and scoped lint passed, both browser widths passed. Independent review found no material findings; synchronous resets address its filter-timing concern.

Ruling: realistic source-week fixtures include observations and Manila date fields, matching the current detail API; statistics moved into that evidence rather than remaining duplicated in the main table.

Ruling: final phone inspection exposed clipped fourth filter — wrap only this section's filter group and assert every control fits. Confirm the browser assertions and final CSS build; no broad visual redesign.
