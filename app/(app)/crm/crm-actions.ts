"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { requireUserIdOrError } from "@/lib/current-user";
import { hasCrmPermission, requireCrmAccess, requireCrmPermission } from "@/lib/crm/access";
import { enqueueCrmCallMatchSuggestions, getUnlinkedCrmCallIdsForMatching } from "@/lib/crm/call-match-queue";
import {
  addCrmNote,
  changeCrmStage,
  completeCrmAction,
  createCrmAction,
  createCrmLead,
  getCrmLead,
  linkCrmCall,
  reopenCrmLead,
  reassignCrmLead,
  resolveCrmProfile,
  setCrmOutcome,
  setCrmCallResult as updateCrmCallResult,
  updateCrmLeadFields,
} from "@/lib/crm/queries";
import { confirmCrmCallMatch, decideCrmCallMatchSuggestion, generateCrmCallMatchSuggestion, type CrmCallMatchDecisionResult } from "@/lib/crm/call-match-suggestions";
import { normalizeCapturedProfile } from "@/lib/crm/normalization";
import { actionCompletionSchema, actionSchema, captureProfileSchema, changeStageSchema, crmLeadCaptureSchema, leadFieldsSchema, noteSchema, outcomeSchema, reopenSchema, responsibilitySchema } from "@/lib/crm/schemas";
import type { CrmCallMatchStatus, CrmCapturedProfile, CrmProfileResolution } from "@/lib/crm/types";

type ErrorResult = { error: string };
type CrmErrorKey = "access" | "invalidProfile" | "ambiguousMatch" | "invalidData" | "invalidStage" | "invalidOutcome" | "leadNotFound" | "invalidResponsibility" | "responsibleAccount" | "invalidNote" | "invalidAction" | "cannotCreateAction" | "actionNotFound" | "invalidAssociation" | "leadOrCallNotFound" | "captureFailed" | "callMatchInvalid" | "callMatchExpired" | "callMatchConflict" | "callMatchNotFound" | "callMatchQueueUnavailable";

async function currentUser(): Promise<string | ErrorResult> {
  const userId = await requireUserIdOrError();
  return typeof userId === "string" ? userId : { error: userId.error };
}

export async function getCrmLeadDetailAction(leadId: string) {
  const userId = await currentUser();
  if (typeof userId !== "string") return null;
  const access = await requireCrmAccess(userId);
  if (!access || !z.string().uuid().safeParse(leadId).success) return null;
  return getCrmLead(access.accountId, leadId);
}

async function crmError(key: CrmErrorKey = "access"): Promise<string> {
  const t = await getTranslations("crm");
  return t(`errors.${key}`);
}

function refreshCrm(): void {
  revalidatePath("/crm", "layout");
  revalidatePath("/crm");
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm/leads");
  revalidatePath("/crm/actions");
  revalidatePath("/crm/appels");
}

function parseProfile(input: unknown): { profile: CrmCapturedProfile } | null {
  const parsed = captureProfileSchema.safeParse(input);
  if (!parsed.success) return null;
  const profile = normalizeCapturedProfile(parsed.data);
  return profile ? { profile } : null;
}

export async function resolveProfileAction(input: unknown): Promise<{ error: string | null; resolution?: CrmProfileResolution }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = parseProfile(input);
  if (!parsed) return { error: await crmError("invalidProfile") };
  return { error: null, resolution: await resolveCrmProfile(access.accountId, parsed.profile) };
}

