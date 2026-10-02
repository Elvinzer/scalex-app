# Intensive mobile setter pass

Date: 2026-09-19

## Scope

The acceptance dataset runs 250 deterministic loops: 5 simulated working days
with 50 leads per day. It covers the requested states: new, contacted,
responded, qualified, booked, no-show, lost, reopened and sold. Ten loops use
the slow-network checkpoint. The fixture is reproducible and is not presented
as five calendar days of field observation.

Historical rows without a reliable `first_message_sent` event remain `new`; no
synthetic contact, qualification or KPI event was inserted during the
backfill.

## Results

| Check | Result |
| --- | --- |
| Setter loops | 250 |
| Simulated days | 5 × 50 |
| Unique lead identities | 250 |
| Duplicate operation keys | 0 |
| Slow-network checkpoints | 10 |
| Common-action tap budget target | 3 after opening a lead, excluding text entry and keyboard submit |
| Field elapsed time / retry count | Not measured by the deterministic fixture; reserved for the controlled pilot |

## Manual mobile checkpoints

- 320 × 568 and 320 × 812: CRM section tabs remain reachable; lead capture,
  lead drawer and internal booking dialog remain usable without horizontal
  overflow. The mobile navigation and Falco bubble do not overlap, and the
  main content keeps its bottom safe-area reserve.
- 320, 360, 375, 390, 393, 414 and 430 CSS px: `/crm`, `/crm/pipeline`,
  `/crm/leads`, `/crm/actions` and `/crm/appels` keep `scrollWidth` equal to the
  viewport width. Visible controls have at least a 44 px touch area; the only
  smaller node is the native checkbox inside its larger label target.
- 768, 1024, 1280 and 1440 CSS px: the same routes keep their exact active tab
  and have no horizontal overflow.
- Lead detail: response, qualification, booking link, internal slots, no-show,
  loss and sale-validation surfaces were opened. Internal booking displayed
  Minaly-calculated slots with the available closer and stayed local until
  confirmation. The QA lead was reopened after the no-show mutation.
- Offline transition: capture and qualification mutations show an error,
  re-enable the control and preserve their draft. Capture drafts also reload
  after navigation.
- Accessibility: axe reports zero violations on the CRM routes and Falco chat
  drawer after its delayed load. The chat scroll region is keyboard-focusable,
  icon controls are named, and the production sign-in page has a main landmark.
- Dark mode, reduced motion and keyboard focus were checked at 320 px. The
  focused search field is brought into the visual viewport.

## Cumulative frictions fixed during the second pass

- Platform changes now update the default acquisition source, while a source
  deliberately chosen by the setter is preserved.
- Qualification saves no longer remove an unsaved team note from the same lead.
- Note, qualification, booking-link and internal-booking retries keep their
  operation key when the request fails, limiting duplicate history and calls.
- Internal booking conflict checks respect closer buffers and appointment
  duration and configured closer calendars, including concurrent idempotent
  confirmations.
- Lead and action ordering uses a stable tie-breaker so returning to a queue
  does not reshuffle equal timestamps.
- The queue keeps its active due-date, relance and category subset when it
  completes or reschedules an action, and the next-lead shortcut follows that
  same subset.
- Share/copy booking is locked while the phone hands the link to the native
  share sheet or clipboard, so repeated taps do not open multiple share flows.
- Assignment, loss, reopen and state mutations retain their operation key
  through a failed response, while server results now distinguish saved state
  from an error and the UI exposes pending transitions.
- CRM filters, shortcuts, drawer controls and call-management controls now use
  44 px minimum touch targets on mobile. The Falco chat close/send controls and
  scroll region are named and keyboard-usable, including while the drawer is
  still loading.
- The Falco portrait fallback no longer emits a repeated Next Image sizing
  warning when the chat bubble is opened.

## Follow-up local browser regression — 2026-10-02

- At 320 × 568 and a reduced 320 × 360 viewport, the capture dialog stayed
  within the viewport (`scrollWidth === innerWidth`). The focused identity field
  remained visible at the reduced height; this approximates keyboard pressure
  but does not replace an iOS or Android virtual-keyboard check.
