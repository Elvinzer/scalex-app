"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { nativeBookingAvailability, nativeBookingEventClosers, nativeBookingEvents, nativeBookingExceptions, teamMembers, users } from "@/db/schema";
import { canCreateNativeBookingEvent } from "@/lib/billing/plan-gate";
import { requireUserId } from "@/lib/current-user";
import { getNativeBookingEvent, getNativeBookingEventDetail } from "@/lib/native-booking/queries";
import { availabilitySchema, exceptionSchema, nativeBookingEventInputSchema } from "@/lib/native-booking/validation";
import { requirePermission } from "@/lib/team/context";

const eventActionSchema = z.object({ eventId: z.string().uuid() });
const closerActionSchema = eventActionSchema.extend({ closerUserId: z.string().uuid() });
const toggleEventSchema = eventActionSchema.extend({ status: z.enum(["draft", "active", "paused", "archived"]) });
const availabilityActionSchema = eventActionSchema.extend({ availability: z.array(availabilitySchema).max(7) });
const exceptionActionSchema = eventActionSchema.extend({ exception: exceptionSchema });

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
      const [event] = await tx
        .insert(nativeBookingEvents)
        .values({ userId: access.accountId, ...parsed.data })
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

  await db
    .update(nativeBookingEvents)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(nativeBookingEvents.id, eventId), eq(nativeBookingEvents.userId, access.accountId)));
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

export async function toggleNativeBookingEventAction(eventId: string, status: string): Promise<ActionResult> {
  const access = await getBookingAccess();
  if (isActionError(access)) return access;
  const parsed = toggleEventSchema.safeParse({ eventId, status });
  if (!parsed.success) return { error: "État d’événement invalide." };
  const detail = await getNativeBookingEventDetail(access.accountId, eventId);
  if (!detail) return { error: "Événement introuvable." };

  if (parsed.data.status === "active") {
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
