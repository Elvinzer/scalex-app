## Purpose

This capability makes every canonical call identifiable and gives CRM users a
safe, explainable way to reconcile an unlinked call with the right lead.

## ADDED Requirements

### Requirement: Canonical calls are identifiable

CRM Appels SHALL display enough information to distinguish one call from every
other call, whether or not it is linked to a lead. The call identity SHALL be
separate from the lead identity.

#### Scenario: Unlinked call has usable identity

- **WHEN** a canonical iClosed, Calendly, or manual call has no CRM link
- **THEN** CRM Appels SHALL show the invitee name when available, the source,
  the scheduled date and time, and a stable external reference
- **AND** the interface SHALL show that the call is unlinked as a status, not
  as the only label in the lead column

#### Scenario: Call has additional source context

- **WHEN** the call contains an email, phone number, event type, duration,
  closer, setter, or booking reference
- **THEN** the call row or its detail view SHALL expose the available values
- **AND** missing values SHALL be shown as unavailable rather than invented

#### Scenario: Linked call remains traceable

- **WHEN** a call is linked to a lead
- **THEN** CRM Appels SHALL show both the lead identity and the call identity
- **AND** the original canonical call record SHALL remain the source of truth

#### Scenario: Date label describes the displayed date

- **WHEN** the Appels list displays the scheduled call instant
- **THEN** its label SHALL be Date/heure de l’appel or an equivalent localized
  label
- **AND** it SHALL not label `scheduledAt` as the record creation date

### Requirement: Users can find and inspect a specific call

CRM Appels SHALL provide search, filters, and a detail context that allow a
user to locate a call without relying on the lead link.

#### Scenario: Search unlinked calls

- **WHEN** a CRM user searches by invitee name, email, phone, source reference,
  event type, or linked lead identity
- **THEN** the list SHALL return matching calls within the current account

#### Scenario: Filter the reconciliation queue

- **WHEN** a user filters by unlinked state, source, scheduled date, attendance,
  call outcome, or suggestion state
- **THEN** the list SHALL return only calls matching those filters

#### Scenario: Inspect call details

- **WHEN** a user opens a call detail
- **THEN** the interface SHALL show the full available call reference, source,
  invitee context, scheduled instant, event type, duration, attribution and
  current link or suggestion state
- **AND** the full reference SHALL be copyable without exposing another
  account’s data

### Requirement: Falco suggestions are scoped and explainable

The system SHALL use account-scoped candidate retrieval before asking Falco to
rank or explain possible lead matches. A suggestion SHALL never be treated as
an established link.

#### Scenario: Suggestion has sufficient evidence

- **WHEN** an unlinked call has enough available signals to identify one or
  more plausible leads in the same account
- **THEN** Falco SHALL return a structured suggestion with a state, confidence
  level, candidate lead identifiers, reasons, and missing evidence when known
- **AND** the result SHALL identify the suggestion timestamp and the data
  fingerprint used to generate it

#### Scenario: Several candidates are plausible

- **WHEN** multiple leads remain plausible after candidate retrieval
- **THEN** the system SHALL display the candidates and their distinct reasons
- **AND** it SHALL not present one candidate as an established match

#### Scenario: Evidence is too weak

- **WHEN** the available evidence is limited to a weak or ambiguous signal,
  such as a common name without supporting context
- **THEN** Falco SHALL return no reliable match or an explicitly low-confidence
  review state
- **AND** the user SHALL retain a manual lead selector

#### Scenario: Suggestion generation is unavailable

- **WHEN** the agent, quota, network, or source data is unavailable
- **THEN** CRM Appels SHALL remain usable for inspection and manual linking
- **AND** the interface SHALL show a recoverable unavailable or retry state
  without fabricating a suggestion

#### Scenario: Existing call is already linked

- **WHEN** a call already has a confirmed CRM link
- **THEN** the system SHALL not generate a competing suggestion for that call
- **AND** the existing link SHALL remain the only active association

### Requirement: Link decisions require explicit human confirmation

The system SHALL require an authorized CRM user to confirm a suggested match or
to select a lead manually. Falco SHALL never write a call link by itself.

#### Scenario: User accepts a suggestion

- **WHEN** an authorized user confirms a displayed candidate
- **THEN** the system SHALL create or update the canonical CRM call link using
  the existing account-scoped link path
- **AND** it SHALL record the suggestion identifier, confidence, decision
  actor, decision time, and match method for audit

#### Scenario: User rejects a suggestion

- **WHEN** a user says that a suggested candidate is not the correct lead
- **THEN** the suggestion SHALL be marked rejected or dismissed
- **AND** no lead identity, call outcome, or call link SHALL be changed

#### Scenario: Retry repeats a decision

- **WHEN** a confirmation or rejection is retried with the same idempotency key
- **THEN** the system SHALL return the previous decision without creating a
  duplicate link or duplicate audit event

#### Scenario: Call became linked before confirmation

- **WHEN** another authorized user links the call before a suggestion is
  confirmed
- **THEN** the confirmation SHALL fail safely or become a no-op
- **AND** the existing link SHALL not be overwritten by a stale suggestion

### Requirement: Matching is private, auditable, and operationally bounded

Call reconciliation SHALL respect account isolation, minimize data sent to
Falco, and avoid running an uncached agent call on every page render.

#### Scenario: Candidate isolation

- **WHEN** the system prepares candidates or handles a suggestion decision
- **THEN** it SHALL query and mutate only records belonging to the current
  account
- **AND** it SHALL not reveal whether a call or lead exists in another account

#### Scenario: New call is analyzed asynchronously

- **WHEN** a new unlinked canonical call is ingested
- **THEN** the system SHALL be able to enqueue one idempotent suggestion job
- **AND** rendering CRM Appels SHALL not call Falco again for the same input
  fingerprint

#### Scenario: Historical queue is analyzed deliberately

- **WHEN** an authorized user requests suggestions for historical unlinked
  calls
- **THEN** the system SHALL process a bounded batch with rate limits and
  progress or failure feedback
- **AND** it SHALL not silently modify any call link

#### Scenario: Sensitive data is handled safely

- **WHEN** call or candidate data is sent to Falco
- **THEN** the system SHALL send only the minimum fields needed to rank or
  explain the candidates, validate the structured response, and keep raw
  contact values out of logs
- **AND** the call SHALL use the existing BYOK and shared-key quota policy

#### Scenario: Social side effects remain prohibited

- **WHEN** a suggestion is generated, accepted, rejected, or retried
- **THEN** the system SHALL not call Instagram or LinkedIn messaging APIs,
  send a message, or schedule a social message
