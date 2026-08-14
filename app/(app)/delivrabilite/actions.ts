"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import {
  clientJourneyStageHistory,
  clientJourneys,
  clientMilestones,
  clientNotes,
  clientReminders,
  journeyColumns,
  sales,
  testimonials,
} from "@/db/schema";
import { track } from "@/lib/analytics";
import { deleteBookingAsset, isOwnedBookingAssetPath } from "@/lib/booking-page/storage";
import { getCurrentUser } from "@/lib/current-user";
import { getJourneyDetails, syncTestimonialCount } from "@/lib/deliverability/queries";
import { JOURNEY_COLUMN_TYPES, JOURNEY_STATUSES, TESTIMONIAL_MEDIA_TYPES } from "@/lib/deliverability/types";
import { requirePermission } from "@/lib/team/context";

const columnTypeSchema = z.enum(JOURNEY_COLUMN_TYPES);
const statusSchema = z.enum(JOURNEY_STATUSES);
const mediaTypeSchema = z.enum(TESTIMONIAL_MEDIA_TYPES);
const idSchema = z.string().uuid();

const journeyInputSchema = z.object({
  clientName: z.string().trim().min(1).max(160),
  saleId: idSchema.nullable().optional(),
  offerId: z.string().trim().max(100).nullable().optional(),
  columnId: idSchema,
  enteredAt: z.coerce.date().optional(),
});

const columnInputSchema = z.object({
  id: idSchema.nullable().optional(),
  name: z.string().trim().min(1).max(80),
  type: columnTypeSchema,
});

const testimonialInputSchema = z.object({
  id: idSchema.nullable().optional(),
  mediaType: mediaTypeSchema,
  fileUrl: z.string().trim().max(512).nullable().optional(),
  externalUrl: z.string().trim().url().max(500).nullable().optional(),
  text: z.string().trim().max(10000).nullable().optional(),
  clientName: z.string().trim().min(1).max(160),
  clientJourneyId: idSchema.nullable().optional(),
  offerId: z.string().trim().max(100).nullable().optional(),
  resultText: z.string().trim().max(500).nullable().optional(),
  consent: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function invalid(message: string): { error: string } {
  return { error: message };
}

async function getAccess(permission: "delivrabilite:suivi-client" | "delivrabilite:temoignages") {
  const { userId } = await getCurrentUser();
  const access = await requirePermission(userId, permission);
  return access ? { ...access, userId } : null;
}

function revalidateDelivery() {
  revalidatePath("/delivrabilite/suivi-client");
  revalidatePath("/delivrabilite/temoignages");
  revalidatePath("/business");
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic-app");
}

export async function createJourney(data: unknown): Promise<{ error: string | null; id?: string }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const parsed = journeyInputSchema.safeParse(data);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Client invalide.");

  const [column] = await db.select().from(journeyColumns).where(and(eq(journeyColumns.id, parsed.data.columnId), eq(journeyColumns.userId, access.accountId))).limit(1);
  if (!column) return invalid("Colonne introuvable.");

  let sale: typeof sales.$inferSelect | undefined;
  if (parsed.data.saleId) {
    [sale] = await db.select().from(sales).where(and(eq(sales.id, parsed.data.saleId), eq(sales.userId, access.accountId))).limit(1);
    if (!sale) return invalid("Vente introuvable.");
    const [existing] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.userId, access.accountId), eq(clientJourneys.saleId, sale.id))).limit(1);
    if (existing) return invalid("Cette vente est déjà reliée à un client.");
  }

  const enteredAt = parsed.data.enteredAt ?? new Date();
  const [journey] = await db.insert(clientJourneys).values({
    userId: access.accountId,
    clientName: parsed.data.clientName,
    saleId: parsed.data.saleId ?? null,
    offerId: parsed.data.offerId ?? sale?.offerId ?? null,
    columnId: column.id,
    enteredAt,
    columnUpdatedAt: enteredAt,
    lastActivityAt: enteredAt,
    status: column.type === "end" ? "completed" : "active",
  }).returning({ id: clientJourneys.id });
  await db.insert(clientJourneyStageHistory).values({ userId: access.accountId, clientJourneyId: journey.id, toColumnId: column.id, changedAt: enteredAt });
  after(() => track("client_journey_created", access.userId, { journey_id: journey.id, sale_id: parsed.data.saleId ?? null }));
  revalidateDelivery();
  return { error: null, id: journey.id };
}

