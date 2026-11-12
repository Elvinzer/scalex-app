# LinkedIn lead capture in the existing Chrome extension

* **Author:** Cédric Bernard
* **Date:** 2026-11-12
* **Status:** Five fresh-context Goldfish reviews completed; two could not run because of the agent thread limit, including one retry each. Static review only. Recommendations below await user alignment. No product implementation or runtime verification performed.

## Overview

A setter viewing a standard personal LinkedIn profile should open the existing Minaly panel from an icon beside the person's name. The panel prefills the visible full name and canonical profile URL. The selected authorized business stays visible, can be changed, and is remembered for later captures. Recognize existing profiles within that business and require a deliberate choice for uncertain matches.

LinkedIn capture and remembered business selection are already implemented in the shared extension, according to source inspection. The useful next change is to verify and harden that flow, not build another integration. The current version is 0.3.11. Existing behavior has not been demonstrated in an authenticated browser during this review.

## Analysis

### Blocker before release: the selected business must control every write

The worker can continue a request with cookies when obtaining a business-bound bearer fails (`extension/src/background.ts:140`). The server accepts cookie identity without the pinned business when no bearer is supplied (`lib/crm/extension-session.ts:57`). This creates a static path where the stored business label and server-selected business can differ. Actual occurrence depends on the cookie/session state and has not been reproduced.

Proposed requirement: block capture when the selected business cannot be authorized. Never silently use another business. Remembering a selection must not weaken authorization. Test business A remembered, B active in the web app, and failed renewal for A; no capture may land in B.

### Major: switching business must clear old decisions

Selection currently lives in global extension storage and changing it uses the web reconnect flow. Keep one remembered selection across extension tabs unless a separate requirement emerges. On change, invalidate candidates, offers, selected records and delayed responses, then resolve the visible profile again. Bind a confirmed write to the business shown at confirmation. Test two tabs and switching during delayed requests. A native panel selector is a product choice, not yet an architectural requirement.

### Major: capture the person whose profile is open

Current detection includes company pages, conversations and fallback profile links on other pages. The approved first-version surface is the main personal `/in/` profile. Proposed requirement: capture name and URL from that same identity; a messaging overlay must not replace it. Missing or uncertain identity must prevent capture. Verify late loading, profile-to-profile navigation, back/forward and navigation to unsupported pages. Narrowing detection affects existing installations and needs an explicit compatibility decision.

### Confirmed decision: capture starts at first message sent

The user explicitly confirmed that adding a LinkedIn profile must place the new lead at `first_message_sent`. Preserve the existing default. The review's recommendation to separate capture from that stage was rejected by the user because it does not match the intended setter workflow. This records the CRM stage; it does not request automated message sending. Capture may also interact with existing message-test assignment; preserve only the intended shared behavior and verify Instagram compatibility. Do not reset an existing lead's later stage when recognizing or recapturing its profile.

### Major: preserve names and existing identities

The current client splits at the first whitespace; server normalization can infer the same split when parts are absent. Preserve the visible full name as the reference and decide how structured fields are corrected without claiming a reliable automatic split. Do not overwrite confirmed names on recapture. No database migration is established as necessary.

Reuse exact canonical URL matching, legacy lead fields, attached social profiles, business-scoped queries and transactional uniqueness. A possible name match is a suggestion, never an automatic merge. Make explicit that choosing a candidate links the profile. Test identical names, cross-network links, same URL in different businesses, repeated clicks, lost responses and simultaneous captures.

### Keep operational work proportional

Useful diagnostics distinguish extraction, session, authorization, matching and persistence failures, and distinguish conflict types. Do not log secrets, names, profile URLs or DOM. No LLM, new telemetry service or distributed quota system is justified by this capture feature. Measure actual pilot behavior before adding capacity work.

## Goals vs. Non-Goals

**In scope:** one visible personal profile; existing panel; full name and canonical URL; remembered authorized business; clear business destination; exact recognition and explicit uncertain matching; actionable error recovery; targeted Instagram compatibility checks.

**Out of scope:** automated messaging, bulk import, private LinkedIn APIs, email/phone enrichment, search results, Sales Navigator, conversation capture, new notes/reminder features, a new CRM model or a second extension.

## Alternatives Weighed

* A separate LinkedIn panel or integration is not recommended: the shared capture architecture already exists.
* Automatic merging by name is not recommended: names do not establish identity.
* A native business picker is not yet selected: the existing web selection flow might meet the initial need; its usability cost must be accepted explicitly.
* Copying Breakcold's broader feature set is not recommended for this scope. Its documented workspace switching is relevant; notes, tasks, additional surfaces and enrichment do not solve the immediate capture requirement.
* These are reviewer recommendations, not user rejections.

## Key Decisions & Staging for Next Steps

The user approved the core hypothesis for review and then explicitly confirmed `first_message_sent` as the initial stage on LinkedIn capture. Resolve the business-switch interaction, ambiguous-name treatment and old-client policy before coding.

Then verify the existing packaged extension on an authorized LinkedIn profile. Implement only demonstrated gaps and the business-binding safeguard. Required acceptance covers new/known/ambiguous leads, expired/revoked sessions, two businesses and tabs, route changes, uncertain identity, retries and concurrent capture. Verify the persisted destination as well as the visible panel. Preserve existing session storage and matching contracts where possible. Follow repository typecheck/lint/test, runtime and extension release requirements for implementation; none were run for this documentation-only brainstorm.

## Review Coverage

| Persona | Dimension | Status | Evidence |
| --- | --- | --- | --- |
| design_critic | Architecture, cost and quotas | Completed | [Report](design-review.md) |
| codebase_details | Observability and operations | Completed | [Report](codebase-review.md) |
| zoom_out | Complexity and reuse | Completed | [Report](zoom-review.md) |
| comprehension | User and developer ergonomics | Completed in a fresh context | [Report](comprehension-fresh-review.md) |
| implementation_readiness | Compatibility and rollout | Completed | [Report](readiness-review.md) |
| structural | Long-term maintenance | Not run | Agent thread limit; retry also failed |
| inventive_catalyst | Alternative transforms | Not run | Agent thread limit; retry also failed |

The five counted reviewers started without parent conversation history and each recorded its persona, target and code reads. No additional standards were supplied. Host instruction-file exclusion was not independently verified. An earlier non-isolated comprehension attempt was excluded; only the separately spawned fresh-context report is counted. Missing reviews are not clean findings.

## Competitor Sources

Documentation research only, not hands-on testing. Breakcold documents workspace switching and lead notes/history/tasks in its [extension help](https://help.breakcold.com/en/category/chrome-extension-16b2sbr/), broader [LinkedIn surfaces](https://help.breakcold.com/en/article/which-linkedin-pages-support-the-extension-6wda0r/), and explicitly excludes extracting email/phone in its [enrichment explanation](https://help.breakcold.com/en/article/can-i-enrich-linkedin-leads-from-the-chrome-extension-ab6370/).

The existing root `concepts_brief.md` concerns multiple businesses and was preserved. Use this file explicitly for any later design handoff.
