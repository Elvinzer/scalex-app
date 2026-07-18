import { z } from "zod";

// Shared by the modal form and the server action — the only place a raw
// month blob is trusted, per CLAUDE.md's rule against unvalidated `as` on
// external input. Every field optional/nullable: no field in "Datas" is
// mandatory.
const nonNegativeIntOrNull = z.number().int().min(0).nullable();

export const monthlyMetricsInputSchema = z.object({
  cashCollected: nonNegativeIntOrNull,
  cashContracted: nonNegativeIntOrNull,
  newFollowers: nonNegativeIntOrNull,
  firstMessages: nonNegativeIntOrNull,
  conversations: nonNegativeIntOrNull,
  callsProposed: nonNegativeIntOrNull,
  callsBooked: nonNegativeIntOrNull,
  callsTaken: nonNegativeIntOrNull,
  salesClosed: nonNegativeIntOrNull,
});
