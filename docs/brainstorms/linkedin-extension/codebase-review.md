# LinkedIn capture: codebase and operational review

Mode: BRAINSTORM. Reviewed 2026-11-12. Scope: observability and operational debuggability, with implementation evidence supporting the feature hypothesis.

## Evidence boundary

This is a static source review. No browser session, live LinkedIn DOM, extension installation, request trace, test execution, deployment, or production logs were inspected. Implemented branches below are not proof that version 0.3.11 works reliably on LinkedIn. No product code was changed.

## Existing behavior to reuse

- `content.ts` already recognizes LinkedIn, reads visible name headings, constructs a canonical profile URL, and uses the shared resolve/capture panel and API flow. A new LinkedIn integration architecture is unnecessary on this evidence.
- Business selection already occurs in `/extension/auth/select`; unavailable businesses have disabled choices. Completion and renewal check CRM access for the selected business. The signed bearer payload contains `accountId`; server access resolution rechecks membership for each bearer request. Stored business ID/name survive renewal. Clicking the business name in the panel reopens authentication, so changing business currently uses the reconnect flow rather than an embedded selector.
- Resolve queries use `accountId` filters and return known, ambiguous, or unknown profiles. Exact URL checks include both profile records and legacy lead records. Capture resolves again, requires an explicit decision for ambiguity, and calls transactional capture code with an idempotency key. Existing CRM events record successful lead creation/profile capture. These events can support reconciliation, but are not end-to-end operational traces.
- The content script has operation IDs that discard superseded responses, clears resolved data after authentication, and distinguishes session, unavailable, connection-error, and generic error UI states. Preserve these behaviors when changing business selection or LinkedIn extraction.

## Findings

### Major: there is no shared diagnostic context across the capture journey

**Dimension:** Observability & Operational SRE Debuggability.

**Operational risk:** The inspected content-script, worker, session, resolve, and capture code carries no operation correlation identifier, elapsed time, extension version, or selector version through the request chain. A setter reporting “it failed” cannot correlate the visible panel state with renewal, API handling, resolution, and persistence. Worker exceptions become generic `network_error`; other catches discard reasons. Existing successful CRM events do not explain failed attempts.

**Mitigation requirement:** Define a bounded operation identifier propagated from panel action through worker/API responses and structured server diagnostics. Include action, platform, extension version, stage, duration, retry attempt, HTTP result, and stable reason code. Use restricted logs for tenant/actor context; never include bearer tokens, cookies, names, profile URLs, raw DOM, or request payloads. A retry must remain distinguishable from the original attempt without breaking mutation idempotency.

**Acceptance check:** Simulate failed renewal, failed resolve, failed capture, and success. A support reference from each final UI state must locate the relevant request outcomes without exposing lead identity or secrets.

### Major: DOM breakage can look like no supported profile

**Dimension:** Observability & Operational SRE Debuggability.

**Operational risk:** LinkedIn extraction currently falls back from the route to visible links, accepts `/company/` as well as `/in/`, and attempts conversation detection before normal profiles. These are broader than the approved standard-profile scope. Missing headings fall back to the handle. Without distinct diagnostics, a LinkedIn markup change, intentionally unsupported page, late identity load, and extraction of the wrong visible profile can be indistinguishable operationally.

**Mitigation requirement:** Establish a standard-profile route gate for this version and record only non-identifying extraction outcomes: supported/unsupported route class, identity found/waiting/missing, selected extraction strategy, fallback used, launcher mount outcome, and elapsed wait. Keep excluded surfaces excluded even though legacy code contains support. Provide a small diagnostic view/export with extension version and these statuses, not DOM snapshots.

**Acceptance check:** Use actual LinkedIn standard profiles in the supported browser, including SPA navigation and delayed headings; verify the launcher is beside the correct name and capture URL/name match the page. Search results, company pages, messaging, and Sales Navigator must not pick a lead through fallback links. Exercise missing identity explicitly.

### Major: tenant switches and in-flight requests need an observable acceptance contract

**Dimension:** Observability & Operational SRE Debuggability.

**Operational risk:** Worker storage is global across extension tabs; callbacks broadcast authentication changes to all tabs. A request can start under one bearer while response metadata reads the current stored business after the request. Content-script operation IDs and auth resets help reject stale UI, but static review does not prove that multi-tab reconnects, renewal failures, and an in-flight mutation preserve the visible business-to-write relationship. This review does not assert a confirmed cross-business write defect.

