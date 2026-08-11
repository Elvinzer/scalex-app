import { z } from "zod";

import { readMetaTracking, type MetaTrackingFields } from "@/lib/meta-ads/tracking";

import { ICLOSED_EVENT_MATCHERS } from "./protocol";

// Parsing of iClosed calls into our own domain. `readCall` targets the real
// GET /v1/eventCalls item shape (verified 2026-07-29) and the documented
// webhook shape (event type + event + invitee objects, verified 2026-08-11).
// It also tolerates the older data/call/payload wrapper used by the first
// webhook receiver implementation. The envelope (event id + type) is
// validated before it is used for idempotency/routing; the call body is read
// defensively.

export type IclosedEventKind = "booked" | "cancelled" | "rescheduled" | "unknown";

type Rec = Record<string, unknown>;

export type NormalizedCall = {
  iclosedCallId: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
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
} & MetaTrackingFields;

// iClosed's webhook docs describe grouped data rather than publishing one
// fixed JSON schema. Validate the root as a record, then normalize the stable
// identifiers from the documented groups. This keeps unknown fields available
// to readCall() without trusting arbitrary input as a typed object.
const recordSchema = z.record(z.string(), z.unknown());

export type IclosedEnvelope = Rec & { id: string; type: string };

export function parseEnvelope(raw: unknown): IclosedEnvelope | null {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) return null;

  const value = parsed.data;
  const eventTypeData = firstRecord(
    value.eventTypeData,
    value.eventType,
    value.event_type,
    value.event_type_data,
    value.eventTypeDetails,
    value.eventTypeInfo,
  );
  const id = firstString(
    eventTypeData?.uuid,
    eventTypeData?.eventId,
    value.eventId,
    value.webhookEventId,
    value.deliveryId,
    value.id,
    value.uuid,
  );
  const type = firstString(
    value.hookType,
    value.type,
    value.eventTypeName,
    value.eventTypeId,
    eventTypeData?.hookType,
  );

  if (!id || !type) return null;
  return { ...value, id, type };
}

export function classifyEvent(type: string): IclosedEventKind {
  const t = type.trim().toLowerCase();
  if (ICLOSED_EVENT_MATCHERS.booked.some((m) => t.includes(m))) return "booked";
  if (ICLOSED_EVENT_MATCHERS.cancelled.some((m) => t.includes(m))) return "cancelled";
  if (ICLOSED_EVENT_MATCHERS.rescheduled.some((m) => t.includes(m))) return "rescheduled";
  return "unknown";
}

// ── defensive field readers ──────────────────────────────────────────────
function asRecord(value: unknown): Rec | null {
  const parsed = recordSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function firstRecord(...values: unknown[]): Rec | null {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

const CALL_ID_FIELDS = ["id", "callId", "eventCallId", "uuid"] as const;
const CALL_TIME_FIELDS = [
  "dateTimeUTC",
  "dateTime",
  "startTime",
  "start_time",
  "utc_start_time",
  "scheduledAt",
] as const;

function hasCallIdentity(value: Rec): boolean {
  return Boolean(firstString(...CALL_ID_FIELDS.map((field) => value[field])));
}

function hasCallTime(value: Rec): boolean {
  return Boolean(firstString(...CALL_TIME_FIELDS.map((field) => value[field])));
}

function callCandidate(value: unknown): Rec | null {
  const record = asRecord(value);
  if (!record) return null;
  if (hasCallIdentity(record) && hasCallTime(record)) return record;

  for (const nested of [record.call, record.callData, record.eventData, record.eventCall, record.data, record.event]) {
    const candidate = asRecord(nested);
    if (candidate && hasCallIdentity(candidate) && hasCallTime(candidate)) return candidate;
  }
  return null;
}

// The call object can be the envelope itself (list items), nested under a
// data/call/payload wrapper, or exposed as iClosed's `event` object. The
// latter is only selected when it has both a call id and a start time, because
// the REST item shape also uses `event` for the event template metadata.
function callBody(source: Rec): Rec {
  for (const value of [source.data, source.call, source.payload, source.callData, source.eventData, source.eventCall, source.event]) {
    const candidate = callCandidate(value);
    if (candidate) return candidate;
  }
  return source;
}

function phoneFromAnswers(...collections: unknown[]): string | null {
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const rawAnswer of collection) {
      const answer = asRecord(rawAnswer);
      if (!answer) continue;
      const type = firstString(answer.type)?.toUpperCase();
      const question = firstString(answer.statement, answer.question, answer.label);
      if (type === "PHONE_NO" || (question && /phone|telephone|téléphone|mobile|whatsapp/i.test(question))) {
        const value = firstString(answer.answer);
        if (value) return value;
      }
    }
  }
  return null;
}