export async function createJourneyFromSale(saleId: unknown): Promise<{ error: string | null; id?: string }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const parsed = idSchema.safeParse(saleId);
  if (!parsed.success) return invalid("Vente invalide.");
  const [sale] = await db.select().from(sales).where(and(eq(sales.id, parsed.data), eq(sales.userId, access.accountId))).limit(1);
  if (!sale) return invalid("Vente introuvable.");
  const [existing] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.userId, access.accountId), eq(clientJourneys.saleId, sale.id))).limit(1);
  if (existing) return invalid("Cette vente est déjà reliée à un client.");
  const columns = await db.select().from(journeyColumns).where(eq(journeyColumns.userId, access.accountId)).orderBy(asc(journeyColumns.position));
  const firstColumn = columns.find((column) => column.type === "entry") ?? columns[0];
  if (!firstColumn) return invalid("Aucune colonne de parcours n'est disponible.");
  return createJourney({
    clientName: sale.clientName,
    saleId: sale.id,
    offerId: sale.offerId,
    columnId: firstColumn.id,
    enteredAt: sale.saleDate,
  });
}

export async function addJourneyColumn(data: unknown): Promise<{ error: string | null; id?: string }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const parsed = columnInputSchema.omit({ id: true }).safeParse(data);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Colonne invalide.");
  const current = await db.select({ position: journeyColumns.position }).from(journeyColumns).where(eq(journeyColumns.userId, access.accountId)).orderBy(asc(journeyColumns.position));
  const nextPosition = current.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1;
  const [column] = await db.insert(journeyColumns).values({ userId: access.accountId, name: parsed.data.name, type: parsed.data.type, position: nextPosition }).returning({ id: journeyColumns.id });
  revalidateDelivery();
  return { error: null, id: column.id };
}

export async function updateJourneyColumn(data: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const parsed = columnInputSchema.extend({ id: idSchema }).safeParse(data);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Colonne invalide.");
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(journeyColumns).set({ name: parsed.data.name, type: parsed.data.type, updatedAt: now }).where(and(eq(journeyColumns.id, parsed.data.id), eq(journeyColumns.userId, access.accountId)));
    await tx.update(clientJourneys)
      .set({ status: parsed.data.type === "end" ? "completed" : "active", updatedAt: now })
      .where(and(eq(clientJourneys.userId, access.accountId), eq(clientJourneys.columnId, parsed.data.id)));
  });
  revalidateDelivery();
  return { error: null };
}

export async function reorderJourneyColumns(columnIds: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const parsed = z.array(idSchema).min(1).safeParse(columnIds);
  if (!parsed.success) return invalid("Ordre de colonnes invalide.");
  const current = await db.select({ id: journeyColumns.id }).from(journeyColumns).where(eq(journeyColumns.userId, access.accountId));
  const currentIds = new Set(current.map((column) => column.id));
  if (currentIds.size !== parsed.data.length || parsed.data.some((id) => !currentIds.has(id))) return invalid("Ordre de colonnes invalide.");
  await db.transaction(async (tx) => {
    for (const [position, id] of parsed.data.entries()) {
      await tx.update(journeyColumns).set({ position: -(position + 1), updatedAt: new Date() }).where(and(eq(journeyColumns.id, id), eq(journeyColumns.userId, access.accountId)));
    }
    for (const [position, id] of parsed.data.entries()) {
      await tx.update(journeyColumns).set({ position, updatedAt: new Date() }).where(and(eq(journeyColumns.id, id), eq(journeyColumns.userId, access.accountId)));
    }
  });
  revalidateDelivery();
  return { error: null };
}

