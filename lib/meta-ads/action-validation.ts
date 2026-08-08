import { z } from "zod";

export const metaActionSchema = z
  .object({
    campaignId: z.string().uuid().optional(),
    entityId: z.string().uuid().optional(),
    entityType: z.enum(["campaign", "adset", "ad"]).default("campaign"),
    actionType: z.enum(["pause", "resume", "set_daily_budget"]),
    dailyBudgetCents: z.number().int().min(100).max(10_000_000).optional(),
    idempotencyKey: z.string().uuid(),
    expectedStatus: z.string().trim().max(40).optional(),
    expectedDailyBudgetCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  })
  .superRefine((value, context) => {
    if (!value.entityId && !value.campaignId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["entityId"], message: "La cible Meta est requise." });
    }
    if (value.entityType !== "campaign" && !value.campaignId) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["campaignId"], message: "La campagne parente est requise pour cette cible Meta." });
    }
    if (value.actionType === "set_daily_budget" && value.dailyBudgetCents === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["dailyBudgetCents"], message: "Le budget quotidien est requis." });
    }
    if (value.entityType === "ad" && value.actionType === "set_daily_budget") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["actionType"], message: "Le budget se pilote au niveau campagne ou ensemble de publicités." });
    }
  });