export async function captureProfileAction(input: unknown): Promise<{ error: string | null; leadId?: string; created?: boolean }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsedInput = crmLeadCaptureSchema.safeParse(input);
  if (!parsedInput.success) return { error: await crmError("invalidProfile") };
  const parsed = normalizeCapturedProfile(parsedInput.data);
  if (!parsed) return { error: await crmError("invalidProfile") };
  const resolution = await resolveCrmProfile(access.accountId, parsed);
  if (resolution.kind === "ambiguous") return { error: await crmError("ambiguousMatch") };
  try {
    const result = await createCrmLead(access.accountId, { profile: parsed, actorUserId: userId, offerId: parsedInput.data.offerId ?? null, marketingSource: parsedInput.data.source, stage: parsedInput.data.stage, responsibleSetterId: null, source: "app", sourceEventKey: parsedInput.data.sourceEventKey ?? null, idempotencyKey: parsedInput.data.idempotencyKey ?? null });
    refreshCrm();
    return { error: null, leadId: result.lead.id, created: result.created };
  } catch {
    return { error: await crmError("captureFailed") };
  }
}

export async function updateLeadFieldsAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = leadFieldsSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidData") };
  const { leadId, idempotencyKey, ...fields } = parsed.data;
  const lead = await updateCrmLeadFields(access.accountId, leadId, fields, userId, "app", idempotencyKey);
  if (!lead) return { error: await crmError("leadNotFound") };
  refreshCrm();
  return { error: null };
}

export async function changeStageAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = changeStageSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidStage") };
  const lead = await changeCrmStage(access.accountId, parsed.data.leadId, parsed.data.stage, userId);
  if (!lead) return { error: await crmError("leadNotFound") };
  refreshCrm();
  return { error: null };
}

export async function setOutcomeAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidOutcome") };
  const access = await requireCrmPermission(userId, "crm:view");
  if (!access) return { error: await crmError() };
  const lead = await setCrmOutcome(access.accountId, parsed.data.leadId, parsed.data.outcome, userId);
  if (!lead) return { error: await crmError("leadNotFound") };
  refreshCrm();
  return { error: null };
}

export async function reopenLeadAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidStage") };
  const lead = await reopenCrmLead(access.accountId, parsed.data.leadId, userId, parsed.data.stage, parsed.data.idempotencyKey);
  if (!lead) return { error: await crmError("leadNotFound") };
  refreshCrm();
  return { error: null };
}

export async function reassignLeadAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmPermission(userId, "crm:assign");
  if (!access) return { error: await crmError() };
  const parsed = responsibilitySchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidResponsibility") };
  try {
    const lead = await reassignCrmLead(access.accountId, parsed.data.leadId, parsed.data.setterId, userId);
    if (!lead) return { error: await crmError("leadNotFound") };
    refreshCrm();
    return { error: null };
  } catch {
    return { error: await crmError("responsibleAccount") };
  }
}

export async function addNoteAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidNote") };
  const note = await addCrmNote(access.accountId, parsed.data.leadId, userId, parsed.data.body);
  if (!note) return { error: await crmError("leadNotFound") };
  refreshCrm();
  return { error: null };
}

export async function createActionAction(input: unknown): Promise<{ error: string | null; actionId?: string }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = actionSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidAction") };
  try {
    const action = await createCrmAction(access.accountId, userId, { ...parsed.data, dueAt: new Date(parsed.data.dueAt), source: "app" });
    if (!action) return { error: await crmError("leadNotFound") };
    refreshCrm();
    return { error: null, actionId: action.id };
  } catch {
    return { error: await crmError("cannotCreateAction") };
  }
}

export async function completeActionAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = actionCompletionSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidAction") };
  const action = await completeCrmAction(access.accountId, parsed.data.actionId, userId, parsed.data.status, hasCrmPermission(access, "crm:manage-pipeline"));
  if (!action) return { error: await crmError("actionNotFound") };
  refreshCrm();
  return { error: null };
}

export async function linkCallAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmPermission(userId, "crm:assign");
  if (!access) return { error: await crmError() };
  const parsed = z.object({ leadId: z.string().uuid(), salesCallId: z.string().uuid(), confidence: z.string().trim().min(1).max(40) }).safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidAssociation") };
  const result = await linkCrmCall(access.accountId, userId, parsed.data.leadId, parsed.data.salesCallId, parsed.data.confidence);
  if (!result) return { error: await crmError("leadOrCallNotFound") };
  refreshCrm();
  return { error: null };
}

