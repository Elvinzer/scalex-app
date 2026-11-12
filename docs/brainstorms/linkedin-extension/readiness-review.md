# LinkedIn capture: implementation readiness review

Mode: BRAINSTORM. Focus: migration, backward compatibility, rollout and rollback. Code inspection only; no runtime or database verification performed. No product code changed.

## Existing behavior to preserve

LinkedIn is already a supported platform in the content script, URL normalization and capture/resolve endpoints. The extension already stores a selected business ID and name, renews its session for that business, and offers reconnection through the business label. The server verifies current CRM access for the business encoded in the signed bearer token. Resolution checks both `crm_lead_profiles` and legacy profile columns on `leads`, scoped to the business; uniqueness constraints also include the business. This concept can build on those contracts without a new LinkedIn integration or a new lead table.

## Findings

### Major: business changes must invalidate the previous business's panel state

- **Dimension:** Migration & Backward Compatibility.
- **Compatibility hazard:** The current selection is global extension storage, not per tab. Authentication replacement broadcasts to all tabs. Adding a direct selector while retaining resolved leads, candidate selections, offers or requests from the old business could present or submit a stale decision under the new session. The concept does not yet specify what happens to an open panel or an in-flight capture when another tab changes business.
- **Migration requirement:** Preserve the existing stored business keys and pinned renewal semantics. Specify a single selection scope, clear business-dependent panel state on a successful switch, and resolve the currently visible profile again before allowing capture. Associate responses with both profile and business so old responses cannot replace current state. Define whether switching waits for an active mutation or takes effect after it; a completed capture must remain attributed to its original business. Lost membership must require a fresh authorized choice rather than silently selecting another business.
- **Acceptance checks:** Upgrade a connected 0.3.11 installation without losing its selection; switch with two LinkedIn tabs open; deliver an old resolve response after switching; expire a session and revoke membership; verify the visible business and resulting lead agree in every case.

### Major: ambiguous-name handling changes a shared persistent contract

- **Dimension:** Migration & Backward Compatibility.
- **Compatibility hazard:** `minalySplitName` currently turns the first word into `firstName` and the remainder into `lastName`. Server normalization independently repeats that inference when parts are absent or blank. Lead creation persists these inferred fields, and recapture updates the social name fields. Merely omitting name parts in the new LinkedIn client therefore does not satisfy the concept's ambiguous-name boundary. Changing shared normalization could also change Instagram/import behavior.
- **Migration requirement:** Decide explicitly how an unparsed display name is represented, presented and later corrected. Preserve the full visible name and avoid treating blank fields as permission to infer boundaries on the new path. Keep older clients accepted during rollout, avoid a blanket rewrite of existing names, and ensure recapture does not overwrite manually confirmed names. If a new field is needed, make it additive with safe behavior for clients that omit it; a schema migration is not established as necessary by this review.
- **Acceptance checks:** Multiword given names, surname-first names, single names and suffixes retain their full display name; old clients still capture; Instagram behavior remains intentional; corrected existing names survive LinkedIn recapture.

### Major: preserve legacy and additional-network identity during deduplication changes

- **Dimension:** Migration & Backward Compatibility.
- **Compatibility hazard:** Existing exact resolution deliberately supports both the legacy primary-profile columns and the newer additional-profile table. The concept's “existing leads” includes leads whose primary network is Instagram and whose LinkedIn identity is attached separately. Replacing this with a LinkedIn-only lookup or changing canonical URL rules would bypass existing identity and risk duplicates. An unchanged name cannot establish that two different profile URLs are the same person.
- **Migration requirement:** Reuse the existing business-scoped resolution, ambiguous-match confirmation and transactional uniqueness path. Preserve the canonical URL contract (`https://linkedin.com/in/<lowercase-slug>`, without query parameters) and legacy fallback. Require explicit confirmation for suggested cross-network matches. If URL rules do change, define compatibility lookup/backfill and collision handling before release rather than deleting or merging leads automatically.
- **Acceptance checks:** Recognize a legacy LinkedIn lead, LinkedIn attached to an Instagram lead, and the same URL with `www`, tracking query and trailing slash. The identical URL in another business must remain independent. Concurrent captures and retries must not produce two leads; a same-name different person must remain a choice.

### Major: scope reduction and rollback need a supported-version contract

- **Dimension:** Migration & Backward Compatibility.
- **Compatibility hazard:** The manifest currently injects throughout LinkedIn; detection includes conversation surfaces, `/company/` URLs and fallback links found on other pages. The approved concept only covers a standard personal profile. A new client can narrow its launcher, but already installed clients can continue using broader surfaces and old payloads. Chrome updates are asynchronous, and the documented rollback publishes a higher corrective version rather than downgrading installed clients.
- **Migration requirement:** State that the new release gates LinkedIn capture to the approved personal-profile surface, including SPA navigation away from that surface, without breaking Instagram. Keep shared APIs and stored session formats compatible with 0.3.11 throughout the rollout. Publish through the existing versioned package/update flow and keep the corrective release strategy; rolling back distribution must not delete captured leads or clear the user's selected business. Decide whether older clients remain supported on their broader surfaces or must update before LinkedIn capture; do not assume a launcher change enforces policy on every installation.
- **Acceptance checks:** Upgrade while a panel is open, navigate profile to search/company/messaging without reloading, and confirm no stale capture remains actionable. Run old and new clients against the deployed server. Exercise the corrective higher-version release and verify existing leads and selections survive.

## Files read

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.1/agents/implementation_readiness.md`
- `docs/brainstorms/linkedin-extension/concept-input.md`
- `extension/README.md`
- `extension/manifest.json`
- `extension/src/background.ts`
- `extension/src/content.ts` (targeted sections and searches)
- `docs/crm-extension-release.md`
- `app/api/crm/extension/session/route.ts`
- `app/api/crm/extension/resolve/route.ts`
- `app/api/crm/extension/capture/route.ts`
- `lib/crm/extension-session.ts`
- `lib/crm/normalization.ts`
- `lib/crm/profile-matching.ts`
- `lib/crm/queries.ts` (targeted resolution/create sections and search)
- `db/schema.ts` (targeted CRM profile/lead schema sections and search)

No access failures. No other reports, history or memory were read. The documented competitor pages were not needed for this compatibility review and were not opened.
