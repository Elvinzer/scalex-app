# insight-execution

## Purpose

Faire de la conversation Falco une source de premier plan du cycle d'exécution existant, avec une sauvegarde idempotente et un passage contrôlé vers le Journal.

## ADDED Requirements

### Requirement: Source Copilote persistée

The execution domain SHALL support a Copilote insight with `sourceType: "copilote"` and `sourceId` equal to a conversation UUID. A saved record SHALL contain the user-validated title and action in the execution fields and a versioned snapshot containing `problem`, `actionText` and `successCriterion`.

#### Scenario: Matérialisation depuis une conversation

- **WHEN** the authenticated user saves valid Copilote fields for an owned conversation
- **THEN** an insight is created with decision `todo`
- **AND** `sourceType` is `copilote`
- **AND** `sourceId` is the conversation identifier
- **AND** `sourceLabel` is derived from the conversation subject as `Falco · {sujet}`
- **AND** the record can be retrieved from the originating conversation and the Journal execution history

#### Scenario: Snapshot Copilote

- **WHEN** the insight is materialized
- **THEN** its typed snapshot contains `kind: "copilote"`, `version: 1`, `problem`, `actionText` and `successCriterion`
- **AND** the values equal the validated values submitted by the user
- **AND** no transcript is copied into the snapshot

#### Scenario: Conversation inexistante ou étrangère

- **WHEN** the capture contract receives an unknown, malformed or non-owned conversation identifier
- **THEN** it returns a safe error
- **AND** no insight is created
- **AND** no information about the rejected conversation is revealed

### Requirement: Unicité et idempotence par conversation

The database SHALL enforce at most one Copilote insight per account and conversation, independently of the fingerprint. The server SHALL return the existing record when the same capture is retried.

#### Scenario: Insight déjà matérialisé

- **WHEN** a save request targets a conversation that already has a Copilote insight
- **THEN** the existing insight identifier is returned
- **AND** no second insight is created
- **AND** its current decision and linked initiative remain unchanged

#### Scenario: Requêtes concurrentes

- **WHEN** two valid save requests for the same account and conversation execute concurrently
- **THEN** the unique database boundary resolves the race
- **AND** both callers receive the same persisted insight
- **AND** no duplicate initiative can be created as a side effect

### Requirement: Lancement via le chemin existant

A Copilote insight in a launchable state SHALL use the existing `launchInsight` contract and SHALL expose the same target, assignment, due-date and weekly-focus behavior as insights from other sources.

#### Scenario: Ouverture du lancement

- **WHEN** the user activates `Lancer dans le Journal` from a saved Copilote insight
- **THEN** the existing launch dialog opens
- **AND** it offers `Une tâche courte dans le Journal` or `Un projet existant`
- **AND** it offers an optional due date
- **AND** it offers an optional responsible team member when the user's permissions allow assignment
- **AND** `En faire ma priorité de la semaine` is checked by default

#### Scenario: Lancement confirmé

- **WHEN** the user confirms a valid launch
- **THEN** an initiative is created or reused for the insight
- **AND** the initiative enters the existing actionable launch state (`in_progress` in the current service path)
- **AND** the insight decision becomes `launched`
- **AND** the action appears in the Journal with its exact validated text and source
- **AND** the conversation card displays `Lancé` and the selected due date

#### Scenario: Cible invalide

- **WHEN** the user selects a project or task that is missing, foreign or no longer accessible
- **THEN** the launch is rejected atomically
- **AND** no partial initiative, task link or weekly focus is left behind
- **AND** the insight remains in its previous decision

#### Scenario: Annulation du lancement

- **WHEN** the user closes or cancels the launch dialog before confirmation
- **THEN** no initiative is created or modified
- **AND** no weekly focus is changed
- **AND** the insight keeps decision `todo` unless it had another existing lifecycle state

### Requirement: Priorité hebdomadaire unique

The Copilote launch SHALL use the existing weekly-focus uniqueness rule.

#### Scenario: Nouvelle priorité

- **WHEN** the user launches a Copilote action with weekly focus enabled while another focus exists for the current week
- **THEN** the new initiative becomes the only focus for that week
- **AND** the previous initiative remains in the Journal without the focus flag

#### Scenario: Pas de priorité

- **WHEN** the user disables weekly focus
- **THEN** the action is launched without changing the current weekly focus

### Requirement: Cycle de vie après sauvegarde

The Copilote insight SHALL remain synchronized with the existing execution lifecycle, including `later`, `dismissed` and `completed`.

#### Scenario: Reporter une action

- **WHEN** the user chooses `Plus tard` from the existing insight controls
- **THEN** the decision becomes `later`
- **AND** the resume date is retained when provided
- **AND** the conversation and history show the action as retrievable but not currently launched

#### Scenario: Réactiver une action écartée

- **WHEN** the user chooses `Réactiver` for a dismissed Copilote insight
- **THEN** the insight returns to `todo`
- **AND** the same insight identifier is retained
- **AND** the conversation does not create a second proposal record

#### Scenario: Marquer l'action terminée

- **WHEN** the user marks the linked Journal initiative completed through the existing execution control
- **THEN** the initiative follows its existing completion transition
- **AND** the insight decision becomes `completed`
- **AND** the conversation card displays `Terminée`
- **AND** the success criterion remains visible in the action detail

### Requirement: Actions disponibles après lancement

A Copilote card whose insight is launched or completed SHALL not present a new primary business action.

#### Scenario: Action lancée

- **WHEN** the card displays decision `launched`
- **THEN** it offers `Ouvrir dans le Journal` and `Marquer terminée` according to the existing initiative state
- **AND** it does not offer `Garder cette action` or another save action
- **AND** no action on the card uses the coral primary accent

#### Scenario: Action terminée

- **WHEN** the card displays decision `completed`
- **THEN** it offers a return to the conversation or Journal history
- **AND** it does not offer a second launch or save action

### Requirement: Permissions et isolation d'exécution

Every Copilote execution read and mutation SHALL be scoped to the authenticated account and existing team permissions.

#### Scenario: Lecture d'un insight étranger

- **WHEN** a user submits an insight or initiative identifier belonging to another account
- **THEN** the server returns the existing safe not-found or access error
- **AND** no title, action, source or conversation data is returned

#### Scenario: RLS et migration

- **WHEN** the schema migration adds the Copilote uniqueness boundary or indexes
- **THEN** RLS remains enabled for the affected user-scoped tables
- **AND** the migration is generated and applied through the Drizzle migration workflow