- At 320 × 812, `/crm`, `/crm/leads`, `/crm/pipeline`, `/crm/actions`,
  `/crm/appels` and `/crm/extension` showed the expected active section state
  without horizontal overflow.
- A synthetic capture draft survived an offline submission, closing and
  reopening the dialog, and browser back/forward navigation. The error remained
  visible and the draft was cleared after the check.
- With the browser fetch call stubbed to reject after a delay, the submit button
  disabled while pending, a second tap did not start another request, and a
  retry kept the same idempotency key and draft. The stub prevented the request
  from reaching the app server, so no CRM record was created.
- The draft was removed from session storage and the browser session was closed
  after the check. No database mutation was made.

## Pilot gate

The deterministic pass, representative browser checkpoints and production
deployment are green. A real five-day pilot remains necessary to measure
elapsed time per lead, actual scroll count and retry frequency with a setter
account. The new workflow is ready for that controlled pilot, not for an
unobserved general rollout.

## Local timezone regression — 2026-10-02

- CRM queue grouping, due-date display and rescheduling now use the same
  validated browser timezone. Direct visits with a missing or stale timezone
  synchronize it after hydration, so server and browser render the initial
  view consistently.
- Date conversion tests cover Paris local time, a nonexistent spring-forward
  time and postponing across a daylight-saving boundary.
- Full local checks: typecheck, lint and 653 tests passed. The Next.js dev
  server reported no compile, session or browser errors.
- `/crm` was checked at 320 × 568, and `/crm/actions` at 320 × 568 and
  1280 × 900. Document width matched the viewport, sampled local date inputs
  matched visible due dates, and axe reported zero violations. Axe left color
  contrast as an incomplete manual review item.
- The full route/action/KPI matrix, wider network fault automation and
  controlled setter pilot remain open under tasks 9.3, 9.4, 10.2 and 10.3.

## Production smoke — 2026-10-02

- Commit `a109d4f235817c0704fbaf0ce83fc4854a54a312` deployed to Vercel
  Production with a successful deployment status.
- On `www.minaly.io`, authenticated read-only checks covered `/crm`,
  `/crm/leads`, `/crm/pipeline`, `/crm/actions`, `/crm/appels` and
  `/crm/extension` at 320 × 568 and 1280 × 900. Each route displayed its
  expected heading and `scrollWidth` matched the viewport. The due-today filter
  had no matching actions in the account used for the check and showed its
  empty state.
- The timezone query synchronized from UTC to the browser's `Europe/Paris`
  zone. Fresh-session browser checks reported zero JavaScript errors on `/crm`
  and `/crm/actions`; axe reported zero violations on both, with color contrast
  left for manual review.
- The unauthenticated `/crm` request redirected to `/sign-in`; `/sign-in`
  returned HTTP 200. CRM pages were inspected in an existing authenticated
  session. No CRM mutation was submitted.
- The production deployment is verified for these read-only checks. Field
  timing, the full route/action/KPI acceptance matrix, broader network-failure
  automation and the controlled setter pilot remain open under tasks 9.3, 9.4,
  10.2 and 10.3.

## Local route matrix — 2026-10-02

- Read-only browser checks covered `/crm`, `/crm/leads`, `/crm/pipeline`,
  `/crm/actions`, `/crm/appels` and `/crm/extension` at 320, 360, 375, 390,
  393, 414 and 430 CSS px. Every route showed its expected heading, and
  `documentElement.scrollWidth` matched the viewport width.
- At 320 × 568, the same six routes had no horizontal overflow, and the
  section navigation exposed exactly one `aria-current="page"` link matching
  the current route.
- These checks were read-only. They confirm route reachability and layout; they
  do not close the remaining form/action/KPI interaction matrix or pilot tasks.
- A local `/crm/actions` fault-injection pass ran with the browser offline and
  a 1.2 s delayed rejection for mutation POSTs. A double tap on “Terminer”
  produced one intercepted request, disabled the second tap while pending,
  kept the action visible after failure and displayed the retryable error.
  The fetch wrapper rejected before the original network call; no server
  mutation was submitted. The browser was returned online and the wrapper
  removed afterward.
