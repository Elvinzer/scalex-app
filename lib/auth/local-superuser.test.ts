import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalSuperuserConfig,
  hostnameFromHostHeader,
  isLocalSuperuserDisabled,
  LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE,
} from "./local-superuser";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local superuser guard", () => {
  it("accepts a configured account only on localhost during development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LOCAL_SUPERUSER_ID", "3c485aca-866c-4ad7-bd9f-73bbd3c888bf");
    vi.stubEnv("LOCAL_SUPERUSER_EMAIL", "ced.bernard31@gmail.com");

    expect(getLocalSuperuserConfig("localhost")).toEqual({
      id: "3c485aca-866c-4ad7-bd9f-73bbd3c888bf",
      email: "ced.bernard31@gmail.com",
    });
    expect(getLocalSuperuserConfig("127.0.0.1")).not.toBeNull();
    expect(getLocalSuperuserConfig("example.com")).toBeNull();
  });

  it("rejects the local account outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCAL_SUPERUSER_ID", "3c485aca-866c-4ad7-bd9f-73bbd3c888bf");
    vi.stubEnv("LOCAL_SUPERUSER_EMAIL", "ced.bernard31@gmail.com");

    expect(getLocalSuperuserConfig("localhost")).toBeNull();
  });

  it("parses host headers without allowing a port to change the hostname", () => {
    expect(hostnameFromHostHeader("localhost:3000")).toBe("localhost");
    expect(hostnameFromHostHeader("[::1]:3000")).toBe("::1");
    expect(hostnameFromHostHeader("example.com:443")).toBe("example.com");
  });

  it("recognizes the local auto-login bypass cookie", () => {
    expect(isLocalSuperuserDisabled(LOCAL_SUPERUSER_DISABLED_COOKIE_VALUE)).toBe(true);
    expect(isLocalSuperuserDisabled(undefined)).toBe(false);
    expect(isLocalSuperuserDisabled("other-value")).toBe(false);
  });
});
