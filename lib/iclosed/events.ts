import { z } from "zod";

import { ICLOSED_EVENT_MATCHERS } from "./protocol";

// Parsing of iClosed calls into our own domain. `readCall` targets the real
// GET /v1/eventCalls item shape (verified 2026-07-29) and also tolerates the
// webhook envelope (data/call/payload wrapper) so the same reader serves both
// the backfill and — if real-time webhooks are set up in the iClosed dashboard
// — the webhook receiver. The envelope (event id + type) is strictly validated
// for idempotency/routing; the call body is read defensively.

export type IclosedEventKind = "booked" | "cancelled" | "rescheduled" | "unknown";

export type NormalizedCall = {
  iclosedCallId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  scheduledAt: Date;
  durationMinutes: number | null;
  closer: string | null;
  eventType: string | null;
  // Auto-mapped from iClosed's own disposition (task.outcome / cancelledBy) and
  // deal value, so a backfill fills the funnel + CA instead of importing blank
  // "à traiter" rows. Null attendance = iClosed has no disposition yet → the
  // call stays "à venir/à traiter" and the closer sets it by hand.
  attendance: "booked" | "showed" | "no_show" | "cancelled" | null;
  outcome: "pending" | "closed" | "not_closed" | null;
  contracted: number | null; // from the WON deal value
  collected: number | null;
};

// Only the envelope is strict. `.passthrough()` keeps unknown fields; the call
// object may live under data/call/payload, or the envelope may itself BE the
// call (backfill list items) — readCall() handles all of those.
const envelopeSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    type: z.string(),
    data: z.record(z.string(), z.unknown()).optional(),
    call: z.record(z.string(), z.unknown()).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type IclosedEnvelope = z.infer<typeof envelopeSchema>;

