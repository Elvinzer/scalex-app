import { z } from "zod";

// Shared by the manual entry form and every row of a CSV import — the only
// place a raw KPI row is trusted, per CLAUDE.md's rule against unvalidated
// `as` on external input.
export const settingKpiEntryInputSchema = z.object({
  date: z
    .string()
    .date()
    .refine((value) => value <= new Date().toISOString().slice(0, 10), {
      message: "La date ne peut pas être dans le futur",
    }),
  newSubscribers: z.number().int().min(0).max(100_000),
  firstMessagesSent: z.number().int().min(0).max(100_000),
  conversationsStarted: z.number().int().min(0).max(100_000),
  callsProposed: z.number().int().min(0).max(100_000),
  callsBooked: z.number().int().min(0).max(100_000),
});

export type SettingKpiEntryInput = z.infer<typeof settingKpiEntryInputSchema>;
