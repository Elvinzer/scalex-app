## Purpose

Cette capacité transforme les événements CRM, appels et ventes en indicateurs
lisibles par setter et par équipe, avec une attribution et une période explicites.

## ADDED Requirements

### Requirement: KPI source events

The system SHALL calculate CRM KPIs from recorded CRM activities, stage-history
events, canonical call records, and canonical sale records.

#### Scenario: KPI data is available

- **WHEN** a user opens CRM Aujourd’hui or an authorized KPI view
- **THEN** the system SHALL calculate KPI values from recorded source events
- **AND** the system SHALL not require a Meta or LinkedIn analytics API

#### Scenario: KPI source is unavailable

- **WHEN** a source does not provide sufficient data for a KPI
- **THEN** the system SHALL show an explicit unavailable or incomplete state
- **AND** it SHALL not fabricate a value

### Requirement: Operational KPI counts

The system SHALL expose the operational counts for messages sent, responses,
conversations, value content sent, calls proposed, calls booked, attended calls,
no-shows, and validated sales.

#### Scenario: KPI strip on Aujourd’hui

- **WHEN** a user opens CRM Aujourd’hui
- **THEN** the system SHALL show the configured period and the available operational counts
- **AND** the KPI strip SHALL link to the relevant CRM list or action context when a drill-down is available

#### Scenario: Setter KPI view

- **WHEN** a setter filters KPIs to their own activity
- **THEN** the system SHALL attribute activity counts to the user who performed the activity
- **AND** the system SHALL not reassign another setter’s activity merely because the lead’s current responsible setter changed

### Requirement: Funnel conversion rates

For a selected lead cohort whose first-message event occurs in the reporting
period, the system SHALL calculate each funnel rate using unique leads that
reach the target milestone, without counting a lead more than once in a stage.

#### Scenario: Response rate

- **WHEN** the user requests the response rate for a first-message cohort
- **THEN** the system SHALL calculate conversations reached divided by unique first-message leads in that cohort

#### Scenario: Value-content rate

- **WHEN** the user requests the value-content rate
- **THEN** the system SHALL calculate unique leads reaching Contenu de valeur envoyé divided by unique leads reaching Conversation en cours in the same cohort

#### Scenario: Call-proposal and booking rates

- **WHEN** the user requests call-proposal or booking conversion
- **THEN** the system SHALL calculate Appel proposé divided by Contenu de valeur envoyé and Appel booké divided by Appel proposé respectively
- **AND** the system SHALL use unique leads for stage conversions

#### Scenario: Attendance, no-show, and closing rates

- **WHEN** the user requests call outcome rates
- **THEN** the system SHALL calculate attended calls divided by booked calls, no-shows divided by booked calls, and validated sales divided by attended calls
- **AND** the system SHALL use canonical call and sale outcomes when available

### Requirement: Explicit period and filters

The system SHALL display and apply the selected reporting period and SHALL
support filtering by setter, team, platform, offer, and source where the data
exists.

#### Scenario: Period changes

- **WHEN** the user changes the reporting period
- **THEN** all visible KPI values and conversion denominators SHALL update to that period or clearly labeled cohort
- **AND** the interface SHALL not mix period-scoped counts with unlabeled lifetime values

#### Scenario: Team filter

- **WHEN** an authorized user selects a team or setter filter
- **THEN** the system SHALL apply the filter to the KPI source events and lead cohort
- **AND** the resulting scope SHALL be visible in the UI

### Requirement: Reopening and duplicate safety in KPIs

The system SHALL keep KPI calculations stable when a lead is reopened,
reassigned, or captured repeatedly.

#### Scenario: Reopened lead

- **WHEN** a lead is reopened and reaches a previously visited stage again
- **THEN** the lead SHALL count once for the relevant unique-lead conversion
- **AND** the history SHALL remain available for activity and audit views

#### Scenario: Repeated profile capture

- **WHEN** the same social profile is captured repeatedly without a new qualifying event
- **THEN** the KPI counts SHALL not increase merely because of duplicate capture attempts

### Requirement: Attribution transparency

The system SHALL make KPI attribution understandable to users by exposing the
relevant actor, responsible setter, source, and period context.

#### Scenario: Setter changes lead stage

- **WHEN** a setter changes the stage of a lead owned by another setter
- **THEN** the event actor SHALL remain the setter who made the change
- **AND** stage-cohort attribution SHALL use the responsible setter at the time of the first qualifying stage event
- **AND** the current responsible setter SHALL remain separately visible
