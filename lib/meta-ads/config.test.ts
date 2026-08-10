import { describe, expect, it } from "vitest";

import { getMetaAppCredentials } from "./config";

describe("Meta app configuration", () => {
  it("returns null when OAuth credentials are incomplete", () => {
    const previousId = process.env.META_APP_ID;
    const previousSecret = process.env.META_APP_SECRET;
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;

    expect(getMetaAppCredentials()).toBeNull();

    if (previousId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousId;
    if (previousSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previousSecret;
  });

  it("trims and returns complete OAuth credentials", () => {
    const previousId = process.env.META_APP_ID;
    const previousSecret = process.env.META_APP_SECRET;
    process.env.META_APP_ID = " app-id ";
    process.env.META_APP_SECRET = " app-secret ";

    expect(getMetaAppCredentials()).toEqual({ appId: "app-id", appSecret: "app-secret" });

    if (previousId === undefined) delete process.env.META_APP_ID;
    else process.env.META_APP_ID = previousId;
    if (previousSecret === undefined) delete process.env.META_APP_SECRET;
    else process.env.META_APP_SECRET = previousSecret;
  });
});
