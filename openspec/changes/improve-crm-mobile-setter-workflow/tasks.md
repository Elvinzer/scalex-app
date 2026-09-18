## 1. Contract alignment and test fixtures

- [x] 1.1 Compare the mobile workflow contract with the active CRM capture, call-reconciliation and booking changes; record and resolve any conflicting stage, outcome or attribution assumptions.
- [x] 1.2 Define deterministic lead fixtures covering new, contacted, responded, qualified, booked, no-show, lost, reopened and sold states, including a 250-loop intensive-use dataset.
- [x] 1.3 Add the server and client schemas for the explicit pre-contact state, response milestone, free-form qualification note and mobile mutation result states.

## 2. Additive data model and migration

- [x] 2.1 Add the explicit pre-contact state, optional booking contact fields, internal appointment data and any loss metadata required by the spec, with indexes and RLS policies.
- [x] 2.2 Extend the CRM event contract for qualification-note activity and response attribution without changing the meaning of the existing five operational stages.
- [x] 2.3 Generate the Drizzle migration, inspect the SQL and metadata, apply it with `db:migrate`, and verify the shared Supabase data before exposing the new UI.
- [x] 2.4 Backfill the pre-contact state only from existing reliable events, report unknown records, and verify that no synthetic first-message or qualification KPI event was created.

## 3. Setter queue and server queries

- [x] 3.1 Implement the personal `/crm` work queue with overdue, today and upcoming groups, a direct due-today relance filter, counts and actionable empty states.
- [x] 3.2 Add stable search/filter parameters and bounded or cursor-based pagination for leads, actions and calls while preserving ordering and return context.
- [x] 3.3 Add queue transitions for complete, postpone and reschedule that return the next actionable lead without losing the active filter or list position. Queue filters are passed through the mutation and rescheduling removes an item when it leaves the active subset.

## 4. Common mutation reliability

- [x] 4.1 Standardize Zod validation, server authorization, idempotency keys, UI pending states and discriminated mutation `saved`/`error` responses for capture, notes, qualification, stages, response, actions and outcomes; pending remains an explicit client transition state.
- [x] 4.2 Make retries and double-taps safe for notes, actions, assignment, stage changes, responses, no-shows, loss, reopening, booking and sale validation; preserve operation keys through uncertain responses and reconcile against authoritative state on retry.
- [x] 4.3 Preserve note, qualification and action drafts across mobile navigation or refresh, clear them only after acknowledgement, and ensure sensitive draft content is never logged or put in a URL.

## 5. Lead capture and detail loop

- [x] 5.1 Reduce mobile capture to the reliable identity minimum, show the explicit « Nouveau lead » state, and make optional enrichment editable after creation.
- [x] 5.2 Reorder the lead detail so identity, state, response, responsible setter, next action and next call appear before history, with a compact mobile action surface.
- [x] 5.3 Add the explicit « A répondu » action, its history entry and its unique KPI behavior, including reconciliation with extension-originated responses. Both surfaces use the canonical response event and idempotency key.
- [x] 5.4 Add the single free-form qualification editor with partial save, mobile keyboard behavior, retry and draft preservation.
- [x] 5.5 Make notes and next actions available from the same mobile context, with visible confirmation, retry and draft-preservation states.

## 6. Booking and commercial outcomes

- [x] 6.1 Add the link-based booking action that exposes the configured link, records link sent, and leaves the call-booked transition to explicit setter confirmation.
- [x] 6.2 Add the internal Minaly booking form with lead context, availability calculated for associated closers, closer/slot selection, idempotent confirmation and no iClosed/Calendly side effect.
- [x] 6.3 Make no-show create one recovery follow-up, require a loss reason before lost, preserve reopening history, and keep sale validation on the canonical sale record.
- [x] 6.4 Expose the next call date, time zone, closer, outcome and recovery action in the lead summary and due-today queue.

## 7. Mobile shell, accessibility and localization

- [x] 7.1 Fix exact route activation and sibling reachability for CRM section navigation at every required viewport.
- [x] 7.2 Reserve top and bottom safe areas, eliminate fixed-navigation/Falco overlap, and verify drawer and action-surface offsets at 320 × 568.
- [x] 7.3 Make keyboard focus, Next/Done behavior, scroll-into-view, touch targets, labels, focus return and inline validation work for note, search, qualification, amount, URL and date fields.
- [x] 7.4 Add or update every CRM key in `locales/en/crm.json` and `locales/fr/crm.json`, including pending, empty, error, loss, booking and retry states.
- [x] 7.5 Add tests that parse both raw locale files, detect duplicate or missing keys, and fail if a raw namespace key is rendered in a CRM surface.

## 8. KPI and attribution

- [x] 8.1 Extend deterministic KPI computation for qualification-note activity, response, booking, attendance, no-show, revenue, setter and source breakdowns with explicit periods and filters; keep qualification rate unavailable until a controlled status exists.
- [x] 8.2 Add metric-specific drill-down queries and links so each KPI opens only the leads, actions or calls that contribute to that metric, preserving the visible period and active filters.
- [x] 8.3 Add regression tests for unique-lead counting, reassignment, reopening, repeated capture, incomplete source data and canonical sale revenue.

## 9. Mobile QA and intensive-use validation

- [x] 9.1 Keep fast Vitest coverage for state transitions, queries, idempotency, booking conflict handling, draft recovery and KPI calculations.
- [x] 9.2 Audit the mobile browser test dependency; if Playwright is added, run `npm audit` first and cover iPhone presets plus 320, 360, 375, 390, 393, 414 and 430 CSS pixel widths.
- [ ] 9.3 Add mobile regression scenarios for short/tall viewports, keyboard open, safe areas, route activation, capture, lead detail, response, qualification, booking, no-show, lost, sold and KPI drill-down. Browser checkpoints cover the shell, capture and representative lead/booking states; the full scenario matrix remains a pilot item.
- [ ] 9.4 Add slow-network, timeout, offline-transition, double-tap, repeated-submit and back-navigation scenarios, asserting no duplicate or silently lost record. Deterministic fixtures and server idempotency are present; full network transition automation remains outstanding.
- [x] 9.5 Execute the deterministic 250-loop, five-day setter simulation, record coverage and cumulative friction, and fix the highest locally observable costs before rollout. Field taps, elapsed time and retry frequency remain explicitly reserved for the controlled pilot.

## 10. Pilot and rollout

- [x] 10.1 Run typecheck, lint, the full test suite, migration checks and a secrets diff review before pilot activation.
- [ ] 10.2 Enable the new mobile workflow for one setter/account, monitor duplicate mutations, unsent drafts, booking links and KPI discrepancies, and keep the rollback path available.
- [ ] 10.3 Review the five-day pilot report, resolve P0/P1 cumulative frictions, then document the final acceptance result before general activation.
