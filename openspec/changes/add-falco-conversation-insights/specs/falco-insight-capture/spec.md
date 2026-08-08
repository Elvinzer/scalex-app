# falco-insight-capture

## Purpose

Transformer une réponse Falco suffisamment précise en insight éditable puis sauvegardé explicitement, sans interrompre la conversation ni créer de tâche vague.

## ADDED Requirements

### Requirement: Proposition structurée dans le fil

Falco SHALL be able to emit an optional structured proposal containing `title`, `problem`, `actionText` and `successCriterion`. The client SHALL render an « Action à retenir » card as the last block of the corresponding Falco message only when all four fields are present and valid.

#### Scenario: Action formulable

- **WHEN** Falco emits a valid proposal for the active conversation
- **THEN** the card appears at the end of that Falco message in the conversation flow
- **AND** it displays the problem, the exact action, the success criterion and `Falco · {sujet de la conversation}`
- **AND** it offers `Garder cette action` as the single dominant action and `Continuer à creuser` as the secondary action
- **AND** no database write occurs merely because the card is displayed

#### Scenario: Réponse sans proposition structurée

- **WHEN** Falco answers without a valid proposal event
- **THEN** the assistant message is displayed and persisted normally
- **AND** no action card is rendered
- **AND** no insight is created

#### Scenario: Proposition périmée ou malformée

- **WHEN** the proposal event is malformed, exceeds a field limit, is interrupted, or references a different conversation than the active response
- **THEN** the event is ignored
- **AND** the normal assistant message remains usable
- **AND** no insight or draft is created automatically

#### Scenario: La carte n'interrompt pas la conversation

- **WHEN** a card is visible and the user sends another message
- **THEN** the new message is processed normally
- **AND** the existing card remains at its original position in the thread

### Requirement: Réponse vague guidée

Falco SHALL NOT present an action card when the exchange does not provide a testable action, a reason and a success criterion. It SHALL be able to return a precision prompt instead.

#### Scenario: Action trop vague

- **WHEN** the conversation does not yet support a precise action
- **THEN** the UI displays `Pas encore d'action à retenir`
- **AND** it explains the missing precision in plain language
- **AND** it offers at least two quick replies, such as `Après 2–3 échanges`, `Quand il demande` or `Ça dépend`
- **AND** it displays no save or launch action

#### Scenario: Réponse rapide

- **WHEN** the user selects a quick reply
- **THEN** the reply is sent as a normal user message in the same conversation
- **AND** no local or server insight is created before Falco returns a valid proposal and the user confirms it

### Requirement: Validation éditable avant sauvegarde

The system SHALL require an explicit user confirmation before creating an insight. `Garder cette action` SHALL only open a local editable state.

#### Scenario: Ouverture de l'édition

- **WHEN** the user activates `Garder cette action`
- **THEN** the card switches to an editable validation state
- **AND** `Titre de l'action`, `L'action à implémenter` and `Critère de réussite` are prefilled
- **AND** the values are editable without changing the persisted conversation
- **AND** the only save action is `Enregistrer l'insight`

#### Scenario: Modification avant sauvegarde

- **WHEN** the user changes one or more editable fields and saves
- **THEN** the capture request contains the exact edited values
- **AND** the original proposal is not substituted back by the client or server

#### Scenario: Annulation explicite

- **WHEN** the user activates `Annuler` from the validation state
- **THEN** the card returns to the proposal state
- **AND** the edited draft is discarded
- **AND** no database write occurs

### Requirement: Conservation du brouillon local

The system SHALL preserve an unregistered validation draft per conversation when the drawer closes, without persisting the transcript or creating an insight.

#### Scenario: Fermeture puis réouverture

- **WHEN** the user edits the title, action or criterion and closes the drawer without saving
- **AND** reopens the same conversation in the same browser session
- **THEN** the card returns to validation state
- **AND** each field contains exactly the value entered before closing

#### Scenario: Isolation des brouillons

- **WHEN** the user switches to another conversation
- **THEN** the other conversation's draft is not displayed
- **AND** the draft is keyed by conversation identifier

#### Scenario: Stockage local indisponible

- **WHEN** `sessionStorage` is unavailable, full or blocked
- **THEN** the chat remains usable
- **AND** the UI keeps the draft for the lifetime of the mounted surface when possible
- **AND** no error exposes transcript content or storage internals to the user

