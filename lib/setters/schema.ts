import { z } from "zod";

// Shared by the add/edit-setter dialog and its server actions — the only
// place a raw setter blob is trusted, per CLAUDE.md's rule against
// unvalidated `as` on external input.
export const setterInputSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  email: z.string().email().nullable(),
  defaultCommissionPct: z.number().min(0).max(1),
});

export type SetterInput = z.infer<typeof setterInputSchema>;
