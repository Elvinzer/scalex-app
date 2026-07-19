import { z } from "zod";

const nonNegativeIntOrNull = z.number().int().min(0).nullable();

// Shared by the post form dialog and the create/update server actions —
// the only place a raw post blob is trusted, per CLAUDE.md's rule against
// unvalidated `as` on external input.
export const contentPostInputSchema = z.object({
  platform: z.string().min(1, "La plateforme est requise"),
  type: z.enum(["post", "reel", "story", "video", "live"]),
  title: z.string().min(1, "Le titre est requis"),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().url().nullable().or(z.literal("").transform(() => null)),
  views: z.number().int().min(0),
  likes: nonNegativeIntOrNull,
  comments: nonNegativeIntOrNull,
  shares: nonNegativeIntOrNull,
  clicks: nonNegativeIntOrNull,
  leads: nonNegativeIntOrNull,
});

export type ContentPostInput = z.infer<typeof contentPostInputSchema>;
