import { z } from "zod";

import {
  CRM_ACTION_CATEGORIES,
  CRM_EVENT_TYPES,
  CRM_LOST_REASONS,
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
export const crmLostReasonSchema = z.enum(CRM_LOST_REASONS);
export const crmEventTypeSchema = z.enum(CRM_EVENT_TYPES);

const captureProfileBaseSchema = z.object({
  profileUrl: z.string().trim().max(500).optional().default(""),
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

function validateProfileIdentity(value: z.infer<typeof captureProfileBaseSchema>, context: z.RefinementCtx): void {
  if (!value.profileUrl && !value.handle) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["profileUrl"], message: "Un profil ou un handle est requis." });
  }
  if (!value.profileUrl && !value.platform) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["platform"], message: "La plateforme est requise sans URL." });
  }
}

export const captureProfileSchema = captureProfileBaseSchema.superRefine(validateProfileIdentity);

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

export const crmLeadCaptureSchema = captureProfileBaseSchema.extend({
  offerId: z.string().trim().max(160).nullable().optional(),
  source: crmLeadSourceSchema.optional(),
  stage: crmStageSchema.optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
}).superRefine(validateProfileIdentity);

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
  closerUserId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const changeStageSchema = z.object({ leadId: z.string().uuid(), stage: crmStageSchema, idempotencyKey: z.string().trim().min(8).max(240).optional() });
export const outcomeSchema = z.object({ leadId: z.string().uuid(), outcome: crmOutcomeSchema.exclude(["sold"]), lostReason: crmLostReasonSchema.nullable().optional(), note: z.string().trim().max(5000).optional(), idempotencyKey: z.string().trim().min(8).max(240).optional() }).superRefine((value, context) => {
  if (value.outcome === "lost" && !value.lostReason) context.addIssue({ code: z.ZodIssueCode.custom, path: ["lostReason"], message: "Une raison est requise." });
});
export const reopenSchema = z.object({ leadId: z.string().uuid(), stage: crmStageSchema, idempotencyKey: z.string().trim().min(8).max(240) });
export const responsibilitySchema = z.object({ leadId: z.string().uuid(), setterId: z.string().uuid().nullable(), idempotencyKey: z.string().trim().min(8).max(240) });
export const noteSchema = z.object({ leadId: z.string().uuid(), body: z.string().trim().min(1).max(5000), idempotencyKey: z.string().trim().min(8).max(240).optional() });
export const qualificationSchema = z.object({ leadId: z.string().uuid(), body: z.string().max(10000), idempotencyKey: z.string().trim().min(8).max(240) });
export const responseSchema = z.object({ leadId: z.string().uuid(), occurredAt: z.string().datetime({ offset: true }).optional(), idempotencyKey: z.string().trim().min(8).max(240) });
export const contactStateSchema = z.object({ leadId: z.string().uuid(), occurredAt: z.string().datetime({ offset: true }).optional(), idempotencyKey: z.string().trim().min(8).max(240) });
export const bookingLinkSchema = z.object({ leadId: z.string().uuid(), idempotencyKey: z.string().trim().min(8).max(240) });
export const internalBookingSlotsSchema = z.object({ leadId: z.string().uuid() });
export const internalBookingSchema = z.object({ leadId: z.string().uuid(), startAt: z.string().datetime({ offset: true }), closerUserId: z.string().uuid(), idempotencyKey: z.string().trim().min(8).max(240) });

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

const actionQueueFilterSchema = z.object({ category: crmActionCategorySchema.optional(), relanceOnly: z.boolean().optional(), overdueOnly: z.boolean().optional(), dueTodayOnly: z.boolean().optional() });
export const actionCompletionSchema = z.object({ actionId: z.string().uuid(), status: z.enum(["completed", "cancelled"]), idempotencyKey: z.string().trim().min(8).max(240).optional(), nextFilters: actionQueueFilterSchema.optional() });
export const actionRescheduleSchema = z.object({ actionId: z.string().uuid(), dueAt: z.string().datetime({ offset: true }), idempotencyKey: z.string().trim().min(8).max(240), nextFilters: actionQueueFilterSchema.optional() });

export const crmExtensionUpdateSchema = z.object({
  leadId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(240),
  responseOccurredAt: z.string().datetime({ offset: true }).optional(),
  stage: crmStageSchema.optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().max(120).optional(),
  offerId: z.string().trim().max(160).nullable().optional(),
  note: z.string().trim().max(5000).optional(),
  action: actionSchema.pick({ category: true, type: true, title: true, dueAt: true, priority: true }).optional(),
}).refine((value) => value.responseOccurredAt !== undefined || value.stage !== undefined || value.displayName !== undefined || value.firstName !== undefined || value.lastName !== undefined || value.offerId !== undefined || value.note !== undefined || value.action !== undefined, { message: "At least one update is required." });

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
