import { afterEach, describe, expect, it, vi } from "vitest";
import { startPolling } from "./poll";

afterEach(() => vi.useRealTimers());

describe("status polling", () => {
  it("does not overlap a slow request and stops at completion", async () => {
    vi.useFakeTimers();
    let resolve!: (again: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const stop = startPolling(check, () => false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    resolve(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
    stop();
  });

  it("pauses hidden tabs and never resumes after cleanup while a read finishes", async () => {
    vi.useFakeTimers();
    let paused = true;
    let resolve!: (again: boolean) => void;
    const check = vi.fn(() => new Promise<boolean>((done) => { resolve = done; }));
    const stop = startPolling(check, () => paused);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).not.toHaveBeenCalled();
    paused = false;
    await vi.advanceTimersByTimeAsync(2000);
    expect(check).toHaveBeenCalledTimes(1);
    stop();
    resolve(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("backs off after failures instead of issuing 30 checks per minute", async () => {
    vi.useFakeTimers();
    const check = vi.fn(async () => { throw new Error("network unavailable"); });
    const stop = startPolling(check, () => false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check).toHaveBeenCalledTimes(10);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
