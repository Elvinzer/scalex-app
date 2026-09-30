## Context

The current smart import pipeline already parses CSV, TSV, XLS, XLSX, pasted tables, text, and images, then asks Falco to map each sheet to the monthly metrics or sales targets. The CRM has a separate lead and event model, and its KPI queries depend on lead creation dates, stage history, and event dates. The new flow must share parsing and agent safeguards without making the monthly import accept CRM-specific payloads by accident.

## Goals / Non-Goals

### Goals

- Reuse the existing parser, upload limits, agent key resolution, rate limiting, and sheet-level analysis model.
- Add a closed, validated `crm_leads` mapping target with a review screen for every source column.
- Keep acquisition source, profile platform, and historical dates as separate fields.
- Normalize phone numbers deterministically in code, surface duplicate groups and field conflicts, and make the final decision explicit.
- Write account-scoped leads and CRM history atomically and make retries safe.
- Keep the import auditable and compatible with existing CRM KPI queries.

### Non-Goals

- No new CRM provider integration or external enrichment.
- No automatic fuzzy merge based only on names, email, profile handle, or display name.
- No attempt to infer missing event dates from a lead creation date.
- No redesign of the existing monthly metrics import UI or its data model.
- No versioning of the user's workbook in the repository.

## Decisions

### 1. Extend the existing analysis contract with a CRM target

Add `crm_leads` to the closed import target enum and pass an explicit target hint from a dedicated CRM flow. The analysis route will authorize either the existing `datas` permission or CRM access based on the validated hint, while the model prompt will receive only the fields allowed for that target. The monthly path will keep its current default and payload shape.

The existing parser remains the source of truth for header detection, sheet extraction, file hashing, and size limits. CRM structured imports will use table units; unsupported non-tabular content will be surfaced as ignored or unsupported rather than silently converted into leads.

### 2. Use a dedicated CRM review flow over shared primitives

Create a CRM-specific client flow that reuses `ImportDropzone` and the analysis response but has its own mapping review, channel question, duplicate review, and CRM preview components. This avoids adding CRM branches to the monthly preview that could change existing behavior, while keeping upload and error handling consistent.

The review state will be serialized into a server-validated payload. The client can display and edit proposals, but the server will revalidate target fields, source values, dates, phones, and conflict choices before writing.

### 3. Let Falco map, keep deterministic transformations in code

Falco will propose target fields, confidence, examples, questions, and a likely creation-date column. Code will perform date parsing, phone normalization, source/platform enum validation, row grouping, duplicate detection, and KPI-related aggregation. Falco will not count rows, merge records, or invent dates.

CRM mapping fields will include profile identity, contact details, acquisition source, platform, offer and setter names, value, stage, outcome, notes, historical lead creation date, and explicit milestone dates supported by the CRM event model. Columns outside this set remain ignored until the user maps them to a supported field.

### 4. Add a normalized phone key and a separate import audit table

Add nullable `phoneNormalized` to `leads` with an account-scoped index. New and imported leads will store a normalized E.164 value when parsing succeeds; the raw phone remains available for display. For existing rows, the import service will also normalize the current raw phone in memory while matching so that the migration does not depend on a risky SQL-only country assumption. Matching will use the account locale as the default country for numbers without a prefix.

Add a `crmImports` table keyed by account and file/configuration identity. It will record filename metadata, hash, status, row and duplicate counts, timestamps, token usage and key source, and the final summary. It will not store the raw workbook or secrets. A unique account-scoped identity and transaction status will make confirmed retries safe.

### 5. Treat channel context as a sheet-level required input

The source column is a lead attribute, while the platform is the network or communication surface. If a sheet has no validated source mapping, the review will request one default source for that sheet. If a workbook contains multiple sheets, each sheet can answer independently. The choice will be stored in the reviewed payload and applied only to rows where the source column is absent or empty.

### 6. Use conservative reconciliation rules

Rows with the same normalized phone are grouped before database writes. The user sees the surviving values and conflicts and chooses merge or skip. Rows without a usable phone are never auto-merged.

Against existing leads, the primary lookup is normalized phone within the current account. A profile URL or normalized handle can be shown as a secondary review hint, but it is not an automatic merge key when the phone is absent. Empty destination fields can be filled after confirmation; populated conflicts default to keep and must be explicitly replaced.

If a row without a phone would violate the existing account-scoped platform and profile URL uniqueness constraint, the review marks it as a profile conflict and only offers an explicit skip. This prevents a database failure without turning the profile URL into a silent deduplication key.

### 7. Preserve historical timing without fabricating events

For a new lead, the validated lead creation date becomes `leads.createdAt`; the import's `createdAt` or `importedAt` remains separate in `crmImports`. Explicit event date columns become event `occurredAt` values and stage-history dates when the corresponding stage is imported. A stage without an explicit event date updates the current stage but does not create a fake dated milestone. Existing CRM query code can therefore use the historical lead date and stage history for KPI calculations.

### 8. Commit through an account-scoped transaction

The CRM commit route will authenticate the session, resolve the account and CRM permission, validate the full payload with Zod, check the import identity, re-run normalization and reconciliation against current database state, and then write all changes in a Drizzle transaction. Lead, stage-history, event, and audit writes will use the same account scope. If any row fails validation or a required conflict remains unresolved, the transaction will roll back completely.

## Risks / Trade-offs

- Phone normalization depends on a default country for local numbers. The chosen locale fallback is useful for the current product but invalid or ambiguous numbers remain review items instead of being merged.
- A very large workbook can produce a large client review payload. Existing file and row limits remain in force; the flow should truncate displayed samples while keeping bounded row data for the server review.
- Historical imports can create KPI movement that looks sudden. The preview and audit summary must show the historical date range, created versus updated counts, skipped duplicates, and unresolved rows before confirmation.
- Adding a nullable phone key does not instantly canonicalize every legacy lead. Matching will normalize legacy values in memory, and future edits/imports will populate the key progressively.
- Falco may propose an incorrect mapping. The closed enum, per-column review, visible examples, and server revalidation keep that proposal advisory.

## Migration Plan

1. Add the CRM target schemas, mapping prompt support, shared review types, and localized copy without changing the monthly flow.
2. Add `phoneNormalized`, its account-scoped index, `crmImports`, and RLS policies through a generated Drizzle migration.
3. Add analysis, preview, and commit endpoints plus the CRM lead import entry point.
4. Run unit tests for parsing, mapping validation, dates, phones, duplicates, reconciliation, and account isolation. Run the existing test suite and analyze the supplied `KPI 2026.xlsx` fixture from its external path without copying it into Git.
5. Deploy the migration before enabling the CRM import entry point. If rollout needs to be reverted, hide the entry point and leave the nullable column and audit rows in place; no destructive rollback is required.

## Deferred Decisions

- Phone-less matching by email is intentionally deferred until real imported data shows whether the false-positive risk is acceptable.
- A later change may add dedicated events for imported stages without explicit milestone dates; this change keeps those stages in current state and history only when a date is supplied.
