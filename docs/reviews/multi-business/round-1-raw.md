# Round 1 raw reviewer reports

Mode: BRAINSTORM. All reviewers received the immutable `round-1-input.md`, their bundled persona and no parent transcript. Native task IDs and final statuses are recorded with each verbatim report. Instruction-file exclusion is unverified; `fork_turns: none` establishes fresh conversation context only.

## egm-design

Native task ID: `/root/multibusiness_synthesizer/egm_design`
Status: completed

```text
No concept-level blocker found. The independent-business model is coherent. These are safeguards to carry into the next design stage, not claims that the brainstorm must already contain an implementation.

1. **Major — Cost, Quota & Token Economics**
   **Source scope:** “AI fallback,” “Isolation and operational boundaries,” and “Admin exemption.”
   The target reports an unlimited shared-key allowance today. More businesses can multiply concurrent AI work, scheduled briefs and shared-key exposure, particularly for admins who can create businesses without subscribing. Independent usage accounting alone does not bound that exposure.
   **Required mitigation:** Before enabling creation, define business-level usage attribution, concurrency limits and a server-wide shared-key spending safeguard. Keep any anti-abuse limits on the creator distinct from business allowances, so the safeguard does not pool otherwise independent businesses.
   **Status:** Independence and admin exemptions are confirmed; limits and allowance amounts remain recommendations requiring a product decision.

2. **Major — Cost, Quota & Token Economics**
   **Source scope:** “Billing boundary,” especially the proposed automation pause and undecided incoming-event handling.
   Blocking a business creates an operational tradeoff: discarding provider events can leave permanent gaps after payment, while retaining unlimited events or replaying everything immediately can create storage growth, provider-rate-limit pressure and processing spikes.
   **Required mitigation:** Choose a bounded suspension policy for each integration: what is acknowledged, retained, discarded or reconciled from the provider after recovery. Recovery needs deduplication, bounded replay and observable failure handling.
   **Status:** Product blocking is confirmed. Pausing automation, retention and replay behavior are unapproved proposals.

3. **Major — Architecture and database load**
   **Source scope:** “Migration approach to investigate” and “What the code already supports.”
   Moving identity, subscriptions and operational ownership away from the owner’s user ID affects both live requests and delayed callbacks. A long period with competing old and new context rules increases query complexity and the chance that a retried job resolves to a different business.
   **Required mitigation:** Make the inventory produce a cutover contract: authoritative business identity during each phase, compatibility rules for outstanding events, measurable backfill invariants, and conditions for removing compatibility logic. Assess locking and backfill load before applying migrations to the shared database.
   **Status:** The coupling and shared database are documented facts. The migration sequence remains a proposal; no specific migration mechanism is mandated here.

4. **Major — Resource allocation and failure isolation**
   **Source scope:** “Background jobs, OAuth callbacks, imports and webhooks” and the independent-business hypothesis.
   Separate data and subscriptions do not provide operational independence by themselves. A large import, webhook burst or recovery replay from one business can occupy shared workers, provider quotas or database connections and delay other paying businesses.
   **Required mitigation:** Include per-business concurrency and bounded batches in the job design, with fair scheduling or equivalent protection against one business monopolizing shared capacity. Carry business identity through operational metrics so interference can be detected.
   **Status:** Business independence is confirmed. Specific scheduling mechanisms and capacity targets remain technical recommendations.

Files read in full:

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.0/agents/design_critic.md`
- `/Users/cedricbernard/Documents/Pro/scale x/scaleXapp/docs/reviews/multi-business/round-1-input.md`

Unread required files: none. Cited implementation files were not inspected; repository statements above are attributed to the target document.
```

## egm-codebase-details

Native task ID: `/root/multibusiness_synthesizer/egm_codebase_details`
Status: completed

```text
No Blocker found in the concept’s observability dimension. The following are Major requirements for the later design, rather than evidence that the requested feature needs a different architecture.

