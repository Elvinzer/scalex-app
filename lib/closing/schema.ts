import { z } from "zod";

// Shared by the manual entry form and every row of a CSV import — the only
// place a raw closing KPI row is trusted, per CLAUDE.md's rule against
// unvalidated `as` on external input. Mirrors lib/setting/schema.ts.
export const closingKpiEntryInputSchema = z.object({
  date: z
    .string()
    .date()
    .refine((value) => value <= new Date().toISOString().slice(0, 10), {
      message: "La date ne peut pas être dans le futur",
    }),
  callsAttended: z.number().int().min(0).max(100_000),
  salesClosed: z.number().int().min(0).max(100_000),
});

export type ClosingKpiEntryInput = z.infer<typeof closingKpiEntryInputSchema>;

// Columns editable inline (double-click) in the history table — date is
// excluded, same reasoning as Setting's editableSettingKpiFields.
export const editableClosingKpiFields = ["callsAttended", "salesClosed"] as const;

export type EditableClosingKpiField = (typeof editableClosingKpiFields)[number];
