import { z } from "zod";

// Shared by the video form dialog and the create/update server actions —
// the only place a raw call blob is trusted, per CLAUDE.md's rule against
// unvalidated `as` on external input.
export const closingVideoInputSchema = z.object({
  clientName: z.string().min(1, "Le nom du client est requis"),
  callDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().url().nullable().or(z.literal("").transform(() => null)),
  transcript: z.string().max(20000).nullable(),
  notes: z.string().max(4000).nullable(),
  outcome: z.enum(["closed", "not_closed", "pending"]),
});

export type ClosingVideoInput = z.infer<typeof closingVideoInputSchema>;
