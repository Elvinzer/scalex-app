## 1. Reconcile the handoff with existing CRM contracts

- [x] 1.1 Compare the handoff’s screen flows with the active mobile setter, call reconciliation, lead capture, and extension changes; keep their data and mutation contracts.
- [x] 1.2 Replace all demo pipeline-stage identifiers and labels with `CRM_LEAD_STAGES` and localized labels from the application.
- [x] 1.3 Reconcile the handoff’s color usage with the Minaly design tokens: violet only for IA/analytics, one coral primary CTA per screen, neutral styles for repeated list actions and manual call linking.
- [x] 1.4 Confirm the list filters and sort order used by Leads, Pipeline, and call association before implementing pagination and count queries.

## 2. Add bounded, counted lead browsing

- [x] 2.1 Extend the account-scoped Leads query contract to return a bounded batch and the exact total matching its active filters.
- [x] 2.2 Pass stable filters and pagination state from the Leads route; reset pagination when the filter set changes.
- [x] 2.3 Present the exact matching-result count, the currently displayed count, and a clear load-more action without conflating filtered results with an unrelated global total.
- [x] 2.4 Add visible loading, no-match, end-of-results, and retry states; preserve the current sort and active filters.
- [x] 2.5 Verify that search and filter counts remain account-scoped and match the displayed rows.

## 3. Scale Pipeline per stage

- [x] 3.1 Replace the single global lead batch with independent bounded queries or cursors for each canonical stage and an accurate full-stage count.
- [x] 3.2 Add stage-local load-more behavior and search that retain the selected source and stage filters.
- [x] 3.3 Keep the five-column board for wide viewports and render one selected-stage list for compact viewports.
- [x] 3.4 Preserve accessible stage changes and reconcile card movement and counts after success or error.

## 4. Recompose the CRM shell and daily work surfaces

- [x] 4.1 Update CRM navigation to remain a single horizontally scrollable row below 1024 px and add a persistent Extension destination with correct active-route behavior.
- [x] 4.2 Keep Aujourd’hui’s queue before analytics, collapse monthly analytics by default, and ensure the next-action highlight does not duplicate its queue item.
- [x] 4.3 Move lead capture and import behind clear contextual actions while preserving the existing capture and import operations.
- [x] 4.4 Rework Leads into mobile cards below 1024 px and a readable table at or above 1024 px; keep search and essential filters easy to find.
- [x] 4.5 Rework Actions hierarchy so due dates stay visible and repeated list actions use non-primary button styling.

## 5. Rework calls and manual association

- [x] 5.1 Keep call pagination and canonical call data while collapsing secondary filters on compact viewports and rendering mobile cards below 1024 px.
- [x] 5.2 Replace the preloaded-lead selector with account-scoped server search that returns a bounded candidate list and exposes loading, empty, and error states.
- [x] 5.3 Preserve manual association permissions and existing call-link mutation behavior; keep Falco match suggestions unchanged and visually distinct.

## 6. Refine lead detail, import, and extension surfaces

- [x] 6.1 Apply the responsive information hierarchy to lead detail; prevent destructive controls from overlapping lead identity or primary context on narrow screens.
- [x] 6.2 Verify capture and every import wizard step render their full content and visible labels at compact and wide widths.
- [x] 6.3 Preserve the extension onboarding flow and make its route reachable independently of the dismissible dashboard suggestion.

## 7. Accessibility, localization, and responsive review

- [x] 7.1 Add or update every changed CRM string in French and English with matching keys and placeholders.
- [x] 7.2 Ensure touch targets, keyboard focus, overlay focus return, safe-area spacing, and non-color status cues meet the CRM accessibility requirements.
- [x] 7.3 Review the affected screens at 320, 360, 390, 768, and 1440 CSS pixels, including search results, empty states, open filters, lead-link sheets, and import steps.
- [x] 7.4 Record any remaining query-performance concern for exact counts or per-stage totals and add an index only if measurement shows it is needed.

## 8. Close gaps found during the acceptance audit

- [x] 8.1 Apply Falco suggestion-status filtering before SQL limit and offset, and verify the final page indicator.
- [x] 8.2 Keep Pipeline load-more requests tied to the last applied search and source filters.
- [x] 8.3 Refresh moved Pipeline stages after success without evicting an already loaded lead.
- [x] 8.4 Use one due-time rule for overdue classification, include the highlighted action in group counts, and expose overdue text without relying on color.
- [x] 8.5 Reset action lists when their filters or server-provided rows change; show selected quick filters and announce action updates.
- [x] 8.6 Show import step progress, retain work on errors, retry the failed operation, and keep import controls at least 44 px high.
- [x] 8.7 Show import and sale-validation controls only to users with the server-required permission.
- [x] 8.8 Preserve the originating CRM list and its filters when opening and leaving a lead detail.
- [x] 8.9 Announce call-link search results and return lead detail to the Calls filters.
- [x] 8.10 Bound and validate Leads query parameters, announce empty result counts, and recover cleanly from lead-drawer load failures.

Implementation note: no query-performance issue appeared during the runtime review. Lead results are paginated in batches of 25 and each pipeline stage in batches of 15; no new index was added. Revisit exact-count latency if production telemetry shows it becoming significant as CRM volume grows.
