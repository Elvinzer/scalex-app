## Purpose

Cette capacité définit un CRM réellement exploitable depuis un téléphone par
un setter qui répète les mêmes opérations toute la journée, sans sacrifier la
qualité des données, la traçabilité commerciale ni la fiabilité des KPI.

## ADDED Requirements

### Requirement: Personal daily work queue

The system SHALL present `/crm` as the setter’s personal work queue by default.
It SHALL prioritize open actions that are overdue or due today, expose a direct
view of leads to relaunch today, and keep each item linked to its lead context.
The queue SHALL show enough context to decide the next action without opening a
second page, including the lead identity, source or platform, action title and
due time.

#### Scenario: Setter starts a work session

- **WHEN** a setter opens `/crm`
- **THEN** their open actions SHALL be shown by default, with overdue actions before actions due today
- **AND** the setter SHALL be able to open the due-today relance view in one deliberate action
- **AND** an empty queue SHALL explain what has been completed and offer the next useful action

#### Scenario: Setter completes or postpones an action

- **WHEN** a setter completes or postpones an action from the queue or its lead context
- **THEN** the action SHALL disappear from the current open queue or move to its new due-date group
- **AND** the queue SHALL remain on the same filter and position when possible
- **AND** the setter SHALL be able to open the next actionable lead without returning to a generic dashboard

### Requirement: Fast capture with an explicit pre-contact state

The system SHALL allow a setter to capture a social lead from a phone with the
minimum information needed for a reliable identity: platform, canonical profile
URL or normalized handle, display name or handle, and source. Offer, first name,
last name, qualification and other enrichment fields SHALL remain optional at
capture time and SHALL be editable later. A newly captured lead SHALL be shown
as « Nouveau lead » or an equivalent explicit pre-contact state. The system
MUST NOT record or count a first message merely because the lead was captured.

#### Scenario: Setter captures a new Instagram follower

- **WHEN** the setter enters the Instagram profile, a name or handle, and the source and confirms
- **THEN** the lead SHALL be created with the current responsible setter
- **AND** the lead SHALL appear in the pre-contact queue with an obvious next action
- **AND** no first-message event SHALL be recorded until an actual first message is registered

#### Scenario: Setter omits optional enrichment

- **WHEN** the setter captures a lead without offer, first name, last name, qualification or note
- **THEN** the lead SHALL still be saved if the identity minimum is valid
- **AND** the missing fields SHALL be visibly marked as incomplete without blocking the next workflow step

#### Scenario: Capture is submitted twice

- **WHEN** the setter double-taps the capture button or retries after an uncertain response
- **THEN** the account SHALL contain at most one lead for the same canonical social identity and capture operation
- **AND** the interface SHALL resolve to the existing lead instead of creating a duplicate

### Requirement: Lead detail prioritizes repeated actions

The lead detail SHALL put the information needed for a decision above the
history: identity and social link, current state, response state, responsible
setter, next action, next call date when present, and source. Note, stage,
response, qualification, follow-up, booking and outcome actions SHALL be
reachable from the lead context without requiring the setter to search through
the history. Each common action SHALL require no more than three taps after the
lead is open, excluding text entry and the final keyboard submission.

#### Scenario: Setter opens a lead from the queue

- **WHEN** the setter opens a lead on a phone
- **THEN** the identity, current state, response state and next action SHALL be visible before the historical timeline
- **AND** the primary actions SHALL be reachable from the first view or one compact action surface
- **AND** opening the detail SHALL not discard the queue filter or the setter’s place in the list

#### Scenario: Setter adds a note and a next action

- **WHEN** the setter writes a note and schedules the next action from the lead detail
- **THEN** both operations SHALL be available in the same lead context
- **AND** the note and action confirmation SHALL be visible without a full-page navigation
- **AND** an interrupted save SHALL preserve the entered text for retry

### Requirement: Qualification remains a quick free-form note

The system SHALL provide one free-form text area for the setter to record the
whole qualification of a lead. This version SHALL NOT require separate
structured fields for situation, objective, experience, investment capacity,
savings, blocker, maturity or final qualification. The setter SHALL be able to
save an incomplete note, edit it later and recover its content after a failed
save.

#### Scenario: Setter qualifies a lead during a conversation

- **WHEN** the setter writes the qualification in the lead context
- **THEN** the complete text SHALL be stored as a qualification note associated with the lead
- **AND** the lead summary SHALL show that a qualification note exists
- **AND** the setter SHALL be able to include the relevant situation, objective, experience, capacity, savings, blocker, maturity and conclusion in the same field

