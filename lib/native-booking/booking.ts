import { and, asc, eq, gte, gt, ne, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingAvailability,
  nativeBookingActivities,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookingLeads,
  nativeBookingLinks,
  nativeBookings,
  nativeBookingQuestions,
  nativeCalendarConnections,
  salesCalls,
  users,
} from "@/db/schema";
import { inngest, nativeBookingCalendarSyncRequested } from "@/lib/inngest/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { resolveMetaTouchpoint } from "@/lib/meta-ads/attribution";

import { generateBookingSlots } from "./slots";
import {
  createExternalCalendarEvent,
  cancelExternalCalendarEvent,
  getCalendarStatesForClosers,
  listBusyForConnection,
  updateExternalCalendarEvent,
  type CalendarConnection,
} from "./calendar";
import { validateNativeBookingAnswers } from "./questions";
import { normalizeEmail, normalizePhone, sanitizeUtm, type PublicBookingRequest } from "./validation";
import { scheduleNativeBookingNotification } from "./notifications";
import { scheduleNativeBookingReminders } from "./reminders";
import { createBookingManagementTokens } from "./tokens";

export type NativeBookingResult = {
  bookingId: string;
  callId: string;
  startAt: Date;
  endAt: Date;
  closerName: string;
  meetingLabel: string;
  meetingUrl: string | null;
  eventTimeZone: string;
  cancellationToken: string | null;
  rescheduleToken: string | null;
  calendarSyncWarning?: boolean;
};

export type NativeBookingHoldResult = {
  holdId: string;
  startAt: Date;
  endAt: Date;
  closerName: string;
  eventTimeZone: string;
  expiresAt: Date;
};

const BOOKING_HOLD_DURATION_MS = 5 * 60_000;

