import { describe, expect, it } from "vitest";

import { createMobileSetterLoopFixture, MOBILE_SETTER_WORKFLOW_STATES, summarizeMobileSetterLoop } from "./mobile-fixtures";

describe("mobile setter intensive-use fixture", () => {
  it("covers five days of fifty deterministic loops and every requested lead state", () => {
    const fixture = createMobileSetterLoopFixture();
    const summary = summarizeMobileSetterLoop(fixture);

    expect(fixture).toHaveLength(250);
    expect(summary).toMatchObject({
      loops: 250,
      days: 5,
      uniqueLeadIds: 250,
      duplicateOperationKeys: 0,
      slowNetworkLoops: 10,
      loopsByDay: { "1": 50, "2": 50, "3": 50, "4": 50, "5": 50 },
    });
    expect(Object.keys(summary.states).sort()).toEqual([...MOBILE_SETTER_WORKFLOW_STATES].sort());
    expect(Object.values(summary.states).reduce((total, count) => total + count, 0)).toBe(250);
    expect(new Set(fixture.map((loop) => loop.operationKey)).size).toBe(250);
    expect(fixture.every((loop) => loop.expectedTapBudget === 3)).toBe(true);
  });

  it("is reproducible so the intensive-use report can be compared after fixes", () => {
    expect(createMobileSetterLoopFixture()).toEqual(createMobileSetterLoopFixture());
  });

  it("rejects an invalid loop count instead of silently producing a partial report", () => {
    expect(() => createMobileSetterLoopFixture(0)).toThrow(RangeError);
    expect(() => createMobileSetterLoopFixture(1.5)).toThrow(RangeError);
  });
});
