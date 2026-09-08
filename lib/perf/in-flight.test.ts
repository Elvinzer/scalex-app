import { describe, expect, it, vi } from "vitest";

import { getInFlight } from "./in-flight";

describe("getInFlight", () => {
  it("shares one operation across concurrent requests and isolates accounts", async () => {
    const pending = new Map<string, Promise<string>>();
    let resolve!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const requests = Array.from({ length: 100 }, () => getInFlight(pending, "account-a", loader));
    await expect(getInFlight(pending, "account-b", async () => "other")).resolves.toBe("other");
    expect(loader).toHaveBeenCalledTimes(1);
    resolve("loaded");
    expect(await Promise.all(requests)).toEqual(Array(100).fill("loaded"));
    expect(pending.size).toBe(0);
  });

  it("does not duplicate timed-out SQL while the original read is still running", async () => {
    const pending = new Map<string, Promise<string>>();
    let resolve!: (value: string) => void;
    const loader = vi.fn(() => new Promise<string>((done) => { resolve = done; }));
    const options = { timeoutMs: 5, timeoutLabel: "read", retainUntilSettled: true };
    await expect(getInFlight(pending, "account", loader, options)).rejects.toThrow("[timeout]");
    await expect(getInFlight(pending, "account", loader, options)).rejects.toThrow("[timeout]");
    expect(loader).toHaveBeenCalledTimes(1);
    resolve("late");
    await Promise.resolve();
    await expect(getInFlight(pending, "account", async () => "fresh", options)).resolves.toBe("fresh");
    expect(pending.size).toBe(0);
  });

  it("releases retained work after a late rejection", async () => {
    const pending = new Map<string, Promise<string>>();
    let reject!: (error: Error) => void;
    const task = new Promise<string>((_, fail) => { reject = fail; });
    await expect(getInFlight(pending, "account", () => task, { timeoutMs: 5, retainUntilSettled: true })).rejects.toThrow("[timeout]");
    reject(new Error("connection closed"));
    await Promise.resolve();
    expect(pending.size).toBe(0);
  });

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
