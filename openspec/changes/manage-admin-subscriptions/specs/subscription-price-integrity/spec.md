## Purpose

Garantir que le montant et le Price affichés pour un abonnement correspondent à ce qui est réellement souscrit dans Stripe, même après une évolution du catalogue Scale X.

## ADDED Requirements

### Requirement: Subscription retains its subscribed Price identity

The system SHALL retain the Stripe Price identity and subscribed monthly amount for each subscription projection whenever Stripe provides them, separately from the current catalog price of the referenced plan.

#### Scenario: New subscription is synchronized

- **WHEN** a newly created subscription is received from Stripe
- **THEN** the local projection stores the Price identity and amount attached to the subscription item in addition to the plan reference

#### Scenario: Catalog price changes

- **WHEN** an admin changes the monthly price of a plan and Stripe creates a new Price
- **THEN** existing subscription projections continue to display their stored subscribed amount and Price identity until Stripe reports an explicit subscription change

### Requirement: Catalog edits do not silently migrate subscribers

The system SHALL treat a new catalog Price as a checkout option for future subscriptions and SHALL NOT silently change the Price attached to existing Stripe subscriptions as a side effect of editing a plan.

#### Scenario: Existing subscriber remains on an archived Price

- **WHEN** the old Price is archived after a plan price edit
- **THEN** an existing subscriber remains represented by the old Price and the admin UI does not label the subscriber with the new catalog amount

### Requirement: Unknown historical amount is explicit

The system SHALL never use the current catalog amount as a silent substitute when the historical subscribed Price cannot yet be resolved. It SHALL display an explicit unknown or verification state and offer the safe resynchronization path.

#### Scenario: Legacy row lacks Price snapshot

- **WHEN** an existing subscription row predates the Price snapshot and has not been reconciled
- **THEN** the list and detail show that the subscribed amount is to be verified rather than displaying the current plan amount as fact

#### Scenario: Reconciliation fills the historical Price

- **WHEN** a successful Stripe resynchronization resolves the subscription item Price
- **THEN** the projection stores the identity and amount and the UI replaces the verification state with the exact subscribed value