**Mitigation requirement:** Define the business binding of each operation and diagnose stale/superseded response rejection, renewal business mismatch, authorization rejection, and switch completion. Use the server-authorized business as the source of truth for request results. Explicitly settle what happens when switching during a capture and when another tab switches the shared extension business.

**Acceptance check:** Two authorized businesses and two tabs: start resolve/capture for A, switch to B while the response is delayed, and verify the actual persisted destination plus the displayed business/result. Repeat after token expiry and after A access is revoked. No silent fallback to another business is acceptable.

### Major: successful CRM events do not measure capture reliability or duplicate prevention

**Dimension:** Observability & Operational SRE Debuggability.

**Operational risk:** The capture route maps several failures to `profile_conflict`, `idempotency_conflict`, or `capture_failed`; it does not emit structured diagnostics for the underlying failure in the inspected code. The panel treats any capture 409 as an ambiguous choice and clears resolution before capture, which can lose actionable distinctions. Retried mutations after network failure further obscure whether the first attempt committed.

**Mitigation requirement:** Record bounded outcomes for resolve (known/ambiguous/unknown), capture (created/existing/confirmed/replayed/conflict/failed), authorization, throttling, and transport retry. Track latency and error rates by endpoint/platform/version; use tenant IDs only in controlled diagnostics, not high-cardinality metric labels. Distinguish replay from newly created capture. Preserve separate user recovery paths for ambiguity, profile conflict, idempotency conflict, and unexpected failure.

**Acceptance check:** Replay a request after a simulated lost response, capture the same LinkedIn URL twice, confirm an ambiguous match, and race two captures. Inspect persisted leads and CRM events, not only success UI. Verify the outcome is traceable within the selected business and an unrelated business stays unchanged. Alert thresholds can be calibrated from the pilot, but counters and ownership must exist first.

### Major: inferred name boundaries propagate beyond profile display

**Dimension:** Observability & Operational SRE Debuggability.

**Operational risk:** `minalySplitName` currently assigns the first whitespace token to firstName and all remaining tokens to lastName. Capture persists these values; new eligible message-test assignments can render a message using the inferred firstName. An ambiguous name is therefore not merely a display issue. Reusing capture can also assign an existing active message test, an implementation side effect that the brief should acknowledge without expanding scope into messaging.

**Mitigation requirement:** Preserve the visible full name without claiming inferred boundaries are verified. Decide whether explicit correction or a conservative unknown split is required before consuming a first name. If diagnostics are added, record extraction/correction provenance only, not the name itself. State whether existing message-test assignment remains part of capture or is intentionally gated for this scope.

**Acceptance check:** Test a mononym, multipart family name, compound given name, non-Latin name, and a heading containing a title/suffix. Verify stored full name and any downstream template output; no silent claim of reliable first/last parsing.

## Minimal operational handoff

The brief should name the owner for extension incidents and document a short triage path: obtain extension version and support reference, identify route/extraction versus session versus API/persistence failure, confirm server-authorized business, inspect retry/idempotency outcome, and choose reconnect/retry/upgrade. Keep this small and reuse existing release/version mechanisms; no new telemetry vendor is required by these findings.

## Files actually read

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.1/agents/codebase_details.md`
- `docs/brainstorms/linkedin-extension/concept-input.md`
- `extension/README.md`
- `extension/manifest.json`
- `extension/src/background.ts`
- `extension/src/content.ts` (targeted sections: extraction, name splitting, request bridge, panel/business header, resolve/capture/search/update, auth handling)
- `lib/crm/extension-http.ts`
- `lib/crm/extension-session.ts`
- `lib/crm/queries.ts` (targeted sections: resolve and transactional capture)
- `app/api/crm/extension/session/route.ts`
- `app/api/crm/extension/resolve/route.ts`
- `app/api/crm/extension/capture/route.ts`
- `app/extension/auth/select/page.tsx`
- `app/extension/auth/complete/route.ts`

Access/search notes: initial searches for `app/api/extension` and `lib/extension` failed because those directories do not exist; actual CRM paths above were found and read. Filename search for sentry/instrumentation/telemetry/observability/logger returned no matches; this is not proof that deployment-level logging or tracing is absent. No secrets were read.
