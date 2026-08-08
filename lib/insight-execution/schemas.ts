import { z } from "zod";

import {
  BASELINE_UNITS,
  INITIATIVE_STATUSES,
  INSIGHT_DECISIONS,
  INSIGHT_SOURCE_TYPES,
  MEASUREMENT_EVIDENCE_TYPES,
} from "./types";

export const insightSourceTypeSchema = z.enum(INSIGHT_SOURCE_TYPES);
export const insightDecisionSchema = z.enum(INSIGHT_DECISIONS);
export const initiativeStatusSchema = z.enum(INITIATIVE_STATUSES);
export const measurementEvidenceTypeSchema = z.enum(MEASUREMENT_EVIDENCE_TYPES);
export const baselineUnitSchema = z.enum(BASELINE_UNITS);

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export const insightHistoryFilterSchema = z.object({
  decision: insightDecisionSchema.optional(),
  sourceType: insightSourceTypeSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

export const materializeInsightSchema = z.object({
  sourceType: insightSourceTypeSchema,
  sourceId: z.string().trim().min(1).max(160),
});

export const launchInsightSchema = z
  .object({
    insightId: z.string().uuid(),
    targetType: z.enum(["todo", "project"]),
    targetId: z.string().uuid().nullable().optional(),
    dueDate: isoDateSchema.nullable().optional(),
    assignedTeamMemberId: z.string().uuid().nullable().optional(),
    makeWeeklyFocus: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.targetType === "project" && !value.targetId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["targetId"], message: "Sélectionne un projet." });
    }
  });

export const insightDecisionInputSchema = z.object({
  insightId: z.string().uuid(),
  decision: insightDecisionSchema,
  resumeAt: isoDateSchema.nullable().optional(),
});

export const initiativeStatusInputSchema = z.object({
  initiativeId: z.string().uuid(),
  status: initiativeStatusSchema,
});

export const focusInputSchema = z.object({ initiativeId: z.string().uuid() });

export const assignmentInputSchema = z.object({
  initiativeId: z.string().uuid(),
  teamMemberId: z.string().uuid().nullable(),
});

export const qualitativeResultSchema = z.object({
  initiativeId: z.string().uuid(),
  note: z.string().trim().min(1).max(2000),
});

export const nudgeActionSchema = z.object({ initiativeId: z.string().uuid() });
