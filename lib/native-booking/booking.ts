import { and, asc, eq, gte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingAvailability,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookingLeads,
  nativeBookingLinks,
  nativeBookings,
  salesCalls,
  users,
} from "@/db/schema";

import { generateBookingSlots } from "./slots";
import {
  createExternalCalendarEvent,
  getCalendarStatesForClosers,
  listBusyForConnection,
  type CalendarConnection,
} from "./calendar";
import { normalizePhone, sanitizeUtm, type PublicBookingRequest } from "./validation";

export type NativeBookingResult = {
  bookingId: string;
  callId: string;
  startAt: Date;
  endAt: Date;
  closerName: string;
  meetingLabel: string;
  meetingUrl: string | null;
  eventTimeZone: string;
  calendarSyncWarning?: boolean;
};

type NativeBookingError = { error: "not_found" | "existing_booking" | "slot_unavailable" | "invalid" };
type InternalNativeBookingResult = NativeBookingResult & {
  calendarConnectionId: string | null;
  calendarConnection: CalendarConnection | null;
  shouldSyncCalendar: boolean;
};
type InternalBookingResult = InternalNativeBookingResult | NativeBookingError;

function isBlockingStatus(status: string, holdExpiresAt: Date | null, now: Date): boolean {
  return status === "confirmed" || status === "sync_failed" || (status === "pending" && Boolean(holdExpiresAt && holdExpiresAt > now));
}

function closerIsBusy(
  startAt: Date,
  endAt: Date,
  bookings: Array<{ startAt: Date; endAt: Date; status: string; holdExpiresAt: Date | null }>,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  now: Date
): boolean {
  return bookings.some((booking) => {
    if (!isBlockingStatus(booking.status, booking.holdExpiresAt, now)) return false;
    const bufferedStart = new Date(booking.startAt.getTime() - bufferBeforeMinutes * 60_000);
    const bufferedEnd = new Date(booking.endAt.getTime() + bufferAfterMinutes * 60_000);
    return startAt < bufferedEnd && endAt > bufferedStart;
  });
}

