import { and, asc, desc, eq, gte, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingAvailability,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookingLinks,
  nativeBookings,
  users,
} from "@/db/schema";

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

  const [availability, exceptions, closers, links] = await Promise.all([
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
  ]);

  return { event, availability, exceptions, closers, links };
}

export async function getPublicNativeBookingEvent(slug: string) {
  const [event] = await db
    .select()
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.slug, slug), eq(nativeBookingEvents.status, "active")))
    .limit(1);
  return event ?? null;
}

export async function getPublicNativeBookingSlots(
  slug: string,
  options?: { fromDate?: string; days?: number; now?: Date }
): Promise<{ event: NonNullable<Awaited<ReturnType<typeof getPublicNativeBookingEvent>>>; slots: GeneratedBookingSlot[] } | null> {
  const event = await getPublicNativeBookingEvent(slug);
  if (!event) return null;

  const now = options?.now ?? new Date();
  const [availability, exceptions, bookings] = await Promise.all([
    db.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, event.id)),
    db.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, event.id)),
    db
      .select({ startAt: nativeBookings.startAt, endAt: nativeBookings.endAt, status: nativeBookings.status, holdExpiresAt: nativeBookings.holdExpiresAt })
      .from(nativeBookings)
      .where(
        and(
          eq(nativeBookings.eventId, event.id),
          ne(nativeBookings.status, "cancelled"),
          ne(nativeBookings.status, "expired"),
          gte(nativeBookings.endAt, now)
        )
      ),
  ]);

  return {
    event,
    slots: generateBookingSlots({
      event,
      availability,
      exceptions,
      bookings,
      now,
      fromDate: options?.fromDate,
      days: options?.days ?? 14,
    }),
  };
}

export async function hasFutureNativeBooking(accountId: string, emailNormalized: string, now = new Date()) {
  const [booking] = await db
    .select({ id: nativeBookings.id, startAt: nativeBookings.startAt, eventId: nativeBookings.eventId })
    .from(nativeBookings)
    .where(
      and(
        eq(nativeBookings.userId, accountId),
        eq(nativeBookings.emailNormalized, emailNormalized),
        gte(nativeBookings.startAt, now),
        ne(nativeBookings.status, "cancelled"),
        ne(nativeBookings.status, "expired")
      )
    )
    .orderBy(asc(nativeBookings.startAt))
    .limit(1);
  return booking ?? null;
}

export async function getEventClosers(accountId: string, eventId: string) {
  return db
    .select({ assignment: nativeBookingEventClosers, user: users })
    .from(nativeBookingEventClosers)
    .innerJoin(nativeBookingEvents, eq(nativeBookingEventClosers.eventId, nativeBookingEvents.id))
    .innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id))
    .where(and(eq(nativeBookingEventClosers.eventId, eventId), eq(nativeBookingEvents.userId, accountId)));
}
