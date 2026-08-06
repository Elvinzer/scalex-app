import { and, asc, desc, eq, gte, gt, ne, or } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingAvailability,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookingLinks,
  nativeBookingQuestions,
  nativeBookingReminderRules,
  nativeBookings,
  users,
} from "@/db/schema";
import { getCalendarStatesForClosers, listBusyForConnection } from "@/lib/native-booking/calendar";

import { generateBookingSlots, type GeneratedBookingSlot } from "./slots";

export async function listNativeBookingEvents(accountId: string) {
  const rows = await db
    .select()
    .from(nativeBookingEvents)
    .where(eq(nativeBookingEvents.userId, accountId))
    .orderBy(desc(nativeBookingEvents.createdAt));
  return rows;
}

export async function getNativeBookingEvent(accountId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.id, eventId), eq(nativeBookingEvents.userId, accountId)))
    .limit(1);
  return event ?? null;
}

export async function getNativeBookingEventDetail(accountId: string, eventId: string) {
  const event = await getNativeBookingEvent(accountId, eventId);
  if (!event) return null;

  const [availability, exceptions, closers, links, questions, reminders] = await Promise.all([
    db
      .select()
      .from(nativeBookingAvailability)
      .where(eq(nativeBookingAvailability.eventId, event.id))
      .orderBy(asc(nativeBookingAvailability.weekday), asc(nativeBookingAvailability.startTime)),
    db
      .select()
      .from(nativeBookingExceptions)
      .where(eq(nativeBookingExceptions.eventId, event.id))
      .orderBy(asc(nativeBookingExceptions.date)),
    db
      .select({ assignment: nativeBookingEventClosers, user: users })
      .from(nativeBookingEventClosers)
      .innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id))
      .where(eq(nativeBookingEventClosers.eventId, event.id))
      .orderBy(asc(nativeBookingEventClosers.position), asc(users.displayName), asc(users.email)),
    db.select().from(nativeBookingLinks).where(eq(nativeBookingLinks.eventId, event.id)).orderBy(desc(nativeBookingLinks.createdAt)),
    db.select().from(nativeBookingQuestions).where(eq(nativeBookingQuestions.eventId, event.id)).orderBy(asc(nativeBookingQuestions.position)),
    db.select().from(nativeBookingReminderRules).where(eq(nativeBookingReminderRules.eventId, event.id)).orderBy(asc(nativeBookingReminderRules.position)),
  ]);

  return { event, availability, exceptions, closers, links, questions, reminders };
}

export async function getPublicNativeBookingEvent(slug: string) {
  const [event] = await db
    .select()
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.slug, slug), eq(nativeBookingEvents.status, "active")))
    .limit(1);
  if (!event) return null;
  const questions = await db
    .select()
    .from(nativeBookingQuestions)
    .where(eq(nativeBookingQuestions.eventId, event.id))
    .orderBy(asc(nativeBookingQuestions.position));
  return { ...event, questions };
}

