# Goldfish brainstorm review, round 1

Target: `concepts_brief.md`, preserved exactly in `round-1-input.md`.
Date: 2026-11-03. Mode: BRAINSTORM.

Six native fresh-context reviewers completed. No reviewer rejected the concept. Deduplicated findings: 0 Blocker, 12 Major, 2 Nit. Major means a consequential concern to address before the relevant implementation stage; it does not require a completed technical design in a concept brief. The revised brief records mitigations as recommendations and open decisions. No finding has been resolved by product code.

## Reviewer status

| Reviewer | Native task ID | Status | Raw Blocker / Major / Nit |
| --- | --- | --- | --- |
| egm-design | `/root/multibusiness_synthesizer/egm_design` | completed | 0 / 4 / 0 |
| egm-codebase-details | `/root/multibusiness_synthesizer/egm_codebase_details` | completed | 0 / 5 / 0 |
| egm-zoom-out | `/root/multibusiness_synthesizer/egm_zoom_out` | completed | 0 / 2 / 2 |
| egm-comprehension | `/root/multibusiness_synthesizer/egm_comprehension` | completed | 0 / 3 / 0 |
| egm-implementation-readiness | `/root/multibusiness_synthesizer/egm_implementation_readiness` | completed | 0 / 3 / 0 |
| egm-structural | `/root/multibusiness_synthesizer/egm_structural` | completed | 0 / 3 / 0 |

Each reviewer read its entire persona and snapshot. Some inspected source; their exact coverage and later verification gaps appear in `round-1-raw.md`. No supplied required reading was inaccessible. No reviewer failed or needed retry. Prompts did not contain other reviewers' findings. `fork_turns: none` isolated conversation history; exclusion of host instruction files is unverified. Persona names do not describe all actual contents: the codebase-details persona covered observability, for example. No additional standard was supplied.

## Deduplicated findings

### M1. Explicit context and a shared entitlement policy. Severity: Major

Lenses: zoom-out, structural. Scope: Switching business, Billing boundary, isolation; `lib/team/context.ts`, `lib/current-user.ts`, `lib/billing/plan-gate.ts`.

Current context resolves from a person, permits owners without the delegated subscription gate, and `getCurrentUser()` falls back to the personal ID when context is null. Carrying that into business extraction could turn denial into an unintended account selection. The app layout separately blocks null context, so this is a migration hazard for callers, not a demonstrated frontend bypass or existing cross-business breach. Recommend explicit business targeting and distinct absent-selection, denied-membership, suspended and active outcomes, with personal identity available independently. One policy should combine ownership, membership, plan and recorded exemption without mixing them. Reuse existing permission keys. Resolve this contract before implementation.

### M2. Migration mapping, reconciliation and rollback. Severity: Major

Lenses: design, codebase-details, implementation-readiness. Scope: Migration approach; schema, context and deployment scripts.

Visible membership cannot identify every existing owner business: someone can own historical data while currently working in another account. Counts alone cannot reveal wrong assignments. Once a second business has writes, legacy code cannot represent the data and rolling back only the app is unsafe. Recommend a durable legacy-owner mapping based on records and entitlements, an ambiguity report, per-account reconciliation, compatible old/new writers or a deliberate write stop, and a documented rollback boundary. Assess locks and backfill load on the shared database. Require preservation of new business writes after activation and measurable criteria to remove compatibility code.

### M3. Legacy billing identifiers must remain unambiguous. Severity: Major

Lens: implementation-readiness. Scope: Billing boundary, migration; `lib/billing/stripe-subscription.ts`.

Old subscriptions use `metadata.userId`; that person can later own several businesses. Delayed events and legacy checkout attempts cannot select their target from current browser context. Recommend stable subscription and checkout mappings to business IDs, rejection of unknown/conflicting associations, a recoverable exception path and explicit criteria for retiring legacy payload support. Decide before billing migration.

### M4. Billing projection rejection needs detection and recovery. Severity: Major

Lens: codebase-details. Scope: Billing recovery; `lib/billing/stripe-subscription.ts`, `app/api/webhooks/stripe-billing/route.ts`.

The inspected webhook silently returns for non-success projection results, and the outer handler can then mark the event processed. Intentional ignores and actionable mapping conflicts need different operational outcomes before they control business blocking. Recommend categorized rejection records, entitlement transition history and a safe comparison/reconciliation path against authoritative payment state. This is evidenced operational risk, not proof of an existing breach. No code was changed.

### M5. Personal identity deletion must not implicitly control business lifetime. Severity: Major

Lens: structural. Scope: Isolation and migration; `db/schema.ts` user-linked business, subscription, role and actor references.

User cascades can remove business or historical membership records when an identity disappears. Excluding self-service transfer does not answer sole-owner deletion. Recommend separating business ownership from historical actors and auditing cascade paths. Proposed first-release default: block ordinary sole-owner deletion while an owned business remains open and provide an administrative closure process; preserve or anonymize historical actor references without deleting unrelated businesses. This product lifecycle rule requires approval before schema design.

