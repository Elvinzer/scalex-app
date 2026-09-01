## Purpose

Cette capacité fournit un suivi fiable et partagé des leads sociaux d’une
entreprise, depuis leur première capture jusqu’à leur résultat commercial.

## ADDED Requirements

### Requirement: Company-scoped social identity

The system SHALL associate every CRM lead with exactly one company account and
shall identify a social profile primarily by account, platform, and canonical
profile URL.

#### Scenario: Same profile in two companies

- **WHEN** the same Instagram or LinkedIn profile is captured by two different company accounts
- **THEN** the system SHALL create or resolve two independent company-scoped lead records
- **AND** neither company SHALL receive the other company’s lead data

#### Scenario: Existing profile in the current company

- **WHEN** a user captures a profile whose account, platform, and canonical profile URL already exist in the current company
- **THEN** the system SHALL return the existing lead instead of creating a duplicate

#### Scenario: Name-only similarity

- **WHEN** a captured display name matches an existing lead but the canonical profile identity does not match
- **THEN** the system SHALL not automatically treat the profile as the same lead
- **AND** it MAY present an ambiguous-match state for explicit user confirmation

### Requirement: Lead identity and qualification fields

The system SHALL maintain the social identity and qualification fields needed
to operate a lead without requiring an external enrichment service.

#### Scenario: New social lead

- **WHEN** a new lead is confirmed by an authorized CRM user
- **THEN** the lead SHALL store its platform, canonical profile URL, normalized handle, display name, optional first name, optional last name, source, and optional offer
- **AND** the lead SHALL store the current responsible user as its default responsible setter

#### Scenario: Simple field update

- **WHEN** a CRM user edits the lead’s name, first name, last name, source, or offer
- **THEN** the system SHALL save the new value within the current company account
- **AND** the change SHALL remain visible to other authorized company members

### Requirement: Pipeline stage tracking

The system SHALL use exactly these five pipeline stages:
1. 1er message envoyé
2. Conversation en cours
3. Contenu de valeur envoyé
4. Appel proposé
5. Appel booké

#### Scenario: Initial pipeline stage

- **WHEN** a new lead is created from a captured profile
- **THEN** the default stage SHALL be 1er message envoyé
- **AND** the user SHALL be able to choose another stage before confirming the creation

#### Scenario: User changes stage

- **WHEN** a CRM user changes a lead’s pipeline stage from the application or extension
- **THEN** the system SHALL save the selected stage
- **AND** the system SHALL append a stage-history event with the actor, source, timestamp, previous stage, new stage, and responsible setter at that moment

#### Scenario: Lead has no response

- **WHEN** a lead has no recorded response after the first message
- **THEN** the system SHALL keep the lead at 1er message envoyé
- **AND** the system SHALL not automatically mark the lead as lost

### Requirement: Lead outcomes and reopening

The system SHALL keep no-show, lost, sold, and reopened outcomes separate from
the five pipeline stages.

#### Scenario: No-show flag

- **WHEN** a user marks a booked lead as a no-show
- **THEN** the system SHALL record the no-show outcome or flag
- **AND** the pipeline stage SHALL remain independently queryable
- **AND** the system SHALL create a follow-up action candidate

#### Scenario: Lead is marked lost

- **WHEN** a CRM user manually marks a lead as lost
- **THEN** the system SHALL record the lost outcome and preserve the last known pipeline stage
- **AND** the system SHALL preserve the loss event in the history

#### Scenario: Lost lead is reopened

- **WHEN** a user reopens a lost lead
- **THEN** the system SHALL propose the lead’s last known pipeline stage
- **AND** the user SHALL be able to select another pipeline stage before confirming
- **AND** the system SHALL preserve both the loss and reopening events

#### Scenario: Sale validation

- **WHEN** an authorized closer, manager, or owner validates a sale
- **THEN** the system SHALL record the sold outcome and the validating actor
- **AND** the system SHALL not fabricate or replace the canonical financial sale record

### Requirement: Shared team notes

The system SHALL provide shared team notes on a lead and SHALL not expose private
lead notes in this capability.

#### Scenario: User adds a team note

- **WHEN** a CRM user adds a note to a lead
- **THEN** all CRM users in the same company account SHALL be able to read the note
- **AND** the note SHALL include its author and creation timestamp

### Requirement: Responsible setter continuity

The system SHALL keep the current responsible setter distinct from the user
who performs an activity and SHALL preserve responsibility history.

#### Scenario: Lead is reassigned

- **WHEN** an authorized application user changes the responsible setter
- **THEN** the current responsible setter SHALL change without resetting the pipeline stage, outcomes, notes, activities, or calls
- **AND** the system SHALL append a responsibility-history event with the old setter, new setter, actor, and timestamp

#### Scenario: Activity by a non-responsible setter

- **WHEN** a setter who is not the current responsible setter changes an allowed field or stage
- **THEN** the system SHALL record that setter as the activity actor
- **AND** the current responsible setter SHALL remain unchanged

### Requirement: Lead history integrity

The system SHALL provide a chronological history of material lead events and
shall not silently overwrite historical facts.

#### Scenario: History is displayed

- **WHEN** an authorized user opens a lead from Pipeline, Leads, Actions, or Aujourd’hui
- **THEN** the system SHALL display the current qualification state and the material history relevant to the lead
- **AND** the history SHALL distinguish application-originated events from extension-originated events when known
