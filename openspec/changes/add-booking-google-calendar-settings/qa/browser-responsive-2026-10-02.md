# Google Calendar settings and agenda browser QA

Date: 2026-10-02

## Environment and safety

- Local Next.js 16.3.5 with Turbopack and `agent-browser` 0.33.2.
- Used `/e2e/calendar-settings` and `/e2e/calendar-agenda`, which render synthetic `.example.test` data and return `notFound()` in production.
- Did not open the real calendar settings route, connect Google accounts, or mutate CRM/booking records.
- The settings save request was captured and held in the browser. A route abort was also installed for the fixture path; no POST reached the Next.js server.

## Responsive matrix

Checked settings and agenda at 320×568, 390×844, 768×900, 1280×900, and 1440×900. The agenda was checked in Agenda, Week, and List views. At each viewport, `documentElement.scrollWidth` matched `clientWidth`; no page-level horizontal overflow appeared. The week grid keeps its own bounded horizontal scroller at tablet/desktop widths.

## States and behavior

- Calendar settings: ready, empty, disconnected, success, OAuth error, and pending save.
- Empty settings expose a `role="status"` message; OAuth failure exposes `role="alert"`; success and pending save use `role="status"`.
- While a save is held, the button changes to its saving label and disables the form actions. The captured POST remained in the browser and was not sent to the server.
- Disconnected invitation accounts now explain that reconnection is required, instead of suggesting that only calendar write access is missing.
- Agenda: populated agenda/week/list views and the empty period state. No raw translation keys appeared in either language.

## Keyboard and accessibility checks

- The accessibility tree exposes page headings, links, buttons, `Source`, `Status`, and `Period` controls with names; tabs expose selected state.
- Keyboard traversal reaches the tabs, filters, and appointment actions. Focus is visible on settings controls and on agenda filters; dropdown wrappers show a 3 px accent ring.
- Opening an appointment record moves focus to its close button. Escape closes the drawer and restores focus to the appointment action.
- Settings links and buttons are at least 44 px high. Week-view appointment buttons now enforce a 44 px minimum height; conflict checkbox rows retain a 56 px label target.

## Fixes made from this pass

- Increased calendar settings action targets to at least 44 px.
- Added a live announcement for the pending save state.
- Corrected the disconnected invitation-account recovery message.
- Added visible keyboard focus to agenda filter controls and raised week appointment targets to 44 px.
- Added development-only fixtures for empty, error, disconnected, success, and agenda view states.
- Raised booking management event actions to 44 px; the mobile action/contrast follow-up is recorded in the CRM responsive QA report.

## Validation

- `npm run test`: 164 files passed, 709 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Next.js `get_compilation_issues`: `issues: []`.
- Next.js `get_errors`: no config or session errors.
- `openspec validate add-booking-google-calendar-settings --type change --strict --no-interactive`: valid.
- `git diff --check`: passed.

## Deployment and production smoke

- Commit `26b0e60` was pushed to `main`. GitHub reports the Vercel commit status as
  `success` (`Deployment has completed`):
  [deployment](https://vercel.com/cedrics-projects-87cca661/scalex-app/9H2pe5AgGJMwDjeTpRatFEqVcQbs).
- `https://www.minaly.io/sign-in` returned HTTP 200.
- Unauthenticated requests to `/crm` and `/settings/calendars` returned HTTP 307
  to `/sign-in`.
- `/e2e/calendar-agenda` returned HTTP 404 in production, as expected for the
  development-only fixture.
- These checks did not authenticate to production, connect Google, or mutate
  CRM/booking records.

## Remaining limits

This browser matrix uses synthetic data. It does not verify real Google OAuth, Google Calendar/Meet provider behavior, or authenticated owner/two-closer access. Those flows remain in tasks 9.2–9.6 and require dedicated test identities/provider configuration.
