## 1. Shared import contracts and Falco mapping

- [x] 1.1 Extend the import target and mapping schemas with the closed `crm_leads` target, CRM field definitions, per-column review decisions, sheet-level source context, and CRM analysis/preview types.
- [x] 1.2 Extend Falco's import prompt and tool schema so CRM analysis proposes only supported CRM fields, confidence, samples, date candidates, and explicit ignored columns while preserving the monthly and sales prompts.
- [x] 1.3 Extend import analysis authorization and routing so a validated CRM target requires CRM permission, carries the account locale and target hint, and leaves the existing monthly import response and permission path unchanged.
- [x] 1.4 Add server-side Zod schemas for CRM mapping edits, source choices, duplicate decisions, conflict decisions, preview rows, and the final commit payload.

## 2. CRM persistence and deterministic domain logic

- [x] 2.1 Add nullable `phoneNormalized` to `leads`, an account-scoped index, and the `crmImports` audit table with account-scoped RLS policies and indexes in `db/schema.ts`.
- [x] 2.2 Generate and apply the Drizzle migration for the schema changes using `npm run db:generate` and `npm run db:migrate`; do not use `db push`.
- [x] 2.3 Implement strict CRM phone normalization with locale fallback, invalid-number reporting, historical date parsing, source/platform validation, and bounded value normalization without changing manual capture behavior.
- [x] 2.4 Implement pure row preparation that applies the validated mapping, fills a sheet default source only when needed, preserves raw source values for review, and reports missing required values or unsupported event dates.
- [x] 2.5 Implement deterministic duplicate grouping by normalized phone within the upload and matching against current-account leads, including conflicting field summaries and unresolved-row reasons.
- [x] 2.6 Implement conservative reconciliation rules for empty fields, populated conflicts, duplicate merge/skip choices, and idempotent import identity calculation.

## 3. CRM analysis, preview, and commit APIs

- [x] 3.1 Add a CRM analysis response path that returns sheet mappings, source-context questions, bounded row data, file hashes, Falco token metadata, and no writes.
- [x] 3.2 Add a CRM preview endpoint or server action that revalidates the edited mappings and returns normalized lead outcomes, duplicate groups, conflicts, missing values, historical date warnings, and import counts.
- [x] 3.3 Add an authenticated CRM commit endpoint or server action that revalidates the complete payload, checks the account-scoped import identity, and performs all lead, stage-history, event, and audit writes in one transaction.
- [x] 3.4 Ensure imported leads use the historical creation date when validated, store normalized phone values, keep the actual import timestamp in the audit record, and create only explicitly dated events or stage history.
- [x] 3.5 Make the commit retry-safe and account-isolated, with no raw workbook, phone secrets, API keys, or cross-account identifiers in logs or client errors.
- [x] 3.6 Revalidate CRM lead, KPI, and relevant dashboard paths after a successful commit and return an auditable summary of created, updated, merged, skipped, duplicate, and unresolved rows.

## 4. CRM review experience

- [x] 4.1 Add an import entry point to the CRM leads page that reuses the existing dropzone and supports Excel, CSV, TSV, and pasted tabular data without altering the monthly import UI.
- [x] 4.2 Build the CRM column mapping review with one row per source column, proposed target, confidence, examples, editable target, and explicit ignore controls.
- [x] 4.3 Build the channel-context step that asks for an acquisition source per sheet when no source column is validated, while explaining that source and profile platform are separate.
- [x] 4.4 Build the normalized preview showing historical lead dates, resulting stage/source/platform, created versus updated rows, missing phones, duplicate groups, and field conflicts.
- [x] 4.5 Build explicit duplicate and conflict decisions with safe defaults, blocking unresolved required decisions before commit and showing the source rows involved.
- [x] 4.6 Add loading, empty, error, authorization, success, and retry states, including a clear audit summary after commit.
- [x] 4.7 Add synchronized French and English translation keys for every new CRM import label, question, validation message, warning, result, and error; verify no raw translation key is rendered.

## 5. Tests and fixture validation

- [x] 5.1 Add unit tests for CRM mapping schema validation, source/platform separation, date parsing, locale-aware phone normalization, and missing-value reporting.
- [x] 5.2 Add unit tests for within-file duplicate grouping, existing-lead phone matching, conflict decisions, no-phone behavior, and idempotent import identity.
- [x] 5.3 Add API/service tests for authentication, account isolation, tampered payload rejection, transaction rollback, historical timestamps, explicit event dates, and audit summaries.
- [x] 5.4 Add regression coverage proving the existing monthly metrics and sales import contracts still parse, analyze, and commit as before.
- [x] 5.5 Run the CRM analysis and parser tests against `/Users/cedricbernard/Downloads/KPI 2026.xlsx`, assert that its sheets and title-row handling are stable, and remove any temporary fixture or generated copy after the test.
- [x] 5.6 Run translation catalog checks, typecheck, lint, the full test suite, and a production build; inspect the final diff for secrets and unintended changes.
