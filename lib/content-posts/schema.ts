import { z } from "zod";

// Only path that writes to content_posts today — see db/schema.ts's
// contentPosts comment: bookings/dealsClosed are the sole fields a synced
// (non-"manual") row can be hand-edited on.
export const contentPostCommercialStatsSchema = z.object({
  bookings: z.number().int().min(0).nullable(),
  dealsClosed: z.number().int().min(0).nullable(),
});

export type ContentPostCommercialStatsInput = z.infer<typeof contentPostCommercialStatsSchema>;