type NativeBookingError = { error: "not_found" | "existing_booking" | "slot_unavailable" | "invalid" };
type BookingMode = "hold" | "confirm";
type InternalNativeBookingResult = {
  bookingId: string;
  callId: string | null;
  startAt: Date;
  endAt: Date;
  closerName: string;
  meetingLabel: string;
  meetingUrl: string | null;
  eventTimeZone: string;
  cancellationToken: string | null;
  rescheduleToken: string | null;
  mode: BookingMode;
  holdExpiresAt: Date | null;
  idempotencyKey: string;
  calendarConnectionId: string | null;
  calendarConnection: CalendarConnection | null;
  shouldSyncCalendar: boolean;
  calendarSyncWarning?: boolean;
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

async function createNativeBookingInternal(handle: string, slug: string, request: PublicBookingRequest, mode: BookingMode): Promise<InternalBookingResult> {
  const event = await db
    .select({ event: nativeBookingEvents })
    .from(nativeBookingEvents)
    .innerJoin(users, eq(users.id, nativeBookingEvents.userId))
    .where(and(eq(users.bookingHandle, handle), eq(nativeBookingEvents.slug, slug), eq(nativeBookingEvents.status, "active")))
    .limit(1);
  const eventRow = event[0]?.event;
  if (!eventRow) return { error: "not_found" };

  const questions = await db
    .select()
    .from(nativeBookingQuestions)
    .where(eq(nativeBookingQuestions.eventId, eventRow.id))
    .orderBy(asc(nativeBookingQuestions.position));
  const answerValidation = validateNativeBookingAnswers(questions, request.answers);
  if (!answerValidation.ok) return { error: "invalid" };

  const now = new Date();
  const phoneNormalized = normalizePhone(request.phone);
  const requestedStart = new Date(request.startAt);
  const requestedEnd = new Date(requestedStart.getTime() + eventRow.durationMinutes * 60_000);
  const safeUtm = sanitizeUtm(request.utm);
  const metaAttribution = await resolveMetaTouchpoint(eventRow.userId, request.metaTouchpointToken);

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
    if (existingAttempt && existingAttempt.status !== "cancelled" && existingAttempt.status !== "expired" && existingAttempt.status !== "pending" && existingAttempt.closerUserId) {
      const [closer] = await tx.select().from(users).where(eq(users.id, existingAttempt.closerUserId)).limit(1);
      const [call] = await tx.select({ id: salesCalls.id }).from(salesCalls).where(eq(salesCalls.nativeBookingId, existingAttempt.id)).limit(1);
      if (closer && call) {
        return {
          bookingId: existingAttempt.id,
          callId: call.id,
          idempotencyKey: existingAttempt.idempotencyKey,
          startAt: existingAttempt.startAt,
          endAt: existingAttempt.endAt,
          closerName: closer.displayName || closer.email,
          meetingLabel: eventRow.meetingLabel,
          meetingUrl: eventRow.meetingUrl,
          eventTimeZone: eventRow.timeZone,
          cancellationToken: existingAttempt.cancellationTokenEncrypted ? decrypt(existingAttempt.cancellationTokenEncrypted) : null,
          rescheduleToken: existingAttempt.rescheduleTokenEncrypted ? decrypt(existingAttempt.rescheduleTokenEncrypted) : null,
          mode: "confirm",
          holdExpiresAt: null,
          calendarConnectionId: existingAttempt.calendarConnectionId,
          calendarConnection: existingAttempt.calendarConnectionId
            ? calendarStates.get(existingAttempt.closerUserId)?.connection ?? null
            : null,
          shouldSyncCalendar: existingAttempt.syncStatus !== "synced" && !existingAttempt.externalEventId && Boolean(calendarStates.get(existingAttempt.closerUserId)?.connection),
          ...(existingAttempt.status === "sync_failed" ? { calendarSyncWarning: true } : {}),
        };
      }
      return { error: "invalid" };
    }
    if (mode === "confirm" && existingAttempt?.status === "pending" && (!existingAttempt.holdExpiresAt || existingAttempt.holdExpiresAt <= now)) {
      return { error: "slot_unavailable" };
    }

    const duplicateConditions = [
      eq(nativeBookings.userId, eventRow.userId),
      eq(nativeBookings.phoneNormalized, phoneNormalized),
      gte(nativeBookings.startAt, now),
      or(
        eq(nativeBookings.status, "confirmed"),
        eq(nativeBookings.status, "sync_failed"),
        and(eq(nativeBookings.status, "pending"), gt(nativeBookings.holdExpiresAt, now))
      ),
    ];
    if (existingAttempt) duplicateConditions.push(ne(nativeBookings.id, existingAttempt.id));

    const [duplicate] = await tx
      .select({ id: nativeBookings.id })
      .from(nativeBookings)
      .where(and(...duplicateConditions))
      .limit(1);
    if (duplicate) return { error: "existing_booking" };

    const allBookingConditions = [eq(nativeBookings.eventId, eventRow.id), ne(nativeBookings.status, "cancelled"), ne(nativeBookings.status, "expired")];
    if (existingAttempt) allBookingConditions.push(ne(nativeBookings.id, existingAttempt.id));

    const [availability, exceptions, allBookings, assignedClosers] = await Promise.all([
      tx.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, eventRow.id)),
      tx.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, eventRow.id)),
      tx
        .select({
          id: nativeBookings.id,
          startAt: nativeBookings.startAt,
          endAt: nativeBookings.endAt,
          status: nativeBookings.status,
          holdExpiresAt: nativeBookings.holdExpiresAt,
          closerUserId: nativeBookings.closerUserId,
        })
        .from(nativeBookings)
        .where(and(...allBookingConditions)),
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

    const calendarConnection = calendarStates.get(selected.assignment.closerUserId)?.connection ?? null;
    const nextHoldExpiresAt = mode === "hold" ? new Date(now.getTime() + BOOKING_HOLD_DURATION_MS) : null;
    const managementTokens = mode === "confirm" ? createBookingManagementTokens() : null;
    const bookingValues = {
        userId: eventRow.userId,
        eventId: eventRow.id,
        abandonedLeadId: lead?.status === "converted" ? null : lead?.id ?? null,
        idempotencyKey: request.idempotencyKey,
        status: mode === "hold" ? "pending" as const : "confirmed" as const,
        syncStatus: calendarConnection ? "pending" as const : "not_required" as const,
        firstName: request.firstName.trim(),
        lastName: request.lastName.trim(),
        email: request.email.trim(),
        emailNormalized: normalizeEmail(request.email),
        phone: request.phone.trim(),
        phoneNormalized,
        answers: answerValidation.snapshot,
        guestTimeZone: request.guestTimeZone,
        eventTimeZone: eventRow.timeZone,
        startAt: requestedStart,
        endAt: requestedEnd,
        closerUserId: selected.assignment.closerUserId,
        calendarConnectionId: calendarConnection?.id ?? null,
        externalEventId: null,
        externalEventUrl: null,
        holdExpiresAt: nextHoldExpiresAt,
        cancellationTokenHash: managementTokens?.cancellationTokenHash ?? existingAttempt?.cancellationTokenHash ?? null,
        rescheduleTokenHash: managementTokens?.rescheduleTokenHash ?? existingAttempt?.rescheduleTokenHash ?? null,
        cancellationTokenEncrypted: managementTokens ? encrypt(managementTokens.cancellationToken) : null,
        rescheduleTokenEncrypted: managementTokens ? encrypt(managementTokens.rescheduleToken) : null,
        syncError: null,
        linkId: link?.id ?? null,
        metaTouchpointId: metaAttribution?.touchpointId ?? null,
        landingPage: request.landingPage,
        referrer: request.referrer,
        utmSource: safeUtm.utm_source ?? link?.utmSource ?? null,
        utmMedium: safeUtm.utm_medium ?? link?.utmMedium ?? null,
        utmCampaign: safeUtm.utm_campaign ?? link?.utmCampaign ?? null,
        utmContent: safeUtm.utm_content ?? link?.utmContent ?? null,
        utmTerm: safeUtm.utm_term ?? link?.utmTerm ?? null,
        utmMetadata: safeUtm,
      };
    const [booking] = existingAttempt?.status === "pending"
      ? await tx
          .update(nativeBookings)
          .set(bookingValues)
          .where(eq(nativeBookings.id, existingAttempt.id))
          .returning({ id: nativeBookings.id })
      : await tx.insert(nativeBookings).values(bookingValues).returning({ id: nativeBookings.id });
    if (!booking) return { error: "invalid" };

    let call: { id: string } | undefined;
    if (mode === "confirm") {
      [call] = await tx
        .insert(salesCalls)
        .values({
        userId: eventRow.userId,
        iclosedCallId: `native:${booking.id}`,
        nativeBookingId: booking.id,
        inviteeName: `${request.firstName.trim()} ${request.lastName.trim()}`,
        inviteeEmail: request.email.trim(),
        inviteePhone: request.phone.trim(),
        durationMinutes: eventRow.durationMinutes,
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
        metaTouchpointId: metaAttribution?.touchpointId ?? null,
        })
        .returning({ id: salesCalls.id });
      if (!call) return { error: "invalid" };

      await tx.insert(nativeBookingActivities).values({
        bookingId: booking.id,
        kind: "booked",
        toStartAt: requestedStart,
        toEndAt: requestedEnd,
        toCloserUserId: selected.assignment.closerUserId,
        toCloserName: selected.user.displayName || selected.user.email,
      });
    }

    if (mode === "confirm" && lead && lead.status !== "converted") {
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

    if (mode === "confirm") {
      await tx
        .update(nativeBookingEvents)
        .set({ roundRobinCursor: (selected.assignment.position + 1) % Math.max(assignedClosers.length, 1), updatedAt: new Date() })
        .where(eq(nativeBookingEvents.id, eventRow.id));
    }

    return {
      bookingId: booking.id,
      callId: call?.id ?? null,
      idempotencyKey: request.idempotencyKey,
      startAt: requestedStart,
      endAt: requestedEnd,
      closerName: selected.user.displayName || selected.user.email,
      meetingLabel: eventRow.meetingLabel,
      meetingUrl: eventRow.meetingUrl,
      eventTimeZone: eventRow.timeZone,
      cancellationToken: managementTokens?.cancellationToken ?? null,
      rescheduleToken: managementTokens?.rescheduleToken ?? null,
      mode,
      holdExpiresAt: nextHoldExpiresAt,
      calendarConnectionId: calendarConnection?.id ?? null,
      calendarConnection,
      shouldSyncCalendar: mode === "confirm" && Boolean(calendarConnection),
    };
  });

  if ("error" in transactionResult) return transactionResult;
  let calendarSyncWarning = Boolean(transactionResult.calendarSyncWarning);
  if (transactionResult.mode === "confirm" && transactionResult.shouldSyncCalendar && transactionResult.calendarConnection) {
    try {
      const externalEvent = await createExternalCalendarEvent({
        connection: transactionResult.calendarConnection,
        idempotencyKey: transactionResult.idempotencyKey,
        title: transactionResult.meetingLabel,
        description: eventRow.description,
        startAt: transactionResult.startAt,
        endAt: transactionResult.endAt,
        guestName: `${request.firstName.trim()} ${request.lastName.trim()}`,
        guestEmail: request.email.trim(),
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
      calendarSyncWarning = false;
    } catch (error) {
      console.error("[native-booking] external calendar event creation failed", error);
      await db
        .update(nativeBookings)
        .set({ syncStatus: "failed", status: "sync_failed", syncError: "La synchronisation du calendrier a échoué.", updatedAt: new Date() })
        .where(eq(nativeBookings.id, transactionResult.bookingId));
      try {
        await inngest.send(nativeBookingCalendarSyncRequested.create({ bookingId: transactionResult.bookingId }));
      } catch (scheduleError) {
        console.error("[native-booking] calendar retry scheduling failed", scheduleError);
      }
      calendarSyncWarning = true;
    }
  }

  if (transactionResult.mode === "confirm") {
    await scheduleNativeBookingNotification(transactionResult.bookingId, "confirmation");
    await scheduleNativeBookingReminders(transactionResult.bookingId);
  }

  return { ...transactionResult, ...(calendarSyncWarning ? { calendarSyncWarning: true } : {}) };
}

export async function createNativeBooking(
  handle: string,
  slug: string,
  request: PublicBookingRequest
): Promise<NativeBookingResult | NativeBookingError> {
  const result = await createNativeBookingInternal(handle, slug, request, "confirm");
  if ("error" in result) return result;
  if (!result.callId) return { error: "invalid" };
  return {
    bookingId: result.bookingId,
    callId: result.callId,
    startAt: result.startAt,
    endAt: result.endAt,
    closerName: result.closerName,
    meetingLabel: result.meetingLabel,
    meetingUrl: result.meetingUrl,
    eventTimeZone: result.eventTimeZone,
    cancellationToken: result.cancellationToken,
    rescheduleToken: result.rescheduleToken,
    ...(result.calendarSyncWarning ? { calendarSyncWarning: true } : {}),
  };
}

export async function createNativeBookingHold(
  handle: string,
  slug: string,
  request: PublicBookingRequest
): Promise<NativeBookingHoldResult | NativeBookingError> {
  const result = await createNativeBookingInternal(handle, slug, request, "hold");
  if ("error" in result) return result;
  return {
    holdId: result.bookingId,
    startAt: result.startAt,
    endAt: result.endAt,
    closerName: result.closerName,
    eventTimeZone: result.eventTimeZone,
    expiresAt: result.holdExpiresAt ?? new Date(Date.now() + BOOKING_HOLD_DURATION_MS),
  };
}

export async function retryNativeBookingCalendarSync(bookingId: string): Promise<"synced" | "skipped"> {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row) return "skipped";
  if (!row.booking.calendarConnectionId) return "skipped";

  const [connection] = await db
    .select()
    .from(nativeCalendarConnections)
    .where(eq(nativeCalendarConnections.id, row.booking.calendarConnectionId))
    .limit(1);
  if (!connection) return "skipped";

  try {
    if (row.booking.status === "cancelled") {
      if (!row.booking.externalEventId) return "skipped";
      await cancelExternalCalendarEvent(connection, row.booking.externalEventId);
      await db
        .update(nativeBookings)
        .set({ calendarConnectionId: null, externalEventId: null, externalEventUrl: null, syncStatus: "synced", syncError: null, updatedAt: new Date() })
        .where(eq(nativeBookings.id, bookingId));
      return "synced";
    }

    const externalEvent = row.booking.externalEventId
      ? await updateExternalCalendarEvent({
          connection,
          externalEventId: row.booking.externalEventId,
          title: row.event.meetingLabel,
          description: row.event.description,
          startAt: row.booking.startAt,
          endAt: row.booking.endAt,
          guestName: `${row.booking.firstName} ${row.booking.lastName}`,
          guestEmail: row.booking.email,
          meetingUrl: row.event.meetingUrl,
        })
      : await createExternalCalendarEvent({
          connection,
          idempotencyKey: row.booking.idempotencyKey,
          title: row.event.meetingLabel,
          description: row.event.description,
          startAt: row.booking.startAt,
          endAt: row.booking.endAt,
          guestName: `${row.booking.firstName} ${row.booking.lastName}`,
          guestEmail: row.booking.email,
          meetingUrl: row.event.meetingUrl,
        });
    await db
      .update(nativeBookings)
      .set({
        status: "confirmed",
        syncStatus: "synced",
        externalEventId: externalEvent.id,
        externalEventUrl: externalEvent.url,
        syncError: null,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(nativeBookings.id, bookingId));
    await scheduleNativeBookingNotification(bookingId, "confirmation");
    return "synced";
  } catch (error) {
    await db
      .update(nativeBookings)
      .set({
        status: "sync_failed",
        syncStatus: "failed",
        syncError: "La synchronisation du calendrier a échoué.",
        updatedAt: new Date(),
      })
      .where(eq(nativeBookings.id, bookingId));
    throw error;
  }
}
