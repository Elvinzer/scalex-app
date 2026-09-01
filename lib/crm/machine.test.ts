import { describe, expect, it } from "vitest";

import { canChangeStage, defaultStageAfterReopen, eventForOutcome, eventForStage, legacyStageForCrmStage } from "./machine";
import { reopenSchema } from "./schemas";

describe("CRM state machine", () => {
  it("keeps the five operational stages independent from outcomes", () => {
    expect(canChangeStage("call_booked", "first_message_sent")).toBe(true);
    expect(legacyStageForCrmStage("value_content_sent")).toBe("conversation");
    expect(eventForStage("first_message_sent")).toBe("first_message_sent");
    expect(eventForOutcome("no_show")).toBe("no_show_marked");
  });

  it("reopens on the last known stage by default", () => {
    expect(defaultStageAfterReopen("conversation_in_progress")).toBe("conversation_in_progress");
    expect(defaultStageAfterReopen(null)).toBe("first_message_sent");
  });

  it("requires an explicit stage and idempotency key when confirming a reopen", () => {
    const input = { leadId: "00000000-0000-4000-8000-000000000001", stage: "call_proposed", idempotencyKey: "reopen-00000001" };
    expect(reopenSchema.safeParse(input).success).toBe(true);
    expect(reopenSchema.safeParse({ ...input, stage: "invalid" }).success).toBe(false);
    expect(reopenSchema.safeParse({ ...input, idempotencyKey: "short" }).success).toBe(false);
  });
});
