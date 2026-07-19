import { z } from "zod";

const nonNegativeIntOrNull = z.number().int().min(0).nullable();

// Shared by the campaign form dialog and the create/update server actions —
// the only place a raw campaign blob is trusted, per CLAUDE.md's rule
// against unvalidated `as` on external input.
export const adCampaignInputSchema = z.object({
  platform: z.string().min(1, "La plateforme est requise"),
  name: z.string().min(1, "Le nom de la campagne est requis"),
  objective: z.string().max(200).nullable(),
  budget: nonNegativeIntOrNull,
  spend: nonNegativeIntOrNull,
  impressions: nonNegativeIntOrNull,
  clicks: nonNegativeIntOrNull,
  leads: nonNegativeIntOrNull,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export type AdCampaignInput = z.infer<typeof adCampaignInputSchema>;