### Requirement: Sauvegarde explicite d'un insight Copilote

The system SHALL call the server-side Copilote capture contract only from `Enregistrer l'insight`. The server SHALL validate the fields, verify conversation ownership and materialize `sourceType: "copilote"` with `sourceId` equal to the conversation identifier and decision `todo`.

#### Scenario: Enregistrement réussi

- **WHEN** the user activates `Enregistrer l'insight` with valid values
- **THEN** the button enters a visible loading state and cannot be activated twice
- **AND** an insight is created or the existing insight for that conversation is returned
- **AND** the saved record contains the exact title, action and success criterion validated by the user
- **AND** the source label is derived server-side as `Falco · {sujet de la conversation}`
- **AND** the card displays `Insight conservé`, `À traiter`, the exact title and `Lancer dans le Journal`
- **AND** the local draft is cleared after the successful response

#### Scenario: Enregistrement idempotent

- **WHEN** two save requests for the same account and conversation arrive concurrently
- **THEN** both requests resolve to the same insight identifier
- **AND** at most one Copilote insight exists for that conversation
- **AND** the first successfully persisted values remain the source of truth unless the product explicitly supports an edit action

#### Scenario: Échec de l'enregistrement

- **WHEN** the capture request fails because of validation, access, network or database error
- **THEN** the card displays `L'action n'a pas pu être enregistrée.` with `role="alert"`
- **AND** the text explains that the user's values are conserved and gives a recovery path
- **AND** all entered values remain visible
- **AND** `Réessayer` retries the same validated values
- **AND** no partial insight is displayed as saved

### Requirement: Conversation déjà associée

The system SHALL show the persisted insight state instead of proposing a second card whenever the conversation already has a Copilote insight, including `todo`, `launched`, `later`, `dismissed` and `completed`.

#### Scenario: Insight existant

- **WHEN** the conversation is opened and an insight already exists
- **THEN** the UI displays the existing card or an `Cette conversation a déjà une action associée.` banner
- **AND** it offers `Voir l'action` or the current lifecycle actions
- **AND** no new proposal can be saved from that conversation

#### Scenario: Action écartée

- **WHEN** the existing insight has decision `dismissed`
- **THEN** the existing action remains retrievable
- **AND** the user can use the existing reactivation path
- **AND** a second insight is not created

### Requirement: Accessibilité et ergonomie de la carte

The card SHALL be usable on keyboard and touch devices and SHALL communicate state without relying on color.

#### Scenario: Parcours clavier

- **WHEN** the user navigates the card with a keyboard
- **THEN** every interactive element has a visible focus state
- **AND** tab order follows the visual order
- **AND** every button describes its effect

#### Scenario: États et erreurs

- **WHEN** the card is saving or displays an error
- **THEN** the state is announced to assistive technology
- **AND** errors are close to the relevant action and use `role="alert"`
- **AND** the state label remains readable without color perception

#### Scenario: Mouvement réduit

- **WHEN** the user has enabled `prefers-reduced-motion`
- **THEN** card appearance and state transitions do not rely on animation

### Requirement: Lisibilité mobile et textes longs

The card SHALL remain fully readable at the supported mobile viewports and SHALL never introduce horizontal scrolling.

#### Scenario: Carte sur mobile

- **WHEN** a card is displayed in a 375 × 812 or 390 × 844 drawer
- **THEN** the card is not hidden behind the composer, drawer footer or virtual keyboard
- **AND** the composer remains reachable
- **AND** every touch target is at least 44 × 44 CSS pixels

#### Scenario: Action longue

- **WHEN** `actionText` exceeds 300 characters on a 375 px viewport
- **THEN** the complete text is visible through vertical layout and scrolling
- **AND** no ellipsis hides required content
- **AND** no horizontal scrollbar appears

### Requirement: Confidentialité de la capture

The capture flow SHALL not copy the full conversation into the insight record, logs or URLs.

#### Scenario: Données persistées

- **WHEN** an insight is saved
- **THEN** only the validated title, problem, action and success criterion are persisted in the typed Copilote snapshot
- **AND** no API key, session token or full transcript is persisted in that snapshot

#### Scenario: Compte non autorisé

- **WHEN** a client submits a conversation identifier from another account
- **THEN** the server rejects the capture
- **AND** no source label, title or transcript detail from that conversation is returned
