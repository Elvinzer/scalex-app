# CRM mobile route and touch-target QA

Date: 2026-10-02

## Scope

- Read-only authenticated local browser checks with `agent-browser` 0.33.2.
- Routes: `/crm`, `/crm/leads`, `/crm/pipeline`, `/crm/actions`,
  `/crm/appels`, `/crm/extension`, `/ventes/rdv`, and `/ventes/appels`
  (`/ventes/appels` resolves to `/crm/appels`).
- No lead, action, call, booking, or account data was changed.

## Responsive results

- All eight routes at 320 × 568: no horizontal overflow.
- The same eight routes had no horizontal overflow at 320 × 844, 390 × 844,
  768 × 900, 1280 × 900, and 1440 × 900. After the later contrast and phone
  fallback adjustments, `/ventes/rdv` was rechecked at 390 × 844, 768 × 900,
  1280 × 900, and 1440 × 900; all remained free of horizontal overflow.
- After the final UI changes, the 320 × 568 scan found no visible, actionable
  links, buttons, or form targets below 44 px. Visible labels were counted as
  the target when they activate their associated field; hidden `sr-only` labels
  and controls in closed drawers were not treated as visible targets.

## Findings fixed

- CRM lead links with a 42 px width now have a 44 px minimum width.
- Booking-page settings links, event actions, and repeated status controls now
  have a 44 px minimum height. The sidebar admin shortcut also has a 44 px
  minimum height.
- Axe found the repeated coral “mark contacted” action at 3.28:1 contrast.
  It now uses the shared outline button style, which also keeps repeated list
  actions from presenting a false single primary CTA.
- A phone value that cannot produce a `tel:` URL now renders as text instead
  of an anchor without `href`.

## Accessibility and validation

- Axe 4.12.1 on `/ventes/rdv` at 320 × 568: zero violations after the changes.
  One color-contrast check remains incomplete because the mobile navigation
  background is partially obscured in the audit; it is not a confirmed failure.
- `npm run typecheck`, `npm run lint`, and `npm run test` passed; Vitest ran
  164 files and 709 tests.
- `openspec validate --all --strict --no-interactive`: 31 items passed.
- `git diff --check`: passed.

## Production smoke

- Vercel deployment for commit `12e7c6c` completed successfully.
- Read-only `HEAD` checks on `www.minaly.io`: `/sign-in` returned 200;
  `/crm` and `/settings/calendars` returned 307 to `/sign-in`; the test-only
  `/e2e/calendar-agenda` route returned 404.
- `/ventes/appels?period=month&from=dashboard` returned 307 to
  `/crm/appels?period=month&from=dashboard`, confirming the legacy alias keeps
  its query parameters in production.
- Responses included the configured CSP, HSTS, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, and `Referrer-Policy` headers.
- These requests were read-only; no CRM or booking records were changed.

## Production vitals spot check

- `agent-browser vitals` on 2026-10-02, in the restored signed-in Chrome session,
  without network or CPU throttling. These are spot checks, not field p75 data.
- The first navigation through `/sign-in` landed on `/dashboard` and measured
  TTFB 22 ms, FCP 3.79 s, LCP 4.70 s. Two subsequent desktop Dashboard runs
  measured FCP 0.68–1.21 s and LCP 0.99–2.34 s; CLS was 0.00–0.03.
- At 390 × 844, Dashboard measured FCP 1.01 s, LCP 1.96 s, CLS 0.00.
- `/crm/leads` measured FCP 1.07 s, LCP 1.69 s, CLS 0.00 at 1280 × 720;
  at 390 × 844 it measured FCP 0.57 s, LCP 1.17 s, CLS 0.00.
- After commit `38cd37d`, a cache-cleared authenticated `/sign-in` navigation
  landed on `/dashboard`: TTFB 21 ms, FCP 1.97 s, LCP 3.06 s, CLS 0.00. A CDP
  navigation-timing sample counted one redirect and about 1.09 s of redirect
  processing. The previous cache-cleared sample on the same path measured
  FCP 2.27 s, LCP 3.28 s, and about 1.20 s of redirect processing. These are
  individual spot checks, so the roughly 0.1 s redirect reduction is not a
  stable performance result. Repeat with controlled device/network conditions
  before treating it as a trend; these checks do not establish field-user
  performance.
- After commit `9738ffe`, two more cache-cleared authenticated navigations
  still landed on `/dashboard` without browser errors. They measured FCP
  2.78–3.14 s, LCP 3.76–3.78 s, CLS 0.00–0.03, and CDP redirect processing
  1.89–1.98 s. This conflicts with the prior single sample and does not show a
  reproducible gain. The cold auth redirect remains unresolved; repeat several
  times under controlled device/network conditions before making a performance
  claim.

## Remaining limit

Task 9.3 remains open. This route and touch-target pass does not exercise the
full CRM action/KPI matrix or replace the controlled setter pilot in tasks
10.2–10.3.