const callMatchRequestSchema = z.object({ callId: z.string().uuid(), force: z.boolean().optional() });

export async function requestCrmCallMatchAction(input: unknown): Promise<{ error: string | null; status?: CrmCallMatchStatus }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = callMatchRequestSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("callMatchInvalid") };
  const suggestion = await generateCrmCallMatchSuggestion(access.accountId, parsed.data.callId, parsed.data.force === true);
  if (!suggestion) return { error: await crmError("callMatchNotFound") };
  refreshCrm();
  return { error: null, status: suggestion.status };
}

const callMatchBatchSchema = z.object({ limit: z.number().int().min(1).max(25).optional() });

export async function queueHistoricalCrmCallMatchesAction(input: unknown): Promise<{ error: string | null; queued: number }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return { ...userId, queued: 0 };
  const access = await requireCrmPermission(userId, "crm:assign");
  if (!access) return { error: await crmError(), queued: 0 };
  const parsed = callMatchBatchSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("callMatchInvalid"), queued: 0 };
  try {
    const callIds = await getUnlinkedCrmCallIdsForMatching(access.accountId, parsed.data.limit);
    if (callIds.length === 0) return { error: null, queued: 0 };
    const queued = await enqueueCrmCallMatchSuggestions(access.accountId, callIds);
    if (queued === 0) return { error: await crmError("callMatchQueueUnavailable"), queued: 0 };
    refreshCrm();
    return { error: null, queued };
  } catch {
    return { error: await crmError("callMatchQueueUnavailable"), queued: 0 };
  }
}

const callMatchConfirmSchema = z.object({ callId: z.string().uuid(), suggestionId: z.string().uuid(), leadId: z.string().uuid() });

function callMatchDecisionError(result: CrmCallMatchDecisionResult): CrmErrorKey | null {
  if (result === "not_found") return "callMatchNotFound";
  if (result === "expired") return "callMatchExpired";
  if (result === "conflict") return "callMatchConflict";
  return null;
}

export async function confirmCrmCallMatchAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmPermission(userId, "crm:assign");
  if (!access) return { error: await crmError() };
  const parsed = callMatchConfirmSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("callMatchInvalid") };
  const result = await confirmCrmCallMatch(access.accountId, userId, parsed.data.callId, parsed.data.suggestionId, parsed.data.leadId);
  const errorKey = callMatchDecisionError(result);
  if (errorKey) return { error: await crmError(errorKey) };
  refreshCrm();
  return { error: null };
}

const callMatchDecisionSchema = z.object({ suggestionId: z.string().uuid(), decision: z.enum(["rejected", "dismissed"]) });

export async function decideCrmCallMatchAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmPermission(userId, "crm:assign");
  if (!access) return { error: await crmError() };
  const parsed = callMatchDecisionSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("callMatchInvalid") };
  const result = await decideCrmCallMatchSuggestion(access.accountId, userId, parsed.data.suggestionId, parsed.data.decision);
  const errorKey = callMatchDecisionError(result);
  if (errorKey) return { error: await crmError(errorKey) };
  refreshCrm();
  return { error: null };
}

const crmCallResultSchema = z.object({
  callId: z.string().uuid(),
  result: z.enum(["showed", "no_show", "awaiting_decision", "not_closed"]),
});

export async function setCrmCallResultAction(input: unknown): Promise<{ error: string | null }> {
  const userId = await currentUser();
  if (typeof userId !== "string") return userId;
  const access = await requireCrmAccess(userId);
  if (!access) return { error: await crmError() };
  const parsed = crmCallResultSchema.safeParse(input);
  if (!parsed.success) return { error: await crmError("invalidData") };
  const result = await updateCrmCallResult(access.accountId, parsed.data.callId, parsed.data.result, userId);
  if (!result) return { error: await crmError("leadOrCallNotFound") };
  refreshCrm();
  revalidatePath("/ventes/appels");
  revalidatePath("/dashboard");
  return { error: null };
}
