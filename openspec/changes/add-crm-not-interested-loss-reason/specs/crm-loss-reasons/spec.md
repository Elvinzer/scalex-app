## Purpose

Cette capacité définit les motifs de perte contrôlés d’un lead dans le CRM et l’ancien Pipeline, afin de distinguer un refus explicite sans ajouter une étape au funnel opérationnel.

## ADDED Requirements

### Requirement: Non-interested is a controlled loss reason

Le CRM SHALL expose « Non intéressé » comme motif sélectionnable lorsqu’un utilisateur marque un lead comme perdu. Le motif SHALL être persisté avec le résultat perdu sous le code stable `non_interesse`.

#### Scenario: CRM user marks a lead as not interested

- **WHEN** a CRM user opens the existing loss flow and selects « Non intéressé »
- **THEN** the lead SHALL keep its current pipeline stage
- **AND** its outcome SHALL become `lost`
- **AND** its lost reason SHALL become `non_interesse`
- **AND** the existing loss event and optional note behavior SHALL be preserved

#### Scenario: Legacy Pipeline user marks a lead as not interested

- **WHEN** a user marks a lead as `perdu` from the legacy-compatible Pipeline and selects « Non intéressé »
- **THEN** the shared lead record SHALL persist `non_interesse` as its lost reason
- **AND** the existing legacy stage history SHALL be recorded as for any other lost reason

### Requirement: Loss reason does not create a pipeline stage

Le système SHALL conserver exactement les cinq étapes opérationnelles CRM. `non_interesse` SHALL remain a reason attached to a lost outcome and SHALL NOT be accepted as a stage, a funnel milestone, or a new Kanban column.

#### Scenario: Pipeline renders its stages

- **WHEN** an authorized user opens the CRM Pipeline
- **THEN** the board SHALL render the existing five stages
- **AND** it SHALL not render a separate « Non intéressé » column

#### Scenario: Lost reason is used in KPI calculations

- **WHEN** the CRM KPI projection processes a lead whose lost reason is `non_interesse`
- **THEN** the lead SHALL follow the existing lost-outcome behavior
- **AND** the reason SHALL not create a new funnel denominator or conversion milestone

### Requirement: Both user-facing loss flows are localized

Le motif SHALL be available in both French and English in the CRM and legacy Pipeline namespaces. Neither flow SHALL render a raw translation key or reject the reason because the interface locale changed.

#### Scenario: French loss flow

- **WHEN** a user opens the loss reason selector with the French locale
- **THEN** the selector SHALL display « Non intéressé »

#### Scenario: English loss flow

- **WHEN** a user opens the loss reason selector with the English locale
- **THEN** the selector SHALL display the localized English equivalent of the reason

### Requirement: CRM imports normalize the new reason

Les imports CRM SHALL reconnaître le libellé français accentué, ses variantes sans accent et les variantes anglaises usuelles comme le même motif `non_interesse`. Une valeur inconnue SHALL remain invalid or require review rather than being silently mapped to another loss reason.

#### Scenario: Import contains a recognized variant

- **WHEN** an imported lost-reason value represents « Non intéressé » in a supported spelling or language
- **THEN** the prepared row SHALL contain `non_interesse`
- **AND** committing the row SHALL persist the same shared lost reason

#### Scenario: Import contains an unknown reason

- **WHEN** an imported lost-reason value is not recognized
- **THEN** the import review SHALL preserve the validation or review state
- **AND** it SHALL not classify the lead as `non_interesse` or as another existing reason

### Requirement: Existing lost-lead lifecycle remains unchanged

Ajouter ce motif SHALL not change the current lifecycle contract: a lost lead remains reopenable, and open actions SHALL not be automatically cancelled or hidden by this change.

#### Scenario: Lead with the new reason is reopened

- **WHEN** an authorized user reopens a lead whose lost reason is `non_interesse`
- **THEN** the existing reopen flow SHALL clear the active lost outcome as it does for other lost leads
- **AND** the lead SHALL return to an explicitly selected operational stage

#### Scenario: Lead has open actions when marked lost

- **WHEN** a lead with open CRM actions is marked lost with reason `non_interesse`
- **THEN** this change SHALL not create, cancel, or reschedule those actions
