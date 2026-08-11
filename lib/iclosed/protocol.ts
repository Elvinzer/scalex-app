// ─────────────────────────────────────────────────────────────────────────
// iClosed API constants — now aligned with the REAL public API (verified
// against developer.iclosed.io + live probing on 2026-07-29), no longer
// best-effort guesses.
//
// Confirmed:
//   - Base URL: https://public.api.iclosed.io
//   - Auth:     Authorization: Bearer iclosed_<key>   (static API key)
//   - List calls: GET /v1/eventCalls?eventType=ALL&limit=100&page=0
//                 → { data: { eventCalls: [...], count } }   (returns HTTP 201)
//   - eventType enum: PAST | UPCOMING | ALL
//   - ⚠️ API access requires a Business/Enterprise iClosed plan. A key on a
//     lower plan authenticates (not 401) but every data endpoint returns a
//     bare `{ "message": "Bad request" }` 400 — see validateIclosedKey's
//     "no_api_access" branch.
//   - ⚠️ There is NO public webhook-management endpoint. Real-time webhooks are
//     configured in the iClosed dashboard (Settings → Developer → Webhooks),
//     not via API, so the integration uses a one-time backfill followed by the
//     token-scoped webhook receiver.
// ─────────────────────────────────────────────────────────────────────────

export const ICLOSED_API_BASE = "https://public.api.iclosed.io";
export const ICLOSED_KEY_PREFIX = "iclosed_";

export const ICLOSED_ENDPOINTS = {
  // Also used to validate a key (no dedicated /me endpoint exists).
  eventCalls: "/v1/eventCalls",
  // Deal amounts live here, NOT on eventCalls (whose `deals` is empty in
  // practice). Linked back to a call by `eventCallId`; `value` is a string.
  deals: "/v1/deals",
} as const;

// Webhook event IDs (from developer.iclosed.io "Event Types"). Kept for the
// webhook receiver's type-matching and for whenever real-time delivery is set
// up manually in the iClosed dashboard with these triggers.
export const ICLOSED_WEBHOOK_TRIGGERS = [
  { id: "newCallScheduled", name: "Call booked" },
  { id: "callCancelled", name: "Call cancelled" },
  { id: "callRescheduled", name: "Call rescheduled" },
] as const;

// How the webhook envelope identifies each event (matched case-insensitively;
// several spellings tolerated). iClosed uses `hookType` / event ids like
// "newCallScheduled".
export const ICLOSED_EVENT_MATCHERS = {
  booked: ["newcallscheduled", "call booked", "call.booked", "call_booked"],
  cancelled: ["callcancelled", "call cancelled", "call.cancelled", "call_cancelled"],
  rescheduled: ["callrescheduled", "call rescheduled", "call.rescheduled", "call_rescheduled"],
} as const;
