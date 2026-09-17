## 1. Release foundation

- [x] 1.1 Bump the extension manifest version and document the public Web Store and pilot package environment variables.
- [x] 1.2 Implement the shared CRM extension release model with manifest version loading, trusted distribution URL validation, package availability checks and deterministic Chrome version comparison.
- [x] 1.3 Add the public release metadata route with strict query validation, minimal JSON output, cache headers and rate limiting.
- [x] 1.4 Add the dependency-free extension packaging script, explicit runtime file allowlist, versioned/latest ZIP artifacts and version-increment guard.
- [x] 1.5 Wire extension packaging into the build lifecycle and ignore generated download artifacts without hiding source files.

## 2. CRM onboarding surface

- [x] 2.1 Add synchronized humanized FR/EN CRM translation keys for the suggestion, guide, distribution states, four setup steps, privacy limits, troubleshooting and release status.
- [x] 2.2 Build the responsive accessible `/crm/extension` guide as a server-rendered CRM page using the shared release model and existing design tokens.
- [x] 2.3 Add a small client-only CRM suggestion with local dismissal, accessible focus states and a link to the guide, without changing CRM navigation.
- [x] 2.4 Render the suggestion only for authorized CRM users on the CRM home page and preserve existing activation/access behavior.

## 3. Extension update experience

- [x] 3.1 Extend the extension Chrome type declarations and background message contract for release checks, Chrome update events and safe update actions.
- [x] 3.2 Implement background release polling and `onUpdateAvailable` handling, including trusted update URL normalization and deferred reload behavior.
- [x] 3.3 Add the non-blocking accessible update notice to the extension panel and keep it out of the way of loading/capture operations.
- [x] 3.4 Update extension documentation with the install paths, version bump/package workflow, Web Store publication and rollback procedure.

## 4. Verification and handoff

- [x] 4.1 Add unit/contract coverage for release version comparison, URL/distribution selection, route responses, package contents and extension update states.
- [x] 4.2 Run the package command and verify the generated ZIPs contain only the allowlisted runtime files and expose the expected latest metadata.
- [x] 4.3 Run typecheck, lint and the complete test suite, then fix all failures including raw FR/EN translation-key checks.
- [x] 4.4 Run the Next dev-loop compilation probes and browser checks for CRM home, guide states, narrow viewport, keyboard focus and no dead installation link.
- [x] 4.5 Review the final diff for secrets, raw colors, unsynchronized locales, generated artifacts and OpenSpec task completion.