#### Scenario: Setter revisits a qualification

- **WHEN** the setter reopens a lead with an existing qualification note
- **THEN** the previous text SHALL be restored in the mobile form
- **AND** the setter SHALL be able to append or replace it without re-entering the rest of the lead data

#### Scenario: Qualification save fails

- **WHEN** the qualification note cannot be saved because of a timeout or network failure
- **THEN** the entered text SHALL remain available for retry
- **AND** the interface SHALL not present the note as saved until the server acknowledges it

### Requirement: Response is an explicit milestone

The system SHALL expose an explicit « A répondu » action in the lead context.
This action SHALL record a response milestone separately from the pipeline
stage, with the actor, responsible setter at the time, source and occurrence
timestamp. The UI SHALL make the milestone visibly completed after the first
recorded response, and repeated taps SHALL not inflate response KPIs.

#### Scenario: Setter marks a lead as having responded

- **WHEN** the setter taps « A répondu »
- **THEN** a response milestone SHALL be recorded and shown in the lead history
- **AND** the lead SHALL remain in the appropriate conversation stage unless the setter changes that stage separately
- **AND** the response state SHALL be visible from the lead summary and queue

#### Scenario: Response was already captured elsewhere

- **WHEN** an extension or another authorized source has already recorded the response
- **THEN** the lead detail SHALL show the action as completed
- **AND** a manual tap SHALL not create a second KPI-counting response for the same lead milestone

### Requirement: Booking supports a link path and an internal reservation path

The lead context SHALL expose two explicit booking actions. The first SHALL let
the setter send or copy the configured booking link to the prospect and SHALL
record that the link was sent without marking the call as booked. The second
SHALL open Minaly’s internal booking form, prefilled with the lead context, so
the setter can reserve a date and time for the prospect. The internal path SHALL
store the appointment in Minaly and SHALL NOT trigger iClosed, Calendly or
another external booking tool.

#### Scenario: Setter sends the booking link

- **WHEN** the setter chooses the link-based booking action from a lead
- **THEN** the configured link SHALL be available to copy or share from the phone
- **AND** the CRM SHALL record the link-sent action and its timestamp
- **AND** the lead SHALL remain outside the call-booked state until the setter receives confirmation from the prospect

#### Scenario: Prospect confirms a link booking

- **WHEN** the prospect tells the setter that the appointment was booked
- **THEN** the setter SHALL be able to mark the lead as « Appel booké » or the equivalent next status from the same lead context
- **AND** the action SHALL record the setter, confirmation time and any appointment information entered
- **AND** the call-booked KPI SHALL count the explicit confirmation only once

#### Scenario: Setter reserves internally for the prospect

- **WHEN** the setter chooses « Réserver le rendez-vous pour le prospect »
- **THEN** Minaly SHALL calculate and display available slots for the closer or closers associated with the lead
- **AND** the setter SHALL select an available slot and, when several closers are eligible, the closer attached to that slot
- **AND** the lead identity and the selected appointment details SHALL remain in the internal booking context
- **AND** a successful confirmation SHALL create the internal Minaly appointment and move the lead to the call-booked state
- **AND** no iClosed, Calendly or other external booking side effect SHALL be required

#### Scenario: No internal slot is available

- **WHEN** no associated closer has an available slot for the internal booking flow
- **THEN** Minaly SHALL explain that no slot is currently available
- **AND** the setter SHALL be able to return to the lead without changing it to call-booked
- **AND** the lead context and any entered contact information SHALL be preserved

#### Scenario: Internal booking is submitted twice

- **WHEN** the setter double-taps or retries the internal reservation after an uncertain response
- **THEN** Minaly SHALL create at most one internal appointment for that reservation operation
- **AND** the lead detail SHALL show the authoritative appointment state after reconciliation

### Requirement: Follow-ups and outcomes are actionable from mobile

The system SHALL let a setter complete, postpone or reschedule an open follow-up
from the due-today queue or the lead detail. Marking a booked call as no-show
SHALL create at most one visible recovery follow-up. Marking a lead as lost
SHALL require a loss reason, preserve the event and allow later reopening.
Validating a sale SHALL use the canonical sale record for amount, date, source
and setter attribution rather than duplicating financial data in the lead.

#### Scenario: Setter processes a no-show

