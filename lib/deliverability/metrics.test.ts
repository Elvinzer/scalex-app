import { describe, expect, it } from "vitest";

import { computeDeliveryMetrics } from "./metrics";

const now = new Date("2026-08-14T12:00:00.000Z");

function row(overrides: Partial<Parameters<typeof computeDeliveryMetrics>[0][number]> = {}) {
  return {
    status: "active" as const,
    columnType: "progression" as const,
    enteredAt: "2026-08-01T12:00:00.000Z",
    lastActivityAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("computeDeliveryMetrics", () => {
  it("hides comparison rates below the ten-client threshold", () => {
    const result = computeDeliveryMetrics([row()], now);

    expect(result.insufficientSample).toBe(true);
    expect(result.successRate).toBeNull();
    expect(result.dropoutRate).toBeNull();
    expect(result.averageDurationDays).toBeNull();
    expect(result.activeClients).toBe(1);
  });

  it("computes success, dropout, duration and newcomers from typed stages", () => {
    const rows = Array.from({ length: 10 }, (_, index) => row({
      status: index < 5 ? "completed" : index === 9 ? "abandoned" : "active",
      columnType: index < 5 ? "end" : index === 9 ? "risk" : index === 8 ? "entry" : "progression",
      enteredAt: index === 8 ? "2026-08-10T12:00:00.000Z" : "2026-07-01T12:00:00.000Z",
      lastActivityAt: index === 9 ? "2026-07-20T12:00:00.000Z" : index < 5 ? "2026-08-01T12:00:00.000Z" : "2026-08-14T12:00:00.000Z",
    }));

    const result = computeDeliveryMetrics(rows, now);

    expect(result.insufficientSample).toBe(false);
    expect(result.successRate).toBe(5 / 6);
    expect(result.dropoutRate).toBe(0.1);
    expect(result.averageDurationDays).toBe(31);
    expect(result.newcomers).toBe(1);
  });
});
