## 1. Price integrity and projection

- [x] 1.1 Extend `subscriptions` with nullable `stripePriceId` and `priceMonthlyCents`, plus the indexes needed for admin status/period queries; keep the migration additive and RLS-enabled.
- [x] 1.2 Update the billing input/projection types so the subscribed Price snapshot is validated and remains distinct from the current catalog price.
- [x] 1.3 Update checkout and subscription webhook handling to capture the first recurring subscription item Price, including subscription creation/update/deletion paths, without changing the account association.
- [x] 1.4 Add a safe reconciliation/backfill path for legacy rows and make the UI state explicit when the historical Price is still unknown.

## 2. Admin billing queries and operations

- [x] 2.1 Add account-centric server queries that left-join owners to optional subscriptions/plans, exclude team members as billing accounts, and support URL-backed search, filters, sorting and pagination.
- [x] 2.2 Add detail queries for subscription state, subscribed amount, entitlements, team-member count and native-booking usage with clear missing-data states.
- [x] 2.3 Add admin-only actions for platform Stripe context links, ephemeral Billing Portal links and idempotent subscription resynchronization; validate every input with Zod and preserve existing projection data on failure.
- [x] 2.4 Add explicit status/amount formatting helpers for all current Stripe states, scheduled cancellation and the `À vérifier` Price state without relying on color alone.

## 3. Founders admin UI

- [x] 3.1 Add clear links from `/admin` to subscriptions and plans while retaining the separate referrals entry point.
- [x] 3.2 Build `/admin/subscriptions` with current-state KPIs, URL-persisted controls, accessible table headers, empty states and a responsive mobile card representation.
- [x] 3.3 Build `/admin/subscriptions/[accountId]` with account identity, subscription summary, entitlements, usage, synchronization metadata and safe Stripe/portal/resync actions.
- [x] 3.4 Add pending, success and actionable error feedback for all asynchronous actions, prevent duplicate submissions, and keep destructive financial actions absent from V1.
- [x] 3.5 Apply Scale X semantic tokens and Button variants, with one corail priority CTA per screen and violet reserved for analytics/context actions.

## 4. Verification and delivery

- [x] 4.1 Verify admin authorization independently for every page and Server Action, including non-founder, unauthenticated, missing-customer and Stripe-mismatch paths.
- [x] 4.2 Apply the Drizzle migration with `db:push` after reviewing the schema/RLS diff and confirm existing checkout, webhook idempotency and plan-gating behavior remain intact.
- [x] 4.3 Run the agent-browser matrix on desktop, 375 px and an intermediate viewport: list, search/filter, empty state, detail, portal-link error, resync success/error and keyboard focus order.
- [x] 4.4 Run `npm run typecheck`, `npm run lint`, inspect the final diff for secrets and confirm the production/preview build has no route or environment regression.

> QA note: the development database had no Stripe subscription fixture, so the browser run exercised the safe no-subscription/resync guard rather than creating an external test payment. Vitest covers the Price parser, successful projection upsert, account/plan mismatch guards and unknown historical amounts; 99 tests pass. Production build validation and the agent-browser responsive/accessibility matrix passed.
