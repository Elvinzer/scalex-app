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

## Pilot gate

The deterministic pass, representative browser checkpoints and production
deployment are green. A real five-day pilot remains necessary to measure
elapsed time per lead, actual scroll count and retry frequency with a setter
account. The new workflow is ready for that controlled pilot, not for an
unobserved general rollout.
