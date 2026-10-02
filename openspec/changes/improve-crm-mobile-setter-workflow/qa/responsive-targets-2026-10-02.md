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

## Focused CRM workflow check

- On 2026-10-02, an authenticated local browser check at 320 × 568 opened the
  lead-capture dialog and existing lead detail drawer without submitting data.
- The loss dialog displayed its required reason choices and was cancelled. The
  sale form displayed its validation fields and was dismissed before
  confirmation. The booking panel reported that the closer calendar was
  unavailable and kept confirmation disabled. No CRM or booking record changed.
- On 2026-10-02, `/crm` displayed the six primary KPI cards at 320 × 568. The
  acquisition-source filter appeared separately from the contact-platform
  filter. The document width measured 305 CSS px inside a 320 px viewport.
- A response-rate card click preserved the selected September cohort, the
  Instagram acquisition source and LinkedIn contact platform in its
  `/crm/leads` URL. Direct read-only navigation also exercised all six metric
  drill-downs; each page rendered its metric scope without a Next.js or browser
  error. The leads page measured 305 px of document width at 320 px.
- An axe scan found no violations. One color-contrast check remained incomplete
  because the scanner could not determine backgrounds for partially obscured
  navigation links and a gradient button.
- The local `/crm/leads` capture dialog stayed within the same 320 px width. Its
  create button measured 44 px high, and keyboard Tab moved focus from Close to
  the identity field. The lead detail drawer opened without saving; its
  qualification save button also measured 44 px high and the document remained
  305 px wide at a 320 px viewport.
- This focused check did not submit capture, response, qualification, booking,
  no-show, loss, or sale mutations. It also did not verify keyboard-open
  behavior, setter tasks over multiple days, or the full KPI/filter matrix.

- After the KPI requirement was clarified, the « Performance commerciale »
  panel was changed to open by default. At 320 × 568, the open panel stayed
  within the 305 px document width. Selecting « Dernier mois » retained
  acquisition source `instagram` and contact platform `linkedin` in all six
  KPI drill-down links; opening the response-rate link kept the 2026-09-01 to
  2026-09-30 first-message cohort and both filters in the leads route. That
  filtered cohort had no matching leads. These were read-only checks; the
  period picker also opened with keyboard focus and Enter. Axe found zero
  violations and one incomplete color-contrast check on mobile navigation and
  a gradient control; the scanner did not confirm a contrast failure. The
  full setter action and keyboard matrix remains open.

## Authenticated production mobile smoke

- On 2026-10-02, after the Vercel deployment for `90b7d75` succeeded, the
  restored owner session was checked at 320 × 568. `/dashboard`,
  `/diagnostic-app`, `/roadmap`, `/crm`, `/crm/leads`, `/crm/pipeline`,
  `/crm/actions`, `/crm/appels`, `/crm/extension`, `/settings/calendars` and
  `/settings/equipe` all loaded at 320 CSS pixels with no horizontal overflow.
- The browser console remained empty after clearing it before navigation. The
  lead drawer opened from a visible mobile lead row and stayed within the
  viewport; no lead data was changed.
- A visible-target scan found no actionable target below 44 px on `/crm`,
  `/crm/leads`, `/crm/pipeline`, `/crm/actions`, `/crm/appels`,
  `/crm/extension` or `/settings/calendars`.
- One unthrottled mobile-viewport vitals sample per route measured:
  `/dashboard` TTFB 22 ms / FCP 532 ms / LCP 832 ms / CLS 0;
  `/diagnostic-app` 23 / 712 / 1,544 ms / 0;
  `/crm` 54 / 592 / 628 ms / 0;
  `/crm/leads` 23 / 436 / 1,048 ms / 0;
  `/crm/pipeline` 22 / 460 / 1,112 ms / 0;
  `/crm/actions` 21 / 480 / 780 ms / 0;
  `/crm/appels` 22 / 480 / 1,156 ms / 0;
  `/settings/calendars` 21 / 784 / 1,088 ms / 0. These are individual samples,
  not field percentiles.
- The production smoke did not submit CRM or calendar mutations. Keyboard-open
  behavior, the complete action/KPI matrix and the setter pilot remain open.

## Remaining limit

Task 9.3 remains open. This route and KPI pass does not exercise the full CRM
keyboard/action matrix or replace the controlled setter pilot in tasks 10.2–10.3.

## Production KPI visibility check

- After the production deployment for `99a32fa` reached Ready, the authenticated
  owner route `/crm?team=1&range=previous-month&platform=linkedin&source=instagram`
  was checked at 320 × 568. The primary KPI panel opened by default, all six
  cards rendered, and the document width was 305 px. Each card link retained
  the 2026-09-01 to 2026-09-30 cohort plus acquisition source `instagram` and
  contact platform `linkedin`.
- Opening the response-rate card loaded `/crm/leads` with the expected metric,
  cohort dates and both filters. The browser reported no errors. This was a
  read-only production check; no CRM or booking mutation was submitted.
