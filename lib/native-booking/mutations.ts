import { and, asc, eq, gt, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingAvailability,
  nativeBookingActivities,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookings,
  nativeCalendarConnections,
  salesCalls,
  users,
} from "@/db/schema";
import { inngest, nativeBookingCalendarSyncRequested } from "@/lib/inngest/client";

import {
  cancelExternalCalendarEvent,
  createExternalCalendarEvent,
  listBusyForConnection,
  updateExternalCalendarEvent,
} from "./calendar";
import { getCalendarStatesForClosers } from "./settings";
import { isCalendarTemporarilyUnavailable } from "./calendar-readiness";
import { scheduleNativeBookingNotification } from "./notifications";
import { cancelNativeBookingReminders, rebuildNativeBookingReminders } from "./reminders";
import { getPublicNativeBookingSlots } from "./queries";
import { generateBookingSlots } from "./slots";
import { hashBookingManagementToken } from "./tokens";

export type NativeBookingMutationError = { error: "not_found" | "slot_unavailable" | "invalid" };

export type NativeBookingCancellationResult = {
  bookingId: string;
  status: "cancelled";
  calendarSyncWarning?: boolean;
};

export type NativeBookingRescheduleResult = {
  bookingId: string;
  startAt: Date;
  endAt: Date;
  closerName: string;
  eventTimeZone: string;
  meetingUrl: string | null;
  calendarSyncWarning?: boolean;
};

type BookingStatusRow = {
  startAt: Date;
  endAt: Date;
  status: string;
  holdExpiresAt: Date | null;
};

function isBlockingBooking(booking: BookingStatusRow, now: Date) {
  return booking.status === "confirmed" || booking.status === "sync_failed" || (booking.status === "pending" && Boolean(booking.holdExpiresAt && booking.holdExpiresAt > now));
}

function isBusy(
  startAt: Date,
  endAt: Date,
  bookings: BookingStatusRow[],
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  now: Date
) {
  return bookings.some((booking) => {
    if (!isBlockingBooking(booking, now)) return false;
    const bufferedStart = new Date(booking.startAt.getTime() - bufferBeforeMinutes * 60_000);
    const bufferedEnd = new Date(booking.endAt.getTime() + bufferAfterMinutes * 60_000);
    return startAt < bufferedEnd && endAt > bufferedStart;
  });
}

async function markCalendarFailure(bookingId: string, message: string, markBookingSyncFailed = true) {
  await db
    .update(nativeBookings)
    .set({ ...(markBookingSyncFailed ? { status: "sync_failed" as const } : {}), syncStatus: "failed", syncError: message, updatedAt: new Date() })
    .where(eq(nativeBookings.id, bookingId));
}