export async function deleteJourneyColumn(columnId: unknown, targetColumnId: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const source = idSchema.safeParse(columnId);
  const target = idSchema.safeParse(targetColumnId);
  if (!source.success || !target.success || source.data === target.data) return invalid("Réaffectation invalide.");
  const [sourceColumn, targetColumn] = await Promise.all([
    db.select().from(journeyColumns).where(and(eq(journeyColumns.id, source.data), eq(journeyColumns.userId, access.accountId))).limit(1),
    db.select().from(journeyColumns).where(and(eq(journeyColumns.id, target.data), eq(journeyColumns.userId, access.accountId))).limit(1),
  ]);
  if (!sourceColumn[0] || !targetColumn[0]) return invalid("Colonne introuvable.");
  const clients = await db.select({ id: clientJourneys.id, columnId: clientJourneys.columnId }).from(clientJourneys).where(and(eq(clientJourneys.userId, access.accountId), eq(clientJourneys.columnId, source.data)));
  const remainingColumns = await db.select({ id: journeyColumns.id }).from(journeyColumns).where(eq(journeyColumns.userId, access.accountId)).orderBy(asc(journeyColumns.position));
  const remainingIds = remainingColumns.filter((column) => column.id !== source.data).map((column) => column.id);
  await db.transaction(async (tx) => {
    for (const client of clients) {
      const now = new Date();
      await tx.update(clientJourneys).set({ columnId: target.data, columnUpdatedAt: now, lastActivityAt: now, status: targetColumn[0].type === "end" ? "completed" : "active", updatedAt: now }).where(eq(clientJourneys.id, client.id));
      await tx.insert(clientJourneyStageHistory).values({ userId: access.accountId, clientJourneyId: client.id, fromColumnId: source.data, toColumnId: target.data });
    }
    // `toColumnId` is restrictive so deleting a column cannot leave broken
    // history rows behind. Point those past transitions at the reassignment
    // target; `fromColumnId` is nullable and is cleared by the FK when the
    // source column is deleted.
    await tx.update(clientJourneyStageHistory)
      .set({ toColumnId: target.data })
      .where(and(eq(clientJourneyStageHistory.userId, access.accountId), eq(clientJourneyStageHistory.toColumnId, source.data)));
    await tx.delete(journeyColumns).where(and(eq(journeyColumns.id, source.data), eq(journeyColumns.userId, access.accountId)));
    for (const [position, id] of remainingIds.entries()) {
      await tx.update(journeyColumns).set({ position: -(position + 1), updatedAt: new Date() }).where(and(eq(journeyColumns.id, id), eq(journeyColumns.userId, access.accountId)));
    }
    for (const [position, id] of remainingIds.entries()) {
      await tx.update(journeyColumns).set({ position, updatedAt: new Date() }).where(and(eq(journeyColumns.id, id), eq(journeyColumns.userId, access.accountId)));
    }
  });
  revalidateDelivery();
  return { error: null };
}

export async function moveJourney(journeyId: unknown, columnId: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const journey = idSchema.safeParse(journeyId);
  const nextColumn = idSchema.safeParse(columnId);
  if (!journey.success || !nextColumn.success) return invalid("Déplacement invalide.");
  const [[current], [column]] = await Promise.all([
    db.select().from(clientJourneys).where(and(eq(clientJourneys.id, journey.data), eq(clientJourneys.userId, access.accountId))).limit(1),
    db.select().from(journeyColumns).where(and(eq(journeyColumns.id, nextColumn.data), eq(journeyColumns.userId, access.accountId))).limit(1),
  ]);
  if (!current || !column) return invalid("Client ou colonne introuvable.");
  if (current.columnId === column.id) return { error: null };
  const now = new Date();
  const nextStatus = column.type === "end" ? "completed" : current.status === "completed" ? "active" : current.status;
  await db.update(clientJourneys).set({ columnId: column.id, columnUpdatedAt: now, lastActivityAt: now, status: nextStatus, updatedAt: now }).where(eq(clientJourneys.id, current.id));
  await db.insert(clientJourneyStageHistory).values({ userId: access.accountId, clientJourneyId: current.id, fromColumnId: current.columnId, toColumnId: column.id, changedAt: now });
  after(() => track("client_stage_changed", access.userId, { journey_id: current.id, from: current.columnId, to: column.id }));
  if (column.type === "risk") after(() => track("client_at_risk_flagged", access.userId, { journey_id: current.id, column_id: column.id }));
  revalidateDelivery();
  return { error: null };
}

