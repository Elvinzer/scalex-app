## Context

See `proposal.md` for the problem being solved. The current CRM projection
already reads the canonical `sales_calls` rows and uses `crm_call_links` for an
explicit association. `sales_calls` contains the useful call-side identity:
source, external provider id, invitee name/email/phone, event type,
`scheduledAt`, optional duration, closer and setter. The current Appels surface
does not expose most of those fields for an unlinked row and renders the same
placeholder for every unlinked call.

The existing CRM resolver is account-scoped and Falco calls must follow the
repository BYOK, Zod validation, token logging and no-social-side-effect rules.
The change is additive and must coexist with the CRM V1 rollback flag.

## Goals / Non-Goals

**Goals:**

- Make a call uniquely findable from the CRM without requiring an existing lead
  link.
- Show enough call-side evidence for a human to cross-reference it with a
  social lead.
- Let Falco rank a small, account-scoped candidate set and explain the evidence
  without becoming the source of truth.
- Preserve a clear human decision point, a replay-safe audit trail, and a manual
  fallback.
- Support new-call processing and a bounded historical backlog without running
  an agent call on every page render.

**Non-Goals:**

- No second calls table, provider replacement, or automatic historical link.
- No social API access, message sending, inbox synchronization, or message
  scheduling.
- No automatic creation of a lead from an unlinked call.
- No claim that an agent confidence value is a statistical probability.
- No automatic copying of an email or phone number from a call into a lead
  before the user confirms the relationship.

## Decisions

### 1. Keep the call and lead identities visible separately

The row and detail view will use a two-layer identity block:

```text
Call identity                         Lead identity
────────────────────────────────     ────────────────────────────────
iClosed · #external-id               Marc Lefebvre · @marc.lefebvre
13 Aug 2026 · 11:00 · Coaching 1:1   Confirmed link, or Unlinked
Marc Lefebvre · email when present    Suggestion Falco, if one exists
```

The list will display a short provider reference with a copy action. The detail
view will expose the full `iclosedCallId` or provider reference, the internal
call id as a secondary diagnostic value, and the available invitee and
attribution fields. `scheduledAt` will be labelled as the call date/time;
`createdAt` remains available in the detail context when it is relevant.

The responsive surface will use stacked call cards rather than forcing the
desktop table to scroll horizontally. Both surfaces will retain the same
reference, identity, suggestion state and link action.

### 2. Use deterministic retrieval before Falco

Falco will not search the whole account and will not decide which records it is
allowed to see. A server-side resolver will first retrieve a bounded candidate
set from the current account. It will normalize Unicode, accents, punctuation,
handles and names, then rank available signals such as:

1. exact structured contact or profile identifiers when they exist on both
   sides;
2. normalized invitee name against the lead display/social name;
3. time proximity between the scheduled call and recorded lead activity;
4. current responsible setter, closer, event type or other attribution context;
5. platform context when it is known and meaningful.

A name alone is never enough for a strong match. Weak or common-name results can
  still be returned as explicitly low-confidence review candidates, but they
  cannot bypass confirmation. The resolver returns at most five candidates to
  Falco and the UI displays at most three, with the rest represented as an
  ambiguity indicator.

### 3. Make Falco an explanation and ranking step

Falco receives the minimum call and candidate fields needed for comparison. It
returns a validated object with:

- `status`: `candidate`, `ambiguous`, `no_match`, or `unavailable`;
- `confidence`: `high`, `medium`, or `low`, explicitly described as a review
  signal and not a probability;
- ranked candidate lead ids;
- short reason codes and human-readable reasons;
- missing evidence, when it affects the decision;
- generation time, model version and input fingerprint.

The agent output is never used directly as a database mutation. Falco's raw
response is not rendered or logged as an unbounded string; the structured
validated fields are persisted for the suggestion audit.

### 4. Persist suggestion state separately from the canonical link

Add an account-scoped suggestion record and candidate records rather than
overloading `crm_call_links` with a temporary proposal. The parent suggestion
will contain the call, lifecycle state (`queued`, `ready`, `rejected`,
`dismissed`, `expired`, or `failed`), confidence, explanation, model/version,
input fingerprint, generation timestamps, expiration, and decision metadata.
Candidate rows will contain the lead id, rank and a safe snapshot of the
displayed evidence so a later lead edit does not rewrite what the user saw.

