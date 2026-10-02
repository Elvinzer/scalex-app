import { describe, expect, it, vi } from "vitest";

import { resolveCrmStageOperation, type PendingCrmStageOperation } from "./stage-operations";

describe("CRM stage mutation retries", () => {
  it("reuses the same key when the setter retries an uncertain stage change", () => {
    const pending = new Map<string, PendingCrmStageOperation>();
    const createKey = vi.fn(() => "stage-operation-0001");

    const first = resolveCrmStageOperation(pending, "lead-1", "call_booked", createKey);
    const retry = resolveCrmStageOperation(pending, "lead-1", "call_booked", createKey);

    expect(first).toEqual({ state: "new", idempotencyKey: "stage-operation-0001" });
    expect(retry).toEqual({ state: "retry", idempotencyKey: "stage-operation-0001" });
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("blocks a different stage until the uncertain operation is resolved", () => {
    const pending = new Map<string, PendingCrmStageOperation>([
      ["lead-1", { stage: "call_booked", idempotencyKey: "stage-operation-0001" }],
    ]);
    const createKey = vi.fn(() => "stage-operation-0002");

    expect(resolveCrmStageOperation(pending, "lead-1", "call_proposed", createKey)).toEqual({ state: "conflict" });
    expect(pending.get("lead-1")).toEqual({ stage: "call_booked", idempotencyKey: "stage-operation-0001" });
    expect(createKey).not.toHaveBeenCalled();
  });

  it("starts a fresh operation after the previous stage change is acknowledged", () => {
    const pending = new Map<string, PendingCrmStageOperation>();
    resolveCrmStageOperation(pending, "lead-1", "call_booked", () => "stage-operation-0001");
    pending.delete("lead-1");

    expect(resolveCrmStageOperation(pending, "lead-1", "call_booked", () => "stage-operation-0002")).toEqual({
      state: "new",
      idempotencyKey: "stage-operation-0002",
    });
  });
});
