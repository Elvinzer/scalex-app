import { z } from "zod";

import { ICLOSED_EVENT_MATCHERS } from "./protocol";

// Parsing of iClosed webhook deliveries into our own domain. The envelope
// (event id + type) is the part we rely on for idempotency and routing, so it
// is strictly validated. The call payload's exact field names are NOT
// contractually known from public docs (⚠️ verify against the authenticated
// developer portal), so it is read defensively rather than schema-locked —
// a slightly different real field name is a one-line fix in `readCall` below,
// never a dropped delivery or a crash.

export type IclosedEventKind = "booked" | "cancelled" | "rescheduled" | "unknown";

export type NormalizedCall = {
  iclosedCallId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  scheduledAt: Date;
  closer: string | null;
  eventType: string | null;
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

  return { iclosedCallId: id, inviteeName, inviteeEmail, scheduledAt, closer, eventType };
}

function joinName(first: unknown, last: unknown): string | null {
  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  const joined = `${f} ${l}`.trim();
  return joined === "" ? null : joined;
}