The accepted suggestion id will be carried on the confirmed link or in its
matching event metadata. Existing links remain valid with a null suggestion id.
The existing `match_confirmed` CRM event remains the audit event for acceptance;
its metadata identifies `method = falco`, the suggestion, confidence and actor.

### 5. Separate generation from decision in the UI flow

```text
canonical call
      │
      ├─ linked ───────────────▶ lead + call context
      │
      └─ unlinked
            │
            ▼
      account-scoped candidates
            │
            ▼
      Falco suggestion (async or deliberate request)
            │
      ┌─────┴─────────┐
      ▼               ▼
   review          no reliable match
      │               │
      ▼               ▼
 confirm/reject   manual selector / retry
      │
      ▼
 crm_call_links + match_confirmed event
```

New calls may enqueue a suggestion after ingestion. The historical queue will
be started by an authorized user in a bounded batch. The Appels page reads the
cached state and never invokes Falco just because a row is visible. A changed
call or candidate fingerprint invalidates the previous suggestion; a repeated
job with the same fingerprint is a no-op.

### 6. Use explicit, reviewable UI states

For an unlinked row, the primary display will be the invitee and call
reference, not `Appel non relié`. A compact violet Falco block will show the
candidate, confidence, reasons and generated time. The action area will offer:

- `Relier à ce lead` only after the user reviews the suggestion;
- `Voir la fiche` for candidate context;
- `Ce n’est pas le bon lead` to reject or dismiss;
- `Choisir un lead` as the manual fallback.

Repeated row actions remain outline actions. The confirmation in the call
detail context is the single primary action for that decision; violet remains
reserved for Falco/analytics information.

### 7. Keep authorization and data minimization at the service boundary

Reading a suggestion follows the current CRM access guard. Generating a
suggestion requires CRM access; confirming or manually creating a call link
requires the existing assignment/link permission. Every server command derives
`accountId` from the authenticated session and checks the call and candidate
again inside the transaction.

Raw email and phone values are shown only to authorized CRM users who can
inspect the call. They are not written to logs or included in token metrics.
Falco receives only the fields needed for the comparison under the existing
BYOK/shared-key policy, and its response crosses a Zod boundary before any
display or persistence.

## Risks / Trade-offs

- [Name collisions and stale social names] → Require independent context for a
  strong suggestion, show reasons and alternatives, and keep confirmation
  manual.
- [Falco latency or quota] → Generate asynchronously, cache by fingerprint,
  expose retry, and keep manual linking fully functional.
- [Provider ids are long or inconsistent] → Display a normalized short
  reference with a copyable full value and keep the canonical provider id
  unchanged in storage.
- [A lead changes after a suggestion is generated] → Store the input
  fingerprint and evidence snapshot, expire stale suggestions, and recheck the
  current link in the confirmation transaction.
- [PII leaves the application boundary] → Minimize agent input, prefer
  server-side deterministic matching for exact signals, remove raw PII from
  logs, and follow the existing BYOK policy.
- [Historical queue creates too many agent calls] → Use explicit bounded
  batches, per-account rate limits, idempotent jobs and pilot metrics before
  broad activation.

## Migration Plan

1. Add the suggestion and candidate tables, indexes and RLS policies
   additively; keep the feature disabled by default.
2. Add the optional accepted-suggestion reference to the existing link/audit
   path without changing the source-of-truth rules for `sales_calls`.
3. Deploy read-only call identity and detail projections first.
4. Enable generation for one pilot account, first on new calls and then on a
   small historical batch. Compare accepted, rejected, dismissed, stale and
   no-match outcomes against manual review.
5. Widen activation only after the pilot confirms useful precision and stable
   token/latency costs.
6. Roll back by disabling generation and decision UI while retaining canonical
   calls, existing links and suggestion audit rows. No lead or call data is
   deleted by rollback.

## Open Questions

None that change the V1 contract. Whether to add a dedicated structured contact
identity model for leads can be evaluated after the pilot; it is not required
for the first suggestion flow because the current resolver can use the
available lead names, social identities and activity context.
