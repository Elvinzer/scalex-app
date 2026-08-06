"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { nativeBookingAvailability, nativeBookingEventClosers, nativeBookingEvents, nativeBookingExceptions, nativeBookingLeads, nativeBookingLinks, nativeBookingQuestions, nativeBookingReminderRules, nativeBookings, nativeCalendarConnections, teamMembers, users } from "@/db/schema";
import { canCreateNativeBookingEvent, getNativeBookingEntitlements } from "@/lib/billing/plan-gate";
import { requireUserId } from "@/lib/current-user";
import { getNativeBookingEvent, getNativeBookingEventDetail } from "@/lib/native-booking/queries";
import { retryNativeBookingCalendarSync } from "@/lib/native-booking/booking";
import { cancelNativeBooking, rescheduleNativeBooking } from "@/lib/native-booking/mutations";
import { availabilitySchema, exceptionSchema, nativeBookingEventInputSchema } from "@/lib/native-booking/validation";
import { requirePermission } from "@/lib/team/context";
import { syncNativeBookingReminderConfiguration } from "@/lib/native-booking/reminders";
import { getNativeBookingRescheduleSlotsForAccount } from "@/lib/native-booking/agenda";

const eventActionSchema = z.object({ eventId: z.string().uuid() });
const closerActionSchema = eventActionSchema.extend({ closerUserId: z.string().uuid() });
const toggleEventSchema = eventActionSchema.extend({ status: z.enum(["draft", "active", "paused", "archived"]) });
const availabilityActionSchema = eventActionSchema.extend({ availability: z.array(availabilitySchema).max(7) });
const exceptionActionSchema = eventActionSchema.extend({ exception: exceptionSchema });
const exceptionDeleteActionSchema = eventActionSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide") });
const bookingLinkActionSchema = eventActionSchema.extend({
  label: z.string().trim().min(2, "Le nom du lien est requis").max(120),
  platform: z.string().trim().min(2).max(40),
  contentLabel: z.string().trim().max(160).optional().default(""),
  utmSource: z.string().trim().max(160).optional().default(""),
  utmMedium: z.string().trim().max(160).optional().default(""),
  utmCampaign: z.string().trim().max(160).optional().default(""),
  utmContent: z.string().trim().max(160).optional().default(""),
  utmTerm: z.string().trim().max(160).optional().default(""),
});
const bookingLinkStatusActionSchema = eventActionSchema.extend({ linkId: z.string().uuid(), isActive: z.boolean() });
const calendarDisconnectActionSchema = eventActionSchema.extend({ provider: z.enum(["google", "outlook"]) });
const calendarSelectionActionSchema = eventActionSchema.extend({
  connectionId: z.string().uuid(),
  selectedCalendarIds: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
});
const leadStatusActionSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(["open", "contacted", "dismissed"]),
});
const bookingMutationSchema = z.object({ bookingId: z.string().uuid() });
const rescheduleActionSchema = bookingMutationSchema.extend({ startAt: z.string().datetime({ offset: true }) });

type ActionResult = { error: string | null };

async function getBookingAccess(): Promise<{ accountId: string } | ActionResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:rdv");
  return access ?? { error: "Tu n’as pas accès à la prise de rendez-vous." };
}

function isActionError(value: { accountId?: string; error?: string | null }): value is ActionResult {
  return !value.accountId;
}

export async function createNativeBookingEventAction(input: unknown): Promise<ActionResult & { eventId?: string }> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;

  const parsed = nativeBookingEventInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const entitlement = await canCreateNativeBookingEvent(access.accountId);
  if (!entitlement.allowed) {
    return {
      error:
        entitlement.reason === "limit"
          ? "Ton abonnement atteint sa limite d’événements. Passe au niveau supérieur pour en créer davantage."
          : "La prise de rendez-vous native n’est pas incluse dans ton abonnement.",
    };
  }

  const [existingSlug] = await db
    .select({ id: nativeBookingEvents.id })
    .from(nativeBookingEvents)
    .where(and(eq(nativeBookingEvents.userId, access.accountId), eq(nativeBookingEvents.slug, parsed.data.slug)))
    .limit(1);
  if (existingSlug) return { error: "Ce lien public existe déjà. Choisis un autre slug." };

  try {
    const created = await db.transaction(async (tx) => {
      const { questions, reminders, ...eventValues } = parsed.data;
      const [event] = await tx
        .insert(nativeBookingEvents)
        .values({ userId: access.accountId, ...eventValues })
        .returning({ id: nativeBookingEvents.id });
      if (!event) throw new Error("Création impossible");

      await tx.insert(nativeBookingAvailability).values(
        [1, 2, 3, 4, 5].map((weekday) => ({ eventId: event.id, weekday, startTime: "09:00", endTime: "17:00" }))
      );
      await tx.insert(nativeBookingEventClosers).values({
        eventId: event.id,
        closerUserId: access.accountId,
        position: 0,
      });
      if (questions.length > 0) {
        await tx.insert(nativeBookingQuestions).values(
          questions.map((question, position) => ({
            eventId: event.id,
            position,
            type: question.type,
            label: question.label,
            helpText: question.helpText,
            isRequired: question.isRequired,
            options: question.options,
          }))
        );
      }
      if (reminders.length > 0) {
        await tx.insert(nativeBookingReminderRules).values(
          reminders.map((rule, position) => ({
            eventId: event.id,
            position,
            delayMinutes: rule.delayMinutes,
            subject: rule.subject,
            message: rule.message,
            isActive: rule.isActive,
          }))
        );
      }
      return event;
    });

    revalidatePath("/ventes/rdv");
    return { error: null, eventId: created.id };
  } catch (error) {
    console.error("[native-booking] create event", error);
    return { error: "Impossible de créer l’événement pour le moment." };
  }
}

