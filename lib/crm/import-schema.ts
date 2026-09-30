import { z } from "zod";

import { CRM_IMPORT_FIELDS } from "@/lib/import/schema";

import {
  CRM_LEAD_OUTCOMES,
  CRM_LEAD_SOURCES,
  CRM_LEAD_STAGES,
  CRM_LOST_REASONS,
  CRM_PLATFORMS,
} from "./types";

export const crmImportTargetSchema = z.enum(["crm_leads", "ignore"]);
export const crmImportFieldSchema = z.enum(CRM_IMPORT_FIELDS);
export const crmImportSourceSchema = z.enum(CRM_LEAD_SOURCES);
export const crmImportPlatformSchema = z.enum(CRM_PLATFORMS);
export const crmImportStageSchema = z.enum(CRM_LEAD_STAGES);
export const crmImportOutcomeSchema = z.enum(CRM_LEAD_OUTCOMES);
export const crmImportLostReasonSchema = z.enum(CRM_LOST_REASONS);

const crmImportMappingEntrySchema = z.object({
  sourceColumn: z.string().trim().min(1).max(255),
  targetField: crmImportFieldSchema.nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  granularity: z.enum(["daily", "weekly", "monthly"]),
  sampleValues: z.array(z.string().max(500)).max(5),
  columnValues: z.array(z.string().max(2000)).max(2000),
});

const crmImportMappingSchema = z
  .object({
    sheetName: z.string().trim().min(1).max(255),
    targetTable: crmImportTargetSchema,
    ignoreReason: z.string().trim().max(500).nullable(),
    mappings: z.array(crmImportMappingEntrySchema).max(500),
    dateColumnName: z.string().trim().max(255).nullable(),
    dateColumnValues: z.array(z.string().max(2000)).max(2000).nullable(),
    periodDetected: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).nullable(),
    unmappedColumns: z.array(z.string().trim().min(1).max(255)).max(500),
    questions: z
      .array(
        z.object({
          sourceColumn: z.string().trim().min(1).max(255),
          prompt: z.string().trim().max(1000),
          options: z.array(crmImportFieldSchema).max(3),
        }),
      )
      .max(6),
  })
  .superRefine((value, context) => {
    if (value.targetTable === "ignore" && !value.ignoreReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ignoreReason"],
        message: "Une raison est requise pour ignorer une feuille.",
      });
    }
  });

const crmImportSheetSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sheetName: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i, "Hash de fichier invalide."),
  headerRowConfident: z.boolean(),
  previewRows: z.array(z.array(z.string().max(2000)).max(500)).max(3),
  mapping: crmImportMappingSchema,
  defaultSource: crmImportSourceSchema.nullable().optional(),
});

export const crmImportAnalyzeResponseSchema = z.object({
  sheets: z.array(crmImportSheetSchema.omit({ defaultSource: true })).max(100),
  keySource: z.enum(["byok", "shared"]),
  tokens: z.object({
    inputTokens: z.number().int().min(0),
    outputTokens: z.number().int().min(0),
  }),
});

const crmImportValueSchema = z.union([z.string(), z.number(), z.null()]);
const crmImportConflictSchema = z.object({
  id: z.string(),
  rowKey: z.string(),
  field: crmImportFieldSchema,
  importedValue: crmImportValueSchema,
  existingValue: crmImportValueSchema,
});

export const crmImportPreviewResponseSchema = z.object({
  importKey: z.string(),
  fileHash: z.string(),
  rows: z.array(z.object({
    rowKey: z.string(),
    fileName: z.string(),
    sheetName: z.string(),
    rowIndex: z.number().int().min(0),
    values: z.record(crmImportValueSchema),
    phoneNormalized: z.string().nullable(),
    issues: z.array(z.string()),
    action: z.enum(["create", "update", "skip", "review", "merged"]),
    duplicateGroupId: z.string().nullable(),
    existingLeadId: z.string().uuid().nullable(),
    conflicts: z.array(crmImportConflictSchema),
  })),
  duplicateGroups: z.array(z.object({
    id: z.string(),
    phoneNormalized: z.string().nullable(),
    rowKeys: z.array(z.string()),
    conflicts: z.array(crmImportFieldSchema),
    decision: z.enum(["merge", "skip"]).nullable(),
  })),
  conflicts: z.array(crmImportConflictSchema),
  needsDefaultSourceSheets: z.array(z.object({ fileName: z.string(), sheetName: z.string() })),
  counts: z.object({
    sourceRows: z.number().int().min(0),
    effectiveRows: z.number().int().min(0),
    create: z.number().int().min(0),
    update: z.number().int().min(0),
    merged: z.number().int().min(0),
    skipped: z.number().int().min(0),
    duplicates: z.number().int().min(0),
    unresolved: z.number().int().min(0),
  }),
  canCommit: z.boolean(),
});

export const crmImportCommitResponseSchema = z.object({
  status: z.enum(["committed", "already_committed"]),
  importId: z.string().uuid(),
  importKey: z.string(),
  sourceRows: z.number().int().min(0),
  effectiveRows: z.number().int().min(0),
  create: z.number().int().min(0),
  update: z.number().int().min(0),
  merged: z.number().int().min(0),
  skipped: z.number().int().min(0),
  duplicates: z.number().int().min(0),
  unresolved: z.number().int().min(0),
});

const decisionRecord = <T extends z.ZodTypeAny>(schema: T) =>
  z.record(z.string().trim().min(1).max(500), schema);

export const crmImportReviewSchema = z.object({
  sheets: z.array(crmImportSheetSchema).min(1).max(100),
  keySource: z.enum(["byok", "shared"]),
  tokens: z.object({
    inputTokens: z.number().int().min(0).max(10_000_000),
    outputTokens: z.number().int().min(0).max(10_000_000),
  }),
  duplicateDecisions: decisionRecord(z.enum(["merge", "skip"])).default({}),
  existingLeadDecisions: decisionRecord(z.enum(["update", "skip"])).default({}),
  conflictChoices: decisionRecord(z.enum(["keep", "replace", "first", "last"])).default({}),
  missingPhoneDecisions: decisionRecord(z.enum(["import", "skip"])).default({}),
  missingDateDecisions: decisionRecord(z.enum(["use_import_time", "skip"])).default({}),
}).strict();

export const crmImportCommitPayloadSchema = crmImportReviewSchema.extend({
  confirmDuplicate: z.boolean().optional(),
});

export type CrmImportMappingEntry = z.infer<typeof crmImportMappingEntrySchema>;
export type CrmImportMapping = z.infer<typeof crmImportMappingSchema>;
export type CrmImportSheet = z.infer<typeof crmImportSheetSchema>;
export type CrmImportReview = z.infer<typeof crmImportReviewSchema>;
export type CrmImportCommitPayload = z.infer<typeof crmImportCommitPayloadSchema>;
export type CrmImportAnalyzeResponse = z.infer<typeof crmImportAnalyzeResponseSchema>;
export type CrmImportPreviewResponse = z.infer<typeof crmImportPreviewResponseSchema>;
export type CrmImportCommitResponse = z.infer<typeof crmImportCommitResponseSchema>;