export async function updateJourneyStatus(journeyId: unknown, status: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const journey = idSchema.safeParse(journeyId);
  const parsedStatus = statusSchema.safeParse(status);
  if (!journey.success || !parsedStatus.success) return invalid("Statut invalide.");
  await db.update(clientJourneys).set({ status: parsedStatus.data, lastActivityAt: new Date(), updatedAt: new Date() }).where(and(eq(clientJourneys.id, journey.data), eq(clientJourneys.userId, access.accountId)));
  revalidateDelivery();
  return { error: null };
}

export async function saveJourneyNote(journeyId: unknown, noteId: unknown, body: unknown): Promise<{ error: string | null; id?: string }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const journey = idSchema.safeParse(journeyId);
  const note = noteId === null || noteId === undefined ? { success: true as const, data: null } : idSchema.safeParse(noteId);
  const text = z.string().trim().max(5000).safeParse(body);
  if (!journey.success || !note.success || !text.success) return invalid("Note invalide.");
  const [ownedJourney] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.id, journey.data), eq(clientJourneys.userId, access.accountId))).limit(1);
  if (!ownedJourney) return invalid("Client introuvable.");
  if (note.data) {
    await db.update(clientNotes).set({ body: text.data, updatedAt: new Date() }).where(and(eq(clientNotes.id, note.data), eq(clientNotes.userId, access.accountId), eq(clientNotes.clientJourneyId, journey.data)));
    revalidateDelivery();
    return { error: null, id: note.data };
  }
  if (!text.data) return { error: null };
  const [created] = await db.insert(clientNotes).values({ userId: access.accountId, clientJourneyId: journey.data, body: text.data }).returning({ id: clientNotes.id });
  await db.update(clientJourneys).set({ lastActivityAt: new Date(), updatedAt: new Date() }).where(eq(clientJourneys.id, journey.data));
  revalidateDelivery();
  return { error: null, id: created.id };
}

export async function addJourneyMilestone(journeyId: unknown, name: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const journey = idSchema.safeParse(journeyId);
  const label = z.string().trim().min(1).max(180).safeParse(name);
  if (!journey.success || !label.success) return invalid("Jalon invalide.");
  const [ownedJourney] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.id, journey.data), eq(clientJourneys.userId, access.accountId))).limit(1);
  if (!ownedJourney) return invalid("Client introuvable.");
  await db.insert(clientMilestones).values({ userId: access.accountId, clientJourneyId: journey.data, name: label.data, position: 0 });
  revalidateDelivery();
  return { error: null };
}

export async function toggleJourneyMilestone(milestoneId: unknown, completed: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const milestone = idSchema.safeParse(milestoneId);
  const value = z.boolean().safeParse(completed);
  if (!milestone.success || !value.success) return invalid("Jalon invalide.");
  await db.update(clientMilestones).set({ completedAt: value.data ? new Date() : null, updatedAt: new Date() }).where(and(eq(clientMilestones.id, milestone.data), eq(clientMilestones.userId, access.accountId)));
  revalidateDelivery();
  return { error: null };
}

export async function addJourneyReminder(journeyId: unknown, remindAt: unknown, note: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const journey = idSchema.safeParse(journeyId);
  const dateValue = z.coerce.date().safeParse(remindAt);
  const reminderNote = z.string().trim().min(1).max(500).safeParse(note);
  if (!journey.success || !dateValue.success || !reminderNote.success) return invalid("Rappel invalide.");
  const [ownedJourney] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.id, journey.data), eq(clientJourneys.userId, access.accountId))).limit(1);
  if (!ownedJourney) return invalid("Client introuvable.");
  await db.insert(clientReminders).values({ userId: access.accountId, clientJourneyId: journey.data, remindAt: dateValue.data, note: reminderNote.data });
  revalidateDelivery();
  return { error: null };
}

export async function completeJourneyReminder(reminderId: unknown, completed: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return invalid("Accès refusé.");
  const reminder = idSchema.safeParse(reminderId);
  const value = z.boolean().safeParse(completed);
  if (!reminder.success || !value.success) return invalid("Rappel invalide.");
  await db.update(clientReminders).set({ completed: value.data, updatedAt: new Date() }).where(and(eq(clientReminders.id, reminder.data), eq(clientReminders.userId, access.accountId)));
  revalidateDelivery();
  return { error: null };
}