### M6. Attribute AI usage and bound shared spending. Severity: Major

Lenses: design, codebase-details. Scope: AI fallback and isolation; `lib/agent/client.ts`, `lib/agent/quota.ts`.

The current shared-key cap is `null`; person-level request accounting cannot explain independent business consumption. Admin-created businesses can increase shared exposure. Recommend business/actor/request attribution, key source, outcomes and input/output tokens, independently of quota enforcement. Choose business allowance and per-business concurrency before launch, plus a platform emergency shared-key spending control. Proposed emergency behavior is to stop only shared-key work while leaving eligible BYOK work available. This safeguard must not pool business allowances. Amounts and limits remain unapproved.

### M7. Suspension needs a bounded integration policy. Severity: Major

Lenses: design, zoom-out, codebase-details, structural. Scope: Billing boundary, usage and incoming events.

Billing-only user access is confirmed. Pausing ingestion is a separate decision. Dropped provider events risk missing history; unbounded retention/replay risks cost and recovery spikes. Recommend a provider matrix for acknowledgement, retention, reconciliation and idempotent bounded replay before implementing suspension. Proposed default: stop AI and outbound automation, keep payment processing, and retain minimum authenticated inbound data only where replay or reconciliation is unreliable. Validate provider capabilities and retention limits first; this is not an accepted blanket pause policy.

### M8. Shared infrastructure needs protection against one business monopolizing work. Severity: Major

Lens: design. Scope: Async jobs, imports and recovery.

Data isolation alone does not prevent one large import or replay from exhausting workers, connections or provider limits. Recommend business-scoped concurrency, bounded batches and operational measurements, using existing Inngest controls first. A new scheduler is not a requirement; consider additional mechanisms only if measured interference justifies them. Independence does not imply dedicated infrastructure or a new availability commitment.

### M9. Business telemetry and async lineage must survive the identity split. Severity: Major

Lens: codebase-details. Scope: Switching, isolation; analytics/retry logging, Inngest clients and inspected sync functions.

Generic person IDs and old `userId` event/concurrency keys will not identify the affected business after extraction. Recommend verified business/actor/correlation context, safe denial categories and connection/provider/run lineage. Distinguish completed, failed, deferred and entitlement-skipped work; expose connection freshness. Never record credentials or business payloads. Complete the remaining job/callback inventory during design.

### M10. Blocked members need a useful exit. Severity: Major

Lens: comprehension. Scope: Subscription failure experience.

A member with one blocked business can otherwise reach a dead end and mistake business suspension for login failure. Recommend an explanation, owner-contact route, switching and sign-out, without financial detail or billing privileges. Exact copy and layout can wait until UI design.

### M11. Correct targeting also needs recognizable business context. Severity: Major

Lens: comprehension. Scope: Selector, old tabs, forms and sensitive actions.

A valid action can target the wrong intended business even if the server enforces isolation. Recommend a persistent recognizable business label in editing contexts and sensitive confirmations; exercise similarly named businesses and resumed tabs. The presentation remains open.

### M12. Purchase states must distinguish resume from another purchase. Severity: Major

Lens: comprehension. Scope: Additional creation, pending drafts and billing recovery.

Internal deduplication does not explain an interrupted checkout to the buyer. Recommend visible pending, unsuccessful, active and blocked states, a resume action for an existing purchase and the recurring commitment before confirmation. Draft reservation and trial policy remain commercial proposals.

### N1. Preserve route topology as a proposal. Severity: Nit

Lens: zoom-out. Scope: Switching business.

Explicit request targeting and safe tabs are invariants. Business IDs in URLs remain the leading recommendation pending the route/action inventory. Avoid implying that public links must change.

### N2. Keep exemption lifecycle narrower than ownership transfer. Severity: Nit

Lens: zoom-out. Scope: Admin exemption and exclusions.

A proposed payment-before-transfer rule should not introduce a transfer feature that the brief excludes. Recommend only the first-release rule for an owner losing platform-admin status, with transfer kept out of scope unless requested separately.

## Disposition and next stage

The concept can proceed to product decisions and an implementation design. Before implementation, settle context/entitlement outcomes, identity deletion, subscription-event compatibility and suspension behavior. Before database cutover, complete mapping/reconciliation/rollback evidence and the RLS/route/job inventory. Before launch, set shared-spend controls and verify operational/UX acceptance scenarios. Exact route shape, visual design, log schema and worker mechanism are appropriate later design details.

Confirmed user requirements remain unchanged. Recommended defaults do not become approvals through this review. Source coverage is targeted, not a full security or migration audit. All product code remains unchanged; no tests, database actions, deployment or commit were performed for this documentation review.
