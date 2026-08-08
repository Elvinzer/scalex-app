# falco-conversation-history

## Purpose

Permettre de reprendre une conversation Falco et de savoir immédiatement si elle a déjà produit une action à traiter, à lancer, à reprendre, écartée ou terminée.

## ADDED Requirements

### Requirement: Historique enrichi sans tableau de suivi

The conversation history SHALL display one compact row per owned conversation with its subject, date, persisted message count and an optional action indicator. It SHALL NOT become a task-management table.

#### Scenario: Conversation avec action à traiter

- **WHEN** a conversation has a Copilote insight with decision `todo`
- **THEN** its row displays `Action à traiter`

#### Scenario: Conversation avec action lancée

- **WHEN** a conversation has a Copilote insight with decision `launched`
- **THEN** its row displays `Action lancée`

#### Scenario: Conversation avec action à reprendre

- **WHEN** a conversation has a Copilote insight with decision `later`
- **THEN** its row displays `Action à reprendre`

#### Scenario: Conversation avec action écartée

- **WHEN** a conversation has a Copilote insight with decision `dismissed`
- **THEN** its row displays `Action écartée`
- **AND** the existing action remains reachable from the row or its conversation

#### Scenario: Conversation avec action terminée

- **WHEN** a conversation has a Copilote insight with decision `completed`
- **THEN** its row displays `Action terminée`

#### Scenario: Conversation sans action

- **WHEN** a conversation has no persisted insight
- **THEN** no action indicator is displayed
- **AND** the row keeps the same reserved height and alignment as rows with an indicator

### Requirement: Données de ligne exactes

The history row SHALL use the persisted conversation and message data rather than deriving a subject or count from the client preview.

#### Scenario: Compteur de messages

- **WHEN** a conversation has persisted user and assistant messages
- **THEN** the row displays the exact count of persisted messages belonging to that conversation and account
- **AND** a missing preview does not change the count

#### Scenario: Liste dense

- **WHEN** the history list is rendered
- **THEN** each row is limited to subject, date, message count and optional action indicator
- **AND** no title, action body, due date or tracking table is inserted into the row

#### Scenario: Chargement en lot

- **WHEN** the history contains multiple conversations
- **THEN** insight decisions are loaded in a bounded batch query or joined projection
- **AND** the UI does not issue one insight query per conversation row

### Requirement: Accès à l'action depuis l'historique

The history SHALL let the user open the owned conversation and reach its existing insight state without creating a new insight.

#### Scenario: Ligne avec insight

- **WHEN** the user selects a conversation row with an action indicator
- **THEN** the corresponding conversation opens
- **AND** the existing card, banner or lifecycle actions are displayed
- **AND** no second proposal is generated solely because the row was opened

#### Scenario: Ligne sans insight

- **WHEN** the user selects a conversation row without an action indicator
- **THEN** the conversation opens normally
- **AND** the absence of an indicator does not block Falco from producing a future valid proposal

### Requirement: Isolation des comptes

The history and its action indicators SHALL be scoped to the authenticated account.

#### Scenario: Conversation étrangère

- **WHEN** a client submits or navigates to a conversation identifier from another account
- **THEN** the server does not include that conversation in history
- **AND** no action indicator, title, count or preview from it is returned