function validateTestimonialContent(data: z.infer<typeof testimonialInputSchema>): string | null {
  if (data.mediaType === "photo" || data.mediaType === "video") {
    if (!data.fileUrl) return "Un fichier est obligatoire pour ce format.";
  }
  if (data.mediaType === "link" && !data.externalUrl) return "Un lien est obligatoire pour ce format.";
  if (data.mediaType === "text" && !data.text) return "Le texte du témoignage est obligatoire.";
  if (data.fileUrl && !data.fileUrl.includes("/testimonials/")) return "Fichier invalide.";
  return null;
}

async function validateJourneyLink(accountId: string, journeyId: string | null | undefined): Promise<boolean> {
  if (!journeyId) return true;
  const [journey] = await db.select({ id: clientJourneys.id }).from(clientJourneys).where(and(eq(clientJourneys.id, journeyId), eq(clientJourneys.userId, accountId))).limit(1);
  return Boolean(journey);
}

export async function saveTestimonial(data: unknown): Promise<{ error: string | null; id?: string }> {
  const access = await getAccess("delivrabilite:temoignages");
  if (!access) return invalid("Accès refusé.");
  const parsed = testimonialInputSchema.safeParse(data);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Témoignage invalide.");
  const contentError = validateTestimonialContent(parsed.data);
  if (contentError) return invalid(contentError);
  if (parsed.data.fileUrl && !isOwnedBookingAssetPath(parsed.data.fileUrl, access.accountId)) return invalid("Fichier invalide.");
  if (!(await validateJourneyLink(access.accountId, parsed.data.clientJourneyId))) return invalid("Client introuvable.");

  const values = {
    userId: access.accountId,
    mediaType: parsed.data.mediaType,
    fileUrl: parsed.data.fileUrl ?? null,
    externalUrl: parsed.data.externalUrl ?? null,
    text: parsed.data.text ?? null,
    clientName: parsed.data.clientName,
    clientJourneyId: parsed.data.clientJourneyId ?? null,
    offerId: parsed.data.offerId ?? null,
    resultText: parsed.data.resultText ?? null,
    consent: parsed.data.consent,
    tags: parsed.data.tags,
    testimonialDate: parsed.data.date,
    updatedAt: new Date(),
  };
  let id = parsed.data.id ?? null;
  if (id) {
    const [existing] = await db.select().from(testimonials).where(and(eq(testimonials.id, id), eq(testimonials.userId, access.accountId))).limit(1);
    if (!existing) return invalid("Témoignage introuvable.");
    await db.update(testimonials).set(values).where(and(eq(testimonials.id, id), eq(testimonials.userId, access.accountId)));
    if (existing.fileUrl && existing.fileUrl !== values.fileUrl) await deleteBookingAsset(existing.fileUrl, access.accountId);
  } else {
    const [created] = await db.insert(testimonials).values(values).returning({ id: testimonials.id });
    id = created.id;
    after(() => track("testimonial_added", access.userId, { media_type: values.mediaType, has_consent: values.consent }));
  }
  await syncTestimonialCount(access.accountId);
  revalidateDelivery();
  return { error: null, id };
}

export async function deleteTestimonial(testimonialId: unknown): Promise<{ error: string | null }> {
  const access = await getAccess("delivrabilite:temoignages");
  if (!access) return invalid("Accès refusé.");
  const parsed = idSchema.safeParse(testimonialId);
  if (!parsed.success) return invalid("Témoignage invalide.");
  const [existing] = await db.select().from(testimonials).where(and(eq(testimonials.id, parsed.data), eq(testimonials.userId, access.accountId))).limit(1);
  if (!existing) return invalid("Témoignage introuvable.");
  await db.delete(testimonials).where(and(eq(testimonials.id, existing.id), eq(testimonials.userId, access.accountId)));
  await deleteBookingAsset(existing.fileUrl, access.accountId);
  await syncTestimonialCount(access.accountId);
  revalidateDelivery();
  return { error: null };
}

export async function getJourneyDetailsAction(journeyId: unknown) {
  const access = await getAccess("delivrabilite:suivi-client");
  if (!access) return { error: "Accès refusé.", details: null };
  const parsed = idSchema.safeParse(journeyId);
  if (!parsed.success) return { error: "Client invalide.", details: null };
  return { error: null, details: await getJourneyDetails(access.accountId, parsed.data) };
}
