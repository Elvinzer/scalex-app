import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nativeBookingEvents, nativeBookingNotifications, nativeBookings } from "@/db/schema";
import { getResendClient } from "@/lib/resend-client";
import { getAppUrl } from "@/lib/utils";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";
import { getPublicNativeBookingSlots } from "@/lib/native-booking/queries";
import { createNativeBookingForCrm, scheduleNativeBookingSideEffects } from "@/lib/native-booking/booking";
import { cancelNativeBooking } from "@/lib/native-booking/mutations";

async function main() {
  const sourceBookingId = process.argv[2]?.trim();
  if (!sourceBookingId) throw new Error("A source booking ID is required");

  const [source] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(eq(nativeBookings.id, sourceBookingId))
    .limit(1);
  if (!source || !source.booking.closerUserId || !source.booking.email) throw new Error("Source booking is incomplete");

  const handle = await ensureAccountBookingHandle(source.event.userId);
  const available = await getPublicNativeBookingSlots(handle, source.event.slug, {
    days: 30,
    closerUserId: source.booking.closerUserId,
  });
  const requestedSlot = available?.slots.find((slot) => slot.startAt.getTime() > Date.now());
  if (!requestedSlot) throw new Error("No future booking slot found");

  const answers = Object.fromEntries(
    source.booking.answers.map((answer) => [answer.questionId, answer.answer])
  );
  const created = await createNativeBookingForCrm(source.event.userId, source.event.id, source.booking.closerUserId, {
    firstName: source.booking.firstName,
    lastName: source.booking.lastName,
    email: source.booking.email,
    phone: source.booking.phone,
    guestTimeZone: source.booking.guestTimeZone,
    answers,
    startAt: requestedSlot.startAt.toISOString(),
    idempotencyKey: randomUUID(),
    leadId: null,
    leadSessionKey: null,
    landingPage: source.booking.landingPage,
    referrer: source.booking.referrer,
    linkId: source.booking.linkId,
    metaTouchpointToken: null,
    metaCampaignExternalId: null,
    metaAdSetExternalId: null,
    metaAdExternalId: null,
    utm: source.booking.utmMetadata,
  });
  if ("error" in created) throw new Error(`Booking creation failed: ${created.error}`);

  const sideEffects = await scheduleNativeBookingSideEffects(created.bookingId);
  if (sideEffects.calendar !== "synced" || sideEffects.notification !== "sent") {
    throw new Error(`Confirmation side effects incomplete: ${JSON.stringify(sideEffects)}`);
  }

  const cancelled = await cancelNativeBooking(created.bookingId);
  if ("error" in cancelled || cancelled.calendarSyncWarning) throw new Error(`Cancellation failed: ${JSON.stringify(cancelled)}`);

  const [booking] = await db
    .select({ status: nativeBookings.status, syncStatus: nativeBookings.syncStatus, meetingUrl: nativeBookings.meetingUrl })
    .from(nativeBookings)
    .where(eq(nativeBookings.id, created.bookingId))
    .limit(1);
  const [notification] = await db
    .select({ status: nativeBookingNotifications.status, sentAt: nativeBookingNotifications.sentAt })
    .from(nativeBookingNotifications)
    .where(and(eq(nativeBookingNotifications.bookingId, created.bookingId), eq(nativeBookingNotifications.kind, "cancellation")))
    .limit(1);
  if (booking?.status !== "cancelled" || booking.syncStatus !== "synced" || !booking.meetingUrl || notification?.status !== "sent" || !notification.sentAt) {
    throw new Error(`Cancellation state incomplete: ${JSON.stringify({ booking, notification })}`);
  }

  const bookingUrl = `${getAppUrl()}/book/${handle}/${source.event.slug}`;
  const listed = await getResendClient().emails.list({ limit: 100 });
  if (listed.error || !listed.data) throw new Error("Resend email list failed");
  const sentAfter = new Date(notification.sentAt.getTime() - 120_000);
  const candidates = listed.data.data.filter((email) => email.subject.startsWith("Rendez-vous annulé") && new Date(email.created_at) >= sentAfter);
  const emails = await Promise.all(
    candidates.map(async (email) => {
      const details = await getResendClient().emails.get(email.id);
      const text = details.data?.text ?? "";
      return {
        lastEvent: details.data?.last_event,
        createdAt: details.data?.created_at,
        hasBookingUrl: text.includes(bookingUrl),
        hasJoinLine: text.includes("Lien pour rejoindre l'appel"),
        hasMeetingUrl: booking.meetingUrl ? text.includes(booking.meetingUrl) : false,
      };
    })
  );
  const prospectEmail = emails.find((email) => email.hasBookingUrl);
  if (!prospectEmail || prospectEmail.hasJoinLine || prospectEmail.hasMeetingUrl || prospectEmail.lastEvent !== "delivered") {
    throw new Error(`Cancellation email content is incorrect: ${JSON.stringify({ bookingUrl, emails })}`);
  }

  console.log(JSON.stringify({
    bookingId: created.bookingId,
    status: booking.status,
    syncStatus: booking.syncStatus,
    cancellationEmail: prospectEmail,
  }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});