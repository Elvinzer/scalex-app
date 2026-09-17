## Purpose

Cette capacité permet à un utilisateur autorisé du CRM d'installer l'extension
Chrome avec un parcours court, de comprendre son fonctionnement et de retrouver
le guide ou la dernière version sans quitter Minaly.

## ADDED Requirements

### Requirement: Contextual CRM suggestion

Minaly SHALL afficher une suggestion d'extension sur l'accueil CRM lorsque le
CRM est activé et que l'utilisateur possède un accès CRM autorisé.

#### Scenario: Authorized CRM user sees the suggestion

- **WHEN** a member with CRM access opens `/crm` and the CRM is enabled
- **THEN** Minaly SHALL show a compact suggestion explaining that the extension
  captures visible Instagram and LinkedIn profiles into CRM
- **AND** the suggestion SHALL provide an action to open the installation guide
- **AND** the suggestion SHALL not block KPI, actions or navigation

#### Scenario: User hides the suggestion

- **WHEN** the user chooses to hide the suggestion
- **THEN** Minaly SHALL hide it on that browser for the current CRM context
- **AND** the installation guide SHALL remain reachable from its direct route
- **AND** hiding the suggestion SHALL not change CRM data or extension access

#### Scenario: User is not eligible

- **WHEN** the CRM is disabled or the user has no CRM access
- **THEN** Minaly SHALL not display the extension suggestion
- **AND** the page SHALL keep the existing activation or access behavior

### Requirement: Short installation guide

Minaly SHALL provide `/crm/extension` as a dedicated guide for CRM users. The
guide SHALL not add a sixth CRM navigation tab.

#### Scenario: User opens the guide

- **WHEN** an authorized CRM user opens `/crm/extension`
- **THEN** the guide SHALL show the Chrome prerequisite, the installation
  action, the first Minaly connection step and a verification step on a social
  profile
- **AND** the guide SHALL explain that the extension reads only visible page
  data and does not send social messages
- **AND** the guide SHALL include a concise troubleshooting section

#### Scenario: User can skip or revisit setup

- **WHEN** the user leaves the guide before completing setup
- **THEN** Minaly SHALL let the user continue using the CRM
- **AND** the user SHALL be able to reopen the guide from `/crm/extension`

### Requirement: Distribution-aware installation action

The guide SHALL choose an installation action from the configured distribution
and SHALL never present an unavailable link as ready to use.

#### Scenario: Chrome Web Store is configured

- **WHEN** a valid Chrome Web Store URL is configured
- **THEN** the primary action SHALL open that URL
- **AND** the guide SHALL identify the Web Store as the recommended installation
  path

#### Scenario: Only a pilot package is available

- **WHEN** no Web Store URL is configured but a generated package URL is
  available
- **THEN** the guide SHALL offer the latest versioned pilot package
- **AND** the guide SHALL label the package as a manual or pilot installation
- **AND** the guide SHALL include the extra Chrome steps required to load it

#### Scenario: No distribution is configured

- **WHEN** neither a Web Store URL nor a package URL is available
- **THEN** the guide SHALL show that distribution is not configured yet
- **AND** it SHALL not render a dead download or installation link

### Requirement: Responsive and accessible setup surface

The suggestion and guide SHALL remain usable with keyboard navigation, narrow
viewports and reduced motion.

#### Scenario: Keyboard and assistive technology use

- **WHEN** a user navigates the suggestion or guide without a pointer
- **THEN** every action SHALL have a visible focus state and an accessible name
- **AND** asynchronous setup or release status SHALL be exposed as one contextual
  status message without moving focus

#### Scenario: Narrow viewport

- **WHEN** the guide is viewed at a 375 pixel viewport or in landscape mode
- **THEN** text and actions SHALL reflow without horizontal scrolling
- **AND** primary and secondary actions SHALL remain reachable with a touch-sized
  target

