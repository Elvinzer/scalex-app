## Purpose

Permettre aux fondateurs de diagnostiquer et de réconcilier un abonnement depuis Minaly tout en laissant les mutations financières sensibles à Stripe et en protégeant strictement les données clients.

## ADDED Requirements

### Requirement: Safe Stripe context links

The system SHALL allow an authorized founder to open the relevant Stripe customer or subscription context when the corresponding identifier is known, and SHALL use the platform Stripe account rather than any customer Stripe Connect account.

#### Scenario: Stripe identifiers are available

- **WHEN** an admin opens an account detail with a known Stripe customer or subscription identifier
- **THEN** the page offers a clearly labeled link to the matching platform Stripe context

#### Scenario: Stripe identifier is missing

- **WHEN** an account has no usable Stripe identifier
- **THEN** the page does not fabricate a URL and explains that the Stripe context is unavailable

### Requirement: Customer Billing Portal link

The system SHALL allow an authorized founder to generate a short-lived Stripe Billing Portal session for the account's platform customer, SHALL return the ephemeral URL only to the authenticated admin interaction, and SHALL never persist or log that URL or payment data.

#### Scenario: Customer can access the portal

- **WHEN** an admin requests a portal link for an account with a known platform Stripe customer
- **THEN** the system generates a session with a return path to the account billing page and presents the resulting link with clear expiry-oriented copy

#### Scenario: Customer is not connected to platform billing

- **WHEN** an admin requests a portal link for an account without a platform Stripe customer
- **THEN** the system returns an actionable error and does not call the portal API with an empty or unrelated customer identifier

### Requirement: Idempotent subscription resynchronization

The system SHALL provide an admin-only resynchronization action that reads the platform Stripe subscription, validates the relevant external fields, and upserts the local projection without creating duplicate subscription rows or changing the account association.

#### Scenario: Resynchronization succeeds

- **WHEN** an admin resynchronizes a subscription whose Stripe metadata identifies the same account and plan
- **THEN** the local projection is updated with the latest status, Price identity, period dates and cancellation state, and the UI confirms the synchronization

#### Scenario: Stripe data cannot be trusted for this account

- **WHEN** the Stripe subscription is missing, has invalid metadata, or resolves to a different account or plan
- **THEN** the system leaves the existing local projection unchanged, reports an actionable error and does not reassign the subscription

#### Scenario: Resynchronization is repeated

- **WHEN** an admin repeats the same resynchronization after a successful run
- **THEN** the resulting local state is equivalent and no duplicate record or side effect is created

### Requirement: Financial mutation boundary

The V1 admin surface SHALL NOT expose direct Minaly actions for refunds, immediate cancellation, forced plan changes, payment-method editing, impersonation or arbitrary local subscription edits. It SHALL direct those workflows to the platform Stripe context when needed.

#### Scenario: Admin reviews a destructive workflow

- **WHEN** an admin views an account detail
- **THEN** no direct destructive financial control is presented as a local Minaly mutation

#### Scenario: Admin uses a supported operational action

- **WHEN** an admin selects a supported context, portal or resynchronization action
- **THEN** the action is independently authorized, validated and provides explicit pending and failure feedback