1. **Major — Observability & Operational SRE Debuggability: actor and business cannot remain interchangeable in telemetry.**

   **Source scope:** `docs/reviews/multi-business/round-1-input.md`, “Switching business” and “Isolation and operational boundaries”; `lib/team/context.ts`; `lib/current-user.ts`; `lib/analytics.ts`; `lib/perf/database-retry.ts`.

   **Evidence and operational risk:** The source already distinguishes signed-in `userId` from resolved `accountId`. However, `track()` accepts a generic `distinctId` and optional untyped properties, while database retry warnings contain only operation, code and attempt. After the identity split, “user X had an error” will not identify the affected business, delegated role, or request. Diagnosing a stale-tab write or an unexpected denial would be difficult.

   **Required mitigation:** Define a common safe operation context containing actor ID when applicable, business ID, request or correlation ID, operation and result/reason. Carry it from the server’s verified context through consequential operations and downstream work. Record business selection and authorization denials sufficiently to identify requested business and denial category, without credentials or submitted business content. The draft already requires actor/business auditing for sensitive changes; this recommendation makes that requirement operationally usable. It does not prescribe a telemetry vendor.

2. **Major — Observability & Operational SRE Debuggability: subscription projection and recovery need distinguishable outcomes.**

   **Source scope:** Draft “Billing boundary” and candidate failed-payment/recovery scenarios; `lib/billing/stripe-subscription.ts`; `app/api/webhooks/stripe-billing/route.ts`.

   **Evidence and operational risk:** Projection synchronization distinguishes `invalid`, `mismatch`, `conflict` and `plan_missing`. The webhook’s `upsertFromSubscription()` silently returns on all non-success results, after which the outer handler can mark the Stripe event processed. Unrelated subscriptions intentionally ignored and actionable local projection conflicts therefore have no distinguishable operational outcome in this inspected path. The proposed blocking rule makes “paid but still blocked” a critical support case.

   **Required mitigation:** Preserve intentional ignores, but record actionable synchronization rejection categories with Stripe event/subscription ID and resolved business ID when known. Record entitlement transitions with previous/new state and cause, and provide a safe way to compare local entitlement against authoritative subscription/payment state. Define how failed projection application is detected and recovered before relying on it to block/unblock businesses. Recovery must follow the confirmed billing-only rule; detailed subscription state mapping remains a later design decision.

3. **Major — Observability & Operational SRE Debuggability: asynchronous work needs business-specific lineage and suspension visibility.**

   **Source scope:** Draft “Isolation and operational boundaries” and “Usage and incoming events”; `lib/inngest/client.ts`; `lib/inngest/functions/sync-stripe-account.ts`; `lib/inngest/functions/sync-iclosed-account.ts`; `lib/inngest/functions/refresh-stripe-accounts.ts`.

   **Evidence and operational risk:** Current integration event payloads and concurrency keys commonly use `userId`. Existing jobs have useful named steps, connection lifecycle state and success/failure events, but those currently inherit the owner-as-account convention. A future incident must distinguish B’s failed integration from A’s healthy integration for the same login. If suspension pauses work, skipped work could otherwise resemble a healthy system with no recent activity.

   **Required mitigation:** Carry stable business and connection IDs through event creation, execution, retry, completion and revalidation; retain provider event/job-run correlation. Define visible outcomes for completed, failed, skipped due to entitlement and deliberately deferred work, plus last-success/freshness information per connection. If pause/resume is adopted, specify how operators identify outstanding work and safe resumption. **Pausing integrations and treatment of incoming events are explicitly unapproved recommendations in the draft; their telemetry should follow the eventual decision.**

4. **Major — Observability & Operational SRE Debuggability: migration preservation needs a reconciliation artifact.**

   **Source scope:** Draft “Migration approach to investigate,” particularly mapping existing owners, backfill verification and preservation of subscription/public link destinations; current coupling confirmed in `lib/team/context.ts` and `lib/billing/stripe-subscription.ts`.

   **Operational risk:** The draft correctly calls for counts and relationship verification, but aggregate counts alone cannot identify an old account mapped to the wrong business or demonstrate that an old webhook retry still resolves correctly. Those failures could appear later as unrelated billing, integration or access incidents.

   **Required mitigation:** Require a migration reconciliation report keyed by legacy account and new business identity, covering orphan/multiple mappings, operational ownership, subscription mappings and preserved external/public destinations. Define detectable rollout failure conditions and the compatibility layer’s removal evidence. This operationalizes the draft’s proposed migration approach; it does not approve or prescribe a particular migration implementation.

