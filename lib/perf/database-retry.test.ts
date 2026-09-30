import { describe, expect, it, vi } from "vitest";

import { withDatabaseReadRetry } from "./database-retry";

describe("withDatabaseReadRetry", () => {
  it("retries a cancelled read and returns the successful result", async () => {
    let attempt = 0;
    const operation = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw Object.assign(new Error("statement timeout"), { code: "57014" });
      }
      return "ok";
    });

    await expect(
      withDatabaseReadRetry(operation, { operation: "test-read", delayMs: 0 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("retries a broken connection through the driver's reconnect path", async () => {
    let attempt = 0;

    await expect(
      withDatabaseReadRetry(
        async () => {
          attempt += 1;
          if (attempt === 1) throw Object.assign(new Error("socket reset"), { code: "ECONNRESET" });
          return "ok";
        },
        { operation: "test-read", delayMs: 0 },
      ),
    ).resolves.toBe("ok");
  });

  it("bounds a stuck read without starting a duplicate query", async () => {
    const operation = vi.fn(() => new Promise<string>(() => {}));

    await expect(
      withDatabaseReadRetry(operation, {
        operation: "stuck-read",
        timeoutMs: 5,
        delayMs: 0,
      }),
    ).rejects.toThrow("[timeout] db-stuck-read exceeded 5ms");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("does not retry a non-transient database error", async () => {
    const operation = vi.fn(async () => {
      throw Object.assign(new Error("permission denied"), { code: "42501" });
    });

    await expect(
      withDatabaseReadRetry(operation, { operation: "test-read", delayMs: 0 }),
    ).rejects.toThrow("permission denied");
    expect(operation).toHaveBeenCalledOnce();
  });
});
