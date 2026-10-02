# Dashboard bottleneck production smoke

Date: 2026-10-02
Commit: `bda1fef2ee4946c240e4fdcc68e0f66aea60288f`

## Local verification

- `npm run typecheck`, `npm run lint` and `npm run test` passed. Vitest ran 157
  files and 669 tests.
- `openspec validate improve-dashboard-bottleneck-clarity --strict` passed.
- An authenticated, read-only browser check of `/dashboard` at 320 px showed
  no horizontal overflow, the inline funnel summary, localized source labels
  linked to their current routes, and the Falco stage dialog. The browser
  console reported no page errors; axe reported zero violations and one
  incomplete color-contrast check caused by a gradient/pseudo-element.
- Component tests render French and English fixtures with two funnel variants,
  including source links, localized labels, variant options and the inline
  summary. The removed summary button/dialog are absent.

## Production deployment and smoke

- GitHub reports the Vercel Production deployment for the commit above as
  successful.
- `https://www.minaly.io/sign-in` returned HTTP 200. At 320 × 568, the document
  width matched the viewport and the page had one heading and one form.
- Unauthenticated requests to `/dashboard`, `/crm` and `/crm/actions` returned
  HTTP 307 to `/sign-in`.
- At 390 × 844, the sign-in page reported TTFB 23.8 ms, FCP 196 ms, LCP 196 ms
  and CLS 0. Axe reported zero violations and one incomplete color-contrast
  check on the gradient button. No browser errors were reported.
- No CRM or account data was changed during these checks.

## Remaining verification

- Follow-up on 2026-10-02 at 1280 × 720 against the authenticated local
  `/dashboard` confirmed the bottleneck source links resolve to `/crm/appels`
  and `/ventes/suivi`; the Falco stage button opens its dialog and Escape closes
  it. This was read-only and did not change account data.
- The authenticated production Dashboard was not checked because production
  sign-in requires an email link. The local authenticated account currently
  has only one acquisition journey, so it does not render the journey selector.
- Task 5.2 remains open until an authenticated test account with multiple
  acquisition journeys is available for an interactive browser check.