5. **Major — Observability & Operational SRE Debuggability: independent AI usage needs attributable consumption.**

   **Source scope:** Draft AI fallback, isolation and usage sections; `lib/agent/client.ts`; `lib/agent/quota.ts`.

   **Evidence and operational risk:** Shared-key request counting currently uses `userId` plus month; BYOK calls bypass that counter, and the configured shared cap is `null`. Once a person operates several businesses, a person-level counter cannot explain which business consumed shared capacity or which business’s key was selected.

   **Required mitigation:** Require AI usage records to identify business, actor when applicable, request, key source, outcome and input/output tokens without recording keys. Keep quota enforcement and usage attribution separate. The business allowance/cap remains a product decision; this finding does not introduce a finite cap.

**Files actually read in full:** Persona `agents/codebase_details.md`; immutable review input; `lib/team/context.ts`; `lib/current-user.ts`; `lib/analytics.ts`; `lib/perf/database-retry.ts`; `lib/agent/client.ts`; `lib/agent/quota.ts`; `lib/billing/stripe-subscription.ts`; `app/api/webhooks/stripe-billing/route.ts`; `lib/inngest/client.ts`; `lib/inngest/functions/sync-stripe-account.ts`; `lib/inngest/functions/sync-iclosed-account.ts`; `lib/inngest/functions/refresh-stripe-accounts.ts`.

**Required unread files for later verification:** `db/schema.ts` and migration/policy files for actual audit/usage storage; `app/api/billing/checkout/route.ts` and billing recovery/portal handlers for purchase correlation; remaining integration jobs, OAuth callbacks and webhook receivers for lineage completeness; actual AI invocation handlers and usage persistence for token attribution. Their coverage is not established by this targeted read. No database access, tests, mutations or secret inspection performed.
```

## egm-zoom-out

Native task ID: `/root/multibusiness_synthesizer/egm_zoom_out`
Status: completed

```text
Zoom Out Brainstormer

No Blocker found at concept stage. Separating personal identity from business identity is justified by the confirmed requirement to own several independent businesses. A switcher alone cannot meet it. Existing Supabase identity, invitations and custom permissions provide a useful foundation; no organization service is justified by the stated scope.

1. **Major — Treat billing enforcement as a distinct change within the migration**
   
   **Dimension:** Contrarian / YAGNI & Code Minimization.  
   **Source scope:** “Billing boundary,” “Migration approach to investigate”; `lib/team/context.ts`, `lib/billing/plan-gate.ts`, `lib/current-user.ts`.
   
   **Risk:** The requested billing-only suspension rule changes current behavior beyond adding multiple businesses. Current context resolution explicitly never blocks owners; subscription checks chiefly gate delegated access or individual features. Also, `getCurrentUser()` falls back to the personal user ID when context is null. Reusing that behavior for a suspended business would mix “no eligible business” with “use the person's own account,” undermining both recovery navigation and isolation.
   
   **Required mitigation:** Carry forward one explicit distinction between personal identity, selected business, membership and business entitlement. Treat owner suspension and billing recovery as their own design workstream, with neither denied membership nor suspension falling back to another business. Reuse existing permission keys and guards behind that boundary rather than creating a parallel permission system. This implements a confirmed user constraint, not a new commercial recommendation.

2. **Major — Resolve suspension’s operational meaning before committing to event pausing**
   
   **Dimension:** Contrarian / YAGNI & Code Minimization.  
   **Source scope:** “Billing boundary,” “Isolation and operational boundaries,” “Usage and incoming events.”
   
   **Risk:** Billing-only user access is confirmed; pausing scheduled integrations, automation and incoming operational events is not. Treating the proposed pause as implied by “blocked” introduces provider-specific interruption, replay and reconciliation behavior. That could turn a tenant migration into an integration lifecycle project and leave recovered businesses with missing sales or analytics.
   
   **Required mitigation:** Present user access suspension and provider event handling as separate decisions. Before choosing a pause strategy, inventory existing ingestion and replay capabilities and select the smallest behavior that preserves the approved access restriction and existing data guarantees. Do not describe pausing all business work as accepted scope. The document correctly identifies this as unresolved; it should remain a prerequisite for implementation design rather than an implicit default.