export async function createNativeBooking(slug: string, request: PublicBookingRequest): Promise<NativeBookingResult | { error: "not_found" | "existing_booking" | "slot_unavailable" | "invalid" }> {
  const event = await db
    .select()
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.slug, slug), eq(nativeBookingEvents.status, "active")))
    .limit(1);
  const [eventRow] = event;
  if (!eventRow) return { error: "not_found" };

  const now = new Date();
  const phoneNormalized = normalizePhone(request.phone);
  const requestedStart = new Date(request.startAt);
  const requestedEnd = new Date(requestedStart.getTime() + eventRow.durationMinutes * 60_000);
  const safeUtm = sanitizeUtm(request.utm);

  const calendarCandidates = await db
    .select({ closerUserId: nativeBookingEventClosers.closerUserId })
    .from(nativeBookingEventClosers)
    .where(
      and(
        eq(nativeBookingEventClosers.eventId, eventRow.id),
        eq(nativeBookingEventClosers.isActive, true),
        eq(nativeBookingEventClosers.isOff, false)
      )
    );
  const calendarStates = await getCalendarStatesForClosers(
    eventRow.userId,
    calendarCandidates.map(({ closerUserId }) => closerUserId)
  );
  const externalBusyByCloser = new Map<string, Array<{ startAt: Date; endAt: Date }>>();
  const calendarUnavailable = new Set<string>();
  await Promise.all(
    calendarCandidates.map(async ({ closerUserId }) => {
      const state = calendarStates.get(closerUserId);
      if (!state) return;
      if (state.unavailable) {
        calendarUnavailable.add(closerUserId);
        return;
      }
      if (!state.connection) return;
      try {
        externalBusyByCloser.set(
          closerUserId,
          await listBusyForConnection(
            state.connection,
            new Date(requestedStart.getTime() - eventRow.bufferBeforeMinutes * 60_000),
            new Date(requestedEnd.getTime() + eventRow.bufferAfterMinutes * 60_000)
          )
        );
      } catch (error) {
        console.error("[native-booking] calendar confirmation check failed", { closerUserId, error });
        calendarUnavailable.add(closerUserId);
      }
    })
  );

  const transactionResult: InternalBookingResult = await db.transaction(async (tx): Promise<InternalBookingResult> => {
    // Serialize confirmations for one event. This keeps the round-robin
    // cursor and the final conflict check consistent when two prospects click
    // the same slot at the same time.
    await tx.execute(sql`select id from native_booking_events where id = ${eventRow.id} for update`);

    const [existingAttempt] = await tx
      .select()
      .from(nativeBookings)
      .where(and(eq(nativeBookings.eventId, eventRow.id), eq(nativeBookings.idempotencyKey, request.idempotencyKey)))
      .limit(1);
    if (existingAttempt?.status === "confirmed" && existingAttempt.closerUserId) {
      const [closer] = await tx.select().from(users).where(eq(users.id, existingAttempt.closerUserId)).limit(1);
      const [call] = await tx.select({ id: salesCalls.id }).from(salesCalls).where(eq(salesCalls.nativeBookingId, existingAttempt.id)).limit(1);
      if (closer && call) {
        return {
          bookingId: existingAttempt.id,
          callId: call.id,
          startAt: existingAttempt.startAt,
          endAt: existingAttempt.endAt,
          closerName: closer.displayName || closer.email,
          meetingLabel: eventRow.meetingLabel,
          meetingUrl: eventRow.meetingUrl,
          eventTimeZone: eventRow.timeZone,
          calendarConnectionId: existingAttempt.calendarConnectionId,
          calendarConnection: existingAttempt.calendarConnectionId
            ? calendarStates.get(existingAttempt.closerUserId)?.connection ?? null
            : null,
          shouldSyncCalendar: existingAttempt.syncStatus === "pending" && !existingAttempt.externalEventId,
        };
      }
    }

    const [duplicate] = await tx
      .select({ id: nativeBookings.id })
      .from(nativeBookings)
      .where(
        and(
          eq(nativeBookings.userId, eventRow.userId),
          eq(nativeBookings.phoneNormalized, phoneNormalized),
          gte(nativeBookings.startAt, now),
          ne(nativeBookings.status, "cancelled"),
          ne(nativeBookings.status, "expired")
        )
      )
      .limit(1);
    if (duplicate) return { error: "existing_booking" };

    const [availability, exceptions, allBookings, assignedClosers] = await Promise.all([
      tx.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, eventRow.id)),
      tx.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, eventRow.id)),
      tx
        .select({
          startAt: nativeBookings.startAt,
          endAt: nativeBookings.endAt,
          status: nativeBookings.status,
          holdExpiresAt: nativeBookings.holdExpiresAt,
          closerUserId: nativeBookings.closerUserId,
        })
        .from(nativeBookings)
        .where(and(eq(nativeBookings.eventId, eventRow.id), ne(nativeBookings.status, "cancelled"), ne(nativeBookings.status, "expired"))),
      tx
        .select({ assignment: nativeBookingEventClosers, user: users })
        .from(nativeBookingEventClosers)
        .innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id))
        .where(and(eq(nativeBookingEventClosers.eventId, eventRow.id), eq(nativeBookingEventClosers.isActive, true), eq(nativeBookingEventClosers.isOff, false)))
        .orderBy(asc(nativeBookingEventClosers.position), asc(users.email)),
    ]);

    const validSlots = generateBookingSlots({
      event: eventRow,
      availability,
      exceptions,
      bookings: [],
      now,
      days: eventRow.bookingHorizonDays,
    });
    const slotMatches = validSlots.some((slot) => slot.startAt.getTime() === requestedStart.getTime() && slot.endAt.getTime() === requestedEnd.getTime());
    if (!slotMatches) return { error: "slot_unavailable" };
    if (assignedClosers.length === 0) return { error: "slot_unavailable" };

    const startIndex = Math.abs(eventRow.roundRobinCursor) % assignedClosers.length;
    const orderedClosers = assignedClosers.map((_, index) => assignedClosers[(startIndex + index) % assignedClosers.length]);
    const selected = orderedClosers.find(({ assignment }) => {
      if (calendarUnavailable.has(assignment.closerUserId)) return false;
      if ((externalBusyByCloser.get(assignment.closerUserId) ?? []).some((period) => {
        const bufferedStart = new Date(period.startAt.getTime() - eventRow.bufferBeforeMinutes * 60_000);
        const bufferedEnd = new Date(period.endAt.getTime() + eventRow.bufferAfterMinutes * 60_000);
        return requestedStart < bufferedEnd && requestedEnd > bufferedStart;
      })) return false;
      const closerBookings = allBookings.filter((booking) => booking.closerUserId === assignment.closerUserId);
      return !closerIsBusy(requestedStart, requestedEnd, closerBookings, eventRow.bufferBeforeMinutes, eventRow.bufferAfterMinutes, now);
    });
    if (!selected) return { error: "slot_unavailable" };

    const [link] = request.linkId
      ? await tx
          .select()
          .from(nativeBookingLinks)
          .where(and(eq(nativeBookingLinks.id, request.linkId), eq(nativeBookingLinks.eventId, eventRow.id), eq(nativeBookingLinks.isActive, true)))
          .limit(1)
      : [];

    const [lead] = request.leadId
      ? await tx
          .select({ id: nativeBookingLeads.id, status: nativeBookingLeads.status })
          .from(nativeBookingLeads)
          .where(
            and(
              eq(nativeBookingLeads.id, request.leadId),
              eq(nativeBookingLeads.eventId, eventRow.id),
              eq(nativeBookingLeads.phoneNormalized, phoneNormalized)
            )
          )
          .limit(1)
      : [];

    const [booking] = await tx
      .insert(nativeBookings)
      .values({
        userId: eventRow.userId,
        eventId: eventRow.id,
        abandonedLeadId: lead?.status === "converted" ? null : lead?.id ?? null,
        idempotencyKey: request.idempotencyKey,
        status: "confirmed",
        syncStatus: calendarStates.get(selected.assignment.closerUserId)?.connection ? "pending" : "not_required",
        firstName: request.firstName.trim(),
        lastName: request.lastName.trim(),
        email: null,
        emailNormalized: null,
        phone: request.phone.trim(),
        phoneNormalized,
        guestTimeZone: request.guestTimeZone,
        eventTimeZone: eventRow.timeZone,
        startAt: requestedStart,
        endAt: requestedEnd,
        closerUserId: selected.assignment.closerUserId,
        calendarConnectionId: calendarStates.get(selected.assignment.closerUserId)?.connection?.id ?? null,
        linkId: link?.id ?? null,
        landingPage: request.landingPage,
        referrer: request.referrer,
        utmSource: safeUtm.utm_source ?? link?.utmSource ?? null,
        utmMedium: safeUtm.utm_medium ?? link?.utmMedium ?? null,
        utmCampaign: safeUtm.utm_campaign ?? link?.utmCampaign ?? null,
        utmContent: safeUtm.utm_content ?? link?.utmContent ?? null,
        utmTerm: safeUtm.utm_term ?? link?.utmTerm ?? null,
        utmMetadata: safeUtm,
      })
      .returning({ id: nativeBookings.id });
    if (!booking) return { error: "invalid" };

    const [call] = await tx
      .insert(salesCalls)
      .values({
        userId: eventRow.userId,
        iclosedCallId: `native:${booking.id}`,
        nativeBookingId: booking.id,
        inviteeName: `${request.firstName.trim()} ${request.lastName.trim()}`,
        inviteePhone: request.phone.trim(),
        scheduledAt: requestedStart,
        closer: selected.user.displayName || selected.user.email,
        closerUserId: selected.assignment.closerUserId,
        eventType: eventRow.name,
        source: "native",
        utmSource: safeUtm.utm_source ?? link?.utmSource ?? null,
        utmMedium: safeUtm.utm_medium ?? link?.utmMedium ?? null,
        utmCampaign: safeUtm.utm_campaign ?? link?.utmCampaign ?? null,
        utmContent: safeUtm.utm_content ?? link?.utmContent ?? null,
        utmTerm: safeUtm.utm_term ?? link?.utmTerm ?? null,
      })
      .returning({ id: salesCalls.id });
    if (!call) return { error: "invalid" };

    if (lead && lead.status !== "converted") {
      await tx
        .update(nativeBookingLeads)
        .set({
          status: "converted",
          lastStep: "converted",
          convertedAt: new Date(),
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(nativeBookingLeads.id, lead.id));
    }

    await tx
      .update(nativeBookingEvents)
      .set({ roundRobinCursor: (selected.assignment.position + 1) % Math.max(assignedClosers.length, 1), updatedAt: new Date() })
      .where(eq(nativeBookingEvents.id, eventRow.id));

    return {
      bookingId: booking.id,
      callId: call.id,
      startAt: requestedStart,
      endAt: requestedEnd,
      closerName: selected.user.displayName || selected.user.email,
      meetingLabel: eventRow.meetingLabel,
      meetingUrl: eventRow.meetingUrl,
      eventTimeZone: eventRow.timeZone,
      calendarConnectionId: calendarStates.get(selected.assignment.closerUserId)?.connection?.id ?? null,
      calendarConnection: calendarStates.get(selected.assignment.closerUserId)?.connection ?? null,
      shouldSyncCalendar: Boolean(calendarStates.get(selected.assignment.closerUserId)?.connection),
    };
  });

  if ("error" in transactionResult) return transactionResult;
  let calendarSyncWarning = false;
  if (transactionResult.shouldSyncCalendar && transactionResult.calendarConnection) {
    try {
      const externalEvent = await createExternalCalendarEvent({
        connection: transactionResult.calendarConnection,
        title: transactionResult.meetingLabel,
        description: eventRow.description,
        startAt: transactionResult.startAt,
        endAt: transactionResult.endAt,
        guestName: `${request.firstName.trim()} ${request.lastName.trim()}`,
        guestEmail: null,
        meetingUrl: transactionResult.meetingUrl,
      });
      await db
        .update(nativeBookings)
        .set({
          syncStatus: "synced",
          externalEventId: externalEvent.id,
          externalEventUrl: externalEvent.url,
          syncError: null,
          holdExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(nativeBookings.id, transactionResult.bookingId));
    } catch (error) {
      console.error("[native-booking] external calendar event creation failed", error);
      await db
        .update(nativeBookings)
        .set({ syncStatus: "failed", status: "sync_failed", syncError: "La synchronisation du calendrier a échoué.", updatedAt: new Date() })
        .where(eq(nativeBookings.id, transactionResult.bookingId));
      calendarSyncWarning = true;
    }
  }

  return {
    bookingId: transactionResult.bookingId,
    callId: transactionResult.callId,
    startAt: transactionResult.startAt,
    endAt: transactionResult.endAt,
    closerName: transactionResult.closerName,
    meetingLabel: transactionResult.meetingLabel,
    meetingUrl: transactionResult.meetingUrl,
    eventTimeZone: transactionResult.eventTimeZone,
    ...(calendarSyncWarning ? { calendarSyncWarning: true } : {}),
  };
}