export async function updateNativeBookingEventAction(eventId: string, input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsedId = eventActionSchema.safeParse({ eventId });
  const parsed = nativeBookingEventInputSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) return { error: "Données invalides" };

  const event = await getNativeBookingEventDetail(access.accountId, eventId);
  if (!event) return { error: "Événement introuvable." };

  const { questions, reminders, ...eventValues } = parsed.data;
  await db.transaction(async (tx) => {
    await tx
      .update(nativeBookingEvents)
      .set({ ...eventValues, updatedAt: new Date() })
      .where(and(eq(nativeBookingEvents.id, eventId), eq(nativeBookingEvents.userId, access.accountId)));
    await tx.delete(nativeBookingQuestions).where(eq(nativeBookingQuestions.eventId, eventId));
    if (questions.length > 0) {
      await tx.insert(nativeBookingQuestions).values(
        questions.map((question, position) => ({
          eventId,
          position,
          type: question.type,
          label: question.label,
          helpText: question.helpText,
          isRequired: question.isRequired,
          options: question.options,
        }))
      );
    }
    await tx.delete(nativeBookingReminderRules).where(eq(nativeBookingReminderRules.eventId, eventId));
    if (reminders.length > 0) {
      await tx.insert(nativeBookingReminderRules).values(
        reminders.map((rule, position) => ({
          eventId,
          position,
          delayMinutes: rule.delayMinutes,
          subject: rule.subject,
          message: rule.message,
          isActive: rule.isActive,
        }))
      );
    }
  });
  await syncNativeBookingReminderConfiguration(eventId);
  revalidatePath("/ventes/rdv");
  revalidatePath(`/ventes/rdv/${eventId}`);
  return { error: null };
}

export async function saveNativeBookingAvailabilityAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = availabilityActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Disponibilités invalides" };

  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  const flattened = parsed.data.availability.flatMap((day) =>
    day.windows.map((window) => ({ eventId: event.id, weekday: day.weekday, ...window }))
  );
  await db.transaction(async (tx) => {
    await tx.delete(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, event.id));
    if (flattened.length > 0) await tx.insert(nativeBookingAvailability).values(flattened);
    await tx.update(nativeBookingEvents).set({ updatedAt: new Date() }).where(eq(nativeBookingEvents.id, event.id));
  });

  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function saveNativeBookingExceptionAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = exceptionActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Exception invalide" };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  await db
    .insert(nativeBookingExceptions)
    .values({ eventId: event.id, ...parsed.data.exception })
    .onConflictDoUpdate({
      target: [nativeBookingExceptions.eventId, nativeBookingExceptions.date],
      set: {
        type: parsed.data.exception.type,
        windows: parsed.data.exception.windows,
        reason: parsed.data.exception.reason,
        updatedAt: new Date(),
      },
    });
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function deleteNativeBookingExceptionAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = exceptionDeleteActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Exception invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  await db
    .delete(nativeBookingExceptions)
    .where(and(eq(nativeBookingExceptions.eventId, event.id), eq(nativeBookingExceptions.date, parsed.data.date)));
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function toggleNativeBookingEventAction(eventId: string, status: string): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = toggleEventSchema.safeParse({ eventId, status });
  if (!parsed.success) return { error: "État d’événement invalide." };
  const detail = await getNativeBookingEventDetail(access.accountId, eventId);
  if (!detail) return { error: "Événement introuvable." };

  if (parsed.data.status === "active") {
    const entitlements = await getNativeBookingEntitlements(access.accountId);
    if (!entitlements.enabled) return { error: "La prise de rendez-vous native n’est plus incluse dans ton abonnement." };
    if (detail.availability.length === 0) return { error: "Ajoute au moins une disponibilité avant d’activer l’événement." };
    if (detail.closers.filter(({ assignment }) => assignment.isActive && !assignment.isOff).length === 0) {
      return { error: "Ajoute au moins un closer disponible avant d’activer l’événement." };
    }
  }

  await db
    .update(nativeBookingEvents)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(and(eq(nativeBookingEvents.id, eventId), eq(nativeBookingEvents.userId, access.accountId)));
  revalidatePath("/ventes/rdv");
  revalidatePath(`/ventes/rdv/${eventId}`);
  return { error: null };
}

