import { z } from "zod";

import {
  CRM_ACTION_CATEGORIES,
  CRM_LEAD_OUTCOMES,
  CRM_LEAD_SOURCES,
  CRM_LEAD_STAGES,
  CRM_PLATFORMS,
} from "./types";

export const crmPlatformSchema = z.enum(CRM_PLATFORMS);
export const crmStageSchema = z.enum(CRM_LEAD_STAGES);
export const crmOutcomeSchema = z.enum(CRM_LEAD_OUTCOMES);
export const crmLeadSourceSchema = z.enum(CRM_LEAD_SOURCES);
export const crmActionCategorySchema = z.enum(CRM_ACTION_CATEGORIES);

export const captureProfileSchema = z.object({
  profileUrl: z.string().trim().url().max(500),
  platform: crmPlatformSchema.nullish(),
  handle: z.string().trim().max(160).nullish(),
  displayName: z.string().trim().max(160).nullish(),
  firstName: z.string().trim().max(120).nullish(),
  lastName: z.string().trim().max(120).nullish(),
  messageOccurredAt: z.string().datetime({ offset: true }).nullish(),
  capturedAt: z.string().datetime({ offset: true }).nullish(),
  sourceEventKey: z.string().trim().max(240).nullish(),
  responsibleSetterId: z.string().uuid().nullish(),
});

export const crmCaptureQualificationSchema = z.object({
  offerId: z.string().trim().max(160).nullable().optional(),
  source: crmLeadSourceSchema.optional(),
  stage: crmStageSchema.optional(),
});

export const crmCaptureCommandSchema = z.object({
  decision: z.enum(["create_new", "confirm_match"]).default("create_new"),
  idempotencyKey: z.string().trim().min(8).max(240),
  candidateLeadId: z.string().uuid().optional(),
  separateFromCandidates: z.boolean().optional(),
  profile: captureProfileSchema,
  qualification: crmCaptureQualificationSchema.optional(),
});

export const crmLeadCaptureSchema = captureProfileSchema.extend({
  offerId: z.string().trim().max(160).nullable().optional(),
  source: crmLeadSourceSchema.optional(),
  stage: crmStageSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
});

export const leadFieldsSchema = z.object({
  leadId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  offerId: z.string().trim().max(160).nullable().optional(),
  source: crmLeadSourceSchema.optional(),
  potentialValueEur: z.number().int().min(0).max(100_000_000).optional(),
  closer: z.string().trim().max(160).nullable().optional(),
});

export const changeStageSchema = z.object({ leadId: z.string().uuid(), stage: crmStageSchema });
export const outcomeSchema = z.object({ leadId: z.string().uuid(), outcome: crmOutcomeSchema.exclude(["sold"]) });
export const reopenSchema = z.object({ leadId: z.string().uuid(), stage: crmStageSchema, idempotencyKey: z.string().trim().min(8).max(240) });
export const responsibilitySchema = z.object({ leadId: z.string().uuid(), setterId: z.string().uuid().nullable() });
export const noteSchema = z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(5000) });

export const actionSchema = z.object({
  leadId: z.string().uuid(),
  category: crmActionCategorySchema,
  type: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  dueAt: z.string().datetime({ offset: true }),
  priority: z.number().int().min(0).max(100).default(0),
  responsibleUserId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().trim().max(240).nullable().optional(),
});

export const actionCompletionSchema = z.object({ actionId: z.string().uuid(), status: z.enum(["completed", "cancelled"]) });

export const crmExtensionUpdateSchema = z.object({
  leadId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(240),
  stage: crmStageSchema.optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  offerId: z.string().trim().max(160).nullable().optional(),
  note: z.string().trim().max(5000).optional(),
  action: actionSchema.pick({ category: true, type: true, title: true, dueAt: true, priority: true }).optional(),
}).refine((value) => value.stage !== undefined || value.displayName !== undefined || value.firstName !== undefined || value.lastName !== undefined || value.offerId !== undefined || value.note !== undefined || value.action !== undefined, { message: "At least one update is required." });

export const leadsFilterSchema = z.object({
  search: z.string().trim().max(160).optional(),
  stage: crmStageSchema.optional(),
  outcome: crmOutcomeSchema.optional(),
  responsibleSetterId: z.string().uuid().optional(),
});

export const actionsFilterSchema = z.object({
  category: crmActionCategorySchema.optional(),
  overdueOnly: z.boolean().optional(),
  teamView: z.boolean().optional(),
});
