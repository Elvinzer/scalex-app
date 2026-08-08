import { describe, expect, it } from "vitest";

import { captureCopiloteInsightSchema, launchInsightSchema } from "./schemas";

describe("insight launch input", () => {
  const base = {
    insightId: "00000000-0000-0000-0000-000000000001",
    targetType: "todo" as const,
    targetId: null,
    makeWeeklyFocus: true,
  };

  it("requires a project when the user chooses an existing project", () => {
    expect(launchInsightSchema.safeParse({ ...base, targetType: "project" })).toMatchObject({ success: false });
  });

  it("accepts the simple Journal task path", () => {
    expect(launchInsightSchema.safeParse(base).success).toBe(true);
  });
});

describe("Copilote capture input", () => {
  const valid = {
    conversationId: "00000000-0000-0000-0000-000000000001",
    title: "Proposer plus tôt",
    problem: "Le timing est tardif.",
    actionText: "Tester la proposition après qualification.",
    successCriterion: "Faire le point dans 7 jours.",
  };

  it("accepts the four validated fields", () => {
    expect(captureCopiloteInsightSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty or oversized field", () => {
    expect(captureCopiloteInsightSchema.safeParse({ ...valid, actionText: "" }).success).toBe(false);
    expect(captureCopiloteInsightSchema.safeParse({ ...valid, title: "x".repeat(121) }).success).toBe(false);
  });
});
