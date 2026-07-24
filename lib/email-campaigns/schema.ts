import { z } from "zod";

const nonNegativeIntOrNull = z.number().int().min(0).nullable();

// Shared by the campaign form dialog and the create/update server actions —
// the only place a raw campaign blob is trusted, per CLAUDE.md's rule
// against unvalidated `as` on external input. Mirrors lib/ad-campaigns/schema.ts.
export const emailCampaignInputSchema = z.object({
  name: z.string().min(1, "Le nom de la campagne est requis"),
  sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subject: z.string().max(200).nullable(),
  sends: z.number().int().min(0),
  opens: nonNegativeIntOrNull,
  clicks: nonNegativeIntOrNull,
  revenueAttributed: nonNegativeIntOrNull,
});

export type EmailCampaignInput = z.infer<typeof emailCampaignInputSchema>;
