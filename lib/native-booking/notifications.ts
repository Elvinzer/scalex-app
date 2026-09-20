import { and, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookingNotifications, nativeBookings, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";
import { getResendClient, isResendConfigured } from "@/lib/resend-client";
import { getAppUrl } from "@/lib/utils";

export type NativeBookingNotificationKind = "confirmation" | "cancellation" | "reschedule";
export type NativeBookingNotificationScheduleResult = "queued" | "sent" | "failed";

type NotificationBooking = {
  booking: typeof nativeBookings.$inferSelect;
  event: typeof nativeBookingEvents.$inferSelect;
  ownerHandle: string;
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
  return { subject: "Nouveau rendez-vous confirmé", intro: "Ce rendez-vous vient d'être confirmé.", closerAction: "Pense à préparer ton appel de closing." };
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
    ownerHandle: await ensureAccountBookingHandle(row.event.userId),
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
  return `${getAppUrl()}/book/${details.ownerHandle}/${details.event.slug}?${params.toString()}`;
}

async function sendNotificationEmail(to: string, details: NotificationBooking, kind: NativeBookingNotificationKind, audience: NotificationAudience) {
  if (!isResendConfigured()) return;
  const copy = notificationCopy(kind);
  const { booking, event, closerName } = details;
  const dateLine = formatDateTime(booking.startAt, booking.endAt, booking.eventTimeZone);
  const joinUrl = booking.meetingUrl ?? event.meetingUrl;
  const joinLine = joinUrl ? `Lien pour rejoindre l'appel : ${joinUrl}` : "";
  const management = getManagementUrl(details);
  const icsToken = booking.rescheduleTokenEncrypted ? decrypt(booking.rescheduleTokenEncrypted) : booking.cancellationTokenEncrypted ? decrypt(booking.cancellationTokenEncrypted) : "";
  const ics = icsToken ? `${getAppUrl()}/api/public/booking/${details.ownerHandle}/${event.slug}/ics?token=${encodeURIComponent(icsToken)}` : "";
  const greeting = audience === "prospect" ? `Bonjour ${booking.firstName},` : `Bonjour ${closerName},`;
  const audienceAction = audience === "prospect"
    ? [management ? `Gérer mon rendez-vous : ${management}` : "", ics ? `Ajouter à mon agenda : ${ics}` : ""]
    : [copy.closerAction];
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getResendClient().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Minaly <hello@minaly.io>",
        to,
        subject: `${copy.subject} — ${event.meetingLabel}`,
        text: [
          greeting,
          "",
          copy.intro,
          `Événement : ${event.name}`,
          dateLine,
          `Hôte : ${closerName}`,
          joinLine,
          event.bookingInstructions ? `Consignes : ${event.bookingInstructions}` : "",
          "",
          ...audienceAction,
          "",
          "Minaly",
        ].filter(Boolean).join("\n"),
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Notification delivery timed out")), 15_000);
      }),
    ]);
    if (result.error) {
      throw new Error("Resend rejected the notification email");
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function scheduleNativeBookingNotification(bookingId: string, kind: NativeBookingNotificationKind): Promise<NativeBookingNotificationScheduleResult> {
  const now = new Date();
  await db
    .insert(nativeBookingNotifications)
    .values({ bookingId, kind, status: "pending", attempts: 0, updatedAt: now })
    .onConflictDoNothing({ target: [nativeBookingNotifications.bookingId, nativeBookingNotifications.kind] });
  await db
    .update(nativeBookingNotifications)
    .set({ status: "pending", lastError: null, updatedAt: now })
    .where(
      and(
        eq(nativeBookingNotifications.bookingId, bookingId),
        eq(nativeBookingNotifications.kind, kind),
        ne(nativeBookingNotifications.status, "sent")
      )
  );

  try {
    const deliveryResult = await deliverNativeBookingNotification(bookingId, kind);
    return deliveryResult === "sent" ? "sent" : "failed";
  } catch (error) {
    await db
      .update(nativeBookingNotifications)
      .set({ status: "failed", lastError: "La notification n'a pas pu être planifiée.", updatedAt: new Date() })
      .where(
        and(
          eq(nativeBookingNotifications.bookingId, bookingId),
          eq(nativeBookingNotifications.kind, kind),
          ne(nativeBookingNotifications.status, "sent")
        )
      );
    console.error("[native-booking] notification scheduling failed", {
      bookingId,
      kind,
      message: error instanceof Error ? error.message : "unknown error",
    });
    return "failed";
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

  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(nativeBookingNotifications)
        .where(and(eq(nativeBookingNotifications.bookingId, bookingId), eq(nativeBookingNotifications.kind, kind)))
        .for("update")
        .limit(1);
      if (existing?.status === "sent") return "sent" as const;

      const now = new Date();
      let notification = existing;
      if (notification) {
        [notification] = await tx
          .update(nativeBookingNotifications)
          .set({ status: "pending", attempts: sql`${nativeBookingNotifications.attempts} + 1`, lastError: null, updatedAt: now })
          .where(eq(nativeBookingNotifications.id, notification.id))
          .returning();
      } else {
        [notification] = await tx
          .insert(nativeBookingNotifications)
          .values({ bookingId, kind, status: "pending", attempts: 1, updatedAt: now })
          .onConflictDoNothing({ target: [nativeBookingNotifications.bookingId, nativeBookingNotifications.kind] })
          .returning();
        if (!notification) {
          [notification] = await tx
            .select()
            .from(nativeBookingNotifications)
            .where(and(eq(nativeBookingNotifications.bookingId, bookingId), eq(nativeBookingNotifications.kind, kind)))
            .for("update")
            .limit(1);
          if (notification?.status === "sent") return "sent" as const;
          if (!notification) return "skipped" as const;
          [notification] = await tx
            .update(nativeBookingNotifications)
            .set({ status: "pending", attempts: sql`${nativeBookingNotifications.attempts} + 1`, lastError: null, updatedAt: now })
            .where(eq(nativeBookingNotifications.id, notification.id))
            .returning();
        }
      }
      if (!notification) return "skipped" as const;

      const recipients = new Set<string>();
      if (details.booking.email) recipients.add(`prospect:${details.booking.email}`);
      if (shouldNotifyCloser && details.closerEmail) recipients.add(`closer:${details.closerEmail}`);
      for (const recipient of recipients) {
        const [audience, address] = recipient.split(":", 2) as [NotificationAudience, string];
        await sendNotificationEmail(address, details, kind, audience);
      }

      await tx
        .update(nativeBookingNotifications)
        .set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(nativeBookingNotifications.id, notification.id));
      return "sent" as const;
    });
  } catch (error) {
    await db
      .update(nativeBookingNotifications)
      .set({ status: "failed", lastError: "L'envoi de la notification a échoué.", updatedAt: new Date() })
      .where(and(eq(nativeBookingNotifications.bookingId, bookingId), eq(nativeBookingNotifications.kind, kind), ne(nativeBookingNotifications.status, "sent")));
    throw error;
  }
}
