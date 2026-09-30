## Purpose

Provide a safe, reviewable way to recover CRM history from large Excel or delimited files so that Falco can suggest a column mapping while the user remains in control of channel attribution, duplicate handling, field conflicts, and historical dates used by CRM reporting.

## ADDED Requirements

### Requirement: CRM import intake and analysis

The system SHALL let an authenticated CRM user submit CSV, TSV, XLS, XLSX, or pasted tabular data for analysis, including workbooks with multiple sheets and non-data title rows. Analysis SHALL be read-only and SHALL reuse the existing import size and row limits without changing the behavior of the existing monthly data import.

#### Scenario: Analyze a multi-sheet Excel workbook

- **WHEN** a CRM user uploads an XLSX workbook containing several sheets and decorative rows before the headers
- **THEN** the system SHALL analyze each detected sheet independently, identify the likely header row, return representative row values, and create no CRM records

#### Scenario: Reject an unauthorized CRM analysis

- **WHEN** a user without CRM access submits a CRM import analysis request
- **THEN** the system SHALL return an authorization error and SHALL NOT call Falco or read another account's CRM data

### Requirement: Falco mapping proposal and explicit review

Falco SHALL propose a mapping for every source column in a CRM sheet to a closed set of supported CRM lead fields or `ignore`. Each proposal SHALL include sample values and a confidence level. The user SHALL be able to validate, change, or ignore each proposal before any write occurs, and ignored or unsupported columns SHALL remain visible in the review.

#### Scenario: Review a large source file with many unrelated columns

- **WHEN** Falco analyzes a sheet containing lead fields, campaign fields, formulas, notes, and unrelated columns
- **THEN** the review SHALL show one decision row per source column, the proposed target and confidence, examples when available, and an explicit ignore choice

#### Scenario: Correct a wrong proposal

- **WHEN** the user changes a proposed source-to-target association before previewing the import
- **THEN** the preview and subsequent commit SHALL use the user's association and SHALL not use the superseded Falco proposal

#### Scenario: Keep a column out of CRM

- **WHEN** the user marks a source column as ignored
- **THEN** no value from that column SHALL be written to a lead, event, or CRM history record

### Requirement: Acquisition context and historical lead dates

The system SHALL keep acquisition source distinct from the social or communication platform. If no trusted source column differentiates acquisition channel for a file or sheet, the system SHALL ask the user for a default acquisition source before preview or commit. The import SHALL support a historical lead creation date independently from the date Minaly captured the lead, and SHALL use an explicit historical date for dated CRM records when one is supplied.

#### Scenario: Ask for a missing acquisition source

- **WHEN** no accepted source mapping is available for a sheet
- **THEN** the system SHALL ask the user to choose the acquisition source for that sheet and SHALL block commit until a valid source is selected

#### Scenario: Preserve source and platform separately

- **WHEN** a row contains `Instagram` as the profile platform and `Meta Ads` as the acquisition source
- **THEN** the imported lead SHALL retain `Instagram` as platform and `Meta Ads` as source, with neither value inferred from the other

#### Scenario: Import historical creation dates

- **WHEN** a source column is validated as the lead creation date and contains a parseable date
- **THEN** the new lead's historical creation timestamp SHALL use that date, while the import audit SHALL retain the actual import timestamp separately

#### Scenario: Do not invent event dates

- **WHEN** a row has a lead creation date but no explicit date for a later CRM event
- **THEN** the system SHALL not fabricate the later event date from the creation date and SHALL report the missing date when the event requires one

### Requirement: Phone normalization and duplicate review

The system SHALL normalize phone numbers before comparing rows, using an account locale default when a number has no country prefix, and SHALL use the normalized phone as the primary duplicate key. It SHALL identify duplicates within the submitted data and against existing leads, show the affected rows and conflicts, and SHALL never silently delete or merge a row.

#### Scenario: Detect duplicate rows in the uploaded file

- **WHEN** two source rows resolve to the same normalized phone number
- **THEN** the review SHALL group them as duplicates, show the source rows and conflicting values, and require a merge or skip decision before commit

#### Scenario: Match an existing lead by phone

- **WHEN** an imported row resolves to a normalized phone already belonging to a lead in the current account
- **THEN** the system SHALL offer an update or skip decision for that lead and SHALL not search or modify leads in another account

#### Scenario: Handle a missing or invalid phone

- **WHEN** a row has no usable phone number
- **THEN** the row SHALL be marked as needing review and SHALL not be auto-merged with another row solely on name or email

### Requirement: Field reconciliation and CRM write semantics

The system SHALL show a preview of the resulting lead records before commit. When reconciling with an existing lead, empty destination fields SHALL be fillable by default, while conflicting populated values SHALL require an explicit keep or replace decision. A confirmed commit SHALL write leads, dated CRM history, and relevant events in an account-scoped transaction with an idempotent import identity.

#### Scenario: Fill an empty field on an existing lead

- **WHEN** an imported row contains an email and the matching existing lead has no email
- **THEN** the preview SHALL propose filling the empty field and the commit SHALL write it after confirmation

#### Scenario: Review a populated field conflict

- **WHEN** an imported row contains a phone or source that differs from the existing lead
- **THEN** the preview SHALL show both values and SHALL require the user to keep the existing value or replace it

#### Scenario: Retry the same confirmed import

- **WHEN** the same account submits the same confirmed file and import configuration a second time
- **THEN** the system SHALL detect the existing import identity and SHALL not create duplicate leads, events, or history entries

#### Scenario: Commit historical CRM state

- **WHEN** the user confirms a preview containing a historical creation date and validated CRM stage
- **THEN** the system SHALL write the lead and its relevant stage history using the historical date, set the import source to `migration`, and retain an auditable import summary

### Requirement: Authorization, localization, and compatibility

All CRM import boundaries SHALL validate external payloads server-side, enforce the current account scope, avoid exposing raw uploaded data or secrets in logs, and provide synchronized French and English UI states and errors. Existing monthly metrics and sales import flows SHALL continue to accept their current payloads and semantics.

#### Scenario: Reject a tampered commit payload

- **WHEN** a client changes a target field, account identifier, or conflict decision in the commit request without a valid server-side schema
- **THEN** the system SHALL reject the request and SHALL perform no partial CRM write

#### Scenario: Show localized import states

- **WHEN** the user reviews mappings, channel questions, duplicate warnings, or the final result
- **THEN** the visible labels and errors SHALL resolve to keys present in both the French and English catalogs

#### Scenario: Preserve the existing monthly import

- **WHEN** a user runs the current monthly metrics import
- **THEN** the system SHALL keep its existing target fields, conflict handling, permissions, and write behavior unchanged
