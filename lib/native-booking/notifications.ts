import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookingNotifications, nativeBookings, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { inngest, nativeBookingNotificationRequested } from "@/lib/inngest/client";
import { getResendClient, isResendConfigured } from "@/lib/resend-client";
import { getAppUrl } from "@/lib/utils";

export type NativeBookingNotificationKind = "confirmation" | "cancellation" | "reschedule";

type NotificationBooking = {
  booking: typeof nativeBookings.$inferSelect;
  event: typeof nativeBookingEvents.$inferSelect;
  closerEmail: string | null;
  closerName: string;
};

type NotificationAudience = "prospect" | "closer";

function formatDateTime(startAt: Date, endAt: Date, timeZone: string) {
  const dateLabel = new Intl.DateTimeFormat("fr-FR", { timeZone, dateStyle: "full" }).format(startAt);
  const timeFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} · ${timeFormatter.format(startAt)} – ${timeFormatter.format(endAt)} (${timeZone})`;
}

function notificationCopy(kind: NativeBookingNotificationKind) {
  if (kind === "cancellation") {
    return { subject: "Rendez-vous annulé", intro: "Ce rendez-vous a été annulé.", closerAction: "Tu peux maintenant proposer un nouveau créneau à ce prospect si nécessaire." };
  }
  if (kind === "reschedule") {
    return { subject: "Rendez-vous déplacé", intro: "Ce rendez-vous a été déplacé.", closerAction: "Le nouvel horaire remplace l'ancien dans ton suivi." };
  }
  return { subject: "Nouveau rendez-vous confirmé", intro: "Un nouveau rendez-vous vient d'être confirmé.", closerAction: "Pense à préparer ton appel de closing." };
}

async function loadNotificationBooking(bookingId: string): Promise<NotificationBooking | null> {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents, closer: users })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    booking: row.booking,
    event: row.event,
    closerEmail: row.closer?.email ?? null,
    closerName: row.closer?.displayName || row.closer?.email || "ton closer",
  };
}

function getManagementUrl(details: NotificationBooking): string {
  const rescheduleToken = details.booking.rescheduleTokenEncrypted ? decrypt(details.booking.rescheduleTokenEncrypted) : "";
  const cancellationToken = details.booking.cancellationTokenEncrypted ? decrypt(details.booking.cancellationTokenEncrypted) : "";
  if (!rescheduleToken && !cancellationToken) return "";
  const params = new URLSearchParams();
  if (rescheduleToken) params.set("manage", rescheduleToken);
  if (cancellationToken) params.set("cancel", cancellationToken);
  return `${getAppUrl()}/book/${details.event.slug}?${params.toString()}`;
}

async function sendNotificationEmail(to: string, details: NotificationBooking, kind: NativeBookingNotificationKind, audience: NotificationAudience) {
  if (!isResendConfigured()) return;
  const copy = notificationCopy(kind);
  const { booking, event, closerName } = details;
  const dateLine = formatDateTime(booking.startAt, booking.endAt, booking.eventTimeZone);
  const joinLine = event.meetingUrl ? `Lien pour rejoindre l'appel : ${event.meetingUrl}` : "";
  const management = getManagementUrl(details);
  const icsToken = booking.rescheduleTokenEncrypted ? decrypt(booking.rescheduleTokenEncrypted) : booking.cancellationTokenEncrypted ? decrypt(booking.cancellationTokenEncrypted) : "";
  const ics = icsToken ? `${getAppUrl()}/api/public/booking/${event.slug}/ics?token=${encodeURIComponent(icsToken)}` : "";
  const greeting = audience === "prospect" ? `Bonjour ${booking.firstName},` : `Bonjour ${closerName},`;
  const audienceAction = audience === "prospect"
    ? [management ? `Gérer mon rendez-vous : ${management}` : "", ics ? `Ajouter à mon agenda : ${ics}` : ""]
    : [copy.closerAction];
  await getResendClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Scale X <hello@scalex.app>",
    to,
    subject: `${copy.subject} — ${event.meetingLabel}`,
    text: [
      greeting,
      "",
      copy.intro,
      `Événement : ${event.name}`,
      dateLine,
      `Closer : ${closerName}`,
      joinLine,
      event.bookingInstructions ? `Consignes : ${event.bookingInstructions}` : "",
      "",
      ...audienceAction,
      "",
      "Scale X",
    ].filter(Boolean).join("\n"),
  });
}

export async function scheduleNativeBookingNotification(bookingId: string, kind: NativeBookingNotificationKind) {
  try {
    await inngest.send(nativeBookingNotificationRequested.create({ bookingId, kind }));
  } catch (error) {
    console.error("[native-booking] notification scheduling failed", { bookingId, kind, error });
  }
}

export async function deliverNativeBookingNotification(bookingId: string, kind: NativeBookingNotificationKind) {
  const details = await loadNotificationBooking(bookingId);
  if (!details) return "skipped" as const;

  const shouldNotifyCloser = kind === "confirmation"
    ? details.event.notifyCloserOnBooking
    : kind === "cancellation"
      ? details.event.notifyCloserOnCancellation
      : details.event.notifyCloserOnReschedule;
  if (!shouldNotifyCloser && !details.booking.email) return "skipped" as const;

  const [existing] = await db
    .select()
    .from(nativeBookingNotifications)
    .where(and(eq(nativeBookingNotifications.bookingId, bookingId), eq(nativeBookingNotifications.kind, kind)))
    .limit(1);
  if (existing?.status === "sent") return "sent" as const;

  const now = new Date();
  const [notification] = existing
    ? await db
        .update(nativeBookingNotifications)
        .set({ status: "pending", attempts: sql`${nativeBookingNotifications.attempts} + 1`, lastError: null, updatedAt: now })
        .where(eq(nativeBookingNotifications.id, existing.id))
        .returning()
    : await db
        .insert(nativeBookingNotifications)
        .values({ bookingId, kind, status: "pending", attempts: 1, updatedAt: now })
        .onConflictDoNothing({ target: [nativeBookingNotifications.bookingId, nativeBookingNotifications.kind] })
        .returning();

  if (!notification) {
    const [concurrent] = await db
      .select()
      .from(nativeBookingNotifications)
      .where(and(eq(nativeBookingNotifications.bookingId, bookingId), eq(nativeBookingNotifications.kind, kind)))
      .limit(1);
    return concurrent?.status === "sent" ? ("sent" as const) : ("skipped" as const);
  }

  try {
    const recipients = new Set<string>();
    if (details.booking.email) recipients.add(`prospect:${details.booking.email}`);
    if (shouldNotifyCloser && details.closerEmail) recipients.add(`closer:${details.closerEmail}`);
    for (const recipient of recipients) {
      const [audience, address] = recipient.split(":", 2) as [NotificationAudience, string];
      await sendNotificationEmail(address, details, kind, audience);
    }

    await db
      .update(nativeBookingNotifications)
      .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(nativeBookingNotifications.id, notification.id));
    return "sent" as const;
  } catch (error) {
    await db
      .update(nativeBookingNotifications)
      .set({ status: "failed", lastError: "L'envoi de la notification a échoué.", updatedAt: new Date() })
      .where(eq(nativeBookingNotifications.id, notification.id));
    throw error;
  }
}
