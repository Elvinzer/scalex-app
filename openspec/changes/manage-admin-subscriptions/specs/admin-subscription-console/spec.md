## Purpose

Donner aux fondateurs Scale X une vue opérationnelle fiable de chaque compte client, de son abonnement, de ses droits et de son usage sans devoir parcourir Stripe ou les réglages d'un compte.

## ADDED Requirements

### Requirement: Admin-only subscription inventory

The system SHALL expose a subscription inventory under the founders-only admin area and SHALL authorize both page reads and mutations independently with the existing platform-admin policy.

#### Scenario: Founder opens the inventory

- **WHEN** an authenticated founder opens `/admin/subscriptions`
- **THEN** the system displays the account inventory and the current subscription projection for each account owner

#### Scenario: Non-founder requests the inventory

- **WHEN** an unauthenticated user or a non-founder requests the inventory or a related admin action
- **THEN** the system refuses access without exposing subscription or customer data

### Requirement: Account-centric subscription list

The system SHALL list account owners, including accounts with no subscription, and SHALL never present a team member as an independent billing account. Each row SHALL expose the account identity, subscription state, plan, displayed subscribed amount or an explicit unknown state, current-period end, cancellation-at-period-end state, and a link to the account detail.

#### Scenario: Account has no subscription

- **WHEN** an account owner has no local subscription row
- **THEN** the inventory shows an explicit `Sans abonnement` state and does not infer a plan or amount from the active catalog

#### Scenario: Subscription has a scheduled cancellation

- **WHEN** a subscription is active but `cancelAtPeriodEnd` is true
- **THEN** the row shows that access is scheduled to end at the current-period end in addition to the active status

### Requirement: Search, filtering, sorting and pagination

The system SHALL support server-side search by account email, display name and known Stripe identifiers, filtering by subscription status, plan and cancellation state, deterministic sorting, and pagination. Filters and the current page SHALL be represented in the URL so that an admin can refresh or share the current view without losing context.

#### Scenario: Admin searches a customer

- **WHEN** an admin submits a search term matching an account email or Stripe customer identifier
- **THEN** only matching account rows are returned and the active search is visible in the controls

#### Scenario: Filter produces no results

- **WHEN** the selected filters match no account
- **THEN** the system shows a meaningful empty state with a way to clear filters instead of an empty table with no explanation

### Requirement: Subscription account detail

The system SHALL provide a detail view containing the account identity, local subscription identifiers, Stripe customer and subscription references, status, subscribed Price identity, billing period, cancellation state, plan entitlements, team-member count and native-booking usage when available.

#### Scenario: Account has an active subscription

- **WHEN** an admin opens the detail for an account with an active or trialing subscription
- **THEN** the page shows the subscription state, exact subscribed amount when known, period dates, entitlements and usage against relevant limits

#### Scenario: Account projection is incomplete

- **WHEN** the account has a subscription row but its subscribed Price or usage cannot be resolved
- **THEN** the page labels the missing value explicitly, preserves the rest of the projection and points to the safe resynchronization action

### Requirement: Responsive and accessible admin feedback

The system SHALL remain usable at small viewport widths, SHALL provide a card or equivalent readable representation when the desktop table cannot fit, SHALL use visible labels and text alongside status color, and SHALL announce loading, success and error states for asynchronous admin actions.

#### Scenario: Admin reviews the page on a small viewport

- **WHEN** the inventory is viewed at a mobile viewport
- **THEN** account identity, status, plan and primary action remain readable without requiring essential horizontal scrolling

#### Scenario: Admin triggers an asynchronous action

- **WHEN** a resynchronization or portal-link action is pending, succeeds or fails
- **THEN** the initiating control shows the corresponding pending, success or actionable error state and prevents duplicate submission while pending

### Requirement: Admin billing navigation

The system SHALL provide explicit navigation from the founders dashboard to the subscription inventory and the plan catalog, while preserving the existing separate entry point for referral management.

#### Scenario: Founder enters the admin area

- **WHEN** a founder opens `/admin`
- **THEN** the dashboard exposes clear links to subscriptions, plans and referrals