export async function cancelNativeBooking(bookingId: string): Promise<NativeBookingCancellationResult | NativeBookingMutationError> {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row) return { error: "not_found" };

  const transactionResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from native_bookings where id = ${bookingId} for update`);
    const [booking] = await tx.select().from(nativeBookings).where(eq(nativeBookings.id, bookingId)).limit(1);
    if (!booking) return { error: "not_found" } as const;
    if (booking.status === "cancelled") {
      return { bookingId, status: "cancelled" as const, calendarSyncWarning: booking.syncStatus === "failed" };
    }

    await tx
      .update(nativeBookings)
      .set({
        status: "cancelled",
        syncStatus: booking.externalEventId && booking.calendarConnectionId ? "pending" : "not_required",
        holdExpiresAt: null,
        syncError: null,
        updatedAt: new Date(),
      })
      .where(eq(nativeBookings.id, bookingId));
    await tx.insert(nativeBookingActivities).values({
      bookingId,
      kind: "cancelled",
      fromStartAt: booking.startAt,
      fromEndAt: booking.endAt,
      fromCloserUserId: booking.closerUserId,
      fromCloserName: row.closer?.displayName || row.closer?.email || null,
    });
    await tx
      .update(salesCalls)
      .set({ attendance: "cancelled", updatedAt: new Date() })
      .where(eq(salesCalls.nativeBookingId, bookingId));
    return { bookingId, status: "cancelled" as const, calendarSyncWarning: false };
  });

  if ("error" in transactionResult) return transactionResult;

  let calendarSyncWarning = false;
  if (row.booking.externalEventId && row.booking.calendarConnectionId) {
    const [connection] = await db
      .select()
      .from(nativeCalendarConnections)
      .where(eq(nativeCalendarConnections.id, row.booking.calendarConnectionId))
      .limit(1);
    if (connection) {
      try {
        await cancelExternalCalendarEvent(connection, row.booking.externalEventId, row.booking.calendarId);
        await db
          .update(nativeBookings)
          .set({ syncStatus: "synced", syncError: null, updatedAt: new Date() })
          .where(eq(nativeBookings.id, bookingId));
      } catch (error) {
        console.error("[native-booking] calendar cancellation failed", { bookingId, error });
        await markCalendarFailure(bookingId, "L'annulation dans le calendrier a échoué.", false);
        calendarSyncWarning = true;
      }
    }
  }

  await scheduleNativeBookingNotification(bookingId, "cancellation");
  await cancelNativeBookingReminders(bookingId);
  return { ...transactionResult, ...(calendarSyncWarning ? { calendarSyncWarning: true } : {}) };
}

export async function rescheduleNativeBooking(
  bookingId: string,
  requestedStartAt: Date
): Promise<NativeBookingRescheduleResult | NativeBookingMutationError> {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row || row.booking.status === "cancelled" || row.booking.status === "expired") return { error: "not_found" };

  const requestedEndAt = new Date(requestedStartAt.getTime() + row.event.durationMinutes * 60_000);
  const [availability, exceptions, calendarCandidates, assignedClosers] = await Promise.all([
    db.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, row.event.id)),
    db.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, row.event.id)),
    db
      .select({ closerUserId: nativeBookingEventClosers.closerUserId })
      .from(nativeBookingEventClosers)
      .where(
        and(
          eq(nativeBookingEventClosers.eventId, row.event.id),
          eq(nativeBookingEventClosers.isActive, true),
          or(eq(nativeBookingEventClosers.isOff, false), eq(nativeBookingEventClosers.closerUserId, row.booking.closerUserId ?? ""))
        )
      ),
    db
      .select({ assignment: nativeBookingEventClosers, user: users })
      .from(nativeBookingEventClosers)
      .innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id))
      .where(
        and(
          eq(nativeBookingEventClosers.eventId, row.event.id),
          eq(nativeBookingEventClosers.isActive, true),
          or(eq(nativeBookingEventClosers.isOff, false), eq(nativeBookingEventClosers.closerUserId, row.booking.closerUserId ?? ""))
        )
      )
      .orderBy(asc(nativeBookingEventClosers.position), asc(users.email)),
  ]);
  const now = new Date();
  const slots = generateBookingSlots({ event: row.event, availability, exceptions, bookings: [], now, days: row.event.bookingHorizonDays });
  if (!slots.some((slot) => slot.startAt.getTime() === requestedStartAt.getTime() && slot.endAt.getTime() === requestedEndAt.getTime())) return { error: "slot_unavailable" };
  if (calendarCandidates.length === 0) return { error: "slot_unavailable" };

  const calendarStates = await getCalendarStatesForClosers(row.event.userId, calendarCandidates.map(({ closerUserId }) => closerUserId));
  const externalBusyByCloser = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  const unavailableClosers = new Set<string>();
  await Promise.all(
    calendarCandidates.map(async ({ closerUserId }) => {
      const state = calendarStates.get(closerUserId);
      if (!state) return;
      if (isCalendarTemporarilyUnavailable(state.reason)) {
        unavailableClosers.add(closerUserId);
        return;
      }
      if (state.conflictCalendars.length === 0) return;
      try {
        const periods = await Promise.all(
          state.conflictCalendars.map(({ connection, calendarId }) =>
            listBusyForConnection(
              connection,
              new Date(requestedStartAt.getTime() - row.event.bufferBeforeMinutes * 60_000),
              new Date(requestedEndAt.getTime() + row.event.bufferAfterMinutes * 60_000),
              [calendarId]
            )
          )
        );
        externalBusyByCloser.set(closerUserId, periods.flat());
      } catch (error) {
        console.error("[native-booking] calendar reschedule check failed", { closerUserId, error });
        unavailableClosers.add(closerUserId);
      }
    })
  );

  const transactionResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from native_booking_events where id = ${row.event.id} for update`);
    const [current] = await tx.select().from(nativeBookings).where(eq(nativeBookings.id, bookingId)).limit(1);
    if (!current || current.status === "cancelled" || current.status === "expired") return { error: "not_found" } as const;

    const [conflictingBooking] = await tx
      .select({ id: nativeBookings.id })
      .from(nativeBookings)
      .where(
        and(
          eq(nativeBookings.userId, row.event.userId),
          eq(nativeBookings.phoneNormalized, current.phoneNormalized),
          ne(nativeBookings.id, current.id),
          or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"), and(eq(nativeBookings.status, "pending"), gt(nativeBookings.holdExpiresAt, now)))
        )
      )
      .limit(1);
    if (conflictingBooking) return { error: "slot_unavailable" } as const;

    const allBookings = await tx
      .select({ startAt: nativeBookings.startAt, endAt: nativeBookings.endAt, status: nativeBookings.status, holdExpiresAt: nativeBookings.holdExpiresAt, closerUserId: nativeBookings.closerUserId })
      .from(nativeBookings)
      .where(and(eq(nativeBookings.eventId, row.event.id), ne(nativeBookings.id, current.id), ne(nativeBookings.status, "cancelled"), ne(nativeBookings.status, "expired")));
    const selected = assignedClosers.find(({ assignment }) => {
      if (!current.closerUserId || assignment.closerUserId !== current.closerUserId) return false;
      if (unavailableClosers.has(assignment.closerUserId)) return false;
      if ((externalBusyByCloser.get(assignment.closerUserId) ?? []).some((period) => {
        const bufferedStart = new Date(period.startAt.getTime() - row.event.bufferBeforeMinutes * 60_000);
        const bufferedEnd = new Date(period.endAt.getTime() + row.event.bufferAfterMinutes * 60_000);
        return requestedStartAt < bufferedEnd && requestedEndAt > bufferedStart;
      })) return false;
      return !isBusy(
        requestedStartAt,
        requestedEndAt,
        allBookings.filter((booking) => booking.closerUserId === assignment.closerUserId),
        row.event.bufferBeforeMinutes,
        row.event.bufferAfterMinutes,
        now
      );
    });
    if (!selected) return { error: "slot_unavailable" } as const;

    const [oldConnection] = current.calendarConnectionId
      ? await tx.select().from(nativeCalendarConnections).where(eq(nativeCalendarConnections.id, current.calendarConnectionId)).limit(1)
      : [];
    const nextState = calendarStates.get(selected.assignment.closerUserId);
    const configuredConnection = nextState?.invitationConnection ?? null;
    const configuredCalendarId = nextState?.invitationCalendarId ?? null;
    const nextConnection = current.externalEventId && oldConnection ? oldConnection : configuredConnection;
    const nextCalendarId = current.externalEventId && oldConnection ? current.calendarId : configuredCalendarId;
    const sameExternalConnection = Boolean(current.externalEventId && oldConnection && nextConnection && oldConnection.id === nextConnection.id);
    await tx
      .update(nativeBookings)
      .set({
        startAt: requestedStartAt,
        endAt: requestedEndAt,
        closerUserId: selected.assignment.closerUserId,
        calendarConnectionId: current.externalEventId && oldConnection ? oldConnection.id : nextConnection?.id ?? null,
        calendarId: current.externalEventId && oldConnection ? current.calendarId : nextCalendarId,
        externalEventId: current.externalEventId,
        externalEventUrl: current.externalEventUrl,
        status: "confirmed",
        syncStatus: current.externalEventId || nextConnection ? "pending" : "not_required",
        syncError: null,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(nativeBookings.id, current.id));
    await tx.insert(nativeBookingActivities).values({
      bookingId: current.id,
      kind: "rescheduled",
      fromStartAt: current.startAt,
      fromEndAt: current.endAt,
      toStartAt: requestedStartAt,
      toEndAt: requestedEndAt,
      fromCloserUserId: current.closerUserId,
      fromCloserName: current.closerUserId === selected.assignment.closerUserId ? selected.user.displayName || selected.user.email : null,
      toCloserUserId: selected.assignment.closerUserId,
      toCloserName: selected.user.displayName || selected.user.email,
    });
    await tx
      .update(salesCalls)
      .set({ scheduledAt: requestedStartAt, closer: selected.user.displayName || selected.user.email, closerUserId: selected.assignment.closerUserId, updatedAt: new Date() })
      .where(eq(salesCalls.nativeBookingId, current.id));
    return {
      bookingId: current.id,
      startAt: requestedStartAt,
      endAt: requestedEndAt,
      closerName: selected.user.displayName || selected.user.email,
      eventTimeZone: row.event.timeZone,
      meetingUrl: row.booking.meetingUrl ?? row.event.meetingUrl,
      oldConnection: oldConnection ?? null,
      oldCalendarId: current.calendarId,
      nextConnection,
      nextCalendarId,
      externalEventId: current.externalEventId,
      sameExternalConnection,
    };
  });

  if ("error" in transactionResult) return transactionResult;

  let calendarSyncWarning = false;
  let resolvedMeetingUrl = row.booking.meetingUrl ?? row.event.meetingUrl;
  try {
    if (transactionResult.externalEventId && transactionResult.sameExternalConnection && transactionResult.nextConnection) {
      const externalEvent = await updateExternalCalendarEvent({
        connection: transactionResult.nextConnection,
        calendarId: transactionResult.nextCalendarId,
        externalEventId: transactionResult.externalEventId,
        title: row.event.meetingLabel,
        description: row.event.description,
        startAt: transactionResult.startAt,
        endAt: transactionResult.endAt,
        guestName: `${row.booking.firstName} ${row.booking.lastName}`,
        guestEmail: row.booking.email,
        meetingUrl: row.booking.meetingUrl ?? row.event.meetingUrl,
      });
      const requiresGoogleMeeting = transactionResult.nextConnection.provider === "google";
      const meetingUrl = externalEvent.meetingUrl ?? row.booking.meetingUrl;
      const hasRequiredMeeting = !requiresGoogleMeeting || Boolean(meetingUrl);
      resolvedMeetingUrl = meetingUrl ?? resolvedMeetingUrl;
      await db.update(nativeBookings).set({ calendarConnectionId: transactionResult.nextConnection.id, calendarId: transactionResult.nextCalendarId, meetingUrl, syncStatus: hasRequiredMeeting ? "synced" : "failed", status: hasRequiredMeeting ? "confirmed" : "sync_failed", syncError: hasRequiredMeeting ? null : "Le lien Google Meet est encore en préparation.", updatedAt: new Date() }).where(eq(nativeBookings.id, bookingId));
      if (!hasRequiredMeeting) calendarSyncWarning = true;
    } else if (transactionResult.externalEventId && transactionResult.oldConnection) {
      await cancelExternalCalendarEvent(transactionResult.oldConnection, transactionResult.externalEventId, transactionResult.oldCalendarId);
      if (transactionResult.nextConnection) {
        const created = await createExternalCalendarEvent({
          connection: transactionResult.nextConnection,
          calendarId: transactionResult.nextCalendarId,
          idempotencyKey: `${bookingId}:${transactionResult.startAt.toISOString()}`,
          title: row.event.meetingLabel,
          description: row.event.description,
          startAt: transactionResult.startAt,
          endAt: transactionResult.endAt,
          guestName: `${row.booking.firstName} ${row.booking.lastName}`,
          guestEmail: row.booking.email,
          meetingUrl: row.booking.meetingUrl ?? row.event.meetingUrl,
        });
        const requiresGoogleMeeting = transactionResult.nextConnection.provider === "google";
        const hasRequiredMeeting = !requiresGoogleMeeting || Boolean(created.meetingUrl);
        resolvedMeetingUrl = created.meetingUrl ?? resolvedMeetingUrl;
        await db.update(nativeBookings).set({ calendarConnectionId: transactionResult.nextConnection.id, calendarId: transactionResult.nextCalendarId, externalEventId: created.id, externalEventUrl: created.url, meetingUrl: created.meetingUrl, syncStatus: hasRequiredMeeting ? "synced" : "failed", status: hasRequiredMeeting ? "confirmed" : "sync_failed", syncError: hasRequiredMeeting ? null : "Le lien Google Meet est encore en préparation.", updatedAt: new Date() }).where(eq(nativeBookings.id, bookingId));
        if (!hasRequiredMeeting) calendarSyncWarning = true;
      } else {
        resolvedMeetingUrl = row.booking.meetingUrl ?? row.event.meetingUrl;
        await db.update(nativeBookings).set({ calendarConnectionId: null, calendarId: null, externalEventId: null, externalEventUrl: null, meetingUrl: row.booking.meetingUrl, syncStatus: "not_required", syncError: null, updatedAt: new Date() }).where(eq(nativeBookings.id, bookingId));
      }
    } else if (transactionResult.nextConnection) {
      const created = await createExternalCalendarEvent({
        connection: transactionResult.nextConnection,
        calendarId: transactionResult.nextCalendarId,
        idempotencyKey: `${bookingId}:${transactionResult.startAt.toISOString()}`,
        title: row.event.meetingLabel,
        description: row.event.description,
        startAt: transactionResult.startAt,
        endAt: transactionResult.endAt,
        guestName: `${row.booking.firstName} ${row.booking.lastName}`,
        guestEmail: row.booking.email,
        meetingUrl: row.booking.meetingUrl ?? row.event.meetingUrl,
      });
      const requiresGoogleMeeting = transactionResult.nextConnection.provider === "google";
      const hasRequiredMeeting = !requiresGoogleMeeting || Boolean(created.meetingUrl);
      resolvedMeetingUrl = created.meetingUrl ?? resolvedMeetingUrl;
      await db.update(nativeBookings).set({ calendarConnectionId: transactionResult.nextConnection.id, calendarId: transactionResult.nextCalendarId, externalEventId: created.id, externalEventUrl: created.url, meetingUrl: created.meetingUrl, syncStatus: hasRequiredMeeting ? "synced" : "failed", status: hasRequiredMeeting ? "confirmed" : "sync_failed", syncError: hasRequiredMeeting ? null : "Le lien Google Meet est encore en préparation.", updatedAt: new Date() }).where(eq(nativeBookings.id, bookingId));
      if (!hasRequiredMeeting) calendarSyncWarning = true;
    } else {
      await db.update(nativeBookings).set({ calendarConnectionId: null, syncStatus: "not_required", syncError: null, updatedAt: new Date() }).where(eq(nativeBookings.id, bookingId));
    }
  } catch (error) {
    console.error("[native-booking] calendar reschedule failed", { bookingId, error });
    await markCalendarFailure(bookingId, "Le déplacement dans le calendrier a échoué.");
    calendarSyncWarning = true;
  }

  if (!calendarSyncWarning) {
    await scheduleNativeBookingNotification(bookingId, "reschedule");
    await rebuildNativeBookingReminders(bookingId);
  } else {
    try {
      await inngest.send(nativeBookingCalendarSyncRequested.create({ bookingId, kind: "reschedule" }));
    } catch (scheduleError) {
      console.error("[native-booking] reschedule calendar retry scheduling failed", { bookingId, scheduleError });
    }
  }
  return { ...transactionResult, meetingUrl: resolvedMeetingUrl, ...(calendarSyncWarning ? { calendarSyncWarning: true } : {}) };
}