- **WHEN** the setter marks a booked call as no-show
- **THEN** the lead SHALL show the no-show outcome without being silently marked lost
- **AND** one recovery follow-up SHALL be created for the responsible user
- **AND** repeating the action or refreshing the page SHALL not create another recovery follow-up

#### Scenario: Setter marks a lead as lost

- **WHEN** the setter chooses Lost
- **THEN** the interface SHALL request a loss reason before confirming
- **AND** the loss reason, actor, timestamp and optional note SHALL remain visible in the history
- **AND** the setter SHALL be able to reopen the lead with an explicit next stage

#### Scenario: Setter validates a sale

- **WHEN** an authorized user validates a sale from the lead context
- **THEN** the amount, sale date, source and setter attribution SHALL come from the canonical sale validation
- **AND** the lead SHALL show the sold outcome and the associated sale
- **AND** a repeated confirmation SHALL not create a second sale or duplicate revenue

### Requirement: Mobile navigation and keyboard reachability

The CRM SHALL be usable at 320, 360, 375, 390, 393, 414 and 430 CSS pixels,
including a short viewport. It SHALL expose every CRM section without making an
important tab unreachable through horizontal clipping, mark the exact current
route as active, and keep fixed navigation, drawers and the floating assistant
from covering one another or covering an actionable control. Interactive
targets SHALL provide at least a 44 by 44 CSS pixel touch area. Bottom and top
safe areas SHALL be respected.

#### Scenario: Setter works at 320 by 568

- **WHEN** the setter uses the CRM at 320 by 568 CSS pixels
- **THEN** no unintended horizontal page scroll SHALL occur
- **AND** the Actions and Appels destinations SHALL remain reachable
- **AND** the bottom navigation and floating assistant SHALL not overlap a tappable item

#### Scenario: Setter edits a field with the mobile keyboard open

- **WHEN** the setter focuses a note, qualification, search or date field
- **THEN** the focused field and its save or next action SHALL be scrolled into the visible area above the keyboard
- **AND** the keyboard SHALL offer an appropriate next or done action for the field type
- **AND** closing the keyboard SHALL not reset the form or jump to an unrelated position

#### Scenario: Setter opens a deep CRM route

- **WHEN** the setter opens `/crm/leads`, `/crm/pipeline`, `/crm/actions` or `/crm/appels` directly
- **THEN** only that exact route or its intended child route SHALL be marked active
- **AND** the route’s section navigation SHALL retain access to every sibling destination

### Requirement: Lists and forms remain efficient after repeated use

The system SHALL preserve search, filter and scroll context when the setter
returns from a lead. Search and filters SHALL remain responsive without
requiring a full form reset for each change. Long lead, action and call lists
SHALL load incrementally or in bounded pages, and the interface SHALL expose
loading, empty and error states that explain the next action. Repeated forms
SHALL ask only for fields necessary for the current operation and SHALL use
mobile-appropriate input types for URLs, names, amounts, dates and free text.

#### Scenario: Setter searches for a lead repeatedly

- **WHEN** the setter enters a name or handle and opens a result
- **THEN** returning to the list SHALL keep the query, filters and useful scroll position
- **AND** the result list SHALL update without displaying stale results as if they were current
- **AND** a no-result state SHALL offer a clear way to capture a new lead or clear the filter

#### Scenario: Setter works through a long call list

- **WHEN** the account contains more calls or actions than fit in one mobile view
- **THEN** the page SHALL not require rendering the full history before the first useful interaction
- **AND** loading the next portion SHALL preserve the current position and filters
- **AND** each card SHALL retain its primary identity, date, state and next action at phone width

### Requirement: Mobile mutations are safe under uncertain connectivity

Every mobile mutation for capture, note, qualification, stage, response,
follow-up, outcome, booking handoff and sale validation SHALL have an explicit
pending state and a retry-safe idempotency key. The system SHALL never show a
successful durable save before acknowledgement from the authoritative service,
unless the pending state is clearly labelled. If the network fails, entered
note, qualification and action content SHALL remain available for retry, and an
error SHALL identify whether the operation was saved, pending or not saved.

#### Scenario: Setter double-taps a destructive or state-changing action

- **WHEN** the setter double-taps a stage, outcome, response or completion action
- **THEN** the control SHALL prevent ambiguous repeated submission
- **AND** the server SHALL apply the intended effect at most once for that operation
- **AND** the lead detail SHALL reconcile with the authoritative state after completion

#### Scenario: Network fails while saving a note or next action

