import { and, asc, eq, gte, inArray, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingActivities, nativeBookingEvents, nativeBookings, salesCalls, users, type NativeBookingAnswerSnapshot } from "@/db/schema";

export type UnifiedAgendaSource = "native" | "iclosed" | "calendly";
export type UnifiedAgendaStatus = "confirmed" | "cancelled" | "past";

export type UnifiedAgendaAppointment = {
  id: string;
  source: UnifiedAgendaSource;
  sourceLabel: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  durationEstimated: boolean;
  status: UnifiedAgendaStatus;
  prospectName: string;
  email: string | null;
  phone: string | null;
  closerId: string | null;
  closerName: string;
  eventName: string;
  nativeBookingId: string | null;
  salesCallId: string | null;
  answers: NativeBookingAnswerSnapshot[];
  canManage: boolean;
  attendance: string | null;
  outcome: string | null;
  activities: Array<{
    kind: "booked" | "rescheduled" | "cancelled";
    fromStartAt: Date | null;
    fromEndAt: Date | null;
    toStartAt: Date | null;
    toEndAt: Date | null;
    fromCloserName: string | null;
    toCloserName: string | null;
    createdAt: Date;
  }>;
};

type AgendaQuery = {
  from: Date;
  to: Date;
  sources: UnifiedAgendaSource[];
  closerIds: string[];
  statuses: UnifiedAgendaStatus[];
};

export function projectUnifiedAgendaStatus(startAt: Date, endAt: Date, cancelled: boolean, now: Date): UnifiedAgendaStatus {
  if (cancelled) return "cancelled";
  return endAt <= now ? "past" : "confirmed";
}

export function resolveExternalAgendaDuration(call: Pick<typeof salesCalls.$inferSelect, "scheduledAt" | "durationMinutes">): { endAt: Date; durationMinutes: number; estimated: boolean } {
  const durationMinutes = call.durationMinutes && call.durationMinutes > 0 ? call.durationMinutes : 30;
  return {
    endAt: new Date(call.scheduledAt.getTime() + durationMinutes * 60_000),
    durationMinutes,
    estimated: call.durationMinutes === null,
  };
}

export async function listUnifiedAgendaAppointments(accountId: string, query: AgendaQuery, now = new Date()): Promise<UnifiedAgendaAppointment[]> {
  const result: UnifiedAgendaAppointment[] = [];
  const includeNative = query.sources.includes("native");
  const includeExternal = query.sources.includes("iclosed") || query.sources.includes("calendly");

  if (includeNative) {
    const nativeRows = await db
      .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users, call: salesCalls })
      .from(nativeBookings)
      .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
      .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
      .leftJoin(salesCalls, eq(salesCalls.nativeBookingId, nativeBookings.id))
      .where(
        and(
          eq(nativeBookingEvents.userId, accountId),
          lt(nativeBookings.startAt, query.to),
          gte(nativeBookings.endAt, query.from),
          or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"), eq(nativeBookings.status, "cancelled")),
          ...(query.closerIds.length > 0 ? [inArray(nativeBookings.closerUserId, query.closerIds)] : [])
        )
      )
      .orderBy(asc(nativeBookings.startAt));
    const activityRows = nativeRows.length > 0
      ? await db
          .select()
          .from(nativeBookingActivities)
          .where(inArray(nativeBookingActivities.bookingId, nativeRows.map((row) => row.booking.id)))
          .orderBy(asc(nativeBookingActivities.createdAt))
      : [];
    const activitiesByBooking = new Map<string, typeof activityRows>();
    for (const activity of activityRows) {
      const current = activitiesByBooking.get(activity.bookingId) ?? [];
      current.push(activity);
      activitiesByBooking.set(activity.bookingId, current);
    }
    for (const row of nativeRows) {
      const status = projectUnifiedAgendaStatus(row.booking.startAt, row.booking.endAt, row.booking.status === "cancelled", now);
      if (!query.statuses.includes(status)) continue;
      result.push({
        id: `native:${row.booking.id}`,
        source: "native",
        sourceLabel: "Natif",
        startAt: row.booking.startAt,
        endAt: row.booking.endAt,
        durationMinutes: Math.max(1, Math.round((row.booking.endAt.getTime() - row.booking.startAt.getTime()) / 60_000)),
        durationEstimated: false,
        status,
        prospectName: `${row.booking.firstName} ${row.booking.lastName}`.trim(),
        email: row.booking.email,
        phone: row.booking.phone,
        closerId: row.booking.closerUserId,
        closerName: row.closer?.displayName || row.closer?.email || "Closer non assigné",
        eventName: row.event.name,
        nativeBookingId: row.booking.id,
        salesCallId: row.call?.id ?? null,
        answers: row.booking.answers,
        canManage: true,
        attendance: row.call?.attendance ?? null,
        outcome: row.call?.outcome ?? null,
        activities: activitiesByBooking.get(row.booking.id) ?? [],
      });
    }
  }

  if (includeExternal) {
    const externalSources = query.sources.filter((source): source is "iclosed" | "calendly" => source !== "native");
    const externalRows = await db
      .select({ call: salesCalls, closer: users })
      .from(salesCalls)
      .leftJoin(users, eq(salesCalls.closerUserId, users.id))
      .where(
        and(
          eq(salesCalls.userId, accountId),
          inArray(salesCalls.source, externalSources),
          lt(salesCalls.scheduledAt, query.to),
          gte(salesCalls.scheduledAt, query.from),
          ...(query.closerIds.length > 0 ? [inArray(salesCalls.closerUserId, query.closerIds)] : [])
        )
      )
      .orderBy(asc(salesCalls.scheduledAt));
    for (const row of externalRows) {
      const timing = resolveExternalAgendaDuration(row.call);
      const status = projectUnifiedAgendaStatus(row.call.scheduledAt, timing.endAt, row.call.attendance === "cancelled", now);
      if (!query.statuses.includes(status)) continue;
      const source = row.call.source === "calendly" ? "calendly" : "iclosed";
      result.push({
        id: `${source}:${row.call.id}`,
        source,
        sourceLabel: source === "calendly" ? "Calendly" : "iClosed",
        startAt: row.call.scheduledAt,
        endAt: timing.endAt,
        durationMinutes: timing.durationMinutes,
        durationEstimated: timing.estimated,
        status,
        prospectName: row.call.inviteeName || "Prospect sans nom",
        email: row.call.inviteeEmail,
        phone: row.call.inviteePhone,
        closerId: row.call.closerUserId,
        closerName: row.closer?.displayName || row.closer?.email || row.call.closer || "Closer non assigné",
        eventName: row.call.eventType || (source === "calendly" ? "Rendez-vous Calendly" : "Appel iClosed"),
        nativeBookingId: null,
        salesCallId: row.call.id,
        answers: [],
        canManage: false,
        attendance: row.call.attendance,
        outcome: row.call.outcome,
        activities: [],
      });
    }
  }

  return result.sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
}

export async function getNativeBookingRescheduleSlotsForAccount(accountId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(and(eq(nativeBookings.id, bookingId), eq(nativeBookingEvents.userId, accountId)))
    .limit(1);
  if (!row || !row.booking.closerUserId) return null;
  const { getPublicNativeBookingSlots } = await import("./queries");
  const { ensureAccountBookingHandle } = await import("./handle");
  const handle = await ensureAccountBookingHandle(accountId);
  const slots = await getPublicNativeBookingSlots(handle, row.event.slug, { days: 30, excludeBookingId: bookingId, closerUserId: row.booking.closerUserId });
  return slots?.slots ?? [];
}