export function parseEnvelope(raw: unknown): IclosedEnvelope | null {
  const parsed = envelopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function classifyEvent(type: string): IclosedEventKind {
  const t = type.trim().toLowerCase();
  if (ICLOSED_EVENT_MATCHERS.booked.some((m) => t.includes(m))) return "booked";
  if (ICLOSED_EVENT_MATCHERS.cancelled.some((m) => t.includes(m))) return "cancelled";
  if (ICLOSED_EVENT_MATCHERS.rescheduled.some((m) => t.includes(m))) return "rescheduled";
  return "unknown";
}

// ── defensive field readers ──────────────────────────────────────────────
type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// The call object can be the envelope itself (list items) or nested under a
// data/call/payload wrapper.
function callBody(source: Rec): Rec {
  return asRecord(source.data) ?? asRecord(source.call) ?? asRecord(source.payload) ?? source;
}

// Turns a raw iClosed call/booking object into our NormalizedCall, or null if
// it lacks the two fields we cannot invent (a stable id and a scheduled time).
// ⚠️ The candidate field names below are best-effort — confirm & trim once the
// real payload shape is known.
export function readCall(source: Rec): NormalizedCall | null {
  const body = callBody(source);

  // Deliberately NOT falling back to the envelope's own `id` (that's the EVENT
  // id, not the call id) — mis-keying on it would break idempotency across a
  // call's booked→rescheduled→cancelled lifecycle. No call id = skip.
  // Real /v1/eventCalls item: `id` (number). Deliberately NOT the envelope's
  // own id (that's the EVENT id on webhooks, not the call id).
  const id = firstString(body.id, body.callId, body.eventCallId, body.uuid);
  if (!id) return null;

  // `dateTimeUTC` is the normalized start; `dateTime` is the local fallback.
  const scheduledRaw = firstString(body.dateTimeUTC, body.dateTime, body.startTime, body.scheduledAt);
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return null;

  const contact = asRecord(body.contact) ?? asRecord(body.invitee) ?? {};
  const inviteeName = firstString(body.inviteeName, joinName(body.firstName, body.lastName), contact.name);
  const inviteeEmail = firstString(body.inviteeEmail, contact.email, body.email);

  // The assigned closer is the `user` object on eventCalls.
  const user = asRecord(body.user) ?? asRecord(body.closer) ?? asRecord(body.owner) ?? {};
  const closer = firstString(joinName(user.firstName, user.lastName), user.email, user.name, body.closer);

  // Human label = the event template name. (body.eventType here is the timing
  // enum UPCOMING/PAST, NOT a label — don't use it as one.)
  const event = asRecord(body.event) ?? {};
  const eventType = firstString(event.name, body.eventTypeName);

  const disposition = mapDisposition(body);

  return {
    iclosedCallId: id,
    inviteeName,
    inviteeEmail,
    scheduledAt,
    durationMinutes: durationMinutesFromCall(body, scheduledAt),
    closer,
    eventType,
    ...disposition,
  };
}

// iClosed already records each call's result — map it to our funnel so a
// backfill is auto-filled. Outcome lives on the first `task`; a `cancelledBy`
// marks a cancellation; `deals[].value` is the closed amount.
const CLOSED_OUTCOMES = new Set(["WON"]);
const LOST_OUTCOMES = new Set(["NO_SALE", "REJECTED", "UNQUALIFIED"]);

function mapDisposition(body: Rec): Pick<NormalizedCall, "attendance" | "outcome" | "contracted" | "collected"> {
  const none = { attendance: null, outcome: null, contracted: null, collected: null } as const;

  if (firstString(body.cancelledBy)) {
    return { attendance: "cancelled", outcome: null, contracted: null, collected: null };
  }

  const task = Array.isArray(body.task) ? (asRecord(body.task[0]) ?? {}) : asRecord(body.task) ?? {};
  const outcome = firstString(task.outcome)?.toUpperCase() ?? null;
  const noSaleReason = firstString(task.noSaleReason)?.toUpperCase() ?? null;

  if (noSaleReason === "NO_SHOW") {
    return { attendance: "no_show", outcome: "pending", contracted: null, collected: null };
  }
  if (!outcome) return none; // not dispositioned in iClosed yet

  if (CLOSED_OUTCOMES.has(outcome)) {
    const deals = Array.isArray(body.deals) ? body.deals : [];
    const value = deals.reduce((sum, d) => {
      const v = asRecord(d)?.value;
      return sum + (typeof v === "number" ? v : 0);
    }, 0);
    const contracted = value > 0 ? Math.round(value) : null;
    // We know the contracted amount from the WON deal; iClosed doesn't expose a
    // reliable collected figure here, so we optimistically treat a WON deal as
    // collected (the closer can adjust per call for payment plans).
    return { attendance: "showed", outcome: "closed", contracted, collected: contracted };
  }
  if (LOST_OUTCOMES.has(outcome)) {
    return { attendance: "showed", outcome: "not_closed", contracted: null, collected: null };
  }
  // QUALIFIED / APPROVED / PENDING / PENDING_OUTCOME — they showed, but it's not
  // a terminal sale outcome: leave it for the closer rather than count a loss.
  return { attendance: "showed", outcome: "pending", contracted: null, collected: null };
}

function joinName(first: unknown, last: unknown): string | null {
  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  const joined = `${f} ${l}`.trim();
  return joined === "" ? null : joined;
}

function durationMinutesFromCall(body: Rec, startAt: Date): number | null {
  const directValue = body.durationMinutes ?? body.duration_minutes ?? body.duration;
  const direct = typeof directValue === "number" ? directValue : typeof directValue === "string" ? Number(directValue) : null;
  if (direct && Number.isFinite(direct) && direct > 0 && direct <= 1440) return Math.round(direct);
  const endRaw = firstString(body.endTime, body.end_time, body.endAt, body.end_at, body.dateTimeEnd);
  if (!endRaw) return null;
  const end = new Date(endRaw);
  if (Number.isNaN(end.getTime()) || end <= startAt) return null;
  const duration = Math.round((end.getTime() - startAt.getTime()) / 60_000);
  return duration > 0 && duration <= 1440 ? duration : null;
}
