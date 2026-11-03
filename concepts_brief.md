# Multiple businesses under one Minaly login

* **Author:** Cédric Bernard
* **Date:** 2026-11-03
* **Status:** Research and six-lens Goldfish brainstorm review completed. Confirmed boundaries and unapproved recommendations are distinguished below. Implementation has not started.

## Overview

One person should be able to own several businesses and accept invitations to other businesses through the same Minaly login. They should be able to choose which business they are working in without signing out.

The requested example is a person who owns Club VIP Finance and creates or joins another business. Each additional business they create requires its own subscription. Minaly platform admins can create businesses without subscribing. Joining someone else's business is a separate operation from creating and funding a business.

The author confirmed that businesses share nothing and each is independent. A person's login can give them access to several businesses, but it does not connect those businesses' data, integrations, AI configuration or billing rights.

The author also confirmed that an expired subscription or failed payment blocks the affected business. Access is limited to the billing area needed to settle the amount due. A blocked business does not prevent the person from using other businesses where they still have access.

The main constraint is the existing data model: Minaly currently uses the owner's personal user ID as the business ID. Supporting several owned businesses requires a change to that model. A switcher alone cannot deliver the requested behavior.

## Analysis

### What the code already supports

This is a targeted reading of the main schema, account context, invitations, billing and quota code. It is not a full audit of every route, migration, integration or database policy. No live customer records or Stripe account settings were inspected.

| Area | Evidence in the repository | Consequence |
| --- | --- | --- |
| Identity and business | `db/schema.ts:103` stores personal preferences alongside business flags, the encrypted Anthropic key and Stripe customer references in `users`. `business_profile.user_id` is unique. | One person cannot currently own two independent business profiles. |
| Team membership | `team_members` has one row per account and email, invitation expiry, a linked user after acceptance, and roles through `team_member_roles`. | Existing invitation and permission concepts are reusable. |
| Active business | `lib/team/context.ts` picks the most recently joined active membership with `orderBy(joinedAt)` and `limit(1)`. With no membership, it uses the person's own user ID. | The main resolver provides no explicit choice between owned and joined businesses. Joining an account takes precedence over the person's own account for ordinary users. |
| Platform admins | `lib/admin.ts` reads `ADMIN_EMAILS`. `lib/team/context.ts` gives those people their own account with full permissions before resolving delegated access. | The current bypass does not provide a way to select another business. Platform privileges and business membership need separate rules. |
| Personal versus business context | `lib/current-user.ts` already separates the signed-in `userId`, resolved `accountId`, business owner's `user` row and personal `currentUser` row. | This distinction is useful, but the business still depends on an owner's user row. |
| Minaly subscriptions | `subscriptions.user_id` is unique. `lib/billing/stripe-subscription.ts` updates the subscription projection on conflict with that user ID. | Two independent subscriptions for one person would compete for one local subscription row. Removing the unique constraint alone would leave account resolution ambiguous. |
| Plan restrictions | `lib/billing/plan-gate.ts` checks the host account's active or trialing subscription and team feature. The checkout fallback catalog excludes team members from Solo. Existing plan rows may differ. | Joining another business can remain free for the invitee while the host business must have a plan that includes team access. |
| Invitations | `app/invite/[token]/actions.ts` checks the signed-in email against the invite, activates the membership and clears its token. Invitation creation uses a seven-day expiry. | Reuse the flow, with fresh checks of host entitlement and membership state at acceptance. Joining must not replace access to an existing business. |
| AI fallback | `lib/agent/quota.ts` stores monthly usage against `userId`; the configured cap is currently `null`, meaning unlimited. | Decide the business allowance explicitly. Moving to business billing must not accidentally multiply an assumed protection that does not exist today. |
| Database access | `db/index.ts` uses a shared server Postgres pool. Several schema policies call `native_booking_account_member(...)`. | Audit server authorization and database policies together. Merely changing a browser selection or a Supabase claim cannot establish isolation for all these access paths. |

### What comparable products do

