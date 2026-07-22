import { z } from "zod";

import type { EnrichedMapping } from "@/lib/import/aggregate";
import { MONTHLY_METRICS_FIELDS } from "@/lib/monthly-metrics/types";

// The write destinations a smart import can ever target — closed enums,
// never a free string, so the model's output can't invent a destination or
// a field that doesn't exist (CLAUDE.md: never trust unvalidated `as` on
// external input, and this input is LLM-generated, which is external by
// definition). "ignore" is a real, first-class outcome — a sheet that
// doesn't fit anything is always shown as ignored with a reason, never
// silently dropped.
export const IMPORT_TARGET_TABLES = ["monthly_metrics", "content_posts", "sales", "ad_campaigns", "ignore"] as const;

const CONTENT_POST_FIELDS = ["platform", "type", "title", "publishedAt", "url", "views", "likes", "comments", "shares", "clicks", "leads"] as const;
const SALES_FIELDS = ["clientName", "clientEmail", "sourceChannel", "totalPrice", "paymentType", "saleDate", "closer"] as const;
// Deliberately minimal (not every ad_campaigns column) — the brief's own
// validation case only asks for spend/impressions/clicks/leads aggregated
// per named campaign, not a full campaign-setup import.
const AD_CAMPAIGN_FIELDS = ["campaignName", "spend", "impressions", "clicks", "leads"] as const;

export const ALL_TARGET_FIELDS = [
  ...MONTHLY_METRICS_FIELDS,
  ...CONTENT_POST_FIELDS,
  ...SALES_FIELDS,
  ...AD_CAMPAIGN_FIELDS,
] as unknown as [string, ...string[]];

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

// What the MODEL must produce for one sheet/file — deliberately WITHOUT
// sheetName: the calling code already knows which sheet it asked about
// (lib/agent/import-mapping.ts is called once per sheet), so sheetName is
// attached in code right after validation rather than trusted from the
// model's own echo, removing a whole class of "model said the wrong
// sheet name" mismatch.
export const modelMappingSchema = z
  .object({
    targetTable: z.enum(IMPORT_TARGET_TABLES),
    // Required (non-empty) exactly when targetTable is "ignore" — enforced
    // by the .refine() below rather than a plain optional, so a sheet can
    // never end up ignored with no explanation shown to the user.
    ignoreReason: z.string().nullable(),
    mappings: z.array(mappingEntrySchema),
    // The column whose values determine which month each row belongs to
    // (monthly_metrics/ad_campaigns) — grouping happens in code from the
    // column's real values (lib/import/aggregate.ts's groupValuesByMonth),
    // never by the model doing the counting. Null falls back to
    // periodDetected (a single period for the whole sheet).
    dateColumnName: z.string().nullable(),
    periodDetected: z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).nullable(),
    unmappedColumns: z.array(z.string()),
    questions: z.array(clarifyingQuestionSchema).max(6),
  })
  .refine((data) => data.targetTable !== "ignore" || (data.ignoreReason !== null && data.ignoreReason.trim().length > 0), {
    message: 'ignoreReason is required when targetTable is "ignore"',
    path: ["ignoreReason"],
  });

export type ModelMappingResult = z.infer<typeof modelMappingSchema>;
// sheetName attached in code (see lib/agent/import-mapping.ts) — always
// present downstream, never optional.
export type ImportMappingResult = ModelMappingResult & { sheetName: string };

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
      // Only meaningful for monthly_metrics: the last calendar month
      // present has fewer days of data than have actually elapsed —
      // shown as a warning in the preview, never silently treated as a
      // full month.
      incompleteDaysCount: z.number().int().min(0).optional(),
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
// One entry per SHEET, not per file — a multi-sheet Excel file produces
// one AnalyzeSheetResult per sheet, each independently mappable/ignorable.
export type AnalyzeSheetResult = {
  fileName: string;
  sheetName: string;
  fileHash: string;
  // False when lib/import/parse.ts's detectHeaderRow couldn't confidently
  // find the header row — the client then asks "which line is your header
  // row?" (components/import/import-clarify.tsx) using previewRows below
  // instead of trusting the row-0 fallback.
  headerRowConfident: boolean;
  previewRows: string[][];
  // Type-only import from lib/import/aggregate.ts, which itself type-only
  // imports from here — fine, TypeScript erases type-only imports, no real
  // runtime circular dependency.
  mapping: EnrichedMapping;
};
export type AnalyzeResponse = {
  sheets: AnalyzeSheetResult[];
  existingMonths: Record<string, Record<string, unknown> | null>;
  keySource: "byok" | "shared";
  tokens: { inputTokens: number; outputTokens: number };
};
