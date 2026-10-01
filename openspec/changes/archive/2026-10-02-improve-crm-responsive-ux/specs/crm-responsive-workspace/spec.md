## Purpose

Cette capacité rend les pages CRM faciles à parcourir et à utiliser avec une base de leads croissante, sur téléphone, tablette et ordinateur, tout en conservant les données et opérations canoniques de Minaly.

## ADDED Requirements

### Requirement: CRM navigation remains discoverable and compact

The CRM SHALL provide direct navigation to Aujourd’hui, Leads, Pipeline, Actions, Appels, and Extension. On compact viewports, the CRM navigation SHALL stay on one line, preserve access to every destination, and identify the route that is currently open. The Extension destination SHALL remain available independently of any dismissible suggestion.

#### Scenario: User navigates CRM on a narrow phone

- **WHEN** a user opens any CRM page at a viewport narrower than 1024 CSS pixels
- **THEN** the CRM destinations SHALL remain on one navigation row without wrapping
- **AND** the user SHALL be able to reach the destinations that extend beyond the viewport through an explicit horizontal navigation gesture
- **AND** the active route SHALL be identified correctly, including `/crm/extension` and lead detail routes

#### Scenario: Extension suggestion was dismissed

- **WHEN** a user has dismissed the Extension suggestion on Aujourd’hui
- **THEN** the user SHALL still be able to open `/crm/extension` from the CRM navigation
- **AND** the Extension destination SHALL be shown as active while that route is open

### Requirement: Today prioritizes the next CRM action

The Aujourd’hui page SHALL place the user’s actionable queue before monthly analytics. It SHALL distinguish overdue, due-today, and upcoming open actions according to the existing CRM rules. Monthly analytics SHALL be collapsed by default and SHALL display their reporting period when expanded. A next-action highlight SHALL link to the first actionable item without presenting that same item twice in the queue.

#### Scenario: Setter opens Aujourd’hui with overdue work

- **WHEN** a setter opens Aujourd’hui and overdue actions exist
- **THEN** the next-action entry and overdue group SHALL be visible before monthly analytics
- **AND** completing or opening the highlighted action SHALL operate on the corresponding queue item
- **AND** the same action SHALL appear only once in the queue

#### Scenario: User opens monthly analytics

- **WHEN** a user opens Aujourd’hui
- **THEN** the monthly analytics section SHALL be collapsed by default
- **AND** the section SHALL show its selected period when expanded
- **AND** it SHALL remain visually and semantically distinct from the daily action queue

### Requirement: Leads search exposes the complete filtered result set

The Leads page SHALL allow users to search and filter all leads they are authorized to view, regardless of the default batch size. It SHALL display the exact number of leads matching the active filters and the number currently displayed. When no filters are active, that result total SHALL represent all leads available to the account. A filtered view SHALL NOT combine its matching-result count with a separate global total in a way that obscures the active search scope.

#### Scenario: Matching leads exceed the first batch

- **WHEN** the active search and filters match more leads than the page initially loads
- **THEN** the interface SHALL state the exact matching-result total and the number currently displayed
- **AND** the user SHALL be able to load the next bounded batch
- **AND** loading more SHALL preserve the active filters and deterministic result order

#### Scenario: User changes a lead filter

- **WHEN** a user changes search text or a filter
- **THEN** the displayed leads and exact result total SHALL both reflect the new filter set
- **AND** the loaded-batch position SHALL reset to the beginning
- **AND** the result-count update SHALL be announced accessibly

#### Scenario: No leads match the current filters

- **WHEN** the current search and filters return no leads
- **THEN** the page SHALL show an explicit empty-result state and a clear way to reset the filters
- **AND** it SHALL not imply that the account contains no leads when only the current filters are empty

### Requirement: Pipeline browsing scales independently by stage

The Pipeline SHALL use the canonical five CRM stages and their localized labels. Each stage count SHALL represent all leads matching the active Pipeline filters in that stage, regardless of how many cards are loaded. The system SHALL load leads in bounded batches per stage instead of applying a single global batch limit to the entire board.

#### Scenario: Desktop user opens a populated Pipeline

- **WHEN** a user opens Pipeline at a viewport of at least 1024 CSS pixels
- **THEN** the board SHALL show all five canonical stages with their complete counts
- **AND** each stage SHALL load an initial bounded set of lead cards
- **AND** the user SHALL be able to load more cards for one stage without loading every lead in the other stages

#### Scenario: Mobile user browses a populated stage

- **WHEN** a user opens Pipeline below 1024 CSS pixels
- **THEN** the interface SHALL show one selected stage as a readable lead list
- **AND** the stage selector SHALL stay on one row and expose the selected stage and its count
- **AND** the user SHALL be able to search and load further leads within that stage

#### Scenario: User changes a lead’s stage

- **WHEN** a user changes a lead’s stage from a Pipeline card or lead context
- **THEN** the existing accessible stage-change action SHALL remain available without requiring drag-and-drop
- **AND** the card and stage counts SHALL update to reflect the canonical stage change

#### Scenario: User changes a Pipeline filter before applying it

- **WHEN** a user edits the source or search filter without applying it
- **THEN** loading more leads SHALL stay disabled until the edited filters are applied
- **AND** every page SHALL use the same applied filters and result order

### Requirement: Action lists make due state and completion clear

CRM Actions SHALL distinguish overdue, due-today, and upcoming actions using the existing action data and lifecycle. Each action card SHALL make the lead, action, due information, and available completion or rescheduling actions easy to scan at every supported width. Repeated actions in a list SHALL not create a wall of primary-color buttons.

#### Scenario: User scans overdue actions on mobile

