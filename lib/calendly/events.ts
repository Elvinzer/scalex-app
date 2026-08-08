// Turns Calendly resources into our funnel's domain model. Calendly is a pure
// scheduler: it carries NO outcome/deal data, so every call maps to "booked" (or
// "cancelled") with a "pending" outcome — the closer marks the result by hand
// (setCallOutcome), unlike iClosed's auto-mapped dispositions.

export type CalendlyAttendance = "booked" | "cancelled";

export type NormalizedCalendlyCall = {
  externalId: string; // the scheduled_event URI
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  scheduledAt: Date;
  durationMinutes: number | null;
  closer: string | null;
  eventType: string | null;
  attendance: CalendlyAttendance;
};

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}
function firstString(...values: unknown[]): string | null {
  for (const v of values) if (typeof v === "string" && v.trim() !== "") return v.trim();
  return null;
}
function hostName(event: Rec): string | null {
  const memberships = Array.isArray(event.event_memberships) ? event.event_memberships : [];
  const first = asRecord(memberships[0]) ?? {};
  return firstString(first.user_name, first.user_email);
}
function toDate(value: unknown): Date | null {
  const s = firstString(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function phoneFromQuestions(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const rawAnswer of value) {
    const answer = asRecord(rawAnswer);
    if (!answer) continue;
    const question = firstString(answer.question, answer.statement, answer.label);
    if (question && /phone|telephone|téléphone|mobile|whatsapp/i.test(question)) {
      const phone = firstString(answer.answer);
      if (phone) return phone;
    }
  }
  return null;
}

export function readCalendlyInviteePhone(invitee: Rec, event?: Rec): string | null {
  const location = asRecord(event?.location) ?? {};
  return firstString(
    invitee.text_reminder_number,
    invitee.phone_number,
    invitee.phoneNumber,
    invitee.phone,
    location.phone_number,
    location.phoneNumber,
    phoneFromQuestions(invitee.questions_and_answers)
  );
}

// Backfill: a scheduled_event (list item) + its first invitee (fetched separately).
export function normalizeScheduledEvent(event: Rec, invitee: Rec | null): NormalizedCalendlyCall | null {
  const externalId = firstString(event.uri);
  const scheduledAt = toDate(event.start_time);
  if (!externalId || !scheduledAt) return null;
  const inv = invitee ?? {};
  return {
    externalId,
    inviteeName: firstString(inv.name, joinName(inv.first_name, inv.last_name)),
    inviteeEmail: firstString(inv.email),
    inviteePhone: readCalendlyInviteePhone(inv, event),
    scheduledAt,
    durationMinutes: durationMinutesFromEvent(event, scheduledAt),
    closer: hostName(event),
    eventType: firstString(event.name),
    attendance: firstString(event.status) === "canceled" ? "cancelled" : "booked",
  };
}

export type CalendlyWebhookKind = "created" | "canceled" | "other";

export function classifyCalendlyEvent(eventType: string): CalendlyWebhookKind {
  if (eventType === "invitee.created") return "created";
  if (eventType === "invitee.canceled") return "canceled";
  return "other";
}

// Webhook: { event, payload: { name, email, uri, scheduled_event: {...} } }.
export function parseCalendlyWebhook(
  raw: unknown
): { eventType: string; inviteeUri: string | null; call: NormalizedCalendlyCall | null } | null {
  const body = asRecord(raw);
  if (!body) return null;
  const eventType = firstString(body.event);
  const payload = asRecord(body.payload);
  if (!eventType || !payload) return null;

  const event = asRecord(payload.scheduled_event) ?? {};
  const externalId = firstString(event.uri);
  const scheduledAt = toDate(event.start_time);
  const call: NormalizedCalendlyCall | null =
    externalId && scheduledAt
      ? {
          externalId,
          inviteeName: firstString(payload.name, joinName(payload.first_name, payload.last_name)),
          inviteeEmail: firstString(payload.email),
          inviteePhone: readCalendlyInviteePhone(payload, event),
          scheduledAt,
          durationMinutes: durationMinutesFromEvent(event, scheduledAt),
          closer: hostName(event),
          eventType: firstString(event.name),
          attendance: eventType === "invitee.canceled" ? "cancelled" : "booked",
        }
      : null;

  return { eventType, inviteeUri: firstString(payload.uri), call };
}

function joinName(first: unknown, last: unknown): string | null {
  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  const joined = `${f} ${l}`.trim();
  return joined === "" ? null : joined;
}

function durationMinutesFromEvent(event: Rec, startAt: Date): number | null {
  const direct = typeof event.duration_minutes === "number" ? event.duration_minutes : typeof event.duration_minutes === "string" ? Number(event.duration_minutes) : null;
  if (direct && Number.isFinite(direct) && direct > 0 && direct <= 1440) return Math.round(direct);
  const end = toDate(event.end_time);
  if (!end || end <= startAt) return null;
  const duration = Math.round((end.getTime() - startAt.getTime()) / 60_000);
  return duration > 0 && duration <= 1440 ? duration : null;
}
