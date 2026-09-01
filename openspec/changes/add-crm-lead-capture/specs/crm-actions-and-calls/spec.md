## Purpose

Cette capacité organise les actions commerciales et les appels en projections
priorisées, partagées et raccordées aux données métier déjà présentes dans Minaly.

## ADDED Requirements

### Requirement: Categorized action lifecycle

The system SHALL represent an action with a lead, category, type, due date,
status, priority, responsible user, creator, and completion information.
Categories SHALL be Prospection, Vente, or Rendez-vous.

#### Scenario: Create a prospecting follow-up

- **WHEN** a CRM user creates a follow-up for a lead
- **THEN** the action SHALL be categorized as Prospection
- **AND** the action SHALL have a responsible user and an actionable due date
- **AND** the lead history SHALL record the action creation

#### Scenario: Complete an action

- **WHEN** the responsible user marks an action as complete
- **THEN** the system SHALL record completion time and completing actor
- **AND** the action SHALL remain available in the lead history and completed-action views

### Requirement: Prioritized Aujourd’hui view

The system SHALL present the Aujourd’hui view as separate Prospection, Vente,
and Rendez-vous sections, with overdue actions before actions due today and
upcoming actions.

#### Scenario: User opens Aujourd’hui

- **WHEN** a CRM user opens /crm
- **THEN** the system SHALL show the user’s open actions by category
- **AND** each category SHALL group actions into En retard, Aujourd’hui, and À venir when those groups are non-empty
- **AND** each action SHALL link to its lead context

#### Scenario: Overdue action exists

- **WHEN** an open action has a due date before the current reporting date
- **THEN** the action SHALL appear in the En retard group before today and upcoming actions
- **AND** the interface SHALL expose its due date and responsible user

### Requirement: Personal and team action views

The system SHALL provide a personal action view by default and a team action
view only to users with the corresponding permission.

#### Scenario: Default personal view

- **WHEN** a setter opens Aujourd’hui
- **THEN** the default view SHALL be Mes actions
- **AND** it SHALL show actions assigned to that setter even when the setter can see every company lead

#### Scenario: Authorized team view

- **WHEN** a manager, owner, or explicitly permitted user selects Vue équipe
- **THEN** the system SHALL show the company’s eligible actions across responsible users
- **AND** the view SHALL retain category and priority separation

#### Scenario: Unauthorized team view

- **WHEN** a user without the team-view permission opens Aujourd’hui
- **THEN** the system SHALL not expose the team action view
- **AND** the user SHALL continue to see their personal action view

### Requirement: Complete action and relance listing

The system SHALL provide CRM Actions as the listing for open and completed
actions, including relances, without creating a separate Relances data system.

#### Scenario: Filter actions by category

- **WHEN** a user selects Prospection, Vente, or Rendez-vous in CRM Actions
- **THEN** the system SHALL return only actions in that category

#### Scenario: Filter relances

- **WHEN** a user selects the Relances filter
- **THEN** the system SHALL return actions classified as relances regardless of whether they are overdue, due today, or upcoming

#### Scenario: Filter overdue actions

- **WHEN** a user selects En retard
- **THEN** the system SHALL return open actions whose due date is before the current reporting date

### Requirement: Calls remain a shared projection

The system SHALL display CRM Appels from the existing canonical call records and
shall not create a parallel call source.

#### Scenario: Existing call appears in CRM

- **WHEN** a canonical iClosed, Calendly, or manual call is reliably linked to a lead
- **THEN** CRM Appels SHALL display the lead, platform, date/time, call status, responsible, and result
- **AND** the original call record SHALL remain the source of truth

#### Scenario: Call cannot be reliably linked

- **WHEN** an existing call cannot be reliably associated with a CRM lead
- **THEN** the call SHALL remain visible in the existing call source
- **AND** the system SHALL not create a speculative lead link

### Requirement: No-show follow-up

The system SHALL expose a follow-up action for a no-show without automatically
changing the lead to lost.

#### Scenario: No-show appears in actions

- **WHEN** a booked call is marked as no-show
- **THEN** CRM Actions and Aujourd’hui SHALL be able to show a Rendez-vous follow-up action
- **AND** the user SHALL be able to manually mark the lead lost later

### Requirement: Open action reassignment

The system SHALL preserve completed action history when a lead changes
responsible setter and SHALL provide a deterministic rule for open prospecting
actions.

#### Scenario: Open prospecting action follows reassignment

- **WHEN** an authorized user reassigns a lead with an open Prospection action
- **THEN** the open action SHALL follow the new responsible setter
- **AND** its original creator, creation time, due date, and history SHALL remain unchanged

#### Scenario: Completed action after reassignment

- **WHEN** a completed action exists before a lead is reassigned
- **THEN** the completed action SHALL keep its original responsible user and completing actor
