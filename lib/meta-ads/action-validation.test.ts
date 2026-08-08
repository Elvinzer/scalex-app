import { describe, expect, it } from "vitest";

import { metaActionSchema } from "./action-validation";

const campaignId = "00000000-0000-4000-8000-000000000001";
const idempotencyKey = "00000000-0000-4000-8000-000000000002";

describe("Meta direct action validation", () => {
  it("accepts only the three bounded action families", () => {
    expect(metaActionSchema.safeParse({ campaignId, actionType: "pause", idempotencyKey }).success).toBe(true);
    expect(metaActionSchema.safeParse({ campaignId, actionType: "resume", idempotencyKey }).success).toBe(true);
    expect(metaActionSchema.safeParse({ campaignId, actionType: "set_daily_budget", dailyBudgetCents: 12_000, idempotencyKey }).success).toBe(true);
    expect(metaActionSchema.safeParse({ campaignId, actionType: "change_targeting", idempotencyKey }).success).toBe(false);
  });

  it("rejects missing targets, missing budgets and ad-level budget writes", () => {
    expect(metaActionSchema.safeParse({ campaignId, actionType: "pause", idempotencyKey }).success).toBe(true);
    expect(metaActionSchema.safeParse({ campaignId, actionType: "pause" }).success).toBe(false);
    expect(metaActionSchema.safeParse({ campaignId, actionType: "set_daily_budget", idempotencyKey }).success).toBe(false);
    expect(metaActionSchema.safeParse({ entityId: campaignId, entityType: "adset", actionType: "pause", idempotencyKey }).success).toBe(false);
    expect(metaActionSchema.safeParse({ entityId: campaignId, entityType: "ad", campaignId, actionType: "pause", idempotencyKey }).success).toBe(true);
    expect(metaActionSchema.safeParse({ entityId: campaignId, entityType: "ad", actionType: "set_daily_budget", dailyBudgetCents: 12_000, idempotencyKey }).success).toBe(false);
  });
});
