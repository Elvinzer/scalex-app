// ─────────────────────────────────────────────────────────────────────────
// iClosed API "protocol" — the ONE place that encodes the parts of iClosed's
// public API we could not confirm from public docs at build time (exact
// endpoint paths, webhook event-type strings, payload field names). Everything
// else in lib/iclosed/ is written against these constants, so aligning the
// integration with the real API once we have authenticated developer-portal
// access is a single-file edit here — no logic to hunt down elsewhere.
//
// What IS confirmed from public docs (do not "fix" these):
//   - Base URL:        https://public.api.iclosed.io
//   - Auth:            Authorization: Bearer iclosed_<key>  (static API key,
//                      generated in iClosed Settings → Developers → API Keys)
//   - Webhook register: POST /v1/webhooks  { url, events }
//   - Real event names (Zapier connector): Call Booked, Call Cancelled,
//     Call Rescheduled, Call Outcome, Transaction Synced, …
// ─────────────────────────────────────────────────────────────────────────

export const ICLOSED_API_BASE = "https://public.api.iclosed.io";

// Bearer keys are shown to the client as "iclosed_..." — used only to give an
// early, friendly validation error, never as real security.
export const ICLOSED_KEY_PREFIX = "iclosed_";

// ⚠️ CONFIRM against the authenticated developer portal. Best-effort defaults
// based on the documented REST shape (contacts/calls/deals/transactions/
// events/webhooks resources, /v1 prefix).
export const ICLOSED_ENDPOINTS = {
  // A cheap authenticated GET used purely to validate a key (2xx = valid,
  // 401/403 = invalid, anything else = "unknown / retry later").
  validate: "/v1/me",
  webhooks: "/v1/webhooks", // POST to create, DELETE /v1/webhooks/{id}
  calls: "/v1/calls", // GET list (backfill)
} as const;

// The webhook events we subscribe to on connect. Kept as the human names the
// iClosed UI/Zapier use; if the API expects slugs (e.g. "call.booked") adjust
// the right-hand side only.
export const ICLOSED_WEBHOOK_EVENTS = {
  callBooked: "Call Booked",
  callCancelled: "Call Cancelled",
  callRescheduled: "Call Rescheduled",
} as const;

// How the webhook envelope's `type` field identifies each event. We match
// case-insensitively and tolerate several spellings ("Call Booked",
// "call.booked", "call_booked") so a minor format difference doesn't silently
// drop deliveries — see lib/iclosed/events.ts.
export const ICLOSED_EVENT_MATCHERS = {
  booked: ["call booked", "call.booked", "call_booked", "booked"],
  cancelled: ["call cancelled", "call canceled", "call.cancelled", "call_cancelled", "cancelled", "canceled"],
  rescheduled: ["call rescheduled", "call.rescheduled", "call_rescheduled", "rescheduled"],
} as const;