- **WHEN** the request fails or times out after the setter has entered content
- **THEN** the content SHALL remain in the current draft or retry surface
- **AND** the UI SHALL distinguish retry from a successful save
- **AND** retrying the same operation SHALL not create duplicate notes or actions

#### Scenario: Setter leaves while a mutation is pending

- **WHEN** the setter navigates back or switches lead while a mutation is pending
- **THEN** the interface SHALL either finish and reconcile the operation or show it as pending or failed on return
- **AND** it SHALL not silently discard the operation or report an outdated state as current

### Requirement: Mobile events feed transparent KPI calculations

The system SHALL record mobile-originated milestones for lead creation, first
message, response, qualification-note activity, call proposal, call booking,
attendance, no-show, loss and sale with an occurrence timestamp, capture
timestamp, actor, responsible setter at the time and source when known. A
free-form qualification note SHALL NOT be treated as proof of a qualified lead
and SHALL NOT be used alone to calculate a qualification rate. KPI calculations
SHALL use unique leads for conversion rates, canonical calls for attendance and
canonical sales for revenue. The UI SHALL show the selected period and filters,
provide metric-specific drill-downs, and state explicitly when a metric is
unavailable or incomplete.

#### Scenario: Setter activity is reassigned later

- **WHEN** a setter records a response, qualification or stage change and the lead is later reassigned
- **THEN** the original actor and occurrence time SHALL remain attached to the event
- **AND** the KPI view SHALL keep activity attribution distinct from the current responsible setter

#### Scenario: Setter opens a KPI card

- **WHEN** the setter taps a KPI for responses, qualification, bookings, show rate or sales
- **THEN** the destination SHALL show the leads or calls that contribute to that specific metric
- **AND** it SHALL not send every KPI to the same generic lead date range
- **AND** revenue totals, setter breakdowns and source breakdowns SHALL use the same visible period and filters

#### Scenario: Source data is incomplete

- **WHEN** the system cannot calculate a rate or attribution reliably
- **THEN** the KPI SHALL be labelled unavailable or incomplete
- **AND** the interface SHALL not substitute a plausible-looking zero or fabricated amount

#### Scenario: Qualification is recorded only as free text

- **WHEN** a setter adds or edits a qualification note without selecting a controlled qualification status
- **THEN** the activity SHALL remain visible in the lead history
- **AND** the qualification rate SHALL be labelled unavailable rather than inferred from the note

### Requirement: Mobile surfaces preserve localization and state feedback

Every user-visible CRM state, including drawers, confirmation dialogs, loading
states, empty states, validation errors, retry messages and destructive-action
labels, SHALL resolve to a valid key in both French and English. A raw
translation key SHALL never be rendered in the DOM. Async actions SHALL expose
an accessible status or error and SHALL not leave the setter guessing whether
the operation succeeded.

#### Scenario: Setter opens a confirmation or error state

- **WHEN** the setter opens a delete, loss, sale or retry dialog in either locale
- **THEN** the title, description, buttons, pending state and error message SHALL be translated
- **AND** no `namespace.key` placeholder or missing-message error SHALL be visible to the setter

#### Scenario: Setter receives a validation error

- **WHEN** a form is submitted with an invalid URL, date, amount or required field
- **THEN** the error SHALL identify the field or correction needed near the action
- **AND** all valid values already entered SHALL remain intact

### Requirement: Intensive-use acceptance is measured over repetition

The CRM SHALL be accepted against a phone-only scenario of 50 lead loops per
day for five consecutive simulated days, for 250 loops total. A loop SHALL
start from the daily queue and include opening a lead, reading its summary,
performing at least one of note, response, qualification, stage or follow-up,
and returning to the next actionable lead. The acceptance run SHALL cover the
required mobile widths and at least one slow or interrupted network condition.

#### Scenario: Setter completes the five-day repetition run

- **WHEN** the 250-loop acceptance scenario is executed
- **THEN** every common action SHALL remain reachable within three taps after the lead is open, excluding typing
- **AND** the queue, filter and scroll context SHALL not progressively degrade by the fifth day
- **AND** there SHALL be zero duplicate lead, note, action, outcome or revenue records caused by retries or double-taps
- **AND** there SHALL be zero silently lost note, qualification or follow-up drafts

#### Scenario: Repetition exposes a small friction

- **WHEN** a step requires an additional search, page change, scroll, correction or confirmation in repeated loops
- **THEN** the QA report SHALL record the step count, approximate time cost, frequency and cumulative five-day cost
- **AND** the issue SHALL be prioritized by cumulative setter time and data risk rather than by isolated visual severity
