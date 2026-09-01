## Purpose

Cette capacité permet de capturer un profil Instagram ou LinkedIn depuis les
informations visibles de la page, puis de le créer ou le mettre à jour dans le
CRM de l’entreprise après confirmation de l’utilisateur.

## ADDED Requirements

### Requirement: Relevant-page detection and floating button

The extension SHALL detect relevant visible profile or conversation pages on
Instagram and LinkedIn and SHALL show a compact Minaly floating button before
opening its capture card.

#### Scenario: Relevant profile detected

- **WHEN** the content visible in a supported profile or conversation page can be identified
- **THEN** the extension SHALL display the closed floating Minaly button
- **AND** clicking the button SHALL open the appropriate capture state

#### Scenario: Irrelevant page

- **WHEN** the current page is not a supported profile or conversation page
- **THEN** the extension SHALL not display the floating button

### Requirement: Visible-page capture only

The extension SHALL use only information visible in the current page and SHALL
not use Meta or LinkedIn APIs for CRM capture.

#### Scenario: Profile information is visible

- **WHEN** a supported page exposes a platform, profile URL, handle, display name, avatar, or message timestamp
- **THEN** the extension SHALL use the visible values to prefill the capture card
- **AND** the user SHALL be able to review the values before saving

#### Scenario: Automatic messaging is requested

- **WHEN** a user opens or saves an extension card
- **THEN** the extension SHALL not send, edit, or schedule a social message

### Requirement: Unknown-profile creation

The extension SHALL support a confirmed creation flow for a profile that does
not yet exist in the current company CRM.

#### Scenario: Unknown profile card

- **WHEN** the current profile is unknown in the current company
- **THEN** the extension SHALL show the profile identity, URL, optional first name and last name fields, offer, source, default stage, responsible setter, and available timestamps
- **AND** the responsible setter SHALL default to the connected setter
- **AND** the responsible field SHALL be read-only

#### Scenario: User confirms unknown profile

- **WHEN** the user confirms Ajouter au CRM
- **THEN** the system SHALL create the lead with the reviewed values
- **AND** the default stage SHALL be 1er message envoyé unless the user selected another stage
- **AND** the extension SHALL show a success state with a link to the CRM lead

#### Scenario: User dismisses unknown profile

- **WHEN** the user closes or dismisses the unknown-profile card without confirmation
- **THEN** the system SHALL not create a lead or activity

### Requirement: Known-profile update

The extension SHALL show known CRM information only from the current company
and SHALL permit allowed updates without exposing reassignment controls.

#### Scenario: Known profile card

- **WHEN** the current profile resolves to a lead in the current company
- **THEN** the extension SHALL show that the profile is already known
- **AND** it SHALL show the current stage, responsible setter, next action, and a concise known-lead summary
- **AND** the responsible setter SHALL be read-only

#### Scenario: Known profile update

- **WHEN** a user changes the stage, edits a simple field, adds a team note, or creates an action from the known-profile card
- **THEN** the system SHALL save the permitted change in the current company
- **AND** the system SHALL record the extension user as the actor

### Requirement: Ambiguous-profile confirmation

The extension SHALL prevent an uncertain match from being used silently.

#### Scenario: Ambiguous candidate

- **WHEN** the canonical identity is not conclusive but one or more candidates are plausible
- **THEN** the extension SHALL display an explicit correspondence incertaine state
- **AND** it SHALL present the profile visited and the candidate lead information needed for a decision

#### Scenario: User confirms candidate

- **WHEN** the user selects Confirmer la correspondance
- **THEN** the extension SHALL continue with the selected existing lead
- **AND** the system SHALL record the confirmation actor and timestamp

#### Scenario: User creates a separate lead

- **WHEN** the user selects Créer un nouveau lead
- **THEN** the system SHALL create a new lead only after confirmation
- **AND** it SHALL preserve the existing candidate lead unchanged

### Requirement: Social and CRM timestamp semantics

The extension SHALL distinguish a social message time, page capture time, and
effective CRM creation time.

#### Scenario: Message timestamp is visible

- **WHEN** a visible message timestamp is available
- **THEN** the extension SHALL label it as the received or occurred message time
- **AND** it SHALL separately label the capture time

#### Scenario: Message timestamp is unavailable

- **WHEN** no message is visible or its timestamp cannot be read
- **THEN** the extension SHALL not invent a message time
- **AND** it SHALL show the capture time only or explicitly state that the message date was not detected

#### Scenario: Lead has not been saved

- **WHEN** the unknown-profile card is displayed before confirmation
- **THEN** it SHALL not present an effective createdAt as if the CRM lead already existed
- **AND** it MAY display a clearly labeled anticipated creation time

### Requirement: Secure and idempotent capture

The extension capture flow SHALL be authenticated to the current company
session, SHALL validate the server response, and SHALL be safe to retry.

#### Scenario: Session is expired

- **WHEN** the extension cannot authenticate the current Minaly user
- **THEN** it SHALL not create or update a lead
- **AND** it SHALL show a session-expired recovery state

#### Scenario: Duplicate submission

- **WHEN** the same profile capture is submitted more than once because of a double click or network retry
- **THEN** the system SHALL not create duplicate leads or duplicate capture activities

#### Scenario: CRM is disabled

- **WHEN** the company CRM module is disabled
- **THEN** the extension SHALL not create or update CRM data
- **AND** it SHALL show an unavailable or activation-needed state
