"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import {
  addComment,
  changeLeadStage,
  createLead,
  getLead,
  recoverFromNoShow,
  setNoShow,
  setReminder,
  toggleReminderDone,
  updateLead,
} from "@/lib/leads/queries";
import { commentInputSchema, leadInputSchema, reminderInputSchema, stageChangeSchema } from "@/lib/leads/schema";
import type { LeadWithRelations } from "@/lib/leads/types";

// Lazily fetches comments/history for the drawer (not needed by the board
// itself, which only renders LeadRow — avoids fetching every lead's full
// relations up front).
export async function getLeadDetailAction(id: string): Promise<LeadWithRelations | null> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return null;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return null;

  return getLead(access.accountId, id);
}

export async function createLeadAction(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = leadInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  const lead = await createLead(access.accountId, parsed.data);
  after(() => track("lead_created", userId, { source: lead.source }));
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

export async function updateLeadAction(id: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = leadInputSchema.partial().safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  await updateLead(access.accountId, id, parsed.data);
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

// Handles every drag EXCEPT into "close" (which opens the sale-validation
// modal instead — see validate-sale-action.ts) and stays the same action
// for "perdu" (motif required, enforced by stageChangeSchema's refine).
export async function changeStageAction(id: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = stageChangeSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Motif requis" };

  const result = await changeLeadStage(access.accountId, id, parsed.data.toStage, parsed.data.lostReason);
  if (result.error) return result;

  after(() => track("lead_stage_changed", userId, { to_stage: parsed.data.toStage }));
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

export async function recoverFromNoShowAction(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const result = await recoverFromNoShow(access.accountId, id);
  revalidatePath("/acquisition/pipeline");
  return result;
}

export async function setNoShowAction(id: string, value: boolean): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await setNoShow(access.accountId, id, value);
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

export async function addCommentAction(leadId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = commentInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Commentaire invalide" };

  await addComment(access.accountId, leadId, parsed.data.body);
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

export async function setReminderAction(leadId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = reminderInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Rappel invalide" };

  await setReminder(access.accountId, leadId, parsed.data.reminderDate, parsed.data.reminderNote);
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}

export async function toggleReminderDoneAction(leadId: string, done: boolean): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:pipeline");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await toggleReminderDone(access.accountId, leadId, done);
  revalidatePath("/acquisition/pipeline");
  return { error: null };
}
