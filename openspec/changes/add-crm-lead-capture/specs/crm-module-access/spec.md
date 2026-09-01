## Purpose

Cette capacité contrôle le cycle de vie du CRM, sa présence dans la navigation,
ses permissions d’entreprise et l’isolation entre utilisateurs et comptes.

## ADDED Requirements

### Requirement: Optional owner-controlled module

The CRM SHALL be optional per company account, and only the company owner SHALL
be allowed to activate or deactivate it.

#### Scenario: Owner activates CRM

- **WHEN** the company owner confirms CRM activation
- **THEN** the system SHALL enable the CRM for that company
- **AND** the CRM navigation and authorized access SHALL become available

#### Scenario: Manager attempts activation

- **WHEN** a manager or another non-owner attempts to activate the CRM
- **THEN** the system SHALL deny the mutation
- **AND** the CRM SHALL remain in its previous state

#### Scenario: Owner deactivates CRM

- **WHEN** the company owner deactivates the CRM
- **THEN** the system SHALL hide CRM surfaces and disable extension mutations
- **AND** the system SHALL preserve existing CRM data

### Requirement: Optional onboarding and later activation

The system SHALL offer CRM activation during onboarding without making it
mandatory and SHALL expose a later activation entry in company settings.

#### Scenario: User skips CRM during onboarding

- **WHEN** the owner selects Plus tard or skips the optional CRM onboarding step
- **THEN** the account onboarding SHALL continue without CRM
- **AND** the owner SHALL be able to activate CRM later from Paramètres > Modules > CRM

#### Scenario: Owner activates later

- **WHEN** the owner activates CRM from the settings module page
- **THEN** the system SHALL show a confirmation state
- **AND** the system SHALL indicate that access can be configured in team settings

### Requirement: Conditional navigation and compatibility routes

The system SHALL place CRM as a first-level navigation entry immediately after
Dashboard when active and accessible.

#### Scenario: CRM navigation is visible

- **WHEN** the CRM module is active and the current user has CRM access
- **THEN** the navigation SHALL show CRM with Aujourd’hui, Pipeline, Leads, Actions, and Appels
- **AND** the mobile primary navigation SHALL prioritize CRM while keeping Roadmap in the mobile drawer

#### Scenario: CRM navigation is hidden

- **WHEN** the CRM module is inactive or the user has no CRM access
- **THEN** the primary navigation SHALL not expose CRM
- **AND** the existing navigation SHALL remain usable

#### Scenario: Legacy pipeline or calls URL

- **WHEN** a user opens /ventes/pipeline or /ventes/appels
- **THEN** the system SHALL preserve access through a compatibility alias or redirect to the corresponding CRM surface
- **AND** it SHALL not create a second pipeline or call source

### Requirement: Company-wide visibility

The system SHALL allow authorized CRM users to see all leads in their company,
regardless of the current responsible setter.

#### Scenario: Setter opens Leads

- **WHEN** a setter with CRM access opens CRM Leads
- **THEN** the system SHALL return all company leads permitted by the account scope
- **AND** it SHALL not restrict the list to leads assigned to that setter

#### Scenario: Cross-company access attempt

- **WHEN** a user attempts to request a lead belonging to another company account
- **THEN** the system SHALL deny the request or return not found
- **AND** it SHALL not disclose whether the other-company lead exists

### Requirement: Granular CRM permissions

The system SHALL distinguish CRM access from permissions for team view,
reassignment, pipeline structure, sale validation, and module activation.

#### Scenario: Setter edits allowed lead data

- **WHEN** a setter has CRM access
- **THEN** the setter SHALL be able to view company leads, change pipeline stage, edit simple fields, add team notes, and create actions
- **AND** the setter SHALL not be able to reassign the responsible setter or modify pipeline structure by default

#### Scenario: Manager manages workflow

- **WHEN** a manager has CRM access
- **THEN** the manager SHALL be able to view the team action view, reassign leads, and modify pipeline structure
- **AND** the manager SHALL not be able to activate or deactivate the company CRM unless separately acting as the owner

#### Scenario: Closer validates sale

- **WHEN** the closer assigned to the commercial outcome validates a sale
- **THEN** the system SHALL allow the sale validation
- **AND** an unassigned setter SHALL not gain sale-validation rights solely from having CRM access

### Requirement: Server-enforced authorization

The system SHALL enforce account scope, module state, and CRM permissions on the
server for every CRM read and mutation.

#### Scenario: Client hides a restricted control

- **WHEN** a restricted control is hidden in the UI but a user submits the underlying request directly
- **THEN** the server SHALL re-evaluate the session, account, module state, and permission
- **AND** the server SHALL reject the unauthorized request

#### Scenario: Extension uses a valid member session

- **WHEN** a valid company member uses the extension
- **THEN** the server SHALL apply the same CRM authorization rules as the application
- **AND** the extension’s read-only responsible field SHALL not bypass assignment permissions

### Requirement: Deactivation preserves recoverable data

The system SHALL make deactivation reversible without silently deleting CRM
leads, activity history, actions, calls, notes, or KPI source events.

#### Scenario: CRM is re-enabled

- **WHEN** the owner re-enables a previously disabled CRM module
- **THEN** the existing CRM data SHALL be available again under the same company account
- **AND** the system SHALL preserve historical actors, timestamps, stages, outcomes, and assignments
