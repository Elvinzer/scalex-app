import { describe, expect, it } from "vitest";

import { getMetaAppCredentials } from "./config";

describe("Meta app configuration", () => {
  const names = ["META_APP_ID", "META_APP_SECRET", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"] as const;

  function withEnvironment(values: Partial<Record<(typeof names)[number], string | undefined>>, callback: () => void) {
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    try {
      for (const name of names) {
        if (values[name] === undefined) delete process.env[name];
        else process.env[name] = values[name];
      }
      callback();
    } finally {
      for (const name of names) {
        const value = previous[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }

  it("returns null when the Meta pair is incomplete", () => {
    withEnvironment({ META_APP_ID: undefined, META_APP_SECRET: undefined, INSTAGRAM_APP_ID: undefined, INSTAGRAM_APP_SECRET: undefined }, () => {
      expect(getMetaAppCredentials()).toBeNull();
    });
  });

  it("prefers a complete explicit Meta pair", () => {
    withEnvironment({ META_APP_ID: " meta-id ", META_APP_SECRET: " meta-secret ", INSTAGRAM_APP_ID: "ig-id", INSTAGRAM_APP_SECRET: "ig-secret" }, () => {
      expect(getMetaAppCredentials()).toEqual({ appId: "meta-id", appSecret: "meta-secret" });
    });
  });

  it("does not reuse Instagram Login credentials", () => {
    withEnvironment({ META_APP_ID: undefined, META_APP_SECRET: undefined, INSTAGRAM_APP_ID: " ig-id ", INSTAGRAM_APP_SECRET: " ig-secret " }, () => {
      expect(getMetaAppCredentials()).toBeNull();
    });
  });

  it("does not mix a partial Meta pair with Instagram credentials", () => {
    withEnvironment({ META_APP_ID: "meta-id", META_APP_SECRET: undefined, INSTAGRAM_APP_ID: "ig-id", INSTAGRAM_APP_SECRET: "ig-secret" }, () => {
      expect(getMetaAppCredentials()).toBeNull();
    });
  });
});
