## 1. Shared loss-reason model

- [x] 1.1 Add the stable `non_interesse` value to the CRM and legacy lost-reason constants and confirm the existing Zod schemas accept it only as a lost reason.
- [x] 1.2 Add the value to the shared `lead_lost_reason` Drizzle enum, generate the additive migration, inspect the generated SQL and metadata, then apply it with `npm run db:migrate`.

## 2. User-facing loss flows

- [x] 2.1 Add synchronized French and English labels for the new reason in the `crm` and `pipeline` locale catalogs, then verify both JSON files parse and contain the same key.
- [x] 2.2 Verify that the CRM and legacy loss dialogs expose the new reason through their existing selectors and that the Kanban still renders exactly five columns.

## 3. Import compatibility

- [x] 3.1 Extend CRM lost-reason normalization for accented, unaccented and common English variants of « Non intéressé », all mapping to `non_interesse`.
- [x] 3.2 Add import tests for recognized variants and unknown values, confirming that unknown values remain in the existing review or invalid path.

## 4. Regression and runtime verification

- [x] 4.1 Add or update tests covering persistence validation, migration presence, localized catalog synchronization and unchanged lost/reopen behavior.
- [x] 4.2 Run `npm run typecheck`, `npm run lint` and `npm run test`, including the raw FR/EN catalog and duplicate-key checks.
- [x] 4.3 Run the required Next.js runtime loop on the canonical CRM Pipeline in both locales, verify the visible reason and confirm that no sixth column appears; cover the legacy-compatible dialog rendering in both locales because its public routes redirect to the canonical CRM Pipeline.
- [x] 4.4 Review the final diff for accidental changes, secrets and unintended modifications to KPI, action, stage or extension behavior.