- **WHEN** a user views CRM Actions below 1024 CSS pixels
- **THEN** the due date and overdue text SHALL remain visible without opening the action
- **AND** lead identity and action title SHALL remain readable before secondary metadata
- **AND** complete and reschedule controls SHALL remain reachable with touch input

#### Scenario: User has no actions in a selected group

- **WHEN** the selected action filter contains no open actions
- **THEN** the page SHALL show a clear empty state for that filter
- **AND** it SHALL preserve access to other action groups and the lead context

### Requirement: Calls keep results visible and support full lead search

The Calls page SHALL retain its existing call sources, call results, permissions, and canonical call records. On compact viewports, secondary filters SHALL be disclosed on demand so that search and call results remain easy to reach. Manual lead association SHALL search the complete lead set the user is authorized to access, rather than a preloaded default batch. Falco suggestions SHALL remain distinct from manual association.

#### Scenario: User searches calls on mobile

- **WHEN** a user opens Appels below 1024 CSS pixels
- **THEN** call search and the first call results SHALL appear before the advanced filters
- **AND** the interface SHALL provide a control to open and close the advanced filters
- **AND** the number of active advanced filters SHALL be visible while that panel is closed

#### Scenario: User searches for a lead to link to a call

- **WHEN** an authorized user opens manual association and enters a name, handle, email, or other supported identity value
- **THEN** the interface SHALL search the full account-scoped lead set on the server
- **AND** it SHALL show a bounded list of matching leads with clear loading, no-match, and error states
- **AND** selecting a result SHALL use the existing manual call-link operation

#### Scenario: User paginates a Falco suggestion filter

- **WHEN** a user filters calls by Falco suggestion status and more matching calls exist than fit on one page
- **THEN** the suggestion status SHALL be applied before limit and offset pagination
- **AND** each page SHALL contain matching calls without hiding later matches

#### Scenario: User lacks permission to associate a call

- **WHEN** a user cannot manage CRM call associations
- **THEN** the interface SHALL not expose manual association controls
- **AND** call data and AI suggestions SHALL remain subject to existing permissions and behavior

### Requirement: Lead detail keeps primary context readable

The lead detail SHALL preserve the current lead, outcome, history, call, note, and action contracts. It SHALL present lead identity, current state, responsible user, next action, and due information before secondary history. On compact viewports, content SHALL use a single readable column and destructive actions SHALL not obscure identity, state, or navigation.

#### Scenario: User opens a lead detail on a narrow phone

- **WHEN** a user opens a lead at a viewport of 320 CSS pixels or wider and narrower than 1024 CSS pixels
- **THEN** the identity, state, responsible user, and next action SHALL remain visible without horizontal page scrolling
- **AND** the delete control SHALL remain separate from primary actions and SHALL not overlap lead information
- **AND** the user SHALL be able to return to the originating list without losing its active context when that context is available

### Requirement: Lead creation and import retain complete guided content

Lead capture and import SHALL retain their existing validation and mutation behavior while using responsive, clearly labeled forms. The current step’s principal content and next action SHALL be visible; labels SHALL remain visible during entry and SHALL not rely on placeholders alone. Add and import actions SHALL not force large forms to remain expanded above the Leads list.

#### Scenario: User opens lead creation or import on mobile

- **WHEN** a user opens capture or import below 1024 CSS pixels
- **THEN** the form or wizard SHALL fit the available width without horizontal page scrolling
- **AND** each step SHALL show its content, progress, and next available action
- **AND** validation messages SHALL appear near the affected field while preserving other entered values

#### Scenario: User imports a file

- **WHEN** a user advances through file selection, column mapping, preview, and completion
- **THEN** each step SHALL display the corresponding content and status
- **AND** the existing duplicate handling and explicit review-before-commit behavior SHALL remain intact

#### Scenario: An import step fails

- **WHEN** file analysis, preview, or commit fails
- **THEN** retry SHALL repeat the failed step
- **AND** the selected file, mapping, duplicate choices, and review decisions SHALL remain available

### Requirement: CRM responsive surfaces meet navigation and accessibility needs

CRM pages SHALL adapt their structure to compact viewports below 1024 CSS pixels and wide viewports at or above 1024 CSS pixels. At compact widths, Leads and Calls SHALL use card layouts and Pipeline SHALL show one stage at a time; wide layouts MAY use tables and a five-column Pipeline. The page SHALL not overflow horizontally except for a clearly indicated horizontal CRM navigation row. Interactive controls SHALL have a minimum 44 CSS-pixel touch target, visible focus, accessible labels, and status announcements where result counts or asynchronous states change.

#### Scenario: User opens CRM at a supported viewport

- **WHEN** a user opens any CRM screen at 320, 360, 390, 768, or 1440 CSS pixels wide
- **THEN** the layout SHALL retain its hierarchy without horizontal page overflow
- **AND** fixed navigation, safe areas, the virtual keyboard, and the Falco assistant SHALL not obscure active controls or results
- **AND** all CRM navigation destinations SHALL remain reachable

#### Scenario: User navigates the CRM with keyboard or assistive technology

- **WHEN** a user navigates a CRM list, filter, menu, sheet, or dialog without a pointer
- **THEN** controls SHALL have visible focus and accessible names
- **AND** opening and closing an overlay SHALL manage focus and return it to the triggering control
- **AND** status SHALL not be communicated through color alone

#### Scenario: User switches application language

- **WHEN** a user views any changed CRM screen in French or English
- **THEN** all new or modified user-facing strings and states SHALL exist in both locale catalogs
- **AND** no raw translation key or missing-message placeholder SHALL be visible