3. **Nit — Keep route topology as a proposal until the inventory establishes its cost**
   
   **Dimension:** Contrarian / YAGNI & Code Minimization.  
   **Source scope:** “Switching business”; `lib/team/context.ts`, `lib/current-user.ts`.
   
   **Risk:** Business IDs in URLs are a coherent way to preserve tab context, but the confirmed outcome is correct targeting across tabs, not a particular URL format. Turning the recommendation into a requirement prematurely could force unrelated navigation and public-link changes.
   
   **Required mitigation:** Preserve explicit request targeting as the invariant, then compare the route proposal against the existing route/action inventory. Reuse `getDefaultAppRoute`, the identity/account distinction and existing permission helpers where practical. The document already acknowledges the choice is provisional; retain that qualification in subsequent artifacts.

4. **Nit — Avoid building lifecycle features solely to support exemption edge cases**
   
   **Dimension:** Contrarian / YAGNI & Code Minimization.  
   **Source scope:** “Working product recommendation,” “Admin exemption,” “Proposed exclusions.”
   
   **Risk:** The recommendation discusses payment before ownership transfer while self-service ownership transfer is excluded. This can accidentally pull transfer flows, delegated billing and exemption administration into the initial release.
   
   **Required mitigation:** Define the narrow rule needed when an existing owner loses platform admin status. Keep transfer implementation excluded unless separately approved. A recorded business exemption is reasonable; it does not require a general entitlement administration product.

**Actual files read**

- Entire persona: `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.0/agents/zoom_out.md`
- Entire immutable target: `docs/reviews/multi-business/round-1-input.md`
- Entire `lib/team/context.ts`
- Entire `lib/current-user.ts`
- Entire `lib/billing/plan-gate.ts`
- Entire `lib/billing/stripe-subscription.ts`
- Entire `lib/agent/quota.ts`
- Entire `lib/team/permissions.ts`
- Entire `app/invite/[token]/actions.ts`
- Targeted sections and symbol search in `db/schema.ts`: users, business profile, team membership/roles, subscriptions and policy helper references.

**Required unread evidence before implementation design**

- `app/(app)/layout.tsx`: current owner gate and recovery routing.
- `app/api/webhooks/stripe-billing/route.ts`: payment-failure projection and migration compatibility.
- `lib/team/queries.ts`: invitation availability and acceptance assumptions.
- `lib/inngest/functions/weekly-brief-email.ts`: one concrete scheduled-work suspension surface.
- The migration SQL defining `public.native_booking_account_member`, plus the complete account-scoped route/job/integration inventory. Those files were not located or audited in this focused concept review.

No edits, database access, tests or secret inspection performed.
```

## egm-comprehension

Native task ID: `/root/multibusiness_synthesizer/egm_comprehension`
Status: completed

```text
No Blocker found. The concept is understandable: one personal login accesses independently funded businesses, with permissions and operational context chosen per business. The following are concept-stage ergonomics gaps, not approved implementation requirements.

1. **Major — UX & Developer Ergonomics**  
   **Source scope:** “Switching business”; “Working product recommendation,” subscription failure row.  
   **Usability friction:** An ordinary member of a blocked business cannot use the product or billing. The document preserves switching and sign-out, but does not describe a useful recovery action for someone with no other business. That person could face a dead end without knowing who can restore access.  
   **Concrete risk:** Members repeatedly retry inaccessible pages or mistake a business billing problem for a problem with their own login.  
   **Required mitigation for the later brief:** Define the blocked-member experience with a plain explanation, an appropriate way to identify or contact the responsible owner, and access to switching/sign-out. Do not disclose financial details or grant billing rights. The block is confirmed; this recovery guidance is a recommendation.

2. **Major — UX & Developer Ergonomics**  
   **Source scope:** “Switching business”; “Anchored working hypothesis,” separate-tab scenario.  
   **Usability friction:** Explicit URLs keep requests attached to the correct business, but users still need to recognize which business an existing tab or form belongs to. A selector alone may disappear from view during dialogs or focused workflows.  
   **Concrete risk:** A person submits a valid change to the wrong business because several independent businesses have similar screens, names or records. Server isolation would correctly execute that mistaken intention.  
   **Required mitigation for the later brief:** Require recognizable business context throughout editing and sensitive actions, including after navigating back or resuming an old tab. Exercise this with two similarly named businesses. Easy switching and independence are confirmed; the URL approach and presentation are recommendations.

