import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { nativeBookingEvents, nativeBookingReminderDeliveries, nativeBookingReminderRules, nativeBookings, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { ensureAccountBookingHandle } from "@/lib/native-booking/handle";
import { inngest, nativeBookingReminderRequested } from "@/lib/inngest/client";
import { getAppUrl } from "@/lib/utils";
import { getResendClient, isResendConfigured } from "@/lib/resend-client";

type ReminderContext = {
  firstName: string;
  eventName: string;
  date: string;
  time: string;
  timeZone: string;
  meetingUrl: string;
  managementUrl: string;
};

function formatReminderContext(startAt: Date, endAt: Date, timeZone: string): Pick<ReminderContext, "date" | "time"> {
  return {
    date: new Intl.DateTimeFormat("fr-FR", { timeZone, dateStyle: "full" }).format(startAt),
    time: `${new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(startAt)} – ${new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(endAt)}`,
  };
}

function managementUrl(handle: string, eventSlug: string, rescheduleTokenEncrypted: string | null, cancellationTokenEncrypted: string | null): string {
  const params = new URLSearchParams();
  if (rescheduleTokenEncrypted) params.set("manage", decrypt(rescheduleTokenEncrypted));
  if (cancellationTokenEncrypted) params.set("cancel", decrypt(cancellationTokenEncrypted));
  return params.size > 0 ? `${getAppUrl()}/book/${handle}/${eventSlug}?${params.toString()}` : "";
}

function renderReminderMessage(template: string, context: ReminderContext): string {
  return template.replace(/{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g, (_match, name: string) => context[name as keyof ReminderContext] ?? "");
}

async function scheduleReminderDelivery(deliveryId: string) {
  try {
    await inngest.send(nativeBookingReminderRequested.create({ deliveryId }));
  } catch (error) {
    console.error("[native-booking] reminder scheduling failed", { deliveryId, error });
  }
}

async function getActiveRules(eventId: string) {
  return db
    .select()
    .from(nativeBookingReminderRules)
    .where(and(eq(nativeBookingReminderRules.eventId, eventId), eq(nativeBookingReminderRules.isActive, true)))
    .orderBy(asc(nativeBookingReminderRules.delayMinutes));
}

export async function scheduleNativeBookingReminders(bookingId: string) {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row) return;

  const rules = await getActiveRules(row.event.id);
  const now = new Date();
  for (const rule of rules) {
    const scheduledFor = new Date(row.booking.startAt.getTime() - rule.delayMinutes * 60_000);
    const [existing] = await db
      .select()
      .from(nativeBookingReminderDeliveries)
      .where(and(eq(nativeBookingReminderDeliveries.bookingId, bookingId), eq(nativeBookingReminderDeliveries.ruleId, rule.id)))
      .limit(1);
    if (existing?.status === "sent") continue;

    const delivery = existing
      ? (await db
          .update(nativeBookingReminderDeliveries)
          .set({ scheduledFor, status: "pending", lastError: null, updatedAt: now })
          .where(eq(nativeBookingReminderDeliveries.id, existing.id))
          .returning({ id: nativeBookingReminderDeliveries.id }))[0]
      : (await db
          .insert(nativeBookingReminderDeliveries)
          .values({ bookingId, ruleId: rule.id, scheduledFor, status: "pending", updatedAt: now })
          .returning({ id: nativeBookingReminderDeliveries.id }))[0];
    if (delivery) await scheduleReminderDelivery(delivery.id);
  }
}

export async function cancelNativeBookingReminders(bookingId: string) {
  await db
    .update(nativeBookingReminderDeliveries)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(nativeBookingReminderDeliveries.bookingId, bookingId), inArray(nativeBookingReminderDeliveries.status, ["pending", "failed"])));
}

export async function rebuildNativeBookingReminders(bookingId: string) {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(eq(nativeBookings.id, bookingId))
    .limit(1);
  if (!row) return;
  const rules = await getActiveRules(row.event.id);
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const deliveries = await db.select().from(nativeBookingReminderDeliveries).where(eq(nativeBookingReminderDeliveries.bookingId, bookingId));
  const now = new Date();
  for (const delivery of deliveries) {
    if (delivery.status === "sent" || delivery.status === "processing") continue;
    const rule = rulesById.get(delivery.ruleId);
    if (!rule) {
      await db.update(nativeBookingReminderDeliveries).set({ status: "cancelled", updatedAt: now }).where(eq(nativeBookingReminderDeliveries.id, delivery.id));
      continue;
    }
    const scheduledFor = new Date(row.booking.startAt.getTime() - rule.delayMinutes * 60_000);
    await db.update(nativeBookingReminderDeliveries).set({ scheduledFor, status: "pending", lastError: null, updatedAt: now }).where(eq(nativeBookingReminderDeliveries.id, delivery.id));
    await scheduleReminderDelivery(delivery.id);
  }
  const existingRuleIds = new Set(deliveries.map((delivery) => delivery.ruleId));
  for (const rule of rules) {
    if (existingRuleIds.has(rule.id)) continue;
    const scheduledFor = new Date(row.booking.startAt.getTime() - rule.delayMinutes * 60_000);
    const [created] = await db.insert(nativeBookingReminderDeliveries).values({ bookingId, ruleId: rule.id, scheduledFor, status: "pending", updatedAt: now }).returning({ id: nativeBookingReminderDeliveries.id });
    if (created) await scheduleReminderDelivery(created.id);
  }
}