export async function addNativeBookingCloserAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = closerActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Closer invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  const [candidate] = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(teamMembers, and(eq(teamMembers.memberUserId, users.id), eq(teamMembers.accountId, access.accountId), eq(teamMembers.status, "active")))
    .where(
      and(
        eq(users.id, parsed.data.closerUserId),
        or(eq(users.id, access.accountId), eq(teamMembers.accountId, access.accountId))
      )
    )
    .limit(1);
  if (!candidate) return { error: "Closer introuvable dans ton équipe." };

  const [existing] = await db
    .select({ id: nativeBookingEventClosers.id })
    .from(nativeBookingEventClosers)
    .where(and(eq(nativeBookingEventClosers.eventId, event.id), eq(nativeBookingEventClosers.closerUserId, candidate.id)))
    .limit(1);
  if (!existing) {
    const current = await db.select({ id: nativeBookingEventClosers.id }).from(nativeBookingEventClosers).where(eq(nativeBookingEventClosers.eventId, event.id));
    await db.insert(nativeBookingEventClosers).values({ eventId: event.id, closerUserId: candidate.id, position: current.length });
  }
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function toggleNativeBookingCloserOffAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = closerActionSchema.extend({ isOff: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Closer invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };
  await db
    .update(nativeBookingEventClosers)
    .set({ isOff: parsed.data.isOff, updatedAt: new Date() })
    .where(and(eq(nativeBookingEventClosers.eventId, event.id), eq(nativeBookingEventClosers.closerUserId, parsed.data.closerUserId)));
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function rebalanceNativeBookingAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = eventActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Événement invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  await db
    .update(nativeBookingEvents)
    .set({ roundRobinCursor: 0, updatedAt: new Date() })
    .where(and(eq(nativeBookingEvents.id, event.id), eq(nativeBookingEvents.userId, access.accountId)));
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function disconnectNativeBookingCalendarAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access) return { error: "Tu n’as pas accès à la prise de rendez-vous." };
  const parsed = calendarDisconnectActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Calendrier invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  await db
    .delete(nativeCalendarConnections)
    .where(
      and(
        eq(nativeCalendarConnections.userId, access.accountId),
        eq(nativeCalendarConnections.closerUserId, userId),
        eq(nativeCalendarConnections.provider, parsed.data.provider)
      )
    );
  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function saveNativeCalendarSelectionAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const access = await requirePermission(userId, "ventes:rdv");
  if (!access) return { error: "Tu n’as pas accès à la prise de rendez-vous." };
  const parsed = calendarSelectionActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Sélection de calendriers invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  const [connection] = await db
    .update(nativeCalendarConnections)
    .set({ selectedCalendarIds: Array.from(new Set(parsed.data.selectedCalendarIds)), updatedAt: new Date() })
    .where(
      and(
        eq(nativeCalendarConnections.id, parsed.data.connectionId),
        eq(nativeCalendarConnections.userId, access.accountId),
        eq(nativeCalendarConnections.closerUserId, userId)
      )
    )
    .returning({ id: nativeCalendarConnections.id });
  if (!connection) return { error: "Connexion calendrier introuvable." };

  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function createNativeBookingLinkAction(input: unknown): Promise<ActionResult & { linkId?: string }> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = bookingLinkActionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Lien invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  const [link] = await db
    .insert(nativeBookingLinks)
    .values({
      userId: access.accountId,
      eventId: event.id,
      label: parsed.data.label,
      platform: parsed.data.platform,
      contentLabel: parsed.data.contentLabel || null,
      utmSource: parsed.data.utmSource || null,
      utmMedium: parsed.data.utmMedium || null,
      utmCampaign: parsed.data.utmCampaign || null,
      utmContent: parsed.data.utmContent || null,
      utmTerm: parsed.data.utmTerm || null,
    })
    .returning({ id: nativeBookingLinks.id });
  if (!link) return { error: "Impossible de créer ce lien." };

  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null, linkId: link.id };
}

export async function toggleNativeBookingLinkAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = bookingLinkStatusActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Lien invalide." };
  const event = await getNativeBookingEvent(access.accountId, parsed.data.eventId);
  if (!event) return { error: "Événement introuvable." };

  const [link] = await db
    .update(nativeBookingLinks)
    .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
    .where(
      and(
        eq(nativeBookingLinks.id, parsed.data.linkId),
        eq(nativeBookingLinks.eventId, event.id),
        eq(nativeBookingLinks.userId, access.accountId)
      )
    )
    .returning({ id: nativeBookingLinks.id });
  if (!link) return { error: "Lien introuvable." };

  revalidatePath(`/ventes/rdv/${event.id}`);
  return { error: null };
}

export async function updateNativeBookingLeadStatusAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = leadStatusActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Statut de relance invalide." };

  const [lead] = await db
    .select({ id: nativeBookingLeads.id })
    .from(nativeBookingLeads)
    .where(and(eq(nativeBookingLeads.id, parsed.data.leadId), eq(nativeBookingLeads.userId, access.accountId)))
    .limit(1);
  if (!lead) return { error: "Prospect introuvable." };

  const now = new Date();
  await db
    .update(nativeBookingLeads)
    .set({
      status: parsed.data.status,
      contactedAt: parsed.data.status === "contacted" ? now : null,
      dismissedAt: parsed.data.status === "dismissed" ? now : null,
      updatedAt: now,
    })
    .where(and(eq(nativeBookingLeads.id, lead.id), eq(nativeBookingLeads.userId, access.accountId)));

  revalidatePath("/ventes/rdv");
  return { error: null };
}

async function getAccountBooking(accountId: string, bookingId: string) {
  const [row] = await db
    .select({ booking: nativeBookings, event: nativeBookingEvents })
    .from(nativeBookings)
    .innerJoin(nativeBookingEvents, eq(nativeBookings.eventId, nativeBookingEvents.id))
    .where(and(eq(nativeBookings.id, bookingId), eq(nativeBookingEvents.userId, accountId)))
    .limit(1);
  return row ?? null;
}

export async function cancelNativeBookingAction(input: unknown): Promise<ActionResult & { warning?: boolean }> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = bookingMutationSchema.safeParse(input);
  if (!parsed.success) return { error: "Réservation invalide." };
  const booking = await getAccountBooking(access.accountId, parsed.data.bookingId);
  if (!booking) return { error: "Réservation introuvable." };

  const result = await cancelNativeBooking(booking.booking.id);
  if ("error" in result) return { error: "La réservation n’a pas pu être annulée." };
  revalidatePath("/ventes/rdv");
  revalidatePath(`/ventes/rdv/${booking.event.id}`);
  return { error: null, ...(result.calendarSyncWarning ? { warning: true } : {}) };
}

export async function rescheduleNativeBookingAction(input: unknown): Promise<ActionResult & { warning?: boolean; startAt?: string; endAt?: string; closerName?: string }> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = rescheduleActionSchema.safeParse(input);
  if (!parsed.success) return { error: "Nouvel horaire invalide." };
  const booking = await getAccountBooking(access.accountId, parsed.data.bookingId);
  if (!booking) return { error: "Réservation introuvable." };

  const result = await rescheduleNativeBooking(booking.booking.id, new Date(parsed.data.startAt));
  if ("error" in result) {
    return { error: result.error === "slot_unavailable" ? "Ce créneau n’est plus disponible pour le closer actuellement attribué. Choisis une autre date." : "La réservation n’a pas pu être déplacée." };
  }
  revalidatePath("/ventes/rdv");
  revalidatePath(`/ventes/rdv/${booking.event.id}`);
  return {
    error: null,
    startAt: result.startAt.toISOString(),
    endAt: result.endAt.toISOString(),
    closerName: result.closerName,
    ...(result.calendarSyncWarning ? { warning: true } : {}),
  };
}

export async function getNativeBookingRescheduleSlotsAction(input: unknown): Promise<{ error: string | null; slots: Array<{ startAt: string; endAt: string }> }> {
  const access = await getBookingAccess();
  if (isActionError(access)) return { error: access.error ?? "Accès refusé.", slots: [] };
  const parsed = bookingMutationSchema.safeParse(input);
  if (!parsed.success) return { error: "Réservation invalide.", slots: [] };
  const slots = await getNativeBookingRescheduleSlotsForAccount(access.accountId, parsed.data.bookingId);
  if (!slots) return { error: "Réservation introuvable.", slots: [] };
  return { error: null, slots: slots.map((slot) => ({ startAt: slot.startAt.toISOString(), endAt: slot.endAt.toISOString() })) };
}

export async function retryNativeBookingCalendarSyncAction(input: unknown): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = bookingMutationSchema.safeParse(input);
  if (!parsed.success) return { error: "Réservation invalide." };
  const booking = await getAccountBooking(access.accountId, parsed.data.bookingId);
  if (!booking) return { error: "Réservation introuvable." };
  try {
    await retryNativeBookingCalendarSync(booking.booking.id);
  } catch {
    return { error: "La reprise de synchronisation a encore échoué. Reconnecte le calendrier puis réessaie." };
  }
  revalidatePath("/ventes/rdv");
  return { error: null };
}
