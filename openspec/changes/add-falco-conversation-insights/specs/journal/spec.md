# journal

## Purpose

Faire du Journal le lieu où l'action issue de Falco devient visible, planifiable et vérifiable, tout en conservant le contexte de la conversation d'origine.

## ADDED Requirements

### Requirement: Mapping exact d'une action Falco

The Journal SHALL display a launched Copilote insight using the user-validated values without silently regenerating or rewriting them.

#### Scenario: Action présente dans le Journal

- **WHEN** a Copilote insight is launched
- **THEN** the Journal displays the exact validated title as the action title
- **AND** it displays the exact validated `actionText` as the action body
- **AND** it displays the exact `successCriterion` under `Critère de réussite` in the action detail
- **AND** it may display the saved `problem` as the reason/context
- **AND** it displays `Falco · {sujet de la conversation}` as the source
- **AND** it displays the current initiative status using the existing Journal status vocabulary
- **AND** it displays the due date when one exists

#### Scenario: Texte long

- **WHEN** the validated action or criterion is long
- **THEN** the detail view keeps the complete text available
- **AND** a compact list may reduce visual density only if the full text is available in the detail view
- **AND** no content is replaced by a newly generated summary

### Requirement: Origine lisible

The origin of an action SHALL be understandable from text and SHALL NOT depend only on color or an icon.

#### Scenario: Falco et tâche manuelle côte à côte

- **WHEN** a Falco action is displayed next to a manually created task
- **THEN** the Falco action displays the textual source `Falco · {sujet}`
- **AND** the manually created task remains distinguishable without relying on hue alone

### Requirement: Retour vers la conversation exacte

The Journal SHALL provide a `Voir la conversation` link for every launched Copilote action.

#### Scenario: Conversation accessible

- **WHEN** the user activates `Voir la conversation`
- **THEN** the application opens `/copilote?conversation=<conversationId>`
- **AND** the corresponding conversation is selected
- **AND** the action card is visible in its current lifecycle state

#### Scenario: Conversation supprimée ou inaccessible

- **WHEN** the source conversation no longer exists or is not accessible to the current account
- **THEN** the Journal keeps the action history visible
- **AND** the link is hidden or leads to the safe generic Copilote state
- **AND** no foreign conversation metadata is disclosed

### Requirement: Priorité de la semaine

A Copilote action selected as the weekly focus SHALL use the existing Journal focus presentation.

#### Scenario: Action prioritaire

- **WHEN** the initiative is the current weekly focus
- **THEN** it appears under `Priorité de la semaine` and is presented before the other actions in the relevant Journal surface
- **AND** it displays the source badge or text `Falco`
- **AND** it displays the due date when one exists

#### Scenario: Focus remplacé

- **WHEN** another initiative becomes the weekly focus
- **THEN** the former Copilote action loses the focus treatment
- **AND** its title, status, source and link remain unchanged

### Requirement: Synchronisation avec l'exécution

The Journal SHALL reflect the same initiative and insight state as the conversation card and execution history.

#### Scenario: Lancement réussi

- **WHEN** `launchInsight` succeeds
- **THEN** the Journal can render the action without a second materialization or a duplicate initiative
- **AND** the action remains linked to the same insight record

#### Scenario: Action terminée

- **WHEN** the linked initiative is marked completed
- **THEN** the Journal and the conversation both display the completed state
- **AND** the success criterion remains available for review

### Requirement: Accès au Journal

The Journal projection SHALL enforce the same account and team-member access rules as the existing execution surfaces.

#### Scenario: Action d'un autre compte

- **WHEN** a client attempts to load or open a Copilote initiative identifier from another account
- **THEN** the server returns the existing safe not-found or authorization behavior
- **AND** no action text, source label or conversation identifier is exposed