Notion lets an email address create, join and switch workspaces. A paid plan applies to one workspace. It also advises using fewer workspaces when the need is only to organize work within one organization. [Notion workspace documentation](https://www.notion.com/help/create-delete-and-switch-workspaces), [Notion billing](https://www.notion.com/help/billing).

Linear likewise associates a paid plan with one workspace and bills for users within that workspace. This supports separating the login from the paid business, but it does not mean Minaly should adopt per-seat pricing. [Linear billing and plans](https://linear.app/docs/billing-and-plans).

These are examples of an established pattern, not evidence that every SaaS should use the same pricing. For Minaly, the proposed charging unit is the business. Existing plan limits still determine how many members it may have.

Stripe supports several independent subscriptions for one customer, each with its own billing period, invoice and charge. It also supports quantities within one subscription. Stripe itself does not require us to limit a person to one business. [Stripe subscription models](https://docs.stripe.com/billing/subscriptions/quantities#multiple-subscriptions).

### Working product recommendation

Keep one personal identity and give each business its own ID. The login owns personal preferences such as language, avatar and appearance. Each business owns its profile, members, permissions, subscription and operational data. Integration credentials and the business's AI configuration belong to that business. Decide how email language works when the owner and recipient use different languages.

| Situation | Recommended behavior | Main tradeoff |
| --- | --- | --- |
| Create an additional business | Collect its name, show the additional subscription and activate after the server confirms entitlement through Stripe. A pending checkout may reserve a draft, but cannot enable operations. | Separate subscriptions add purchase friction for owners with several businesses. |
| Join an existing business | Accept an invitation with the same login. The invitee needs no personal subscription. The destination business must permit team access and have room under its plan. | More members can increase support and AI usage; existing plan limits still matter. |
| Own A and work in B | Show both businesses, with the person's role in each. Permissions in B do not inherit ownership rights from A. | Every page and mutation needs a checked business context. |
| Platform admin creates a business | Grant that business an explicit internal billing exemption without a fake Stripe subscription. | Define what happens when admin status or business ownership changes. An admin merely joining a customer business must not make it free. |
| Subscription expires or payment fails | Block the affected business and expose only the billing recovery area. Keep existing owner-only billing permissions; ordinary members cannot open the product or gain billing rights. Other businesses remain accessible. | The owner must be able to settle payment without passing a product gate that redirects back to the blocked business. |
| Invitee leaves or loses access | Revoke access to that business while preserving their identity and access elsewhere. | Historical actions and sales attribution must retain the original actor. |

For the first release, keep one owner per business and reuse the current custom member roles. The owner controls billing, integrations, invitations and sensitive settings. Multiple equal owners and delegated billing administration can follow if there is a concrete need.

### Switching business

Put a business selector near the business name in the sidebar, separate from the personal profile menu. List each accessible business with its name and the user's role. Include creation and pending invitations. A business awaiting payment should show that state and route its owner to billing.

The current `components/app-sidebar.tsx` has a brand area above the main navigation and a personal profile popover below it. Recommend placing a compact business selector under the logo, with the current business name and a chevron. Its popover lists accessible businesses, marks the current selection, and provides creation and invitation actions. Preserve the existing navigation hierarchy and use the existing components and design tokens. The profile menu represents the signed-in person; it must not fall back to the business name in a way that makes the two controls indistinguishable.

On mobile, put the same selector in the navigation drawer and keep the current business identifiable in the header. Handle long names without pushing navigation controls off screen. Require keyboard access, visible focus and appropriate focus return when the popover closes. A full standalone mockup is not a prerequisite for this limited interface change. Recommend focused visual validation of the closed/open selector, the additional-business purchase flow and the blocked-business recovery state, using the running app on desktop and mobile when implementation begins. This is a UX recommendation; no prototype or runtime UI validation has been performed during the brainstorm.

Use the business ID in authenticated app URLs so each tab has an explicit context. A remembered last business is a navigation preference. The server still checks membership and permission for the business named by each request. This makes it possible to use A in one tab and B in another without a global cookie silently redirecting writes.

On a switch, check for unsaved work and open a permitted destination in the selected business. Do not carry a sale, lead, conversation or other resource ID from A into B. Any cache must include the business ID and, when content depends on permissions, the relevant user or access context.

This URL approach changes many routes. A cookie-only switcher would touch fewer URLs, but then every form, action and background request would still need an explicit target and stale-context checks. The route choice remains a design proposal until the wider route audit.

### Billing boundary

Recommend one independent Minaly subscription per business, allowing different plans and renewal dates. A quantity-based subscription for several businesses ties their billing together and makes individual cancellation less clear.

A Stripe customer per business is the initial preference when invoice identity, billing contact and payment management need to stay separate. Stripe also permits one payer customer with several business subscriptions. That alternative could suit a later consolidated billing offer, but requires careful portal access: a member of one business must never gain access to another business's invoices or subscriptions through a shared customer.

Keep Minaly's subscription billing separate from the client's Stripe Connect data source. Validate a business ID in checkout metadata and subscription synchronization. Repeated checkout attempts must not create duplicate active subscriptions for one business. A payment return URL alone never activates a business.

Do not silently change the existing first-business trial or grandfathered access during migration. Whether additional businesses receive a trial is an open commercial decision; the working recommendation is payment before operational activation for additional businesses.

The confirmed unpaid-state rule is billing-only access for a blocked business. Apply the restriction on the server to product pages, reads, mutations and AI requests, rather than hiding navigation links. Keep the business selector and personal sign-out available so the person can reach other businesses or leave the session. Retain owner-only billing access; an ordinary member sees the blocked state without financial details.

For the working hypothesis, block on effective subscription expiry or a confirmed failed subscription payment, without adding a grace period. Cancellation scheduled for the end of an already paid period takes effect at that period's end. If no amount is outstanding, the recovery area should offer renewal rather than invent a debt. Restore access only after server verification of the required payment and subscription entitlement.

User access suspension and provider event handling are separate decisions. A blanket pause could lose history or require a large replay system. The revised recommendation is to stop AI and outbound automation, preserve payment processing and the recovery path, and choose inbound handling per provider after checking replay and reconciliation capabilities. Retain minimum authenticated inbound data only where it is needed to avoid gaps, with explicit retention bounds and idempotent recovery. Keep stored business data intact. This operational policy remains unapproved.

### Isolation and operational boundaries

Each business must have its own leads, sales, analytics, AI conversations, integration connections, AI configuration and booking settings. No business inherits another business's credentials, plan, usage allowance or member permissions. Personal identity and preferences belong to the person rather than either business. The full inventory must identify fields that currently mix actor identity with business ownership.

Server authorization must check current membership, role and business entitlement before reading or writing. RLS policies must enforce the intended business boundaries on exposed database access. Supabase documents that policies run inside Postgres and that privileged roles can bypass them; the implementation must verify which database role the server pool actually uses. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Background jobs, OAuth callbacks, imports and webhooks must carry a stable business ID. They must not resolve their target from whichever business a person happens to be viewing. Cross-table references must reject, for example, a sale in A linked to a lead or role in B.

Connections must be configured separately for each business, without automatic credential reuse or data synchronization between businesses. A separate implementation question is whether to reject attempts to connect the same external Stripe account or channel twice, since the source could then supply duplicate data. Existing public booking URLs should retain their destinations through migration.

An internal billing exemption should be a recorded business entitlement with a reason and grant history. It must not imply general access to unrelated customer data. Track the actor and business for sensitive changes without recording credentials.

### Migration approach to investigate

1. Inventory account-scoped tables, actor fields, RLS helpers, caches, server routes, jobs, OAuth state, subscription metadata, referral attribution and public booking links.
2. Add independent businesses and memberships. Map each existing business owner account to one business; avoid creating empty businesses for invitation-only identities. Determine that from business records and entitlements, not current visible membership; preserve an existing owner business even if its owner currently works elsewhere. Report ambiguous mappings without deleting or silently reassigning records.
3. Add business references to operational data and billing, backfill them and verify counts and relationships. Keep personal preferences and actor references attached to users.
4. Migrate context resolution, permissions, integrations and billing to explicit business IDs. Preserve existing subscription IDs, prices, renewal dates and public links. If a compatibility layer is needed, set its removal conditions.
5. Enable switching and additional-business checkout only after isolation checks pass. Keep existing Stripe events compatible during the transition so retries cannot attach to the wrong business.

Use committed Drizzle migrations and the project's migration workflow. The shared dev and production database makes migration sequencing part of the design. No database change is proposed for execution during this brainstorm.

The main effort is migrating ownership assumptions across the product. The selector itself is a smaller part. A delivery estimate would be premature before the inventory.

## Goals vs. Non-Goals

Proposed first-release goals:

* Keep existing login methods and let one person own and join several businesses.
* Provide an explicit selector and permissions per business.
* Require a separate subscription for every additional active business, with explicit exemptions for businesses created by Minaly admins.
* Keep invitees covered by the destination business's team entitlement.
* Preserve current data, subscriptions, integrations and public links during migration.

Proposed exclusions:

* Consolidated dashboards or shared data across businesses.
* Agency bundles, volume discounts or consolidated invoices.
* Business hierarchies, SSO, shared integrations or automatic joining by email domain.
* Several equal owners, business merging and self-service ownership transfer in the first release.
* A new authentication provider or organization-management service.

Complete business independence, billing-only access after expiry or payment failure, and the existing role model applied independently to each business are confirmed. Remaining boundaries are recommendations for discussion, not accepted requirements.

## Alternatives Weighed

| Alternative | Assessment | Counterargument |
| --- | --- | --- |
| Separate login per business | Does not meet the requested single-login experience. | Keeps the current ownership model and costs less to build. It can remain a temporary workaround. |
| Switch among current owner accounts only | Could improve access to existing teams, but cannot let one real user own two independent businesses under the present schema. | Could be a smaller first delivery if owning several businesses is deferred. |
| Create hidden Supabase users for extra businesses | Do not pursue: it keeps business identity tied to artificial login identities and complicates auth lifecycle and ownership. | It avoids some immediate foreign-key changes, at the price of keeping the underlying coupling. |
| Independent business records and memberships | Preferred direction; it expresses the requested ownership and billing model directly. | Requires a broad migration and evidence that cross-business access is blocked. |
| One subscription with a business quantity | Defer: independent cancellation, plans and invoice identities are less straightforward. | Fewer payments and invoices may suit an agency offer later. |
| Third-party organization service | No identified need to add one while retaining Supabase Auth and existing team roles. | Reconsider if enterprise identity requirements become part of the product. |

The author has ruled out shared business resources. Shared integrations, pooled business allowances and consolidated business data are outside the requested model. The author has not yet chosen between the implementation alternatives above.

## Key Decisions & Staging for Next Steps

### Review findings

All six native Goldfish reviewers completed the same immutable input in BRAINSTORM mode. The deduplicated review found 0 concept Blockers, 12 Major concerns and 2 Nits. This supports the direction while leaving migration proof and product decisions before implementation. The review did not change product code or resolve any finding in code. Full status, source coverage and raw findings are in `docs/reviews/multi-business/round-1-report.md` and `round-1-raw.md`; `round-1-input.md` preserves the original brief exactly.

The confirmed requirements remain: one login can own and join several independent businesses and select one explicitly; additional created businesses have separate subscriptions except for Minaly platform admins; the existing single-owner and custom-member role model applies per business; expiry or failed payment blocks only that business except for owner billing recovery. Business independence covers data, configuration, integrations, permissions, AI usage and billing. It does not require dedicated infrastructure or a new availability commitment.

### Context and entitlement contract

The next design needs to distinguish signed-in identity, selected business, membership, role and entitlement. Recommend explicit business arguments at operational boundaries and separate outcomes for no selection, denied access, suspension and active access. Keep personal identity usable when no business is eligible. Reuse existing permission keys with one business entitlement policy rather than extending owner, member and admin bypasses independently.

This is more than reusing the existing subscription gate. `lib/team/context.ts:122-140` returns owner context without the delegated subscription check. `lib/current-user.ts:53-54` falls back to the personal user ID when context is null. The app layout separately blocks null context, so these are migration hazards for callers that do not independently deny access, not evidence of an existing frontend bypass. A denied or suspended selection must never silently resolve to another business. The policy contract must be settled before implementation; exact URL topology can remain open until the route inventory.

### Migration evidence and rollback

Recommend a durable map from legacy owner accounts to businesses, using existing records, credentials, subscriptions and entitlements. An active membership elsewhere can hide a person's existing owner account, so current visible membership cannot classify an identity as invitation-only. Preserve those owner businesses and report ambiguous cases without deletion or silent reassignment. Avoid creating empty businesses only after this evidence-based classification.

A migration reconciliation report should compare legacy-to-business relationships, operational ownership, subscription identities and public destinations for each account. Aggregate row counts are useful but insufficient. Inventory user cascades and cross-business references, verify exposed RLS policies and the server pool role, and define measurable rollout stop conditions.

Require compatible old/new writers or an explicit write stop during cutover. Assess locks and backfill load on the shared database. Define when rollback to the legacy application becomes unsafe: after new businesses have writes, disabling creation does not make old code able to represent them. Recovery after that point must preserve new businesses and their writes, potentially through a forward fix or a compatible prior deployment. Define evidence for removing compatibility paths before introducing them.

### Billing compatibility and recovery

Legacy subscriptions identify their owner through `metadata.userId`; one person will no longer identify one business. Recommend stable mappings from subscription and checkout identities to business IDs. Old checkout attempts and delayed events must resolve through those mappings, never through the current selection. Unknown or conflicting associations must fail closed, surface a recoverable exception and remain replay-safe after switching is enabled.

The targeted source review found that `app/api/webhooks/stripe-billing/route.ts:93-100` returns silently for non-success projection results, while the outer handler can mark the event processed at line 195. Intentional ignored events and actionable conflicts need distinct outcomes before projection state controls blocking. Recommend safe rejection categories, old/new entitlement state and cause, and a reconciliation path against authoritative Stripe state. This is an operational risk to address in the design, not a claim that a cross-business breach has occurred.

Keep cancellation at paid-period end distinct from effective expiry and failed payment. The exact Stripe event/state matrix, recovery sequencing and out-of-order handling must be designed before billing implementation. Proposed defaults remain: existing catalogue and prices per business, no new trial for additional businesses, existing trial/grandfathered access preserved, and one Stripe customer per business. The user has not approved those commercial and billing-identity choices.

### Identity and exemption lifecycle

User-linked cascade deletion can affect business profiles, subscriptions, roles and historical actor records. Separating business IDs alone does not settle deletion of a login or a sole owner. Recommend a first-release default that blocks ordinary sole-owner deletion while an owned business remains open and provides an administrative closure path. Other businesses' history and billing must survive removal or anonymization of an actor; design historical actor references separately from business ownership. This lifecycle decision needs approval before schema design. It does not require self-service ownership transfer.

For the admin exemption, recommend a recorded business entitlement while its owner remains a Minaly platform admin. If that status is removed, operational access requires a plan while the owner retains billing recovery. An admin joining a customer's business does not exempt it or acquire customer-data access. The exemption lifecycle remains an open product decision; ownership transfer remains outside the proposed first release.

### AI exposure and operational continuity

AI records should identify business, actor where applicable, request, key source, outcome and input/output tokens without storing credentials. Attribution and quota enforcement are separate concerns. `lib/agent/quota.ts:9` currently sets the shared-key cap to `null`; the feature must not assume a finite existing safeguard. Choose independent business allowances and concurrency before launch. Recommend a server-wide emergency shared-key spending control that pauses shared-key work when needed while eligible BYOK work continues. That safety control does not pool business allowances. Limits and amounts need a product decision.

Before implementing suspension, write a provider-specific matrix for acknowledgement, retained data, reconciliation, retry and replay. Keep the confirmed user-access block separate from this unapproved operating policy. Proposed default: stop AI and outbound automation, keep billing processing and preserve minimum inbound records when provider recovery cannot reconstruct them. Validate bounded storage and deduplication before adopting that default. Exact retention periods and same-provider-account connection rules remain open.

Use existing Inngest controls where possible for business-scoped concurrency and bounded batches, especially imports and recovery replay. Measure interference before considering a scheduler change. This is a proportionate safeguard for shared capacity, not a requirement for dedicated workers or infrastructure per business.

Carry stable business and connection IDs through job creation, retries and completion. Operational context should include the verified actor where relevant, correlation ID, operation and result or denial category. Show connection freshness and distinguish failed, deferred and entitlement-skipped work from successful inactivity. Never log credentials or submitted business payloads. The exact log schema and implementation belong in technical design.

### User-facing lifecycle

Recommend pending purchase, unsuccessful payment, active and blocked states with clear next actions. Resuming an existing checkout must be distinct from starting another recurring subscription, and the commitment must be clear before purchase. The server still prevents duplicate subscriptions and activates only after verified entitlement. Draft reservation remains a proposal.

A blocked member should see why the business is unavailable and a way to identify or contact its owner, alongside switching and sign-out. Financial details and billing access remain owner-only. A person with no other business must have a useful explanation rather than a broken product page.

Keep recognizable business identity visible during editing, sensitive confirmations and resumed tabs. Exercise two similarly named businesses: valid server targeting cannot prevent a person from acting in the wrong intended business. Exact layout and wording can wait until UI design. Business IDs in authenticated URLs remain the leading technical recommendation, subject to the route inventory; safe explicit targeting is the invariant.

### Staging

1. Before implementation, settle the context/entitlement contract, identity deletion rule, admin-exemption lifecycle, Stripe suspension/recovery matrix and provider suspension policy. Confirm commercial defaults such as trials and pricing. Preserve recommendations as unapproved until decided.
2. Before database cutover, complete the schema/route/RLS/job/integration inventory, legacy mapping and reconciliation, writer compatibility and rollback proof. Include legacy checkout/event replay and public destinations. Estimate only after that inventory.
3. Before enabling additional creation, prove isolation and entitlement acceptance scenarios, set shared-spend controls and verify purchase/recovery flows. Use existing Inngest safeguards for shared work. Record unresolved exceptions rather than silently migrating them.
4. During detailed design, choose route shape, visible selector states, safe telemetry fields and per-provider retention/replay mechanics. Keep self-service transfer, consolidated billing and a new organization service outside the proposed first release.

## Anchored working hypothesis

One login can own and join multiple independent businesses, select a business explicitly and keep each business's data, integrations, permissions, AI usage and subscription separate. Each additional business needs its own plan unless its owner is a Minaly admin; invitees are covered by the host business's team entitlement. The existing single-owner and custom-role model applies within each business. An expired subscription or failed payment blocks that business except for owner-only billing recovery, while the person's other businesses remain available.

Candidate acceptance scenarios for the later design:

* A person owns A, pays for B and can switch between them while retaining A's data and subscription.
* A starts with no access to B's data, credentials, conversations, roles or usage allowance, even when the same person owns both.
* The same person accepts an invitation to C without a personal purchase and receives only C's assigned permissions.
* Separate tabs in A and B write to their original business; switching cannot redirect an already open form.
* A removed member's next server request fails even if their browser still displays old content.
* Failed or repeated checkout cannot activate a business for free or create two subscriptions for it.
* Expiry or a failed subscription payment blocks B's product pages, data access, writes and AI requests. B's owner can access billing recovery, while an ordinary member cannot open billing or the product. A and C remain unaffected.
* A cancellation scheduled for the end of a paid period does not block B before that period ends. A successful browser return from checkout alone cannot unblock B.
* An admin can create a business without Stripe payment, while joining an ordinary customer business does not change that business's payment requirement.
* Existing subscription events, integration callbacks and public booking links resolve to the same business after migration.

The user authorized the six-lens review and it is complete. The next discussion should decide the outstanding product defaults and authorize the implementation design. No product code has changed.

Additional review-driven scenarios, proposed for that design:

* A person with an existing owner business and an active membership elsewhere retains both after migration; ambiguous historical mappings stop for review.
* A legacy checkout retry and out-of-order subscription events still resolve to the original business and cannot use the browser selection.
* A local projection conflict remains visible and recoverable after Stripe confirms payment; the business does not unblock from an unverified browser return.
* Deleting or anonymizing a member preserves unrelated business records and attribution; sole-owner deletion follows the approved lifecycle rule.
* A blocked member with no other business can identify the owner and sign out without seeing financial details.
* An interrupted checkout offers resume clearly, and similarly named businesses remain identifiable in old tabs and editing dialogs.
* One business's bounded replay cannot monopolize shared job capacity; shared-key usage is attributable by business and the platform spending safeguard does not pool business allowances.
