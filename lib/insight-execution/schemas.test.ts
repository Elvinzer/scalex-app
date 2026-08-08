import { describe, expect, it } from "vitest";

import { launchInsightSchema } from "./schemas";

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