export async function getPublicNativeBookingSlots(
  slug: string,
  options?: { fromDate?: string; days?: number; now?: Date; excludeBookingId?: string; closerUserId?: string | null }
): Promise<{ event: NonNullable<Awaited<ReturnType<typeof getPublicNativeBookingEvent>>>; slots: GeneratedBookingSlot[] } | null> {
  const event = await getPublicNativeBookingEvent(slug);
  if (!event) return null;

  const now = options?.now ?? new Date();
  const bookingFilters = [
    eq(nativeBookings.eventId, event.id),
    ne(nativeBookings.status, "cancelled"),
    ne(nativeBookings.status, "expired"),
    gte(nativeBookings.endAt, now),
    ...(options?.excludeBookingId ? [ne(nativeBookings.id, options.excludeBookingId)] : []),
  ];
  const [availability, exceptions, bookings, closers] = await Promise.all([
    db.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, event.id)),
    db.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, event.id)),
    db
      .select({
        startAt: nativeBookings.startAt,
        endAt: nativeBookings.endAt,
        status: nativeBookings.status,
        holdExpiresAt: nativeBookings.holdExpiresAt,
        closerUserId: nativeBookings.closerUserId,
      })
      .from(nativeBookings)
      .where(and(...bookingFilters)),
    db
      .select({ closerUserId: nativeBookingEventClosers.closerUserId })
      .from(nativeBookingEventClosers)
      .where(
        and(
          eq(nativeBookingEventClosers.eventId, event.id),
          eq(nativeBookingEventClosers.isActive, true),
          eq(nativeBookingEventClosers.isOff, false),
          ...(options?.closerUserId ? [eq(nativeBookingEventClosers.closerUserId, options.closerUserId)] : [])
        )
      ),
  ]);

  const baseSlots = generateBookingSlots({
    event,
    availability,
    exceptions,
    bookings: [],
    now,
    fromDate: options?.fromDate,
    days: options?.days ?? 14,
  });
  const calendarStates = await getCalendarStatesForClosers(
    event.userId,
    closers.map(({ closerUserId }) => closerUserId)
  );
  const externalBusyByCloser = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  const calendarUnavailable = new Set<string>();
  const busyFrom = baseSlots[0]?.startAt ?? now;
  const busyTo = baseSlots[baseSlots.length - 1]?.endAt ?? new Date(now.getTime() + event.bookingHorizonDays * 86_400_000);

  await Promise.all(
    closers.map(async ({ closerUserId }) => {
      const state = calendarStates.get(closerUserId);
      if (!state) return;
      if (state.unavailable) {
        calendarUnavailable.add(closerUserId);
        return;
      }
      if (!state.connection) return;
      try {
        externalBusyByCloser.set(closerUserId, await listBusyForConnection(state.connection, busyFrom, busyTo));
      } catch (error) {
        console.error("[native-booking] calendar availability failed", { closerUserId, error });
        calendarUnavailable.add(closerUserId);
      }
    })
  );

  const availableSlots = baseSlots.filter((slot) =>
    closers.some(({ closerUserId }) =>
      !calendarUnavailable.has(closerUserId) &&
      !bookings.some((booking) => {
        if (booking.closerUserId !== closerUserId) return false;
        if (booking.status !== "confirmed" && booking.status !== "sync_failed" && !(booking.status === "pending" && booking.holdExpiresAt && booking.holdExpiresAt > now)) return false;
        const bufferedStart = new Date(booking.startAt.getTime() - event.bufferBeforeMinutes * 60_000);
        const bufferedEnd = new Date(booking.endAt.getTime() + event.bufferAfterMinutes * 60_000);
        return slot.startAt < bufferedEnd && slot.endAt > bufferedStart;
      }) &&
      !(externalBusyByCloser.get(closerUserId) ?? []).some((period) => {
        const bufferedStart = new Date(period.startAt.getTime() - event.bufferBeforeMinutes * 60_000);
        const bufferedEnd = new Date(period.endAt.getTime() + event.bufferAfterMinutes * 60_000);
        return slot.startAt < bufferedEnd && slot.endAt > bufferedStart;
      })
    )
  );

  return {
    event,
    slots: availableSlots,
  };
}

export async function hasFutureNativeBooking(accountId: string, phoneNormalized: string, now = new Date()) {
  const [booking] = await db
    .select({ id: nativeBookings.id, startAt: nativeBookings.startAt, eventId: nativeBookings.eventId })
    .from(nativeBookings)
    .where(
      and(
        eq(nativeBookings.userId, accountId),
        eq(nativeBookings.phoneNormalized, phoneNormalized),
        gte(nativeBookings.startAt, now),
        or(
          eq(nativeBookings.status, "confirmed"),
          eq(nativeBookings.status, "sync_failed"),
          and(eq(nativeBookings.status, "pending"), gt(nativeBookings.holdExpiresAt, now))
        )
      )
    )
    .orderBy(asc(nativeBookings.startAt))
    .limit(1);
  return booking ?? null;
}

export async function listUpcomingNativeBookings(accountId: string, now = new Date()) {
  return db
    .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
    .where(
      and(
        eq(nativeBookingEvents.userId, accountId),
        gte(nativeBookings.startAt, now),
        or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"))
      )
    )
    .orderBy(asc(nativeBookings.startAt))
    .limit(100);
}

export async function getEventClosers(accountId: string, eventId: string) {
  return db
    .select({ assignment: nativeBookingEventClosers, user: users })
    .from(nativeBookingEventClosers)
    .innerJoin(nativeBookingEvents, eq(nativeBookingEventClosers.eventId, nativeBookingEvents.id))
    .innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id))
    .where(and(eq(nativeBookingEventClosers.eventId, eventId), eq(nativeBookingEvents.userId, accountId)));
}
