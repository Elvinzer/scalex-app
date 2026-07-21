import { z } from "zod";

export const planInputSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Lettres minuscules, chiffres et tirets uniquement"),
  name: z.string().trim().min(1, "Nom requis"),
  priceMonthlyCents: z.number().int().positive("Le prix doit être positif"),
  teamMembersEnabled: z.boolean(),
  maxTeamMembers: z.number().int().positive().nullable(),
  isActive: z.boolean(),
});

export type PlanInput = z.infer<typeof planInputSchema>;
