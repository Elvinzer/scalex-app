import { afterEach, describe, expect, it } from "vitest";

import { decrypt, encrypt } from "./crypto";

const originalCurrentKey = process.env.ENCRYPTION_KEY;
const originalPreviousKey = process.env.ENCRYPTION_KEY_PREVIOUS;

function restoreEnv(name: "ENCRYPTION_KEY" | "ENCRYPTION_KEY_PREVIOUS", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnv("ENCRYPTION_KEY", originalCurrentKey);
  restoreEnv("ENCRYPTION_KEY_PREVIOUS", originalPreviousKey);
});

describe("encrypted values", () => {
  it("reads values encrypted with the previous key during rotation", () => {
    const previousKey = Buffer.alloc(32, 1).toString("base64");
    const currentKey = Buffer.alloc(32, 2).toString("base64");

    process.env.ENCRYPTION_KEY = previousKey;
    delete process.env.ENCRYPTION_KEY_PREVIOUS;
    const payload = encrypt("calendly-token");

    process.env.ENCRYPTION_KEY = currentKey;
    process.env.ENCRYPTION_KEY_PREVIOUS = previousKey;

    expect(decrypt(payload)).toBe("calendly-token");
  });

  it("rejects a malformed payload before trying to decrypt it", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    expect(() => decrypt("not-an-encrypted-value")).toThrow("Encrypted payload is invalid");
  });
});