// Turns a raw iClosed call/booking object into our NormalizedCall, or null if
// it lacks the two fields we cannot invent (a stable id and a scheduled time).
// The candidate field names cover the REST item and the documented webhook
// groups. Unknown provider fields remain ignored.
export function readCall(source: Rec): NormalizedCall | null {
  const body = callBody(source);

  const invitee = firstRecord(body.invitee, source.invitee, body.contact, source.contact) ?? {};
  const contact = firstRecord(body.contact, source.contact) ?? {};
  const eventTypeData = firstRecord(
    body.eventTypeData,
    source.eventTypeData,
    body.eventType,
    source.eventType,
    source.event_type,
    source.event_type_data,
    source.eventTypeInfo,
  );
  const sourceEvent = asRecord(source.event);
  const event = sourceEvent && sourceEvent !== body ? sourceEvent : firstRecord(body.event);
  const setter = firstRecord(body.setter, source.setter);

  // Deliberately NOT falling back to the envelope's own `id` (that's the EVENT
  // id, not the call id) — mis-keying on it would break idempotency across a
  // call's booked→rescheduled→cancelled lifecycle. No call id = skip.
  // Real /v1/eventCalls item: `id` (number). Deliberately NOT the envelope's
  // own id (that's the EVENT id on webhooks, not the call id).
  const id = firstString(
    body.callId,
    body.eventCallId,
    body.uuid,
    body === source && !hasCallTime(source) ? null : body.id,
  );
  if (!id) return null;

  // `dateTimeUTC` is the normalized start; `dateTime` is the local fallback.
  const scheduledRaw = firstString(
    body.dateTimeUTC,
    body.utc_start_time,
    body.dateTime,
    body.startTime,
    body.start_time,
    body.scheduledAt,
    body.invitee_start_time,
    source.dateTimeUTC,
    source.utc_start_time,
    source.dateTime,
  );
  const scheduledAt = scheduledRaw ? new Date(scheduledRaw) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) return null;

  const inviteeName = firstString(
    body.inviteeName,
    invitee.name,
    joinName(invitee.firstName, invitee.lastName),
    contact.name,
    joinName(contact.firstName, contact.lastName),
    joinName(body.firstName, body.lastName),
    body === source ? body.name : null,
  );
  const inviteeEmail = firstString(
    body.inviteeEmail,
    invitee.email,
    contact.email,
    body.guestEmail,
    body === source ? body.email : null,
  );
  const inviteePhone = firstString(
    body.phoneNumber,
    invitee.text_reminder_number,
    invitee.phoneNumber,
    contact.phoneNumber,
    contact.secondary_phoneNumber,
    body.text_reminder_number,
    body.textReminderNumber,
    body.phone,
    phoneFromAnswers(body.questions, body.inviteeQuestionAnswers)
  );

  // The assigned closer is the `user` object on eventCalls.
  const user = firstRecord(body.user, body.closer, body.owner, setter, source.user) ?? {};
  const closer = firstString(
    body.closerName,
    body.assigned_to,
    body.assignedTo,
    joinName(user.firstName, user.lastName),
    user.email,
    user.name,
    body === source ? body.closer : null,
  );

  // Human label = the event template name. (body.eventType here is the timing
  // enum UPCOMING/PAST, NOT a label — don't use it as one.)
  const eventType = firstString(
    body.eventTypeName,
    source.eventName,
    eventTypeData?.name,
    eventTypeData?.eventName,
    event?.name,
    body.eventName,
    body === source ? body.type : null,
  );
  const tracking = readMetaTracking(body, source, contact, invitee, event, eventTypeData);

  const disposition = mapDisposition(body);

  return {
    iclosedCallId: id,
    inviteeName,
    inviteeEmail,
    inviteePhone,
    scheduledAt,
    durationMinutes: durationMinutesFromCall(body, scheduledAt, eventTypeData),
    closer,
    eventType,
    ...tracking,
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

function durationMinutesFromCall(body: Rec, startAt: Date, eventTypeData: Rec | null): number | null {
  const directValue = body.durationMinutes ?? body.duration_minutes ?? body.duration ?? eventTypeData?.duration;
  const direct = typeof directValue === "number" ? directValue : typeof directValue === "string" ? Number(directValue) : null;
  const unit = firstString(body.durationUnit, body.duration_unit, eventTypeData?.durationUnit)?.toUpperCase();
  const durationInMinutes = unit?.includes("HOUR") && direct ? direct * 60 : direct;
  if (durationInMinutes && Number.isFinite(durationInMinutes) && durationInMinutes > 0 && durationInMinutes <= 1440) {
    return Math.round(durationInMinutes);
  }
  const endRaw = firstString(
    body.endTime,
    body.end_time,
    body.utc_end_time,
    body.invitee_end_time,
    body.endAt,
    body.end_at,
    body.dateTimeEnd,
  );
  if (!endRaw) return null;
  const end = new Date(endRaw);
  if (Number.isNaN(end.getTime()) || end <= startAt) return null;
  const duration = Math.round((end.getTime() - startAt.getTime()) / 60_000);
  return duration > 0 && duration <= 1440 ? duration : null;
}