// Résolution d'un lien de gestion namespacé : le token est déjà globalement
// unique, mais on filtre aussi sur (handle, slug) pour honorer l'URL publique et
// empêcher qu'un lien vers un compte cible un event d'un autre compte.
async function findBookingByManagementToken(handle: string, slug: string, token: string, kind: "cancel" | "reschedule") {
  const tokenHash = hashBookingManagementToken(token);
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .innerJoin(users, eq(users.id, nativeBookingEvents.userId))
    .where(
      and(
        eq(users.bookingHandle, handle),
        eq(nativeBookingEvents.slug, slug),
        kind === "cancel" ? eq(nativeBookings.cancellationTokenHash, tokenHash) : eq(nativeBookings.rescheduleTokenHash, tokenHash),
        or(eq(nativeBookings.status, "confirmed"), eq(nativeBookings.status, "sync_failed"))
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getPublicNativeBookingRescheduleSlots(handle: string, slug: string, token: string) {
  const row = await findBookingByManagementToken(handle, slug, token, "reschedule");
  if (!row) return null;
  const slots = await getPublicNativeBookingSlots(handle, slug, { days: 14, excludeBookingId: row.booking.id, closerUserId: row.booking.closerUserId });
  return slots;
}

export async function cancelNativeBookingByToken(handle: string, slug: string, token: string) {
  const row = await findBookingByManagementToken(handle, slug, token, "cancel");
  if (!row) return { error: "not_found" as const };
  return cancelNativeBooking(row.booking.id);
}

export async function rescheduleNativeBookingByToken(handle: string, slug: string, token: string, requestedStartAt: Date) {
  const row = await findBookingByManagementToken(handle, slug, token, "reschedule");
  if (!row) return { error: "not_found" as const };
  return rescheduleNativeBooking(row.booking.id, requestedStartAt);
}
