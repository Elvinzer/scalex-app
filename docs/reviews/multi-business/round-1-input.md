# Multiple businesses under one Minaly login

* **Author:** Cédric Bernard
* **Date:** 2026-11-03
* **Status:** Initial research and working recommendations. Product boundaries remain open. No Goldfish review or implementation has taken place.

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

Propose pausing business automation and scheduled integrations while the business is blocked, while preserving payment webhooks and the recovery path. Keep stored business data intact during the block. Exact handling of incoming integration events and the retention period still need design review; these details have not been approved by the author.

### Isolation and operational boundaries

Each business must have its own leads, sales, analytics, AI conversations, integration connections, AI configuration and booking settings. No business inherits another business's credentials, plan, usage allowance or member permissions. Personal identity and preferences belong to the person rather than either business. The full inventory must identify fields that currently mix actor identity with business ownership.

Server authorization must check current membership, role and business entitlement before reading or writing. RLS policies must enforce the intended business boundaries on exposed database access. Supabase documents that policies run inside Postgres and that privileged roles can bypass them; the implementation must verify which database role the server pool actually uses. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

Background jobs, OAuth callbacks, imports and webhooks must carry a stable business ID. They must not resolve their target from whichever business a person happens to be viewing. Cross-table references must reject, for example, a sale in A linked to a lead or role in B.

Connections must be configured separately for each business, without automatic credential reuse or data synchronization between businesses. A separate implementation question is whether to reject attempts to connect the same external Stripe account or channel twice, since the source could then supply duplicate data. Existing public booking URLs should retain their destinations through migration.

An internal billing exemption should be a recorded business entitlement with a reason and grant history. It must not imply general access to unrelated customer data. Track the actor and business for sensitive changes without recording credentials.

### Migration approach to investigate

1. Inventory account-scoped tables, actor fields, RLS helpers, caches, server routes, jobs, OAuth state, subscription metadata, referral attribution and public booking links.
2. Add independent businesses and memberships. Map each existing business owner account to one business; avoid creating empty businesses for every invited person's personal user row.
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

The user has stated five constraints: one login can create or join several businesses; switching should be easy; an additional created business requires an additional subscription except for Minaly admins; every business is independent and shares no business resources with the others; an expired subscription or failed payment blocks the business except for billing recovery.

Business independence, billing-only access after expiry or payment failure, and the existing role model applied per business are settled. The working hypothesis keeps one owner with access to sensitive settings and custom team roles for members. It requires a destination plan that permits team members, charges each additional business separately and grants explicit exemptions to businesses created by Minaly admins. Ownership transfer stays outside the proposed first release.

Remaining product choices and proposed defaults:

* **Admin exemption:** decide what happens if an admin loses admin status or transfers a business. Recommended default: tie the exemption to the business while its owner remains on the Minaly admin list; require a paid plan before a transfer to a non-admin owner completes. Admin membership in a customer business never exempts it.
* **Plan and price for another business:** recommend the existing plan catalogue and listed price per business, with member limits applied independently to each business. A Solo plan allows no team invitations, as it does now. Leave bundles and volume discounts for later.
* **Trials:** decide whether a second business gets its own trial. Recommended default: do not extend trials to additional businesses in the first release; preserve each existing business's current trial and subscription.
* **Recovery after a failed payment:** the business gate and owner-only recovery path are settled. Confirm Stripe's final invoice and subscription state server-side before restoring access. Show renewal when there is no outstanding invoice.
* **Usage and incoming events:** keep AI usage, integrations and background work scoped to one business. Decide how to handle provider events received during suspension and whether the same external account can be connected to multiple businesses. Recommended default: isolate connections and usage by business, keep payment events processing, and review other incoming events before implementation.
* **Technical scope:** inventory the app routes, data tables, RLS policies, jobs, integrations and public URLs before estimating or implementing the migration. Preserve existing records and subscription history.

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

The next discussion should refine this hypothesis. The EGM Goldfish review comes after the user explicitly confirms that the working boundaries are ready for review. No product code has changed.
