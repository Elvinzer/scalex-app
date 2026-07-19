import { z } from "zod";

// Shared by the testimonial form dialog and the create/update server actions
// — the only place a raw testimonial blob is trusted, per CLAUDE.md's rule
// against unvalidated `as` on external input.
export const testimonialInputSchema = z.object({
  clientName: z.string().min(1, "Le nom du client est requis"),
  format: z.enum(["texte", "video", "capture_ecran", "audio"]),
  content: z.string().max(4000).nullable(),
  url: z.string().url().nullable().or(z.literal("").transform(() => null)),
  collectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type TestimonialInput = z.infer<typeof testimonialInputSchema>;
