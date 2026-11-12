# LinkedIn capture: architecture review

Mode: BRAINSTORM. Static review only; no authenticated LinkedIn runtime, production queries, or competitor testing performed. No product code changed. The requested report is the only workspace write.

The existing extension already has most of this architecture: LinkedIn DOM extraction, a shared panel, business-bound short sessions, server-side resolution, explicit ambiguous matches, and transactional capture with identity uniqueness. A separate LinkedIn service, background scraper, LLM, or new CRM model is not justified by this concept.

## Findings

### 1. Blocker: a failed business session can fall back to another business

Dimension: Architecture and tenant isolation.

Evidence: `background.ts` pins a business in extension storage and renews with that business. However, `minalyBackgroundRequest` still performs its request when renewal returns null and includes cookies. `getCrmExtensionAccess` then accepts a cookie identity when no bearer exists and calls `requireCrmAccess` without the pinned business. The returned background business label still comes from stored selection. Thus the capture contract has a path where displayed selection and server account can diverge. Whether a particular user's cookie session selects another business depends on their account state; that runtime outcome was not tested.

Mitigation requirement: fail closed for extension operations if the selected business cannot obtain a valid bound token. Do not silently use a cookie-derived default business. An expired session, removed membership, or deleted business must disable capture and show a recoverable selection/connection state. Acceptance: with business A remembered and business B active on the web, deny renewal for A and prove no lead is written to B.

### 2. Major: switching business needs an atomic contract across tabs and pending work

Dimension: Architecture and concurrency.

Evidence: business, token, and business name live in global `chrome.storage.local`. Clicking the panel label opens authentication. Authentication overwrites the global business and broadcasts to all tabs. Each API request reads storage separately; capture payloads do not carry the account used by the displayed resolution. `operationId` protects panel rendering from stale responses, but does not cancel a write already issued.

Mitigation requirement: define whether the last business is global across extension tabs. Keep that existing global scope unless there is an explicit reason to change it. A switch must invalidate resolution, candidate choice, offer, and pending editable state in every panel, then resolve the current visible profile again. Bind each mutation to the account/session generation shown when the user confirmed it; reject stale mismatches. Acceptance: open A in two tabs, change to B in one, and submit the old A panel or a delayed A response in the other. The result must never be silently attributed to B. No per-tab tenant architecture is required merely to meet this safeguard.

### 3. Major: shared Instagram detection currently exceeds the approved LinkedIn scope

Dimension: Architecture and extraction reliability.

Evidence: `minalyProfilePath` accepts both `/in/` and `/company/`. `minalyProfileUrl` prefers a visible conversation identity and falls back to visible profile links even when the current path is not a profile. The manifest injects on all LinkedIn paths. Generic `main h1` fallback does not itself prove that the heading belongs to the URL selected by that fallback. Reusing the current detector unchanged therefore does not enforce standard personal profiles only.

Mitigation requirement: gate the approved LinkedIn entry point to the current standard `/in/<slug>` personal profile route and its corresponding visible identity. Disable LinkedIn capture on company, search, Sales Navigator, feed, and conversation surfaces for this version. Preserve existing Instagram behavior. A messaging overlay must not make the icon beside the main profile name capture the overlay contact. Acceptance must cover profile-to-profile SPA navigation, delayed heading, back/forward, profile with open messaging overlay, and unsupported routes containing profile links. Fail closed when identity cannot be established.

### 4. Major: name and identity semantics must survive reuse

Dimension: Data integrity.

Evidence: `minalySplitName` always treats the first whitespace token as first name and the remainder as last name. Both extraction and edited display name use it. This directly conflicts with the concept's ambiguous-name boundary. Server resolution already checks exact canonical profile URLs and proposes ambiguous candidates; database schema declares unique business/platform/URL indexes on leads and social profiles. Name/handle candidate matches are intentionally weaker and cross-channel.

Mitigation requirement: preserve the visible full name as the authoritative captured value and do not imply a verified first/last split. Decide how existing required name fields are populated without presenting an inference as fact. Reuse exact URL matching and explicit candidate confirmation; never turn a display-name match into an automatic merge. Acceptance: mononym, compound surname, non-Western ordering, same name in the same business, same URL in different businesses, linked secondary LinkedIn profile on an Instagram-origin lead, double-click, and simultaneous capture from two tabs. A duplicate race may return an existing record or actionable conflict, but must not create another lead. No new identity schema is established as necessary by this review.

### 5. Major: cheap human capture can still multiply backend queries

Dimension: Cost, Quota & Token Economics.

Evidence: resolve does two exact-identity lookups before candidate searches and can then query profiles, offers, responsible setter, and message-test state. Legacy matching uses leading-wildcard `ILIKE` searches, so result `LIMIT` does not cap scanned work. Navigation checks run every second in every injected tab, although this code inspection does not show a network resolve on every tick. Resolve and capture limits are respectively 60/minute and 30/minute per user/IP, implemented by an in-memory map per serverless instance; these are not global quota guarantees.

Mitigation requirement: keep network resolution user-triggered, cache only by business plus canonical profile identity, invalidate after switch/mutation, coalesce duplicate requests, and do not retry a 429 in a tight loop. No LLM calls or token budget are needed: expected LLM tokens per capture are zero. Use existing quotas for an initial private pilot, measure request count and query latency, and introduce distributed enforcement only if the rollout needs a hard aggregate cap. Example capacity envelope, not a forecast: 100 active setters opening 10 profiles/minute each produces about 16.7 resolves/second before retries; 1,000 produces about 167. Require a pilot concurrency target and inspect representative query plans before a broader rollout. Keep stored data to one explicit profile capture and existing audit events, without HTML dumps or background browsing history.

## Reusable behavior and minimum proof

- Reuse the content-script/service-worker relay, short signed business session, schema validation, profile normalization, server-side matching, explicit candidate confirmation, transactional capture, and existing release pipeline.
- The current business-label reconnect action may satisfy “can be changed” if the intended UX accepts web reconnection. An inline workspace picker is a product choice, not an architectural prerequisite. Specify one behavior before implementation.
- Prove new, known, ambiguous, no-access, expired-session, revoked-business, offline, rate-limited, and concurrent capture paths. Verify the visible selected business and resulting CRM business together.
- Existing navigation tests use compiled source in a VM and primarily exercise Instagram predicate logic. They are useful regression checks, but are not proof of LinkedIn DOM behavior. Add narrow LinkedIn fixtures and validate with the packaged extension on an authorized standard profile before claiming reliability.

## Files actually read

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.1/agents/design_critic.md`
- `docs/brainstorms/linkedin-extension/concept-input.md`
- `extension/README.md`
- `extension/manifest.json`
- `extension/src/background.ts`
- `extension/src/content.ts` (selected extraction, panel, resolution/capture, and navigation sections)
- `extension/profile-navigation.test.ts`
- `app/api/crm/extension/capture/route.ts`
- `app/api/crm/extension/resolve/route.ts`
- `lib/crm/extension-session.ts`
- `lib/crm/profile-matching.ts`
- `lib/crm/queries.ts` (resolve and create sections)
- `lib/crm/normalization.ts` (search excerpts only)
- `lib/rate-limit.ts`
- `db/schema.ts` (identity/index search excerpts only)

Access failures: none. Directory listings were used to locate the relevant extension and CRM files. No secrets, parent conversation, or memory retrieved. No commands that compile code or execute tests were run for this brainstorm review.
