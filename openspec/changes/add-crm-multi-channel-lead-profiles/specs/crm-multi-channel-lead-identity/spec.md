## Purpose

Cette capacité permet à une fiche CRM de regrouper les profils sociaux et les
coordonnées d'une même personne sans écraser l'origine ni l'historique du lead.

## ADDED Requirements

### Requirement: Account-scoped multi-channel profiles

The system SHALL allow one lead to have a canonical profile for each supported
social platform, and SHALL identify each profile by the current account, its
platform, and its canonical profile URL.

#### Scenario: Add a second network to an existing lead

- **WHEN** an authorized user confirms an Instagram profile for a lead that
  already has a WhatsApp-originated profile or another social profile
- **THEN** the system SHALL add the Instagram profile to the same lead
- **AND** the system SHALL preserve the existing source, responsible setter,
  pipeline state, notes, activities, calls, sales links, and history

#### Scenario: Same profile in different accounts

- **WHEN** the same canonical social profile is present in two CRM accounts
- **THEN** each account SHALL resolve only its own lead
- **AND** neither account SHALL expose the other account's lead or profiles

#### Scenario: Conflicting profile on the same lead

- **WHEN** a lead already has a different profile for the same platform
- **THEN** the system SHALL show the conflict and require an explicit decision
- **AND** it SHALL not silently replace or delete the existing profile

### Requirement: Profile and legacy data continuity

The system SHALL preserve existing single-profile lead data while migrating it
to the multi-profile representation, and SHALL keep older capture clients
usable during the transition.

#### Scenario: Legacy profile migration

- **WHEN** an existing lead has a legacy platform, handle, or profile URL
- **THEN** the system SHALL create or associate the equivalent profile record
- **AND** the lead's existing CRM identity, timestamps, and history SHALL remain
  unchanged

#### Scenario: Legacy extension capture

- **WHEN** an older extension submits a valid profile capture during rollout
- **THEN** the server SHALL resolve it within the current account
- **AND** it SHALL add or update the compatible profile representation without
  removing profiles created by the new extension

### Requirement: WhatsApp link from normalized phone

The system SHALL expose a WhatsApp action when a lead has a valid phone number,
using the full international number with digits only after `https://wa.me/`.

#### Scenario: Valid international phone

- **WHEN** a lead has a valid normalized international phone number
- **THEN** the lead view SHALL expose a WhatsApp link in the form
  `https://wa.me/<international-digits>`
- **AND** activating the link SHALL open the WhatsApp click-to-chat destination

#### Scenario: Local phone with an explicit country context

- **WHEN** a user enters a valid national phone number with a known country
  context
- **THEN** the system SHALL normalize it to the international representation
- **AND** the generated link SHALL omit the plus sign, spaces, brackets, and
  dashes

#### Scenario: Missing or invalid phone

- **WHEN** the phone is missing or cannot be validated
- **THEN** the system SHALL not generate a WhatsApp link
- **AND** the lead view SHALL leave the phone available for correction without
  inventing a destination

### Requirement: Contact and profile presentation

The lead view SHALL show each linked social profile separately from the
acquisition source and SHALL make the WhatsApp action independent of social
profile links.

#### Scenario: Lead has WhatsApp and Instagram

- **WHEN** a lead has a WhatsApp number and an Instagram profile
- **THEN** the view SHALL show both actions with their respective labels
- **AND** changing or opening one profile SHALL not change the other
