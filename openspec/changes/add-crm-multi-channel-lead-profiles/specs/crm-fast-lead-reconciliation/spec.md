## Purpose

Cette capacité permet à l'extension de retrouver rapidement une fiche connue
depuis n'importe quel réseau tout en laissant à l'utilisateur la décision sur
les correspondances incertaines.

## ADDED Requirements

### Requirement: Exact profile resolution first

The system SHALL resolve an exact canonical profile URL in the current CRM
account before running broader candidate searches.

#### Scenario: Profile already linked

- **WHEN** the extension visits a canonical profile URL already linked to a
  lead in the current account
- **THEN** the resolve response SHALL identify the existing lead directly
- **AND** it SHALL not wait for fuzzy matching, load lead history, or call an AI
  service

#### Scenario: Profile is known on another network

- **WHEN** the visited Instagram or LinkedIn profile is not linked but the
  current account contains a plausible lead on another network
- **THEN** the resolver SHALL be able to return that lead as a candidate
- **AND** it SHALL state the matching signals used for the suggestion

### Requirement: Bounded deterministic candidate search

The system SHALL search only the current account and SHALL use a bounded,
deterministic candidate flow: normalized phone or email first when available,
then normalized name or handle, then an indexed approximate search only when
the exact searches produce no decisive result.

#### Scenario: Strong contact match

- **WHEN** a captured profile includes a phone or email that matches a lead in
  the current account
- **THEN** that lead SHALL be ranked ahead of name-only candidates
- **AND** the response SHALL identify the matching contact field

#### Scenario: Name and handle normalization

- **WHEN** the visible name is `Alexandre Mepuis` and the handle is
  `alexandre_mepuis`
- **THEN** the resolver SHALL compare normalized forms that ignore case,
  accents, and separators
- **AND** it SHALL treat the result as a suggestion requiring confirmation

#### Scenario: Candidate limit

- **WHEN** more than five leads could match the captured identity
- **THEN** the response SHALL return at most five candidates
- **AND** each candidate SHALL include enough identity and signal information
  for a user to decide
- **AND** the resolver SHALL not load activities, calls, or full lead histories

#### Scenario: No reliable candidate

- **WHEN** no exact or sufficiently relevant candidate exists in the current
  account
- **THEN** the extension SHALL show the profile as unknown
- **AND** it SHALL allow an explicitly confirmed new lead flow

### Requirement: Explicit ambiguous-match decision

The system SHALL never merge or attach a profile solely because of a similar
name, handle, recent activity, setter, or social platform.

#### Scenario: Ambiguous candidates

- **WHEN** two or more candidates have plausible but non-conclusive signals
- **THEN** the extension SHALL show an explicit correspondence incertaine state
- **AND** it SHALL offer both a selected-lead confirmation and a separate-lead
  creation path

#### Scenario: Confirm an existing lead

- **WHEN** the user confirms a candidate in the current account
- **THEN** the system SHALL attach the visited profile to that lead
- **AND** it SHALL preserve every profile, source, responsibility, stage, and
  historical event already attached to the lead
- **AND** repeating the same request SHALL be idempotent

#### Scenario: Reject a candidate

- **WHEN** the user chooses to create a separate lead
- **THEN** the system SHALL leave the candidate unchanged
- **AND** it SHALL create the new lead only after explicit confirmation

### Requirement: Account and cache context

The resolver SHALL derive the account from the authenticated CRM context, and
the extension SHALL bind cached resolutions to that account and captured
profile identity.

#### Scenario: Account changes in the web app

- **WHEN** the active CRM account changes
- **THEN** the extension SHALL refresh or invalidate its session and cached
  resolutions before showing a result
- **AND** a response from the previous account SHALL not be rendered or used for
  a mutation

#### Scenario: Tampered candidate account

- **WHEN** a client submits a candidate lead or account identifier that is not
  part of the server-side resolution context
- **THEN** the server SHALL reject the mutation
- **AND** it SHALL not read or modify data from another account

### Requirement: Manual search fallback

The extension SHALL provide a manual search fallback in the current account
when visible identity signals are insufficient for automatic suggestions.

#### Scenario: Search by visible name

- **WHEN** the user searches for a visible name from the capture card
- **THEN** the extension SHALL request a bounded list of current-account leads
- **AND** it SHALL display the same explicit confirmation controls as automatic
  suggestions
