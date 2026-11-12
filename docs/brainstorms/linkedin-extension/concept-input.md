# LinkedIn lead capture: review input

Author: Cédric Bernard
Date: 2026-11-12
Status: User approved this scope for Goldfish brainstorming review. No implementation requested yet.

## Anchored feature hypothesis

On a standard LinkedIn profile, a Minaly icon beside the lead's name opens the existing extension panel. The panel prefills the visible full name and profile URL. The setter selects an authorized business; the last selection is remembered, stays visible, and can be changed. Existing leads must be recognized within that business instead of silently creating duplicates. Reuse the Instagram capture flow.

## Boundaries

Post-review user clarification: adding a new LinkedIn profile must set the CRM stage to `first_message_sent`, preserving the existing default. Do not replace this with an uncontacted stage. This stage decision does not request automatic sending of a message.

Capture one visible profile at a time. No automated messaging, bulk collection, private LinkedIn API, email or phone enrichment. Search results, Sales Navigator, and conversation interfaces are not approved for this first version. Notes and reminders are possible later work, not required now. Do not infer first and last name boundaries from a display name without considering ambiguous names.

## Known evidence, not runtime proof

extension/README.md claims LinkedIn support already exists and version 0.3.11 selects a business during connection and retains it when refreshing a session. Changing business currently appears to involve reconnecting. extension/manifest.json lists LinkedIn content script matches and version 0.3.11. These statements do not establish actual runtime reliability. Inspect the code before proposing new architecture.

## Competitor research

Breakcold documents switching workspace within its extension and viewing notes, history and tasks: https://help.breakcold.com/en/category/chrome-extension-16b2sbr/

Breakcold documents support for standard profiles, Sales Navigator and search results: https://help.breakcold.com/en/article/which-linkedin-pages-support-the-extension-6wda0r/

Breakcold explicitly says the extension does not extract email or phone from LinkedIn: https://help.breakcold.com/en/article/can-i-enrich-linkedin-leads-from-the-chrome-extension-ab6370/

These are documentation findings, not hands-on competitor testing. Feature parity is not a goal.

## Review requirements

Read your persona and this document first. Mode: BRAINSTORM. Read relevant local files to support findings; distinguish evidence from assumptions. Do not edit product code. Report practical scope gaps, existing reusable behavior, risks and acceptance checks. Avoid expanding into a new CRM or a LinkedIn automation integration. Use rtk for shell commands. Never read secrets or retrieve parent conversation/memory. Write your own report to the path assigned by the parent; list files actually read and any access failures.