3. **Major — UX & Developer Ergonomics**  
   **Source scope:** “Working product recommendation,” additional-business creation; “Billing boundary”; pending checkout draft proposal.  
   **Usability friction:** Creation, unpaid drafts, pending invitations and active businesses may all appear in one selector, but the lifecycle users navigate remains unspecified. “Create another business” could mean resume a previous purchase or begin another subscription.  
   **Concrete risk:** An interrupted checkout leaves users unsure whether they bought a business, whether they can retry safely, or whether selecting creation again adds another recurring charge. Preventing duplicate subscriptions internally does not resolve that uncertainty.  
   **Required mitigation for the later brief:** Define clear visible states and next actions for purchase pending, payment unsuccessful, active and blocked businesses. Make resuming an existing purchase distinguishable from creating another business, and state the recurring commitment before confirmation. Separate payment for additional businesses is confirmed; draft reservation and trial policy remain proposals.

**Files read in full:**

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.0/agents/comprehension.md`
- `/Users/cedricbernard/Documents/Pro/scale x/scaleXapp/docs/reviews/multi-business/round-1-input.md`

**Required files unread:** None. No cited repository source was inspected; findings concern the supplied concept’s UX and cognitive overhead.
```

## egm-implementation-readiness

Native task ID: `/root/multibusiness_synthesizer/egm_implementation_readiness`
Status: completed

```text
No Blocker at concept stage. The independent-business direction is compatible with the confirmed user constraints, provided migration safety becomes an explicit requirement before implementation.

1. **Major — Migration & Backward Compatibility**
   **Scope:** “Migration approach to investigate,” steps 3–5; `package.json` deployment scripts; `lib/team/context.ts`.
   **Compatibility hazard:** The brief sequences backfill, context migration and feature activation but does not establish rollback boundaries. Existing code assumes `accountId === owner userId`; once a second business exists, an older deployment cannot represent it. The shared database and deployment-time migrations also allow old code to run against expanded schema.
   **Required mitigation:** Require a staged, backward-compatible migration and an explicit point after which rolling back to the legacy application is unsafe. Before activation, old and new writers must remain compatible or writes must be deliberately stopped during cutover. After activation, rollback must preserve new businesses and their writes; disabling creation alone cannot make legacy code safe. Exact sequencing belongs in the later design.

2. **Major — Migration & Backward Compatibility**
   **Scope:** “Migration approach to investigate,” step 2; `lib/team/context.ts` account-resolution fallback; inspected portions of `db/schema.ts`.
   **Compatibility hazard:** “Avoid creating empty businesses for every invited person's personal user row” needs a preservation rule. The current resolver treats any person without active membership as an owner, while an active membership can hide their own account. Therefore, current membership status or current visible account cannot reliably distinguish an invitation-only identity from a person with an existing business. An incorrect classification can strand historical records, credentials or subscriptions.
   **Required mitigation:** Require an evidence-based owner-to-business mapping that considers existing business data and entitlements independently of current membership. Preserve an existing owner business even when its owner currently works in another business. Ambiguous records must be reported and resolved without deletion or silent reassignment. This supports the confirmed independence requirement; it does not require granting an additional free subscription.

3. **Major — Migration & Backward Compatibility**
   **Scope:** “Billing boundary”; migration step 5; `lib/billing/stripe-subscription.ts`, especially required `metadata.userId` and conflict updates keyed by `subscriptions.userId`.
   **Compatibility hazard:** Retaining subscription IDs and accepting old Stripe events requires more than adding new metadata. Old subscription payloads identify the business through the owner's user ID, whereas new businesses cannot be resolved uniquely from that identity. Legacy checkout sessions and delayed events can coexist with new subscriptions. A fallback from an unresolved business ID to a person's selected business would misapply entitlement.
   **Required mitigation:** Require a durable, unambiguous mapping for legacy subscriptions and legacy checkout attempts, with compatibility determined from stable subscription or checkout identity. Unknown or conflicting associations must fail closed and remain recoverable. Document when legacy payload support can end; replay safety must continue after switching is enabled. The brief already recognizes this risk; the missing addition is a mandatory compatibility invariant.

**Constraint distinction:** Single login, independent businesses, additional subscriptions except admin creation, and billing-only access after payment failure/expiry are confirmed. URL-based context, one Stripe customer per business, no additional trial, exemption lifecycle and automation suspension remain recommendations. None of the findings approves those choices.

**Files read:**

- Entire persona: `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.0/agents/implementation_readiness.md`
- Entire immutable target: `docs/reviews/multi-business/round-1-input.md`
- Entire `lib/team/context.ts`
- Entire `lib/billing/stripe-subscription.ts`
- Entire `lib/agent/quota.ts`
- Entire `package.json`
- Portions of `db/schema.ts`; the full-file output was truncated, so this was not a complete schema inspection.

**Explicit required unread files:** None required to support these concept-stage findings. The complete schema, migration history, checkout/webhook handlers and queued-job producers/consumers must be inventoried before implementation; their behavior has not been validated here.
```

