## Purpose

Cette capacité garantit que chaque évolution de la capture Chrome est publiée
comme une version identifiable, testée et compatible avec le service CRM.

## ADDED Requirements

### Requirement: Monotonic extension release version

Every extension package containing this capability SHALL declare a valid Chrome
version strictly greater than the previous published version.

#### Scenario: Feature release package

- **WHEN** the multi-profile capture changes are packaged for distribution
- **THEN** the manifest, compiled runtime, and release metadata SHALL carry the
  same new version
- **AND** the package SHALL be available under a versioned filename

#### Scenario: Stale release rejected

- **WHEN** a package version is equal to or lower than the previous published
  version
- **THEN** the packaging process SHALL fail before producing a publishable
  release

### Requirement: Versioned and latest artifacts

The release SHALL provide a versioned archive and a latest alias whose contents
are identical, together with metadata that identifies the current version and
download paths.

#### Scenario: Release metadata served

- **WHEN** the extension checks for an update with a valid current version
- **THEN** the release response SHALL identify whether a newer version exists
- **AND** any update URL SHALL point only to an approved Minaly distribution
  location

#### Scenario: Package content is controlled

- **WHEN** a release archive is generated
- **THEN** it SHALL contain only the approved manifest, HTML callback, and
  compiled extension runtime files
- **AND** it SHALL include the new multi-profile behavior used by the release

### Requirement: Backend compatibility during rollout

The CRM endpoints SHALL remain compatible with the previous extension contract
long enough to publish and adopt the new extension version.

#### Scenario: Older extension during rollout

- **WHEN** an older extension sends a valid capture request after the backend
  deployment
- **THEN** the server SHALL return a supported response or a clear update-needed
  state
- **AND** it SHALL not corrupt, replace, or delete multi-profile data

#### Scenario: New extension release verification

- **WHEN** the new package is tested before publication
- **THEN** its manifest version, archive contents, update metadata, and CRM
  capture contract SHALL be checked automatically
