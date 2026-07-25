import { z } from "zod";

import { LEAD_LOST_REASONS, LEAD_SOURCES, LEAD_STAGES } from "./types";

// Shared by the new-lead dialog / lead drawer assignment form and their
// server actions — the only place a raw lead blob is trusted, per
// CLAUDE.md's rule against unvalidated `as` on external input.
export const leadInputSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  source: z.enum(LEAD_SOURCES),
  offerId: z.string().nullable(),
  potentialValueEur: z.number().int().min(0),
  setterId: z.string().uuid().nullable(),
  closer: z.string().nullable(),
  reminderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  reminderNote: z.string().max(500).nullable(),
});

export type LeadInput = z.infer<typeof leadInputSchema>;

// A stage transition is a state-machine action, not a free-form field
// edit — its own schema, same distinction as setInstallmentStatus vs
// saveSale in lib/sales/*.
export const stageChangeSchema = z
  .object({
    toStage: z.enum(LEAD_STAGES),
    lostReason: z.enum(LEAD_LOST_REASONS).nullable(),
  })
  .refine((value) => value.toStage !== "perdu" || value.lostReason !== null, {
    message: "Un motif est requis pour un lead perdu",
    path: ["lostReason"],
  });

export type StageChangeInput = z.infer<typeof stageChangeSchema>;

export const commentInputSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const reminderInputSchema = z.object({
  reminderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  reminderNote: z.string().max(500).nullable(),
});