## egm-structural

Native task ID: `/root/multibusiness_synthesizer/egm_structural`
Status: completed

```text
No Blocker identified at concept stage. Three Major maintainability risks need explicit treatment in the next brief. These are proposed technical requirements, not additional user-approved product boundaries.

1. **Major — Long-Term Tech Debt & Maintainability: implicit identity fallback survives business extraction.**  
   **Scope:** “Working product recommendation,” “Isolation and operational boundaries,” “Migration approach”; `lib/team/context.ts`, `lib/current-user.ts`.  
   The concept correctly requires explicit business context, but existing APIs resolve context from a user alone, treat missing membership as ownership, and turn a null context back into `accountId = userId`. Carrying these semantics into a compatibility layer would preserve two competing ownership models and make failures silently select an unintended account.  
   **Required mitigation:** The next brief should require an explicit business argument at operational access boundaries, with separate outcomes for absent selection, denied membership and suspended entitlement. Personal identity resolution must remain usable independently. Legacy fallback may resolve only an unambiguous migration mapping, with a defined removal gate. This does not require accepting the proposed URL design.

2. **Major — Long-Term Tech Debt & Maintainability: personal deletion remains coupled to business lifetime.**  
   **Scope:** “Isolation and operational boundaries,” “Migration approach,” proposed exclusion of ownership transfer; `db/schema.ts:103`, `:2152`, `:3510`, `:3533`, `:3829`.  
   The document preserves attribution when a member leaves, but does not address deleting the login or sole owner's identity. Existing business profiles, subscriptions and roles cascade from users; membership records also cascade through actor fields such as `invitedByUserId`. Merely introducing business IDs can leave unrelated business records dependent on a person's continued existence. Excluding self-service ownership transfer does not settle this lifecycle.  
   **Required mitigation:** Add an explicit ownership/deletion decision before migration design. Separate business lifecycle foreign keys from historical actor references, and require that deleting or anonymizing an identity cannot implicitly delete another business's operational history or alter its billing. Whether sole-owner deletion is blocked, closes owned businesses, or requires an administrative process remains a product decision.

3. **Major — Long-Term Tech Debt & Maintainability: distributed entitlement checks can create incompatible business states.**  
   **Scope:** “Billing boundary,” “Isolation and operational boundaries,” admin exemption recommendations; `lib/team/context.ts`, `lib/billing/plan-gate.ts`.  
   The confirmed billing-only rule spans owners, members, recovery pages and operations. Current access logic mixes membership selection with subscription gating, excludes owners from that gate, duplicates administrator bypasses, and separately calculates feature entitlement. Extending each helper independently risks inconsistent recovery access, accidental admin exemptions and different suspension behavior across integrations.  
   **Required mitigation:** Require one business entitlement policy with explicit access outcomes, consumed by membership/permission checks and all execution surfaces. Membership, ownership, platform-admin identity and business exemption must remain distinct inputs. Suspension behavior for background work and incoming events must be decided before those surfaces are implemented; the document's proposed pause policy is still unapproved.

**Files actually read**

- Entire structural persona and `docs/reviews/multi-business/round-1-input.md`.
- Entire `lib/team/context.ts`, `lib/current-user.ts`, `lib/billing/plan-gate.ts`, `lib/billing/stripe-subscription.ts`, `lib/agent/quota.ts`.
- `db/schema.ts` excerpts: lines 103–190, 2152–2168, 3510–3593 and 3829–3878; targeted search of user foreign keys.

**Required unread evidence for the subsequent implementation design**

- Actual account-deletion entry points and Supabase identity deletion behavior; their paths were not discovered in this targeted review.
- `app/api/webhooks/stripe-billing/route.ts`.
- `app/(app)/layout.tsx`.
- `lib/inngest/functions/weekly-brief-email.ts`.
- Remaining schema relations, migration SQL and RLS helper definitions.

These files are needed to validate lifecycle and policy integration, not to reject the feature concept.
```
