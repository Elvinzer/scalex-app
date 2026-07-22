import { z } from "zod";

import { MONTHLY_METRICS_FIELDS } from "@/lib/monthly-metrics/types";

// The only 3 write destinations a smart import can ever target — closed
// enums, never a free string, so the model's output can't invent a
// destination or a field that doesn't exist (CLAUDE.md: never trust
// unvalidated `as` on external input, and this input is LLM-generated,
// which is external by definition).
export const IMPORT_TARGET_TABLES = ["monthly_metrics", "content_posts", "sales"] as const;

const CONTENT_POST_FIELDS = ["platform", "type", "title", "publishedAt", "url", "views", "likes", "comments", "shares", "clicks", "leads"] as const;
const SALES_FIELDS = ["clientName", "clientEmail", "sourceChannel", "totalPrice", "paymentType", "saleDate", "closer"] as const;

export const ALL_TARGET_FIELDS = [...MONTHLY_METRICS_FIELDS, ...CONTENT_POST_FIELDS, ...SALES_FIELDS] as unknown as [string, ...string[]];

// One entry per source column the model looked at — target_field null means
// "I don't know what this is", handled identically to an explicit
// unmapped_columns entry (never invented, never silently dropped).
const mappingEntrySchema = z.object({
  sourceColumn: z.string(),
  targetField: z.enum(ALL_TARGET_FIELDS).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  granularity: z.enum(["daily", "weekly", "monthly"]),
  sampleValues: z.array(z.string()).max(5),
});

const clarifyingQuestionSchema = z.object({
  sourceColumn: z.string(),
  prompt: z.string(),
  // The 2-3 plausible target fields Falco offers as buttons — "Ignorer
  // cette colonne" is always added client-side, never part of this list.
  options: z.array(z.enum(ALL_TARGET_FIELDS)).max(3),
});

export const importMappingResultSchema = z.object({
  targetTable: z.enum(IMPORT_TARGET_TABLES),
  mappings: z.array(mappingEntrySchema),
  periodDetected: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).nullable(),
  unmappedColumns: z.array(z.string()),
  questions: z.array(clarifyingQuestionSchema).max(6),
});

export type ImportMappingResult = z.infer<typeof importMappingResultSchema>;

// A resolved mapping value ready to commit — after Falco's clarification
// round has updated any medium/low-confidence entries. Server-side re-
// validated in commitImport, never trusted as-is from the client.
export const commitImportPayloadSchema = z.object({
  targetTable: z.enum(IMPORT_TARGET_TABLES),
  fileHash: z.string(),
  // Set after the user confirms the "tu as déjà importé ce fichier"
  // warning — first call without it, server returns a warning instead of
  // writing; re-call with this set true to proceed anyway.
  confirmDuplicate: z.boolean().optional(),
  // Carried over from the /api/import/analyze response so the commit's
  // data_imports row logs the REAL token usage/key source of the AI call
  // that produced this mapping (the commit action itself makes no AI call).
  keySource: z.enum(["byok", "shared"]),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  months: z.array(
    z.object({
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      // field -> final numeric/string value, only for fields the user
      // actually confirmed (ignored columns never appear here)
      values: z.record(z.string(), z.union([z.number(), z.string()])),
      // per-field conflict resolution when the target month already has a
      // value — "keep" never writes, "replace" writes; absent = no conflict
      conflictChoices: z.record(z.string(), z.enum(["keep", "replace"])).optional(),
    })
  ),
});

export type CommitImportPayload = z.infer<typeof commitImportPayloadSchema>;

// Shared client/server shape for /api/import/analyze's response — declared
// here (not in the route file) so client components can import it without
// pulling in any server-only route code. `mapping` is the EnrichedMapping
// shape (lib/import/aggregate.ts) — each entry carries its full source
// column values, not just the 5 samples the model saw, so the client can
// compute final field values in code (never pre-aggregated by the LLM).
export type AnalyzeFileResult = {
  fileName: string;
  fileHash: string;
  mapping: Omit<ImportMappingResult, "mappings"> & {
    mappings: (ImportMappingResult["mappings"][number] & { columnValues: string[] })[];
  };
};
export type AnalyzeResponse = {
  files: AnalyzeFileResult[];
  existingMonths: Record<string, Record<string, unknown> | null>;
  keySource: "byok" | "shared";
  tokens: { inputTokens: number; outputTokens: number };
};
