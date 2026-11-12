# LinkedIn capture: comprehension review

Mode: BRAINSTORM. Static code review only; no runtime or competitor verification.

The concept is understandable: capture the currently visible person into an explicitly chosen business using the existing panel. The work should start by tightening the existing LinkedIn path rather than introducing a second capture architecture. No blocker found at the concept stage.

## Findings

### Major: define what changing business feels like

Dimension: UX & Developer Ergonomics.

Usability friction: the hypothesis says the business can be changed, but does not say whether the user stays in the panel. Today the business name is a button with a refresh icon that invokes the same authentication action as login (`extension/src/content.ts:722-730,1334`). The background opens `/sign-in` in a tab. A fresh reader cannot tell whether this reconnect flow is an accepted first-version experience or whether a panel selector is required. A refresh icon also conceals the destination of the action.

Ergonomic requirement: explicitly choose and label the switch interaction in the brief. Keep the selected business visible while inspecting and submitting a lead. Specify switching, cancellation, expired session, and loss of access. Acceptance: switch from business A to B on the same profile, verify B's resolution and qualification choices before enabling capture, then verify the lead lands in B. Repeat with two open profile tabs. Existing remembered-business and renewal behavior can be reused (`background.ts:100-125`). This review does not establish switch reliability.

### Major: full-name preservation needs a concrete contract

Dimension: UX & Developer Ergonomics.

Usability friction: the concept correctly warns against guessing name boundaries, but the current panel offers only an editable display-name field and both extraction and edits call `minalySplitName`, which uses the first whitespace token as first name and everything else as last name (`content.ts:100-103,315-345,935-941`). Simply reusing the Instagram path preserves the exact behavior the concept cautions against.

Ergonomic requirement: define whether this version stores the visible full name without claiming a reliable split, or lets the setter explicitly correct structured fields when those fields are needed. Acceptance: mononym, compound given name, particles, suffixes and non-Latin names preserve the full visible name and do not silently acquire asserted boundaries. Specify the visible fallback when the name has not loaded; the existing extractor falls back to the handle.

### Major: the approved surface needs a visible, testable boundary

Dimension: UX & Developer Ergonomics.

Usability friction: “standard LinkedIn profile” leaves company pages implicit. Current detection accepts both `/in/` and `/company/`, may select a visible profile link on other pages, and tries conversation identities first (`content.ts:105-115,217-222`). Broad manifest matches are not proof of a valid capture surface. Reusing this detection unchanged can expose a person-capture control where the feature promises no support, or attach a page heading to a different person's URL.

Ergonomic requirement: define supported URLs as individual `/in/` profiles for this first version unless company capture is separately approved. Acceptance: no capture launcher on search, company, Sales Navigator or messaging surfaces; on navigation from person A to B, the displayed name, URL and launcher all refer to B before capture is enabled. Decide whether the existing floating launcher is acceptable while the profile heading is missing, and prevent capture of uncertain identity.

### Major: capture should not silently mean “message sent”

Dimension: UX & Developer Ergonomics.

Usability friction: the anchored intent is saving a visible person. The reused unknown-lead form defaults its starting stage to `first_message_sent` and exposes A/B-message state and message-detection context (`content.ts:923-1002`). A setter can save a profile without contacting the person, so this default gives a different business meaning to the action. The known-lead flow also contains notes and next-action controls, although those are deferred in the concept.

Ergonomic requirement: explicitly decide which existing controls remain visible for LinkedIn and what stage an uncontacted capture receives. Acceptance: adding a never-contacted person does not imply a message, response, or reminder was created. Reusing a component must not silently expand the promised interaction into the Instagram messaging workflow. Existing notes/actions need not be rebuilt or removed globally to satisfy this scope.

### Major: explain the duplicate decision before the click

Dimension: UX & Developer Ergonomics.

Usability friction: “existing leads must be recognized” does not distinguish exact profile identity from a possible name match. The panel already supports known, unknown and ambiguous results, manual search, candidate profile links, and an explicit separate-lead action (`content.ts:872-930,1006-1081`). Selecting a candidate immediately calls capture; that consequence is not obvious from the generic instruction to choose a record. The unknown state says the profile does not exist, which is stronger than a search result can guarantee for unlinked cross-network records.

Ergonomic requirement: preserve exact-match versus possible-match semantics and make candidate selection's linking effect clear. Define whether ambiguous candidates can be inspected before linking, and retain an explicit separate-person choice. Acceptance: exact LinkedIn URL yields the existing lead; two people with the same name are not automatically merged; a cross-network candidate can be inspected and deliberately linked; the same person in a different business never appears as a candidate in the selected business. Server matching behavior was not inspected here, so these are required checks, not verified guarantees.

## Files read

- `/Users/cedricbernard/.codex/plugins/cache/egm/egm/0.1.1/agents/comprehension.md`
- `docs/brainstorms/linkedin-extension/concept-input.md`
- `extension/README.md`
- `extension/manifest.json`
- `extension/src/content.ts` (targeted extraction, panel, business and navigation sections)
- `extension/src/background.ts` (targeted session, request and authentication sections)

No access failures. No product files changed. No other reports, history, memory, or secrets read.
