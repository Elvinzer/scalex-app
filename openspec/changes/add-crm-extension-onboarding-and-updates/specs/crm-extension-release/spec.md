## Purpose

Cette capacité fournit une version identifiable de l'extension, un package
reproductible et un signal de mise à jour utilisable par l'application et par
l'extension Chrome.

## ADDED Requirements

### Requirement: Versioned extension package

The release process SHALL build a distributable package from the compiled
extension and SHALL identify it with the version declared in its manifest.

#### Scenario: Package is generated

- **WHEN** the extension package command runs after a successful extension build
- **THEN** it SHALL validate the manifest and compiled entry points
- **AND** it SHALL produce one versioned ZIP and one `latest` ZIP
- **AND** each ZIP SHALL contain only the manifest, callback page and compiled
  extension assets required at runtime

#### Scenario: Version was not incremented

- **WHEN** a release reuses a version that is not greater than the previous
  released version
- **THEN** the release process SHALL fail before publishing an artifact
- **AND** it SHALL explain that the manifest version must be increased

### Requirement: Release metadata is explicit

The system SHALL expose the latest extension version and the usable update URL
without exposing secrets or account data.

#### Scenario: Store distribution is available

- **WHEN** a client checks the release metadata with its current extension
  version and a valid Web Store URL is configured
- **THEN** the response SHALL include the latest version, the Web Store URL and
  whether the client version is older
- **AND** the Web Store URL SHALL be preferred over a pilot package URL

#### Scenario: Pilot package distribution is available

- **WHEN** no Web Store URL is configured but the latest package exists
- **THEN** the response SHALL include the latest version and the package URL
- **AND** it SHALL identify the distribution as manual or pilot

#### Scenario: Release metadata is unavailable

- **WHEN** no usable distribution is configured
- **THEN** the response SHALL identify the release as unavailable
- **AND** it SHALL not include a fabricated package or update link

### Requirement: Extension proposes available updates

The extension SHALL notify the user when Chrome has downloaded a newer version
or when the release metadata reports a newer version.

#### Scenario: Update is available from Chrome

- **WHEN** Chrome reports that a newer extension version is downloaded
- **THEN** the extension SHALL show an accessible non-blocking update notice
- **AND** it SHALL provide an action to apply the update
- **AND** it SHALL not interrupt a capture or update operation already in flight

#### Scenario: Update is available from release metadata

- **WHEN** the installed extension version is older than the latest release
- **THEN** the extension SHALL retain the update state until it is applied or
  the extension restarts
- **AND** the update action SHALL open the configured distribution when Chrome
  has not already downloaded the update

#### Scenario: Current version is up to date

- **WHEN** the installed version is equal to or newer than the latest release
- **THEN** the extension SHALL not show an update warning

### Requirement: Release update is safe to operate

The release flow SHALL keep the existing CRM API contract usable during normal
extension rollout and SHALL treat version information as UX metadata, not as an
authorization secret.

#### Scenario: Older extension calls the CRM

- **WHEN** an older but supported extension calls an existing CRM endpoint
- **THEN** the server SHALL keep applying the existing CRM session, account and
  permission checks
- **AND** version metadata SHALL not grant access or bypass validation

#### Scenario: Release is rolled back

- **WHEN** a release is rolled back or its distribution is disabled
- **THEN** existing CRM leads, sessions and capture routes SHALL remain intact
- **AND** the application SHALL stop presenting the disabled distribution as
  the latest installation path