export async function syncNativeBookingReminderConfiguration(eventId: string) {
  const bookings = await db
    .select({ id: nativeBookings.id })
    .from(nativeBookings)
    .where(and(eq(nativeBookings.eventId, eventId), gte(nativeBookings.startAt, new Date()), inArray(nativeBookings.status, ["confirmed", "sync_failed"])));
  for (const booking of bookings) await rebuildNativeBookingReminders(booking.id);
}

export async function getNativeBookingReminderSchedule(deliveryId: string): Promise<string | null> {
  const [delivery] = await db
    .select({ scheduledFor: nativeBookingReminderDeliveries.scheduledFor, status: nativeBookingReminderDeliveries.status })
    .from(nativeBookingReminderDeliveries)
    .where(eq(nativeBookingReminderDeliveries.id, deliveryId))
    .limit(1);
  if (!delivery || delivery.status === "cancelled" || delivery.status === "sent") return null;
  return delivery.scheduledFor.toISOString();
}

async function claimReminder(deliveryId: string) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ delivery: nativeBookingReminderDeliveries, booking: nativeBookings, event: nativeBookingEvents, rule: nativeBookingReminderRules, closer: users })
      .from(nativeBookingReminderDeliveries)
      .innerJoin(nativeBookings, eq(nativeBookingReminderDeliveries.bookingId, nativeBookings.id))
      .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
      .innerJoin(nativeBookingReminderRules, eq(nativeBookingReminderDeliveries.ruleId, nativeBookingReminderRules.id))
      .leftJoin(users, eq(nativeBookings.closerUserId, users.id))
      .where(eq(nativeBookingReminderDeliveries.id, deliveryId))
      .for("update")
      .limit(1);
    if (!row || (row.delivery.status !== "pending" && row.delivery.status !== "failed")) return null;
    if (row.delivery.scheduledFor > new Date() || !row.rule.isActive) return null;
    if (row.booking.status !== "confirmed" && row.booking.status !== "sync_failed") return null;
    const [claimed] = await tx
      .update(nativeBookingReminderDeliveries)
      .set({ status: "processing", attempts: sql`${nativeBookingReminderDeliveries.attempts} + 1`, updatedAt: new Date() })
      .where(eq(nativeBookingReminderDeliveries.id, deliveryId))
      .returning({ id: nativeBookingReminderDeliveries.id });
    return claimed ? row : null;
  });
}

export async function deliverNativeBookingReminder(deliveryId: string) {
  const row = await claimReminder(deliveryId);
  if (!row) return "skipped" as const;
  const ownerHandle = await ensureAccountBookingHandle(row.event.userId);
  const contextDate = formatReminderContext(row.booking.startAt, row.booking.endAt, row.booking.eventTimeZone);
  const context: ReminderContext = {
    firstName: row.booking.firstName,
    eventName: row.event.name,
    date: contextDate.date,
    time: contextDate.time,
    timeZone: row.booking.eventTimeZone,
    meetingUrl: row.event.meetingUrl ?? "",
    managementUrl: managementUrl(ownerHandle, row.event.slug, row.booking.rescheduleTokenEncrypted, row.booking.cancellationTokenEncrypted),
  };

  try {
    if (isResendConfigured() && row.booking.email) {
      const renderedSubject = renderReminderMessage(row.rule.subject, context);
      const renderedMessage = renderReminderMessage(row.rule.message, context);
      const management = context.managementUrl ? `Gérer mon rendez-vous : ${context.managementUrl}` : "";
      await getResendClient().emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Scale X <hello@scalex.app>",
        to: row.booking.email,
        subject: renderedSubject,
        text: [`Bonjour ${row.booking.firstName},`, "", renderedMessage, context.meetingUrl ? `Lien de réunion : ${context.meetingUrl}` : "", management, "", "Scale X"].filter(Boolean).join("\n"),
      });
    }
    await db.update(nativeBookingReminderDeliveries).set({ status: "sent", sentAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(nativeBookingReminderDeliveries.id, deliveryId));
    return "sent" as const;
  } catch (error) {
    await db.update(nativeBookingReminderDeliveries).set({ status: "failed", lastError: "L’envoi du rappel a échoué.", updatedAt: new Date() }).where(eq(nativeBookingReminderDeliveries.id, deliveryId));
    throw error;
  }
}
