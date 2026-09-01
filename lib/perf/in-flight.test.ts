import { describe, expect, it } from "vitest";

import { getInFlight } from "./in-flight";

describe("getInFlight", () => {
  it("removes timed-out work so a later request can retry", async () => {
    const pending = new Map<string, Promise<string>>();
    const stuck = new Promise<string>(() => {});

    await expect(
      getInFlight(pending, "account", () => stuck, {
        timeoutMs: 5,
        timeoutLabel: "test-work",
      }),
    ).rejects.toThrow("[timeout] test-work exceeded 5ms");

    expect(pending.has("account")).toBe(false);
    await expect(
      getInFlight(pending, "account", () => Promise.resolve("ok"), {
        timeoutMs: 5,
        timeoutLabel: "test-retry",
      }),
    ).resolves.toBe("ok");
  });
});
